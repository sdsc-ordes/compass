"""SPARQL -> GeoJSON translator tests."""

import pytest
from starlette.datastructures import QueryParams

from app.config import config
from app.namespaces import COMPASS, PIN_CLASSES
from app.shacl_to_entities import EntityShape
from app.sparql_builder import sparql_for_instances
from app.sparql_to_geojson_translator import extract_property, instances_to_geojson


def _shape(**kwargs) -> EntityShape:
    defaults = {
        "path_iri": "http://example.org/x",
        "category": "simple_literal",
        "is_multi": False,
        "filter_type": "none",
        "datatype": None,
    }
    return EntityShape(**{**defaults, **kwargs})


def _row(**bindings: str) -> dict[str, str]:
    return {
        "s": "http://ex.org/pin",
        "label": "Pin",
        "type": str(COMPASS.Network),
        "lat": "46.5",
        "long": "6.6",
        **bindings,
    }


class TestStoriesUrl:
    @pytest.mark.parametrize("lang", ["en", "de"])
    def test_is_built_from_the_entity_tag_id(self, lang):
        shape = _shape(id="wpEntityTagId")
        rows = [_row(wpEntityTagIdResult="921")]
        [feature] = instances_to_geojson(rows, [shape], lang)["features"]
        url = feature["properties"]["storiesUrl"]
        assert url == config.entity_stories_url("921", lang)
        assert url.endswith("?tag=921")
        assert f"/{lang}/" in url

    def test_no_tag_id_means_no_url(self):
        [feature] = instances_to_geojson([_row()], [])["features"]
        assert feature["properties"]["storiesUrl"] == ""


class TestExtractProperty:
    def test_multi_iri_with_label(self):
        shape = _shape(id="workArea", category="iri_with_label", is_multi=True)
        row = {"workAreaRaw": "http://ex.org/A|LabelA;;http://ex.org/B|LabelB"}
        assert extract_property(shape, row) == [
            {"iri": "http://ex.org/A", "label": "LabelA"},
            {"iri": "http://ex.org/B", "label": "LabelB"},
        ]

    def test_single_iri_with_label(self):
        shape = _shape(id="funding", category="iri_with_label")
        row = {"fundingIri": "http://ex.org/public", "fundingLabel": "Public"}
        assert extract_property(shape, row) == {
            "iri": "http://ex.org/public",
            "label": "Public",
        }

    def test_single_iri_without_label_falls_back_to_its_local_name(self):
        shape = _shape(id="funding", category="iri_with_label")
        row = {"fundingIri": "http://ex.org/ns#Public"}
        assert extract_property(shape, row) == {
            "iri": "http://ex.org/ns#Public",
            "label": "Public",
        }

    def test_boolean(self):
        shape = _shape(id="active", category="boolean")
        assert extract_property(shape, {"activeResult": "true"}) is True
        assert extract_property(shape, {"activeResult": "false"}) is False

    def test_multi_literal(self):
        shape = _shape(id="activities", category="lang_literal", is_multi=True)
        row = {"activitiesRaw": "Research;;Education;;Policy"}
        assert extract_property(shape, row) == ["Research", "Education", "Policy"]


def test_a_row_without_usable_coordinates_is_skipped():
    rows = [_row(), _row(lat="north"), {k: v for k, v in _row().items() if k != "long"}]
    assert len(instances_to_geojson(rows, [])["features"]) == 1


def test_round_trip_yields_valid_pins(store, entity_shapes):
    sparql = sparql_for_instances(entity_shapes, "en", QueryParams(""))
    features = instances_to_geojson(store.query(sparql), entity_shapes)["features"]
    assert features
    pin_iris = {str(COMPASS[name]) for name in PIN_CLASSES}
    for feature in features:
        props = feature["properties"]
        assert {"id", "label", "type", "typeIri"} <= props.keys()
        assert props["typeIri"] in pin_iris
        longitude, latitude = feature["geometry"]["coordinates"]
        assert -180 <= longitude <= 180
        assert -90 <= latitude <= 90
