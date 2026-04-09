import os
from typing import List, Dict, Any, Optional
import pyoxigraph
from rdflib import Graph, Namespace, URIRef, Literal, RDF, RDFS, SH

COMPASS = Namespace("http://oceancare.org/compass/")
WGS = Namespace("http://www.w3.org/2003/01/geo/wgs84_pos#")

class RDFStore:
    def __init__(self, data_path: str, shapes_path: str, vocab_path: str):
        self.store = pyoxigraph.Store()
        self.data_path = data_path
        self.shapes_path = shapes_path
        self.vocab_path = vocab_path
        self.load_data()

    def load_data(self):
        """Loads Turtle files into the Oxigraph store."""
        with open(self.data_path, "rb") as f:
            self.store.load(f, "text/turtle")
        with open(self.shapes_path, "rb") as f:
            self.store.load(f, "text/turtle")
        with open(self.vocab_path, "rb") as f:
            self.store.load(f, "text/turtle")

    def query(self, sparql: str) -> List[Dict[str, Any]]:
        """Executes a SPARQL SELECT query and returns a list of result dictionaries."""
        import time
        start_time = time.time()
        try:
            results = self.store.query(sparql)
            variables = results.variables
            
            parsed_results = []
            for row in results:
                item = {}
                for var in variables:
                    val = row[var]
                    if val is not None:
                        # NamedNode, Literal, and BlankNode all have .value in 0.5.x
                        # but BlankNode might need prefixing for consistency
                        if isinstance(val, pyoxigraph.BlankNode):
                            item[var.value] = f"_:{val.value}"
                        else:
                            item[var.value] = val.value
                parsed_results.append(item)
            
            end_time = time.time()
            print(f"DEBUG: SPARQL query executed in {end_time - start_time:.4f}s")
            return parsed_results
        except Exception:
            import traceback
            traceback.print_exc()
            raise

    def get_filters_schema(self, lang: str = "en") -> List[Dict[str, Any]]:
        """
        Introspects SHACL shapes to build the filter schema.
        We use rdflib for easier shape traversal and language selection.
        """
        g = Graph()
        g.parse(self.shapes_path, format="turtle")
        g.parse(self.data_path, format="turtle")
        g.parse(self.vocab_path, format="turtle")

        OCORG = Namespace("http://example.org/ocean-org/ontology#")
        GEO = Namespace("http://www.w3.org/2003/01/geo/wgs84_pos#")

        filters = []
        # Find the main OrganizationShape
        shape_uri = OCORG.OrganizationShape
        
        # We skip geo:lat and geo:long from the filters as they are purely for mapping
        from rdflib.namespace import XSD
        SKIP_PROPS = {GEO.lat, GEO.long, OCORG.organizationName, OCORG.websiteUrl,
                      OCORG.keySentence, OCORG.activities, OCORG.hasProject,
                      OCORG.donationUrl, OCORG.offersResearchTrips}

        # Iterate over sh:property
        for prop in g.objects(shape_uri, SH.property):
            path = g.value(prop, SH.path)
            if path in SKIP_PROPS: continue

            name = self._get_label(g, prop, SH.name, lang)
            datatype = g.value(prop, SH.datatype)
            target_class = g.value(prop, SH["class"])
            sh_in_list = list(g.objects(prop, SH["in"]))

            # Skip anyURI properties (e.g. websiteUrl) — not filterable
            if datatype == XSD.anyURI:
                continue

            # Infer widget type
            widget = "multiselect"  # Default
            if datatype in {XSD.integer, XSD.float, XSD.gYear}:
                widget = "slider"
            elif datatype == XSD.date:
                widget = "datepicker"
            elif target_class or sh_in_list:
                widget = "multiselect"

            # Robust local name extraction for IDs
            path_str = str(path)
            local_name = path_str.split("#")[-1].split("/")[-1]

            filter_item = {
                "id": local_name,
                "path": path_str,
                "label": name,
                "type": widget,
                "order": 0 
            }

            if widget == "multiselect":
                options = []
                if target_class:
                    # Class-based property (e.g. hasFocusArea) — enumerate instances
                    for s in g.subjects(RDF.type, target_class):
                        options.append({
                            "value": str(s),
                            "label": self._get_label(g, s, RDFS.label, lang)
                        })
                elif sh_in_list:
                    # sh:in enumeration of IRIs — read labels from vocab
                    from rdflib.collection import Collection
                    head = sh_in_list[0]
                    members = list(Collection(g, head))
                    for member in members:
                        options.append({
                            "value": str(member),
                            "label": self._get_label(g, member, RDFS.label, lang)
                        })
                else:
                    # Plain literal property (e.g. country) — enumerate unique values from data
                    values = set(g.objects(None, path))
                    for val in values:
                        if isinstance(val, Literal) and (val.language == lang or val.language is None):
                            options.append({
                                "value": str(val),
                                "label": str(val)
                            })
                filter_item["options"] = sorted(options, key=lambda x: x["label"])

            elif widget == "slider":
                # Find min/max in the actual data if not explicitly in SHACL
                vals = [float(v) for v in g.objects(None, path) if v.isnumeric() or isinstance(v, (int, float, Literal))]
                filter_item["min"] = int(g.value(prop, SH.minInclusive) or (min(vals) if vals else 0))
                filter_item["max"] = int(g.value(prop, SH.maxInclusive) or (max(vals) if vals else 1000))
                # Ensure foundedYear has a reasonable scale
                if datatype == XSD.gYear:
                    filter_item["min"] = min(vals) if vals else 1900
                    filter_item["max"] = max(vals) if vals else 2026

            elif widget == "datepicker":
                date_vals = sorted([str(v) for v in g.objects(None, path) if str(v)])
                filter_item["min"] = date_vals[0] if date_vals else "2000-01-01"
                filter_item["max"] = date_vals[-1] if date_vals else "2026-12-31"

            filters.append(filter_item)

        # Special: Species filter — enumerate all unique species from project instances
        species_values = set()
        for subj in g.subjects(RDF.type, OCORG.Project):
            for obj in g.objects(subj, OCORG.species):
                if isinstance(obj, Literal) and (obj.language == lang or obj.language is None):
                    species_values.add(str(obj))

        if species_values:
            filters.append({
                "id": "species",
                "path": str(OCORG.species),
                "label": "Species" if lang == "en" else "Arten",
                "type": "multiselect",
                "order": 0,
                "options": sorted(
                    [{"value": s, "label": s} for s in species_values],
                    key=lambda x: x["label"]
                )
            })

        return sorted(filters, key=lambda x: x["label"]) # Alphabetical for now

    def _get_label(self, g: Graph, subject: URIRef, predicate: URIRef, lang: str) -> str:
        """Helper to get a label in a specific language, falling back to English.
        Also checks skos:prefLabel when the primary predicate yields nothing."""
        from rdflib.namespace import SKOS
        candidates = list(g.objects(subject, predicate))
        if predicate != SKOS.prefLabel:
            candidates += list(g.objects(subject, SKOS.prefLabel))
        # Try requested language
        for label in candidates:
            if isinstance(label, Literal) and label.language == lang:
                return str(label)
        # Try English fallback
        for label in candidates:
            if isinstance(label, Literal) and label.language == "en":
                return str(label)
        # Try any label
        if candidates:
            return str(candidates[0])
        return str(subject).split("#")[-1].split("/")[-1]

store_instance: Optional[RDFStore] = None

def get_store() -> RDFStore:
    global store_instance
    if store_instance is None:
        # Assuming we are running from backend/
        # Adjust paths if necessary. 
        # For now, let's look for ontology in ../ontology
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        data_path = os.path.join(base_dir, "ontology", "compass.ttl")
        shapes_path = os.path.join(base_dir, "ontology", "shapes.ttl")
        vocab_path = os.path.join(base_dir, "ontology", "vocab.ttl")
        store_instance = RDFStore(data_path, shapes_path, vocab_path)
    return store_instance
