"""SHACL projection tests: filter widgets and entity property descriptors."""

from app.namespaces import COMPASS, GEO
from app.shacl_to_entities import DISPLAY_ONLY, get_entity_shapes_from_shacl
from app.shacl_to_filters import get_filters_from_shacl


class TestGetFilters:
    def test_widget_types_match_the_entity_shapes(self, graph, entity_shapes):
        widgets = {f.id: f.type for f in get_filters_from_shacl(graph, "en")}
        for shape in entity_shapes:
            if shape.filter_type != "none" and shape.id in widgets:
                assert widgets[shape.id] == shape.filter_type, shape.id

    def test_no_duplicate_ids(self, graph):
        ids = [f.id for f in get_filters_from_shacl(graph, "en")]
        assert len(ids) == len(set(ids)), f"Duplicate filter IDs: {ids}"

    def test_multiselect_filters_have_options(self, graph):
        for f in get_filters_from_shacl(graph, "en"):
            if f.type == "multiselect":
                assert f.options, f"Multiselect filter {f.id} has no options"

    def test_option_descriptions_are_absent_not_empty(self, graph):
        for f in get_filters_from_shacl(graph, "en"):
            for opt in f.options or []:
                assert opt.description is None or opt.description.strip(), (
                    f"{f.id} option {opt.value} has a blank description"
                )

    def test_every_concept_option_carries_its_definition(self, graph):
        # Pins the workbook content too. Excluded: forum (entities define
        # nothing), programme (a definition is missing) and countryArea (see
        # test_country_options_are_undescribed).
        scheme_dims = {"species", "topic", "workArea"}
        for lang in ("en", "de"):
            for f in get_filters_from_shacl(graph, lang):
                if f.id not in scheme_dims:
                    continue
                for opt in f.options or []:
                    assert opt.description, (
                        f"{lang}: {f.id} option {opt.label} has no definition"
                    )
                    assert opt.description.count(".") == 1, (
                        f"{lang}: {f.id} option {opt.label} is more than one sentence"
                    )

    def test_country_options_are_undescribed(self, graph):
        # A country's name is its own description; the workbook leaves those
        # cells empty on purpose.
        for lang in ("en", "de"):
            countries = next(
                f for f in get_filters_from_shacl(graph, lang) if f.id == "countryArea"
            )
            assert countries.options
            for opt in countries.options:
                assert opt.description is None, (
                    f"{lang}: countryArea option {opt.label} carries a description"
                )

    def test_a_definition_is_language_specific(self, graph):
        def described(lang: str, dim: str, value: str) -> str | None:
            f = next(x for x in get_filters_from_shacl(graph, lang) if x.id == dim)
            return next(o.description for o in f.options or [] if o.value == value)

        noise = f"{COMPASS}OceanNoisePollution"
        assert described("en", "topic", noise) == (
            "Human-made underwater noise that masks the sounds marine animals depend on."
        )
        assert described("de", "topic", noise) == (
            "Vom Menschen erzeugter Unterwasserlärm, der die Laute überdeckt, auf "
            "die Meerestiere angewiesen sind."
        )

    def test_scheme_dimensions_carry_the_scheme_definition(self, graph):
        en = {f.id: f for f in get_filters_from_shacl(graph, "en")}
        de = {f.id: f for f in get_filters_from_shacl(graph, "de")}
        assert en["workArea"].description == "Types of work OceanCare performs."
        assert de["workArea"].description == "Arten der Arbeit, die OceanCare leistet."
        for dim in ("topic", "species", "countryArea"):
            assert en[dim].description, f"{dim} lost its English scheme definition"
            assert de[dim].description != en[dim].description, (
                f"{dim} shows its English definition to a German reader"
            )

    def test_dimensions_without_a_scheme_carry_no_description(self, graph):
        filters = {f.id: f for f in get_filters_from_shacl(graph, "en")}
        assert filters["entityType"].description is None
        assert filters["forum"].description is None

    def test_german_labels_differ(self, graph):
        en_labels = {f.id: f.label for f in get_filters_from_shacl(graph, "en")}
        de_labels = {f.id: f.label for f in get_filters_from_shacl(graph, "de")}
        diffs = [k for k in en_labels if k in de_labels and en_labels[k] != de_labels[k]]
        assert diffs, "No labels differ between en and de"


class TestGetEntityShapes:
    def test_builtin_paths_are_not_projected(self, graph):
        paths = {s.path_iri for s in get_entity_shapes_from_shacl(graph)}
        for prop in (GEO.lat, GEO.long, COMPASS.name):
            assert str(prop) not in paths

    def test_display_only_props_have_none_filter(self, graph):
        display_iris = {str(p) for p in DISPLAY_ONLY}
        for shape in get_entity_shapes_from_shacl(graph):
            if shape.path_iri in display_iris:
                assert shape.filter_type == "none", (
                    f"Display-only property {shape.id} has filter_type "
                    f"{shape.filter_type!r}"
                )

    def test_unique_lang_literals_are_single_valued(self, graph):
        shapes = {s.id: s for s in get_entity_shapes_from_shacl(graph)}
        for name in ("description", "location", "altLabel"):
            assert name in shapes, f"{name} is not an entity shape"
            assert shapes[name].category == "lang_literal"
            assert not shapes[name].is_multi, (
                f"{name} is marked multi-valued; the sidebar would render a list"
            )
