"""
SPARQL result parsing and GeoJSON conversion for the entities endpoint.

The main entry point is results_to_geojson(), which converts a list of SPARQL
result rows (from RDFStore.query) into a GeoJSON FeatureCollection.

Helper functions are grouped by concern:
  - extract_property: per-property value extraction from a result row
  - _parse_projects / _parse_species / _parse_special_properties: special-case fields
"""
from typing import Any, Dict, List

from geojson import Feature, FeatureCollection, Point

from .namespaces import ITEM_SEP, FIELD_SEP



def extract_property(spec: dict, res: dict) -> Any:
    """Extract a typed property value from a SPARQL result row.

    Handles iri_with_label, boolean, multi-valued, and scalar cases.
    """
    sid = spec["id"]
    cat = spec["category"]
    is_multi = spec["is_multi"]

    if cat == "iri_with_label":
        if is_multi:
            raw = res.get(f"{sid}Raw", "") or ""
            items = []
            for pair in raw.split(ITEM_SEP):
                parts = pair.strip().split(FIELD_SEP, 1)
                if len(parts) == 2 and parts[0]:
                    items.append({"iri": parts[0].strip(), "label": parts[1].strip()})
            return items
        else:
            iri_val = res.get(f"{sid}Iri")
            label_val = res.get(f"{sid}Label")
            if not iri_val:
                return None
            label = str(label_val) if label_val else str(iri_val).split("#")[-1].split("/")[-1]
            return {"iri": str(iri_val), "label": label}

    if cat == "boolean":
        return res.get(f"{sid}Result", "") == "true"

    if is_multi:
        raw = res.get(f"{sid}Raw", "") or ""
        return [a.strip() for a in raw.split(ITEM_SEP) if a.strip()]

    return res.get(f"{sid}Result", "")


def _parse_special_properties(res: dict) -> dict:
    """Extract type-specific fields (Network/Forum/Project) from a result row."""
    return {
        "memberCount": res.get("memberCountResult", ""),
        "memberStates": res.get("memberStatesResult", ""),
        "mandate": res.get("mandateResult", ""),
        "startDate": res.get("selfStart", ""),
        "endDate": res.get("selfEnd", ""),
    }


def results_to_geojson(
    results: List[Dict[str, Any]],
    specs: List[Dict[str, Any]],
) -> FeatureCollection:
    """Convert SPARQL result rows into a GeoJSON FeatureCollection.

    Args:
        results: List of result dicts from RDFStore.query().
        specs: Property specs from RDFStore.get_property_specs().

    Returns:
        A GeoJSON FeatureCollection with one Feature per valid result row.
    """
    features = []
    for res in results:
        try:
            lat = float(res["lat"])
            lng = float(res["long"])

            properties: Dict[str, Any] = {
                "id": res["s"],
                "label": res["label"],
                "type": str(res.get("typeLabelResult") or (
                    res["type"].split("#")[-1] if "#" in res["type"]
                    else res["type"].split("/")[-1]
                )),
                "typeIri": res["type"],
            }

            for spec in specs:
                properties[spec["id"]] = extract_property(spec, res)

            properties.update(_parse_special_properties(res))

            features.append(Feature(geometry=Point((lng, lat)), properties=properties))
        except (ValueError, KeyError):
            continue

    return FeatureCollection(features)
