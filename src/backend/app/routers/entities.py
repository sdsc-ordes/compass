from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query, Request

from app.core.deps import Lang, StoreDep
from app.namespaces import SPARQL_PREFIXES
from app.result_parser import results_to_geojson
from app.schemas.entities import FeatureCollection
from app.schemas.facets import FacetCounts
from app.sparql_builder import build_entities_query, build_facet_query
from app.sparql_terms import iri_term

router = APIRouter()

# Tag dimensions excluded from facet counts — they are not thematic tags shown
# in the TagPanel (entityType is the legend; relatedProject/forum are relations).
_FACET_EXCLUDED = {"entityType", "relatedProject", "forum"}


@router.get("/", response_model=FeatureCollection)
async def get_entities(
    request: Request,
    lang: Lang,
    store: StoreDep,
) -> FeatureCollection:
    """Returns entities as GeoJSON, with SPARQL and filters driven by SHACL shapes."""
    specs = store.get_property_specs()
    sparql = build_entities_query(specs, lang, request.query_params)
    results = store.query(sparql)
    return FeatureCollection.model_validate(results_to_geojson(results, specs, lang))


@router.get("/facets", response_model=FacetCounts)
async def get_facets(
    request: Request,
    lang: Lang,
    store: StoreDep,
) -> FacetCounts:
    """Per-tag entity counts for the current selection (drill-down faceting).

    Returns {dimensionId: {tagIri: count}}. One SPARQL count query runs per tag
    dimension (~6); acceptable for the in-process Oxigraph store and dataset size.
    """
    specs = store.get_property_specs()
    facets: dict[str, dict[str, int]] = {}
    for spec in specs:
        sid = spec["id"]
        if (
            spec["filter_type"] != "multiselect"
            or spec["category"] != "iri_with_label"
            or sid in _FACET_EXCLUDED
        ):
            continue
        sparql = build_facet_query(specs, lang, request.query_params, sid)
        rows = store.query(sparql)
        facets[sid] = {
            row["val"]: int(row["n"]) for row in rows if row.get("val") and row.get("n")
        }
    return facets


@router.get("/detail")
async def get_entity_detail(
    store: StoreDep,
    iri: str = Query(..., description="Full IRI of the entity"),
) -> list[dict[str, Any]]:
    """Returns single entity detail for popup."""
    subject = iri_term(iri)
    sparql = f"{SPARQL_PREFIXES}\n    SELECT ?p ?o WHERE {{ {subject} ?p ?o . }}"
    return store.query(sparql)
