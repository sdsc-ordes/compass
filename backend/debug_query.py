import os
import traceback
import sys

# Add backend dir to path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.rdf import get_store

def debug():
    try:
        print("--- DEBUG: Initializing Store ---")
        store = get_store()
        print("Store initialized.")

        # Test Filter Schema (this was working)
        print("\n--- DEBUG: Testing Filters Schema ---")
        filters = store.get_filters_schema(lang="en")
        print(f"Success! {len(filters)} filters found.")

        # Test Entities Query
        print("\n--- DEBUG: Testing Entities Query ---")
        sparql = """
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX wgs: <http://www.w3.org/2003/01/geo/wgs84_pos#>
        PREFIX compass: <http://oceancare.org/compass/>
        SELECT ?s ?label ?lat ?long ?type WHERE {
            ?s a ?type .
            ?type rdfs:subClassOf* compass:Entity .
            ?s rdfs:label ?label .
            ?s wgs:lat ?lat .
            ?s wgs:long ?long .
            FILTER(lang(?label) = "en")
        }
        """
        
        print(f"Running SPARQL query...")
        results = store.store.query(sparql) # Raw oxigraph query
        print(f"Query returned type: {type(results)}")
        
        # Explore attributes
        print(f"Available attributes on results: {dir(results)}")
        
        try:
             vars = results.variables
             print(f"Variables: {vars}")
        except Exception as e:
             print(f"Failed to get variables: {e}")
             vars = []

        # Try mapping to dict manually
        print("\n--- DEBUG: Row Iteration ---")
        count = 0
        for row in results:
            count += 1
            print(f"\nRow {count}:")
            print(f"Row type: {type(row)}")
            print(f"Dir(row): {dir(row)}")
            
            for v in vars:
                try:
                    val = row[v]
                    print(f"  {v}: {val} (type={type(val)})")
                except Exception as e:
                    print(f"  Failed to index by {v}: {e}")

        # Now test the actual wrapper method
        print("\n--- DEBUG: Testing Wrapper store.query() ---")
        parsed = store.query(sparql)
        print(f"Success! Wrapper returned {len(parsed)} items.")
        if parsed:
            print(f"Sample: {parsed[0]}")

    except Exception:
        print("\n--- CRITICAL ERROR ---")
        traceback.print_exc()

if __name__ == "__main__":
    debug()
