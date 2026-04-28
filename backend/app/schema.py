"""
SHACL shape introspection: filter schema and property specs.

Reads the OrganizationShape from shapes.ttl and produces:
  - get_filters_schema(): UI filter definitions (multiselect/slider/datepicker)
  - get_property_specs(): property metadata used to auto-generate SPARQL and parse results

Both functions accept a pre-parsed rdflib Graph so the Turtle files are only
parsed once (see RDFStore.rdflib_graph in rdf.py).
"""
from typing import Any, Dict, List

from rdflib import Graph, Literal, Namespace, RDF, RDFS, SH, URIRef
from rdflib.collection import Collection
from rdflib.namespace import SKOS, XSD

from .namespaces import COMPASS, GEO, SCHEMA


# Properties excluded from filters because they are handled in the SPARQL preamble
_PREAMBLE_PROPS = {GEO.lat, GEO.long, COMPASS.name}

# Nested relationships that require special OPTIONAL handling in queries
_NESTED_PROPS: set = set()

# Fetched for display but not exposed as filter dimensions
_DISPLAY_ONLY = {
    SCHEMA.url, SCHEMA.image, COMPASS.keySentence, COMPASS.activities,
    COMPASS.location, COMPASS.secretTheme, COMPASS.managedByOceanCare,
    COMPASS.mandate,
}

# All properties excluded from the standard per-property loop
_SKIP_PROPS = _PREAMBLE_PROPS | _NESTED_PROPS | _DISPLAY_ONLY


def get_label(g: Graph, subject: URIRef, predicate: URIRef, lang: str) -> str:
    """Return a label in *lang*, falling back to English, then any available label."""
    candidates = list(g.objects(subject, predicate))
    if predicate != SKOS.prefLabel:
        candidates += list(g.objects(subject, SKOS.prefLabel))

    for label in candidates:
        if isinstance(label, Literal) and label.language == lang:
            return str(label)
    for label in candidates:
        if isinstance(label, Literal) and label.language == "en":
            return str(label)
    if candidates:
        return str(candidates[0])
    return str(subject).split("#")[-1].split("/")[-1]


# ---------------------------------------------------------------------------
# Filter schema (used by /api/filters/schema)
# ---------------------------------------------------------------------------

def get_filters_schema(g: Graph, lang: str = "en") -> List[Dict[str, Any]]:
    """Build the filter UI schema by traversing the SHACL ForumShape."""
    filters: List[Dict[str, Any]] = []

    for prop in g.objects(COMPASS.ForumShape, SH.property):
        path = g.value(prop, SH.path)
        if path in _SKIP_PROPS:
            continue

        datatype = g.value(prop, SH.datatype)
        if datatype == XSD.anyURI:
            continue  # not user-filterable

        target_class = g.value(prop, SH["class"])
        sh_in_list = list(g.objects(prop, SH["in"]))
        path_str = str(path)
        local_name = path_str.split("#")[-1].split("/")[-1]

        widget = _infer_widget(datatype, target_class, sh_in_list)
        filter_item: Dict[str, Any] = {
            "id": local_name,
            "path": path_str,
            "label": get_label(g, prop, SH.name, lang),
            "type": widget,
            "order": 0,
        }

        if widget == "multiselect":
            filter_item["options"] = _multiselect_options(
                g, prop, path, target_class, sh_in_list, lang
            )
        elif widget == "slider":
            filter_item.update(_slider_bounds(g, prop, path, datatype))
        elif widget == "datepicker":
            filter_item.update(_datepicker_bounds(g, path))

        filters.append(filter_item)

    _add_entity_type_filter(g, filters, lang)
    return sorted(filters, key=lambda x: x["label"])


def _infer_widget(datatype, target_class, sh_in_list) -> str:
    if datatype in {XSD.integer, XSD.float, XSD.gYear}:
        return "slider"
    if datatype == XSD.date:
        return "datepicker"
    return "multiselect"


def _multiselect_options(g, prop, path, target_class, sh_in_list, lang) -> list:
    options = []
    if target_class:
        for s in g.subjects(RDF.type, target_class):
            options.append({"value": str(s), "label": get_label(g, s, RDFS.label, lang)})
    elif sh_in_list:
        for member in Collection(g, sh_in_list[0]):
            options.append({"value": str(member), "label": get_label(g, member, RDFS.label, lang)})
    else:
        seen: dict = {}
        for val in g.objects(None, path):
            if isinstance(val, URIRef):
                key = str(val)
                if key not in seen:
                    seen[key] = {
                        "value": key,
                        "label": get_label(g, val, RDFS.label, lang),
                    }
            elif isinstance(val, Literal) and (val.language == lang or val.language is None):
                key = str(val)
                if key not in seen:
                    seen[key] = {"value": key, "label": key}
        options = list(seen.values())
    return sorted(options, key=lambda x: x["label"])


def _slider_bounds(g, prop, path, datatype) -> dict:
    vals = [
        float(v) for v in g.objects(None, path)
        if v.isnumeric() or isinstance(v, (int, float, Literal))
    ]
    if datatype == XSD.gYear:
        return {"min": min(vals) if vals else 1900, "max": max(vals) if vals else 2026}
    return {
        "min": int(g.value(prop, SH.minInclusive) or (min(vals) if vals else 0)),
        "max": int(g.value(prop, SH.maxInclusive) or (max(vals) if vals else 1000)),
    }


def _datepicker_bounds(g, path) -> dict:
    date_vals = sorted([str(v) for v in g.objects(None, path) if str(v)])
    return {
        "min": date_vals[0] if date_vals else "2000-01-01",
        "max": date_vals[-1] if date_vals else "2026-12-31",
    }


def _add_entity_type_filter(g: Graph, filters: list, lang: str) -> None:
    """Append an entity-type multiselect for the 4 Compass entity classes."""
    type_classes = [
        COMPASS.InternationalForum, COMPASS.Network,
        COMPASS.PartnerOrganization, COMPASS.Project,
    ]
    filters.append({
        "id": "entityType",
        "path": str(RDF.type),
        "label": "Entity Type" if lang == "en" else "Eintragsart",
        "type": "multiselect",
        "order": 0,
        "options": [
            {"value": str(cls), "label": get_label(g, cls, RDFS.label, lang)}
            for cls in type_classes
        ],
    })


# ---------------------------------------------------------------------------
# Property specs (used by /api/entities to auto-generate SPARQL + parse results)
# ---------------------------------------------------------------------------

def get_property_specs(g: Graph) -> List[Dict[str, Any]]:
    """Return property metadata for every SHACL property in ForumShape
    that needs a SPARQL OPTIONAL clause and a GeoJSON output field."""
    specs = []

    for prop_node in g.objects(COMPASS.ForumShape, SH.property):
        path = g.value(prop_node, SH.path)
        if path is None or path in _PREAMBLE_PROPS or path in _NESTED_PROPS:
            continue

        path_str = str(path)
        datatype = g.value(prop_node, SH.datatype)
        target_class = g.value(prop_node, SH["class"])
        sh_in_list = list(g.objects(prop_node, SH["in"]))
        node_kind = g.value(prop_node, SH.nodeKind)
        max_count_val = g.value(prop_node, SH.maxCount)

        is_multi = max_count_val is None or int(str(max_count_val)) != 1
        is_iri = (
            (node_kind is not None and str(node_kind) == str(SH.IRI))
            or target_class is not None
            or bool(sh_in_list)
        )

        category = _infer_category(datatype, is_iri)
        filter_type = _infer_filter_type(path, category, datatype)

        specs.append({
            "id": path_str.split("#")[-1].split("/")[-1],
            "path_iri": path_str,
            "category": category,
            "is_multi": is_multi,
            "filter_type": filter_type,
            "datatype": str(datatype) if datatype else None,
        })

    return specs


def _infer_category(datatype, is_iri: bool) -> str:
    if is_iri:
        return "iri_with_label"
    if datatype is not None and str(datatype) == str(XSD.anyURI):
        return "uri_literal"
    if datatype is not None and str(datatype) == str(XSD.boolean):
        return "boolean"
    if datatype is not None and str(datatype) in (str(XSD.string), str(RDF.langString)):
        return "lang_literal"
    return "simple_literal"  # integer, gYear, date, float, double


def _infer_filter_type(path, category: str, datatype) -> str:
    if path in _DISPLAY_ONLY or category in ("uri_literal", "boolean"):
        return "none"
    if category == "iri_with_label":
        return "multiselect"
    if datatype is not None and str(datatype) in {
        str(XSD.integer), str(XSD.float), str(XSD.double), str(XSD.gYear)
    }:
        return "slider"
    if datatype is not None and str(datatype) == str(XSD.date):
        return "datepicker"
    if category == "lang_literal":
        return "multiselect"
    return "none"
