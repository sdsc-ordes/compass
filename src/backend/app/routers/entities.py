"""Entity routes: GeoJSON pins, facet counts, and per-entity triples."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query, Request

from app.core.deps import Lang, StoreDep
from app.namespaces import ENTITY_TYPE_ID, SPARQL_PREFIXES
from app.schemas.entities import FeatureCollection
from app.schemas.facets import FacetCounts
from app.sparql_builder import build_facet_query, sparql_for_instances
from app.sparql_terms import iri_term
from app.sparql_to_geojson_translator import instances_to_geojson

router = APIRouter()

# forum points at another pin rather than at a tag, so it gets no counts.
_FACET_EXCLUDED = {"forum"}


@router.get(
    "",
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
    shapes = store.entity_shapes()
    sparql = sparql_for_instances(shapes, lang, request.query_params)
    instances = store.query(sparql)
    return FeatureCollection.model_validate(instances_to_geojson(instances, shapes, lang))


@router.get(
    "/facets",
    response_model=FacetCounts,
    summary="Facet counts for the current selection",
    description=(
        "Per-tag entity counts for the current selection: each count is how "
        "many results remain if that tag is added to the selection. Tags within "
        "a dimension combine with AND, so a count can only shrink as more are "
        "picked; entityType is disjunctive and keeps drill-down counts. "
        "Returns {dimensionId: {tagIri: count}}. One SPARQL count query runs per "
        "tag dimension."
    ),
)
async def get_facets(
    request: Request,
    lang: Lang,
    store: StoreDep,
) -> FacetCounts:
    shapes = store.entity_shapes()
    dimensions = [
        shape.id
        for shape in shapes
        if shape.filter_type == "multiselect"
        and shape.category == "iri_with_label"
        and shape.id not in _FACET_EXCLUDED
    ]
    facets: FacetCounts = {}
    for dimension in [*dimensions, ENTITY_TYPE_ID]:
        sparql = build_facet_query(shapes, lang, request.query_params, dimension)
        facets[dimension] = {row["val"]: int(row["n"]) for row in store.query(sparql)}
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
