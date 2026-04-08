import os
import pyoxigraph
from rdflib import Graph, Namespace, URIRef, Literal, RDF, RDFS, SH, XSD

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data_path = os.path.join(base_dir, "ontology", "compass.ttl")
shapes_path = os.path.join(base_dir, "ontology", "shapes.ttl")

store = pyoxigraph.Store()
with open(data_path, "rb") as f:
    store.load(f, "text/turtle")
with open(shapes_path, "rb") as f:
    store.load(f, "text/turtle")

queries = [
    # 1. Check if we find any ResearchInstitutes
    "SELECT ?s WHERE { ?s a <http://example.org/ocean-org/ontology#ResearchInstitute> } LIMIT 5",
    
    # 2. Check if we find any organization names
    "SELECT ?s ?name WHERE { ?s <http://example.org/ocean-org/ontology#organizationName> ?name } LIMIT 5",

    # 3. Check the subclass relationship
    "SELECT ?type WHERE { ?type <http://www.w3.org/2000/01/rdf-schema#subClassOf> <http://example.org/ocean-org/ontology#Organization> }",
    
    # 4. The full join
    """
    PREFIX ocorg: <http://example.org/ocean-org/ontology#>
    PREFIX geo: <http://www.w3.org/2003/01/geo/wgs84_pos#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

    SELECT ?s ?label ?lat ?long ?type WHERE {
        ?s a ?type .
        ?type rdfs:subClassOf* ocorg:Organization .
        ?s ocorg:organizationName ?label .
        ?s geo:lat ?lat .
        ?s geo:long ?long .
    } LIMIT 5
    """
]

for i, q in enumerate(queries):
    print(f"\n--- Query {i+1} ---")
    try:
        results = store.query(q)
        count = 0
        for row in results:
            print({v.value: row[v].value for v in results.variables if row[v] is not None})
            count += 1
        print(f"Total: {count}")
    except Exception as e:
        print(f"Error: {e}")
