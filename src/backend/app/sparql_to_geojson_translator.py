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
    """Return the fragment or last path segment of an IRI.

    Args:
        iri: Absolute IRI string.

    Returns:
        Local name after ``#`` or the final ``/`` segment.
    """
    return (
        iri.rsplit("#", maxsplit=1)[-1] if "#" in iri else iri.rsplit("/", maxsplit=1)[-1]
    )


def extract_property(shape: EntityShape, instance: dict) -> Any:
    """Extract one EntityShape value from an instance binding dict.

    Args:
        shape: Property descriptor describing how the row was projected.
        instance: One SPARQL result row as a dict.

    Returns:
        Decoded value: IRI/label dict(s), bool, list of strings, or a scalar.
    """
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
        label = str(label_val) if label_val else str(iri_val).split("#")[-1].split("/")[-1]
        return {"iri": str(iri_val), "label": label}

    if cat == "boolean":
        return instance.get(f"{sid}Result", "") == "true"

    if is_multi:
        raw = instance.get(f"{sid}Raw", "") or ""
        return [a.strip() for a in raw.split(ITEM_SEP) if a.strip()]

    return instance.get(f"{sid}Result", "")


def _parse_special_properties(instance: dict, lang: str) -> dict:
    """Decode fields queried outside the SHACL-driven EntityShape list.

    Args:
        instance: SPARQL result row.
        lang: UI language for the stories URL.

    Returns:
        Extra GeoJSON properties (currently ``storiesUrl``).
    """
    wp_entity_tag_id = instance.get("wpEntityTagId", "")
    return {
        "storiesUrl": (
            entity_stories_url(wp_entity_tag_id, lang) if wp_entity_tag_id else ""
        ),
    }


def _parse_coordinates(instance: dict[str, Any]) -> Point | None:
    """Build a GeoJSON Point from lat/long bindings, if usable.

    Args:
        instance: SPARQL result row.

    Returns:
        ``Point`` or ``None`` when coordinates are missing or unparseable.
    """
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
    """Build one Feature per SPARQL instance, decoded via EntityShape descriptors.

    Args:
        instances: SPARQL result rows.
        shapes: Descriptors used to decode property columns.
        lang: UI language for special properties.

    Returns:
        GeoJSON FeatureCollection (pins with geometry; regions with
        ``is_region`` / ``regionKey`` and null geometry).
    """
    features = []
    for instance in instances:
        if not instance.get("s") or not instance.get("label") or not instance.get("type"):
            logger.warning(
                "skipping instance without id, label or type: %r",
                sorted(instance.keys()),
            )
            continue

        properties: dict[str, Any] = {
            "id": instance["s"],
            "label": instance["label"],
            "type": str(instance.get("typeLabelResult") or _local_name(instance["type"])),
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
