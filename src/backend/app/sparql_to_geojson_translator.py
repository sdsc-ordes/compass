"""SPARQL instances → GeoJSON FeatureCollection."""

from __future__ import annotations

import logging
from typing import Any

from geojson import Feature, FeatureCollection, Point

from .config import entity_stories_url
from .namespaces import FIELD_SEP, ITEM_SEP
from .shacl_to_entities import EntityShape

logger = logging.getLogger(__name__)

# GROUP_CONCAT emits "<iri>|<label>", so a well-formed item splits into two.
_IRI_LABEL_FIELDS = 2


def _local_name(iri: str) -> str:
    return (
        iri.rsplit("#", maxsplit=1)[-1] if "#" in iri else iri.rsplit("/", maxsplit=1)[-1]
    )


def extract_property(shape: EntityShape, instance: dict) -> Any:
    """Extract one EntityShape from an instance binding dict."""
    sid = shape.id
    cat = shape.category
    is_multi = shape.is_multi

    if cat == "iri_with_label":
        if is_multi:
            raw = instance.get(f"{sid}Raw", "") or ""
            items = []
            for pair in raw.split(ITEM_SEP):
                parts = pair.strip().split(FIELD_SEP, 1)
                if len(parts) == _IRI_LABEL_FIELDS and parts[0]:
                    items.append({"iri": parts[0].strip(), "label": parts[1].strip()})
            return items
        iri_val = instance.get(f"{sid}Iri")
        label_val = instance.get(f"{sid}Label")
        if not iri_val:
            return None
        label = (
            str(label_val) if label_val else str(iri_val).split("#")[-1].split("/")[-1]
        )
        return {"iri": str(iri_val), "label": label}

    if cat == "boolean":
        return instance.get(f"{sid}Result", "") == "true"

    if is_multi:
        raw = instance.get(f"{sid}Raw", "") or ""
        return [a.strip() for a in raw.split(ITEM_SEP) if a.strip()]

    return instance.get(f"{sid}Result", "")


def _parse_special_properties(instance: dict, lang: str) -> dict:
    """Fields queried outside the SHACL-driven EntityShape list (see sparql_builder)."""
    wp_entity_tag_id = instance.get("wpEntityTagId", "")
    return {
        "storiesUrl": (
            entity_stories_url(wp_entity_tag_id, lang) if wp_entity_tag_id else ""
        ),
    }


def _parse_coordinates(instance: dict[str, Any]) -> Point | None:
    """The instance's Point, or None when it carries no usable coordinate pair."""
    lat_raw = instance.get("lat")
    long_raw = instance.get("long")
    if not lat_raw or not long_raw:
        return None
    try:
        return Point((float(long_raw), float(lat_raw)))
    except (TypeError, ValueError):
        logger.warning(
            "entity %s has unparseable coordinates (lat=%r, long=%r); "
            "rendering it as a region instead of a pin",
            instance.get("s"),
            lat_raw,
            long_raw,
        )
        return None


def instances_to_geojson(
    instances: list[dict[str, Any]],
    shapes: list[EntityShape],
    lang: str = "en",
) -> FeatureCollection:
    """One Feature per SPARQL instance, decoded via EntityShape descriptors."""
    features = []
    for instance in instances:
        if (
            not instance.get("s")
            or not instance.get("label")
            or not instance.get("type")
        ):
            logger.warning(
                "skipping instance without id, label or type: %r",
                sorted(instance.keys()),
            )
            continue

        properties: dict[str, Any] = {
            "id": instance["s"],
            "label": instance["label"],
            "type": str(
                instance.get("typeLabelResult") or _local_name(instance["type"])
            ),
            "typeIri": instance["type"],
        }
        for shape in shapes:
            properties[shape.id] = extract_property(shape, instance)
        properties.update(_parse_special_properties(instance, lang))

        geometry = _parse_coordinates(instance)
        if geometry is None:
            properties["is_region"] = True
            properties["regionKey"] = _local_name(instance["s"])

        features.append(Feature(geometry=geometry, properties=properties))

    return FeatureCollection(features)
