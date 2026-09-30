"""Decode SPARQL instance rows into a GeoJSON FeatureCollection."""

from __future__ import annotations

import logging
from typing import Any

from geojson import Feature, FeatureCollection, Point

from app.config import config
from app.namespaces import FIELD_SEP, ITEM_SEP, local_name
from app.shacl_to_entities import EntityShape

logger = logging.getLogger(__name__)


def extract_property(shape: EntityShape, instance: dict[str, Any]) -> Any:
    """Decode one EntityShape value from a SPARQL result row.

    Args:
        shape: Property descriptor describing how the row was projected.
        instance: One SPARQL result row as a dict.

    Returns:
        Decoded value: IRI/label dict(s), bool, list of strings, or a scalar.
    """
    var = shape.id

    if shape.category == "iri_with_label":
        if shape.is_multi:
            items = []
            for pair in instance.get(f"{var}Raw", "").split(ITEM_SEP):
                iri, sep, label = pair.strip().partition(FIELD_SEP)
                if sep and iri:
                    items.append({"iri": iri.strip(), "label": label.strip()})
            return items
        iri = instance.get(f"{var}Iri")
        if not iri:
            return None
        return {"iri": iri, "label": instance.get(f"{var}Label") or local_name(iri)}

    if shape.category == "boolean":
        return instance.get(f"{var}Result", "") == "true"

    if shape.is_multi:
        raw = instance.get(f"{var}Raw", "")
        return [item.strip() for item in raw.split(ITEM_SEP) if item.strip()]

    return instance.get(f"{var}Result", "")


def _parse_coordinates(instance: dict[str, Any]) -> Point | None:
    """Build a GeoJSON Point from lat/long bindings.

    Args:
        instance: SPARQL result row.

    Returns:
        ``Point`` or ``None`` when coordinates are missing or unparseable.
    """
    try:
        return Point((float(instance["long"]), float(instance["lat"])))
    except (KeyError, ValueError):
        return None


def instances_to_geojson(
    instances: list[dict[str, Any]],
    shapes: list[EntityShape],
    lang: str = "en",
) -> FeatureCollection:
    """Build one Feature per SPARQL instance, decoded via EntityShape descriptors.

    Args:
        instances: SPARQL result rows from ``sparql_for_instances``.
        shapes: Descriptors used to decode property columns.
        lang: UI language for the stories URL.

    Returns:
        GeoJSON FeatureCollection, one Point feature per pin. A row without
        usable coordinates is logged and skipped.
    """
    features = []
    for instance in instances:
        geometry = _parse_coordinates(instance)
        if geometry is None:
            logger.warning(
                "skipping %s: no usable coordinates (lat=%r, long=%r)",
                instance["s"],
                instance.get("lat"),
                instance.get("long"),
            )
            continue

        properties: dict[str, Any] = {
            "id": instance["s"],
            "label": instance["label"],
            "type": instance.get("typeLabelResult") or local_name(instance["type"]),
            "typeIri": instance["type"],
        }
        for shape in shapes:
            properties[shape.id] = extract_property(shape, instance)
        tag_id = properties.get("wpEntityTagId")
        properties["storiesUrl"] = config.entity_stories_url(tag_id, lang) if tag_id else ""

        features.append(Feature(geometry=geometry, properties=properties))

    return FeatureCollection(features)
