from fastapi import APIRouter, Depends, Query, Request

from ..rdf import get_store, RDFStore
from ..sparql_builder import build_entities_query
from ..result_parser import results_to_geojson

router = APIRouter()


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
