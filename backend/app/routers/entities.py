from fastapi import APIRouter, Depends, Query, Request

from ..rdf import get_store, RDFStore
from ..sparql_builder import build_entities_query, build_facet_query
from ..result_parser import results_to_geojson

router = APIRouter()

# Tag dimensions excluded from facet counts — they are not thematic tags shown
# in the TagPanel (entityType is the legend; relatedProject/forum are relations).
_FACET_EXCLUDED = {"entityType", "relatedProject", "forum"}


@router.get("/")
async def get_entities(
    request: Request,
    lang: str = Query("en", pattern="^(en|de)$"),
    store: RDFStore = Depends(get_store),
):
    """Returns entities as GeoJSON, with SPARQL and filters driven by SHACL shapes."""
    specs = store.get_property_specs()
    sparql = build_entities_query(specs, lang, request.query_params)
    results = store.query(sparql)
    return results_to_geojson(results, specs)


@router.get("/facets")
async def get_facets(
    request: Request,
    lang: str = Query("en", pattern="^(en|de)$"),
    store: RDFStore = Depends(get_store),
):
    """Per-tag entity counts for the current selection (drill-down faceting).

    Returns {dimensionId: {tagIri: count}}. One SPARQL count query runs per tag
    dimension (~6); acceptable for the in-process Oxigraph store and dataset size.
    """
    specs = store.get_property_specs()
    facets: dict = {}
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
    iri: str = Query(..., description="Full IRI of the entity"),
    lang: str = Query("en", pattern="^(en|de)$"),
    store: RDFStore = Depends(get_store),
):
    """Returns single entity detail for popup."""
    sparql = f"""
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    SELECT ?p ?o WHERE {{
        <{iri}> ?p ?o .
    }}
    """
    return store.query(sparql)
