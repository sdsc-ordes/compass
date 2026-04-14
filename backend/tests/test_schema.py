"""Schema introspection tests.

Validates that get_filters_schema() and get_property_specs() produce
consistent, complete output from the real ontology shapes.
"""
from app.schema import get_filters_schema, get_property_specs, _SKIP_PROPS, _DISPLAY_ONLY
from app.namespaces import COMPASS


class TestGetFiltersSchema:
    def test_returns_filters(self, rdflib_graph):
        filters = get_filters_schema(rdflib_graph, "en")
        assert len(filters) > 0, "No filters returned from shapes"

    def test_no_duplicate_ids(self, rdflib_graph):
        filters = get_filters_schema(rdflib_graph, "en")
        ids = [f["id"] for f in filters]
        assert len(ids) == len(set(ids)), f"Duplicate filter IDs: {ids}"

    def test_species_filter_present(self, rdflib_graph):
        filters = get_filters_schema(rdflib_graph, "en")
        ids = {f["id"] for f in filters}
        assert "species" in ids, "Species filter missing — check Project instances have compass:species"

    def test_entity_type_filter_present(self, rdflib_graph):
        filters = get_filters_schema(rdflib_graph, "en")
        ids = {f["id"] for f in filters}
        assert "entityType" in ids, "Entity type filter missing"

    def test_entity_type_has_all_known_types(self, rdflib_graph):
        filters = get_filters_schema(rdflib_graph, "en")
        et_filter = next(f for f in filters if f["id"] == "entityType")
        type_iris = {opt["value"] for opt in et_filter["options"]}
        expected = {
            str(COMPASS.ResearchInstitute), str(COMPASS.University),
            str(COMPASS.GovernmentAgency), str(COMPASS.NGO),
            str(COMPASS.Network), str(COMPASS.InternationalForum), str(COMPASS.Project),
        }
        assert expected <= type_iris, (
            f"Missing entity types in filter: {expected - type_iris}"
        )

    def test_multiselect_filters_have_options(self, rdflib_graph):
        filters = get_filters_schema(rdflib_graph, "en")
        for f in filters:
            if f["type"] == "multiselect":
                assert "options" in f, f"Multiselect filter {f['id']} has no options"
                assert len(f["options"]) > 0, f"Multiselect filter {f['id']} has empty options"

    def test_slider_filters_have_bounds(self, rdflib_graph):
        filters = get_filters_schema(rdflib_graph, "en")
        for f in filters:
            if f["type"] == "slider":
                assert "min" in f, f"Slider filter {f['id']} has no min"
                assert "max" in f, f"Slider filter {f['id']} has no max"
                assert f["min"] <= f["max"], f"Slider {f['id']}: min > max"

    def test_german_labels_differ(self, rdflib_graph):
        en_filters = get_filters_schema(rdflib_graph, "en")
        de_filters = get_filters_schema(rdflib_graph, "de")
        en_labels = {f["id"]: f["label"] for f in en_filters}
        de_labels = {f["id"]: f["label"] for f in de_filters}
        # At least some labels should differ between languages
        diffs = [k for k in en_labels if k in de_labels and en_labels[k] != de_labels[k]]
        assert len(diffs) > 0, "No labels differ between en and de — i18n may be broken"


class TestGetPropertySpecs:
    def test_returns_specs(self, rdflib_graph):
        specs = get_property_specs(rdflib_graph)
        assert len(specs) > 0, "No property specs returned"

    def test_no_preamble_props_in_specs(self, rdflib_graph):
        """Properties handled in the SPARQL preamble should not appear in specs."""
        specs = get_property_specs(rdflib_graph)
        spec_iris = {s["path_iri"] for s in specs}
        from app.namespaces import GEO
        for prop in [GEO.lat, GEO.long, COMPASS.organizationName]:
            assert str(prop) not in spec_iris, (
                f"{prop} should be excluded from specs (handled in preamble)"
            )

    def test_no_nested_props_in_specs(self, rdflib_graph):
        specs = get_property_specs(rdflib_graph)
        spec_iris = {s["path_iri"] for s in specs}
        assert str(COMPASS.hasProject) not in spec_iris, (
            "hasProject should be excluded (handled by _special_optionals)"
        )

    def test_spec_categories_valid(self, rdflib_graph):
        valid = {"lang_literal", "simple_literal", "uri_literal", "iri_with_label", "boolean"}
        for spec in get_property_specs(rdflib_graph):
            assert spec["category"] in valid, f"Invalid category '{spec['category']}' for {spec['id']}"

    def test_spec_filter_types_valid(self, rdflib_graph):
        valid = {"multiselect", "slider", "datepicker", "none"}
        for spec in get_property_specs(rdflib_graph):
            assert spec["filter_type"] in valid, f"Invalid filter_type '{spec['filter_type']}' for {spec['id']}"

    def test_display_only_props_have_none_filter(self, rdflib_graph):
        """Properties in _DISPLAY_ONLY should get filter_type='none'."""
        specs = get_property_specs(rdflib_graph)
        display_iris = {str(p) for p in _DISPLAY_ONLY}
        for spec in specs:
            if spec["path_iri"] in display_iris:
                assert spec["filter_type"] == "none", (
                    f"Display-only property {spec['id']} has filter_type='{spec['filter_type']}' "
                    f"instead of 'none'"
                )
