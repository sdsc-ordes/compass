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
        OPTIONAL {{
            ?s ocorg:primaryOceanRegion ?regionNode .
            ?regionNode skos:prefLabel ?regionLab .
            FILTER(lang(?regionLab) = "{lang}")
        }}
        OPTIONAL {{
            ?s ocorg:fundingSource ?fundingNode .
            ?fundingNode skos:prefLabel ?fundingLab .
            FILTER(lang(?fundingLab) = "{lang}")
        }}
        OPTIONAL {{
            ?s ocorg:accessType ?accessNode .
            ?accessNode skos:prefLabel ?accessLab .
            FILTER(lang(?accessLab) = "{lang}")
        }}
        OPTIONAL {{ ?s ocorg:keySentence ?keySentence . FILTER(lang(?keySentence) = "{lang}") }}
        OPTIONAL {{ ?s ocorg:mostRecentUpdate ?mostRecentUpdate . }}
        OPTIONAL {{ ?s ocorg:donationUrl ?donationUrl . }}
        OPTIONAL {{ ?s ocorg:offersResearchTrips ?offersResearchTrips . }}
        OPTIONAL {{
            ?s ocorg:activities ?activity .
            FILTER(lang(?activity) = "{lang}")
        }}
        OPTIONAL {{
            ?s ocorg:hasProject ?project .
            ?project ocorg:projectName ?projName .
            FILTER(lang(?projName) = "{lang}")
            OPTIONAL {{ ?project ocorg:startDate ?projStart . }}
            OPTIONAL {{ ?project ocorg:endDate ?projEnd . }}
            OPTIONAL {{ ?project ocorg:imageUrl ?projImage . }}
            OPTIONAL {{ ?project ocorg:projectUrl ?projUrl . }}
            OPTIONAL {{ ?project ocorg:species ?projSpecies . FILTER(lang(?projSpecies) = "en") }}
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
        
        elif key == "species":
            # Filter through hasProject/species join
            filter_parts = []
            for v in values:
                safe_v = v.replace('"', '\\"')
                filter_parts.append(
                    f'?s ocorg:hasProject ?speciesProj . ?speciesProj ocorg:species ?speciesVal . FILTER(str(?speciesVal) = "{safe_v}")'
                )
            if filter_parts:
                if len(filter_parts) > 1:
                    where_clauses.append("{ " + " } UNION { ".join(filter_parts) + " }")
                else:
                    where_clauses.append(filter_parts[0])
        
        elif key == "mostRecentUpdate":
            # Date filter: show organizations updated on or after the given date
            safe_v = val.replace('"', '\\"')
            where_clauses.append(f'?s ocorg:mostRecentUpdate ?mruVal . FILTER(?mruVal >= "{safe_v}"^^xsd:date)')
        
        elif key in RANGE_FILTERS:
            prop = RANGE_FILTERS[key]
            where_clauses.append(f"?s {prop} ?{key}Val . FILTER(?{key}Val >= {val})")

    full_sparql = sparql_prefixes + """
    SELECT ?s ?label ?lat ?long ?type ?country ?founded ?website
           (GROUP_CONCAT(DISTINCT CONCAT(STR(?focusArea), "|", COALESCE(?focusLabel, "")); separator=";;") AS ?focusAreasRaw)
           (SAMPLE(?regionNode) AS ?regionIri)
           (SAMPLE(?regionLab) AS ?regionLabel)
           (SAMPLE(?fundingNode) AS ?fundingIri)
           (SAMPLE(?fundingLab) AS ?fundingLabel)
           (SAMPLE(?accessNode) AS ?accessIri)
           (SAMPLE(?accessLab) AS ?accessLabel)
           (SAMPLE(?keySentence) AS ?keySent)
           (SAMPLE(?mostRecentUpdate) AS ?lastUpdate)
           (SAMPLE(?donationUrl) AS ?donateUrl)
           (SAMPLE(?offersResearchTrips) AS ?researchTrips)
           (GROUP_CONCAT(DISTINCT ?activity; separator=";;") AS ?activitiesRaw)
           (GROUP_CONCAT(DISTINCT CONCAT(COALESCE(?projName, ""), "|", COALESCE(STR(?projStart), ""), "|", COALESCE(STR(?projEnd), ""), "|", COALESCE(STR(?projImage), ""), "|", COALESCE(STR(?projUrl), "")); separator=";;") AS ?projectsRaw)
           (GROUP_CONCAT(DISTINCT STR(?projSpecies); separator=";;") AS ?speciesRaw)
    WHERE {
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

            # Parse focus areas from "iri|label;;iri|label" format
            focus_raw = res.get("focusAreasRaw", "") or ""
            focus_areas = []
            for pair in focus_raw.split(";;"):
                parts = pair.strip().split("|", 1)
                if len(parts) == 2 and parts[0]:
                    focus_areas.append({"iri": parts[0].strip(), "label": parts[1].strip()})

            # Parse activities from "act1;;act2" format
            activities_raw = res.get("activitiesRaw", "") or ""
            activities = [a.strip() for a in activities_raw.split(";;") if a.strip()]

            # Parse species from all projects
            species_raw = res.get("speciesRaw", "") or ""
            all_species = [s.strip() for s in species_raw.split(";;") if s.strip()]

            # Parse projects from "name|start|end|image;;..." format
            projects_raw = res.get("projectsRaw", "") or ""
            projects = []
            for entry in projects_raw.split(";;"):
                parts = entry.strip().split("|")
                if len(parts) >= 1 and parts[0]:
                    proj = {"name": parts[0]}
                    if len(parts) > 1 and parts[1]: proj["startDate"] = parts[1]
                    if len(parts) > 2 and parts[2]: proj["endDate"] = parts[2]
                    if len(parts) > 3 and parts[3]: proj["imageUrl"] = parts[3]
                    if len(parts) > 4 and parts[4]: proj["projectUrl"] = parts[4]
                    projects.append(proj)

            def make_iri_obj(iri_val, label_val):
                if not iri_val:
                    return None
                label = str(label_val) if label_val else str(iri_val).split("#")[-1].split("/")[-1]
                return {"iri": str(iri_val), "label": label}

            properties = {
                "id": res["s"],
                "label": res["label"],
                "type": res["type"].split("#")[-1] if "#" in res["type"] else res["type"].split("/")[-1],
                "typeIri": res["type"],
                "country": res.get("country", ""),
                "founded": res.get("founded", ""),
                "website": res.get("website", ""),
                "focusAreas": focus_areas,
                "primaryOceanRegion": make_iri_obj(res.get("regionIri"), res.get("regionLabel")),
                "fundingSource": make_iri_obj(res.get("fundingIri"), res.get("fundingLabel")),
                "accessType": make_iri_obj(res.get("accessIri"), res.get("accessLabel")),
                "keySentence": res.get("keySent", ""),
                "mostRecentUpdate": res.get("lastUpdate", ""),
                "donationUrl": res.get("donateUrl", ""),
                "offersResearchTrips": res.get("researchTrips", "") == "true",
                "activities": activities,
                "projects": projects,
                "species": all_species,
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
