from fastapi import APIRouter, Depends, Query, Request
from ..rdf import get_store, RDFStore, COMPASS, WGS
from geojson import Feature, Point, FeatureCollection
from rdflib import RDF, URIRef

router = APIRouter()

@router.get("/")
async def get_entities(
    request: Request,
    lang: str = Query("en", pattern="^(en|de)$"),
    store: RDFStore = Depends(get_store)
):
    """
    Returns oceanographic organizations as GeoJSON, applying filters dynamically.
    """
    features = []

    # 1. Base SPARQL prefixes and selection
    sparql_prefixes = """
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
    PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
    PREFIX ocorg: <http://example.org/ocean-org/ontology#>
    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
    """

    sparql_where_base = f"""
        ?s a ?type .
        ?type rdfs:subClassOf* ocorg:Organization .
        ?s ocorg:organizationName ?label .
        ?s geo:lat ?lat .
        ?s geo:long ?long .
        
        OPTIONAL {{ ?s ocorg:country ?country . FILTER(lang(?country) = "{lang}") }}
        OPTIONAL {{ ?s ocorg:foundedYear ?founded . }}
        OPTIONAL {{ ?s ocorg:websiteUrl ?website . }}
        OPTIONAL {{
            ?s ocorg:hasFocusArea ?focusArea .
            ?focusArea skos:prefLabel ?focusLabel .
            FILTER(lang(?focusLabel) = "{lang}")
        }}
        
        FILTER(lang(?label) = "{lang}")
    """

    # 2. Dynamic Filter Application
    # Map query parameter keys to ontology property IRIs
    # These now match the local names (after the split("#") part)
    FILTER_MAP = {
        "hasFocusArea": "ocorg:hasFocusArea",
        "primaryOceanRegion": "ocorg:primaryOceanRegion",
        "country": "ocorg:country",
        "fundingSource": "ocorg:fundingSource",
        "accessType": "ocorg:accessType",
        "openAccessData": "ocorg:openAccessData"
    }
    
    # Range filters
    RANGE_FILTERS = {
        "staffSize": "ocorg:staffSize",
        "annualBudgetUSD": "ocorg:annualBudgetUSD",
        "researchVessels": "ocorg:researchVessels",
        "foundedYear": "ocorg:foundedYear",
        "publicationsPerYear": "ocorg:publicationsPerYear"
    }

    where_clauses = []
    for key, val in request.query_params.items():
        if key == "lang" or not val: continue
        
        # Handle Multiselect
        values = request.query_params.getlist(key) if key in request.query_params else [val]
        
        if key in FILTER_MAP:
            prop = FILTER_MAP[key]
            filter_parts = []
            for v in values:
                if v.startswith("http"):
                    filter_parts.append(f"?s {prop} <{v}> .")
                else:
                    # Generic handling for both @lang and plain literals
                    # For filtering, we'll use a regex or lang check or just match both
                    filter_parts.append(f"?s {prop} ?{key}Val . FILTER(str(?{key}Val) = \"{v}\")")
            
            if len(filter_parts) > 1:
                where_clauses.append("{ " + " } UNION { ".join(filter_parts) + " }")
            else:
                where_clauses.append(filter_parts[0])
        
        elif key in RANGE_FILTERS:
            prop = RANGE_FILTERS[key]
            where_clauses.append(f"?s {prop} ?{key}Val . FILTER(?{key}Val >= {val})")

    full_sparql = sparql_prefixes + """
    SELECT ?s ?label ?lat ?long ?type ?country ?founded ?website (GROUP_CONCAT(?focusLabel; separator=", ") AS ?focusAreas) WHERE {
    """ + sparql_where_base + "\n".join(where_clauses) + """
    }
    GROUP BY ?s ?label ?lat ?long ?type ?country ?founded ?website
    """
    results = store.query(full_sparql)

    # 3. Convert to GeoJSON
    for res in results:
        try:
            lat = float(res["lat"])
            lng = float(res["long"])
            
            properties = {
                "id": res["s"],
                "label": res["label"],
                "type": res["type"].split("#")[-1] if "#" in res["type"] else res["type"].split("/")[-1],
                "country": res.get("country", ""),
                "founded": res.get("founded", ""),
                "website": res.get("website", ""),
                "description": f"Focus: {res.get('focusAreas', 'N/A')}, Founded: {res.get('founded', 'N/A')}"
            }
            
            feature = Feature(
                geometry=Point((lng, lat)),
                properties=properties
            )
            features.append(feature)
        except (ValueError, KeyError):
            continue

    return FeatureCollection(features)

@router.get("/{entity_id}")
async def get_entity_detail(
    entity_id: str,
    lang: str = Query("en", pattern="^(en|de)$"),
    store: RDFStore = Depends(get_store)
):
    """Returns single entity detail for popup."""
    # Assuming entity_id is a full URI or we construct it
    # For now, let's assume it's the full URI passed as a string
    # In a real app, we might encode it or just use the local part.
    
    sparql = f"""
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    PREFIX compass: <http://oceancare.org/compass/>
    SELECT ?p ?o WHERE {{
        <{entity_id}> ?p ?o .
    }}
    """
    results = store.query(sparql)
    return results
