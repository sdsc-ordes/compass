from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query, Request

from app.core.deps import Lang, StoreDep
from app.namespaces import SPARQL_PREFIXES
from app.schemas.entities import FeatureCollection
from app.schemas.facets import FacetCounts
from app.sparql_builder import build_facet_query, sparql_for_instances
from app.sparql_terms import iri_term
from app.sparql_to_geojson_translator import instances_to_geojson

router = APIRouter()

# Tag dimensions excluded from facet counts — they are not thematic tags shown
# in the TagPanel (entityType is the legend; relatedProject/forum are relations).
_FACET_EXCLUDED = {"entityType", "relatedProject", "forum"}


@router.get(
    "/",
    response_model=FeatureCollection,
    summary="List entities as GeoJSON",
    description=(
        "Returns entities as GeoJSON. SPARQL and filters are driven by SHACL shapes."
    ),
)
async def get_entities(
    request: Request,
    lang: Lang,
    store: StoreDep,
) -> FeatureCollection:
    shapes = store.get_entities()
    sparql = sparql_for_instances(shapes, lang, request.query_params)
    instances = store.query(sparql)
    return FeatureCollection.model_validate(instances_to_geojson(instances, shapes, lang))


@router.get(
    "/facets",
    response_model=FacetCounts,
    summary="Facet counts for the current selection",
    description=(
        "Per-tag entity counts for the current selection (drill-down faceting). "
        "Returns {dimensionId: {tagIri: count}}. One SPARQL count query runs per "
        "tag dimension."
    ),
)
async def get_facets(
    request: Request,
    lang: Lang,
    store: StoreDep,
) -> FacetCounts:
    shapes = store.get_entities()
    facets: dict[str, dict[str, int]] = {}
    for field in shapes:
        sid = field.id
        if (
            field.filter_type != "multiselect"
            or field.category != "iri_with_label"
            or sid in _FACET_EXCLUDED
        ):
            continue
        sparql = build_facet_query(shapes, lang, request.query_params, sid)
        instances = store.query(sparql)
        facets[sid] = {
            row["val"]: int(row["n"])
            for row in instances
            if row.get("val") and row.get("n")
        }
    return facets


@router.get(
    "/detail",
    summary="Entity detail triples",
    description="Returns all predicate/object pairs for a single entity IRI.",
)
async def get_entity_detail(
    store: StoreDep,
    iri: str = Query(..., description="Full IRI of the entity"),
) -> list[dict[str, Any]]:
    subject = iri_term(iri)
    sparql = f"{SPARQL_PREFIXES}\n    SELECT ?p ?o WHERE {{ {subject} ?p ?o . }}"
    return store.query(sparql)
