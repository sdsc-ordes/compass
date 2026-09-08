"""SPARQL result rows -> GeoJSON FeatureCollection."""

import logging
from typing import Any

from geojson import Feature, FeatureCollection, Point

from .config import entity_stories_url
from .namespaces import FIELD_SEP, ITEM_SEP

logger = logging.getLogger(__name__)

# GROUP_CONCAT emits "<iri>|<label>", so a well-formed item splits into two.
_IRI_LABEL_FIELDS = 2


def _local_name(iri: str) -> str:
    return (
        iri.rsplit("#", maxsplit=1)[-1] if "#" in iri else iri.rsplit("/", maxsplit=1)[-1]
    )


def extract_property(spec: dict, res: dict) -> Any:
    """Extract one property value from a result row, typed per its spec."""
    sid = spec["id"]
    cat = spec["category"]
    is_multi = spec["is_multi"]

    if cat == "iri_with_label":
        if is_multi:
            raw = res.get(f"{sid}Raw", "") or ""
            items = []
            for pair in raw.split(ITEM_SEP):
                parts = pair.strip().split(FIELD_SEP, 1)
                if len(parts) == _IRI_LABEL_FIELDS and parts[0]:
                    items.append({"iri": parts[0].strip(), "label": parts[1].strip()})
            return items
        else:
            iri_val = res.get(f"{sid}Iri")
            label_val = res.get(f"{sid}Label")
            if not iri_val:
                return None
            label = (
                str(label_val) if label_val else str(iri_val).split("#")[-1].split("/")[-1]
            )
            return {"iri": str(iri_val), "label": label}

    if cat == "boolean":
        return res.get(f"{sid}Result", "") == "true"

    if is_multi:
        raw = res.get(f"{sid}Raw", "") or ""
        return [a.strip() for a in raw.split(ITEM_SEP) if a.strip()]

    return res.get(f"{sid}Result", "")


def _parse_special_properties(res: dict, lang: str) -> dict:
    """Fields queried outside the SHACL-driven specs (see sparql_builder).

    The stories URL is assembled here rather than in the widget so the base URL
    stays configurable in one place (see config.STORIES_BASE_URLS).
    """
    wp_entity_tag_id = res.get("wpEntityTagId", "")
    return {
        "storiesUrl": (
            entity_stories_url(wp_entity_tag_id, lang) if wp_entity_tag_id else ""
        ),
    }


def _coordinates(res: dict[str, Any]) -> Point | None:
    """The row's Point, or None when it carries no usable coordinate pair.

    Country/Area concepts have no coordinates at all -- they are regions, and
    the caller emits them geometry-less. A pair that will not parse as a float
    is a defect in the data, so it is logged rather than passed off as one.
    """
    lat_raw = res.get("lat")
    long_raw = res.get("long")
    if not lat_raw or not long_raw:
        return None
    try:
        return Point((float(long_raw), float(lat_raw)))
    except (TypeError, ValueError):
        logger.warning(
            "entity %s has unparseable coordinates (lat=%r, long=%r); "
            "rendering it as a region instead of a pin",
            res.get("s"),
            lat_raw,
            long_raw,
        )
        return None


def results_to_geojson(
    results: list[dict[str, Any]],
    specs: list[dict[str, Any]],
    lang: str = "en",
) -> FeatureCollection:
    """One Feature per result row.

    A row missing the identity or label the whole UI keys off cannot be
    rendered; it is skipped and logged rather than dropped silently, so a
    defect in the ontology shows up in the API's log instead of as an entity
    that quietly went missing from the map.
    """
    features = []
    for res in results:
        if not res.get("s") or not res.get("label") or not res.get("type"):
            logger.warning(
                "skipping result row without id, label or type: %r",
                sorted(res.keys()),
            )
            continue

        properties: dict[str, Any] = {
            "id": res["s"],
            "label": res["label"],
            "type": str(res.get("typeLabelResult") or _local_name(res["type"])),
            "typeIri": res["type"],
        }
        for spec in specs:
            properties[spec["id"]] = extract_property(spec, res)
        properties.update(_parse_special_properties(res, lang))

        # Country/Area concepts carry no coordinates — emit them as
        # geometry-less *region* features. The frontend joins the polygon
        # boundary by regionKey and renders them as shaded areas.
        geometry = _coordinates(res)
        if geometry is None:
            properties["is_region"] = True
            properties["regionKey"] = _local_name(res["s"])

        features.append(Feature(geometry=geometry, properties=properties))

    return FeatureCollection(features)
