"""SHACL projection tests: filter widgets and entity property descriptors."""

from rdflib import Literal
from rdflib.namespace import SKOS

from app.namespaces import COMPASS, GEO
from app.shacl_to_entities import DISPLAY_ONLY, get_entity_shape_from_shacl
from app.shacl_to_filters import get_filters_from_shacl


class TestGetFilterWidgets:
    def test_returns_filters(self, read_graph):
        filters = get_filters_from_shacl(read_graph, "en")
        assert len(filters) > 0, "No filters returned from shapes"

    def test_no_duplicate_ids(self, read_graph):
        filters = get_filters_from_shacl(read_graph, "en")
        ids = [f.id for f in filters]
        assert len(ids) == len(set(ids)), f"Duplicate filter IDs: {ids}"

    def test_entity_type_filter_present(self, read_graph):
        filters = get_filters_from_shacl(read_graph, "en")
        ids = {f.id for f in filters}
        assert "entityType" in ids, "Entity type filter missing"

    def test_entity_type_has_all_known_types(self, read_graph):
        filters = get_filters_from_shacl(read_graph, "en")
        et_filter = next(f for f in filters if f.id == "entityType")
        assert et_filter.options is not None
        type_iris = {opt.value for opt in et_filter.options}
        expected = {
            str(COMPASS.InternationalForum),
            str(COMPASS.Network),
            str(COMPASS.PartnerOrganization),
            str(COMPASS.Project),
        }
        assert expected <= type_iris, (
            f"Missing entity types in filter: {expected - type_iris}"
        )

    def test_multiselect_filters_have_options(self, read_graph):
        filters = get_filters_from_shacl(read_graph, "en")
        for f in filters:
            if f.type == "multiselect":
                assert f.options is not None, f"Multiselect filter {f.id} has no options"
                assert len(f.options) > 0, f"Multiselect filter {f.id} has empty options"

    def test_option_descriptions_are_absent_not_empty(self, read_graph):
        # The panel prints a description under the option's name, so an option
        # with nothing to say must carry no key rather than an empty line.
        filters = get_filters_from_shacl(read_graph, "en")
        for f in filters:
            for opt in f.options or []:
                assert opt.description is None or opt.description.strip(), (
                    f"{f.id} option {opt.value} has a blank description"
                )

    def test_a_defined_concept_carries_its_definition(self, read_graph):
        # No concept in the committed workbook defines one yet, so the definition
        # is added to the graph here: the projection is what is under test.
        filters = get_filters_from_shacl(read_graph, "en")
        species = next(f for f in filters if f.id == "species")
        assert species.options, "species has no options to define"
        target = species.options[0].value

        graph = read_graph
        graph.add(
            (
                COMPASS[target.split("#")[-1]],
                SKOS.definition,
                Literal("A sea creature.", lang="en"),
            )
        )
        try:
            refreshed = get_filters_from_shacl(graph, "en")
            option = next(
                o
                for o in next(f for f in refreshed if f.id == "species").options or []
                if o.value == target
            )
            assert option.description == "A sea creature."
        finally:
            graph.remove(
                (
                    COMPASS[target.split("#")[-1]],
                    SKOS.definition,
                    Literal("A sea creature.", lang="en"),
                )
            )

    def test_slider_filters_have_bounds(self, read_graph):
        filters = get_filters_from_shacl(read_graph, "en")
        for f in filters:
            if f.type == "slider":
                assert f.min is not None, f"Slider filter {f.id} has no min"
                assert f.max is not None, f"Slider filter {f.id} has no max"
                assert f.min <= f.max, f"Slider {f.id}: min > max"

    def test_german_labels_differ(self, read_graph):
        en_filters = get_filters_from_shacl(read_graph, "en")
        de_filters = get_filters_from_shacl(read_graph, "de")
        en_labels = {f.id: f.label for f in en_filters}
        de_labels = {f.id: f.label for f in de_filters}
        diffs = [k for k in en_labels if k in de_labels and en_labels[k] != de_labels[k]]
        assert len(diffs) > 0, "No labels differ between en and de — i18n may be broken"

    def test_no_preamble_props_in_filter_schema(self, read_graph):
        filters = get_filters_from_shacl(read_graph, "en")
        filter_iris = {f.path for f in filters}
        for prop in [str(GEO.lat), str(GEO.long), str(COMPASS.name)]:
            assert prop not in filter_iris, (
                f"{prop} should not be a filter (it is in the SPARQL preamble)"
            )


class TestGetEntityProperties:
    def test_returns_specs(self, read_graph):
        specs = get_entity_shape_from_shacl(read_graph)
        assert len(specs) > 0, "No entity properties returned"

    def test_no_preamble_props_in_specs(self, read_graph):
        specs = get_entity_shape_from_shacl(read_graph)
        spec_iris = {s.path_iri for s in specs}
        for prop in [GEO.lat, GEO.long, COMPASS.name]:
            assert str(prop) not in spec_iris, (
                f"{prop} should be excluded from specs (handled in preamble)"
            )

    def test_spec_categories_valid(self, read_graph):
        valid = {
            "lang_literal",
            "simple_literal",
            "uri_literal",
            "iri_with_label",
            "boolean",
        }
        for spec in get_entity_shape_from_shacl(read_graph):
            assert spec.category in valid, (
                f"Invalid category '{spec.category}' for {spec.id}"
            )

    def test_spec_filter_types_valid(self, read_graph):
        valid = {"multiselect", "slider", "datepicker", "toggle", "none"}
        for spec in get_entity_shape_from_shacl(read_graph):
            assert spec.filter_type in valid, (
                f"Invalid filter_type '{spec.filter_type}' for {spec.id}"
            )

    def test_display_only_props_have_none_filter(self, read_graph):
        specs = get_entity_shape_from_shacl(read_graph)
        display_iris = {str(p) for p in DISPLAY_ONLY}
        for spec in specs:
            if spec.path_iri in display_iris:
                assert spec.filter_type == "none", (
                    f"Display-only property {spec.id} has "
                    f"filter_type='{spec.filter_type}' instead of 'none'"
                )

    def test_unique_lang_literals_are_single_valued(self, read_graph):
        specs = {s.id: s for s in get_entity_shape_from_shacl(read_graph)}
        for name in ("description", "location", "altLabel"):
            assert name in specs, f"{name} is not a property spec"
            assert specs[name].category == "lang_literal"
            assert not specs[name].is_multi, (
                f"{name} is marked multi-valued; the sidebar would render "
                f"['text'] instead of text"
            )
