"""Tests for the source-data to RDF generator."""

import sys
from collections import Counter
from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st
from odf import teletype
from odf.table import Table, TableCell, TableRow
from odf.text import P

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import ods_to_rdf as gen

COLUMNS = {
    gen.SCHEME_SHEET: gen.SCHEME_COLUMNS,
    gen.CONCEPT_SHEET: gen.CONCEPT_COLUMNS,
    gen.PIN_SHEET: gen.PIN_COLUMNS,
}


@pytest.fixture(scope="module")
def kinds():
    concepts = gen.read_sheet(gen.CONCEPT_SHEET, gen.CONCEPT_COLUMNS)
    pins = gen.read_sheet(gen.PIN_SHEET, gen.PIN_COLUMNS)
    problems = gen.Problems()
    result = gen.index_terms(concepts, pins, problems)
    problems.raise_if_any()
    return result


def make_row(sheet, **cells):
    """Build an in-memory row with every column of ``sheet``, empty unless given."""
    return gen.Row(
        number=42, sheet=sheet, cells={c: cells.get(c, "") for c in COLUMNS[sheet]}
    )


def make_cell(text, **attributes):
    cell = TableCell(**attributes)
    paragraph = P()
    teletype.addTextToElement(paragraph, text)
    cell.addElement(paragraph)
    return cell


def test_committed_ontology_is_fresh_and_conforms():
    assert gen.main(["--check"]) == 0


def test_workbook_uses_exactly_the_declared_dimensions_and_classes():
    schemes = gen.read_sheet(gen.SCHEME_SHEET, gen.SCHEME_COLUMNS)
    pins = gen.read_sheet(gen.PIN_SHEET, gen.PIN_COLUMNS)
    assert {s["id"] for s in schemes} == set(gen.DIMENSIONS)
    assert {p["class"] for p in pins} == set(gen.CLASSES)


def test_every_dimension_and_class_has_a_link_predicate():
    assert set(gen.LINK_PREDICATE) == {*gen.DIMENSIONS, *gen.CLASSES}


def test_concept_definition_becomes_skos_definition():
    triples = gen.concept_triples(
        make_row(
            gen.CONCEPT_SHEET,
            dimension="Species",
            name_en="Whales",
            definition_en="Large marine mammals.",
            definition_de="Grosse Meeressaeugetiere.",
        ),
        gen.Problems(),
        gen.Fallbacks(),
    )
    definitions = [value for predicate, value in triples if predicate == "skos:definition"]
    assert definitions == ['"Large marine mammals."@en', '"Grosse Meeressaeugetiere."@de']


@pytest.mark.parametrize("sheet", [gen.CONCEPT_SHEET, gen.PIN_SHEET])
@given(data=st.data())
def test_every_language_tagged_predicate_gets_both_languages(sheet, data):
    """An empty German cell takes the English text; an empty English cell emits nothing."""
    paired = [c for c in COLUMNS[sheet] if c.endswith(("_en", "_de"))]
    cells = data.draw(
        st.fixed_dictionaries({c: st.sampled_from(["", "x"]) for c in paired})
    )
    row = make_row(
        sheet, dimension="Species", lat="1", lon="1", **{"class": "Network"}, **cells
    )
    fallbacks = gen.Fallbacks()
    if sheet == gen.CONCEPT_SHEET:
        triples = gen.concept_triples(row, gen.Problems(), fallbacks)
    else:
        triples = gen.pin_triples(row, {}, gen.Problems(), fallbacks)

    languages = Counter((p, v[-3:]) for p, v in triples if v.endswith(("@en", "@de")))
    for predicate, _ in languages:
        assert languages[predicate, "@en"] == languages[predicate, "@de"]
    english_only = [
        c for c in paired if c.endswith("_en") and cells[c] and not cells[c[:-3] + "_de"]
    ]
    assert fallbacks.counts.total() == len(english_only)


@pytest.mark.parametrize(
    "concepts, message",
    [
        ([make_row(gen.CONCEPT_SHEET, dimension="Species")], "row has no id"),
        (
            [
                make_row(gen.CONCEPT_SHEET, id="Whales", dimension="Species"),
                make_row(gen.CONCEPT_SHEET, id="Whales", dimension="Species"),
            ],
            "already used by",
        ),
        ([make_row(gen.CONCEPT_SHEET, id="Kelp", dimension="Flora")], "'Flora'"),
    ],
)
def test_bad_concept_rows_are_reported(concepts, message):
    problems = gen.Problems()
    gen.index_terms(concepts, [], problems)
    assert len(problems.items) == 1
    assert message in problems.items[0]


@pytest.mark.parametrize(
    "links, message",
    [("Whales, NoSuchThing", "unknown id 'NoSuchThing'"), ("BEES", "links to itself")],
)
def test_bad_links_are_reported(kinds, links, message):
    problems = gen.Problems()
    gen.parse_links(make_row(gen.PIN_SHEET, id="BEES", links=links), kinds, problems)
    assert len(problems.items) == 1
    assert message in problems.items[0]


def test_problems_accumulate(kinds):
    problems = gen.Problems()
    gen.parse_links(
        make_row(gen.PIN_SHEET, id="BEES", links="Nope, AlsoNope"), kinds, problems
    )
    gen.parse_links(make_row(gen.PIN_SHEET, id="CIT", links="StillNope"), kinds, problems)
    with pytest.raises(gen.SheetError, match="3 problem"):
        problems.raise_if_any()


def test_non_numeric_cell_is_reported():
    problems = gen.Problems()
    row = make_row(gen.CONCEPT_SHEET, wp_tag_id="four-five-five")
    assert gen.numeric_cell(row, "wp_tag_id", problems, int) == ""
    assert len(problems.items) == 1


def test_missing_scheme_row_is_named():
    schemes = [
        make_row(gen.SCHEME_SHEET, id=d, name_en=d, name_de=d) for d in gen.DIMENSIONS[:-1]
    ]
    with pytest.raises(gen.SheetError, match=gen.DIMENSIONS[-1]):
        gen.build_vocab(schemes, [], gen.Problems(), gen.Fallbacks())


def test_wrong_header_names_the_missing_column():
    with pytest.raises(gen.SheetError, match=r"missing.*no_such_column"):
        gen.read_sheet(gen.CONCEPT_SHEET, [*gen.CONCEPT_COLUMNS, "no_such_column"])


def test_unknown_sheet_is_named():
    with pytest.raises(gen.SheetError, match="no sheet named 'nope'"):
        gen.read_sheet("nope", gen.SCHEME_COLUMNS)


def test_row_numbers_count_repeated_empty_rows(monkeypatch):
    table = Table(name="t")
    for text, repeat in (("id", 1), ("a", 1), ("", 3), ("b", 1)):
        sheet_row = TableRow(numberrowsrepeated=repeat)
        sheet_row.addElement(make_cell(text, valuetype="string"))
        table.addElement(sheet_row)
    monkeypatch.setattr(gen, "_sheet", lambda name: table)
    assert [(r.number, r["id"]) for r in gen.read_sheet("t", ["id"])] == [
        (2, "a"),
        (6, "b"),
    ]


@pytest.mark.parametrize(
    "attributes, expected",
    [
        ({"valuetype": "float", "value": "47.22953"}, "47.22953"),
        ({"valuetype": "float", "value": "148.0"}, "148"),
        ({"valuetype": "string"}, "two  spaces"),
    ],
)
def test_cell_text(attributes, expected):
    """A stored number beats the displayed text, and packed spaces are expanded."""
    assert gen._cell_text(make_cell("two  spaces", **attributes)) == expected


def test_repeated_cells_expand():
    sheet_row = TableRow()
    sheet_row.addElement(make_cell("a", valuetype="string"))
    sheet_row.addElement(TableCell(valuetype="string", numbercolumnsrepeated=3))
    assert gen._row_values(sheet_row, 5) == ["a", "", "", "", ""]


@pytest.mark.parametrize(
    "target, predicate",
    [
        ("Dolphins", "compass:species"),
        ("Greece", "compass:countryArea"),
        ("AdvocacyWork", "compass:workArea"),
        ("Shipping", "compass:topic"),
        ("ACCOBAMS", "compass:forum"),
        ("SAVEWhales", "compass:programme"),
        ("OceanCare", "compass:relatedOrganization"),
    ],
)
def test_predicate_follows_the_target(kinds, target, predicate):
    grouped = gen.parse_links(
        make_row(gen.PIN_SHEET, id="BEES", links=target), kinds, gen.Problems()
    )
    assert list(grouped) == [predicate]


@given(value=st.floats(min_value=-180, max_value=180))
def test_coordinates_render_with_five_decimals(value):
    rendered = gen.coordinate(str(value))
    assert rendered.endswith('"^^xsd:float')
    text = rendered.split('"')[1]
    assert len(text.split(".")[1]) == 5
    assert float(text) == pytest.approx(value, abs=1e-5)


@pytest.mark.parametrize(
    "text, expected",
    [
        ("plain", '"plain"@en'),
        ('a "quoted" word', '"a \\"quoted\\" word"@en'),
        ("back\\slash", '"back\\\\slash"@en'),
        ("two\nparagraphs", '"two\\nparagraphs"@en'),
    ],
)
def test_literals_are_escaped(text, expected):
    assert gen.literal(text, "en") == expected


def test_predicates_emit_in_a_fixed_order():
    triples = [
        ("geo:lat", '"1.0"^^xsd:float'),
        ("compass:name", '"B"@de'),
        ("a", "compass:Network"),
        ("compass:name", '"A"@en'),
    ]
    assert sorted(triples, key=gen.order_key) == [
        ("a", "compass:Network"),
        ("compass:name", '"A"@en'),
        ("compass:name", '"B"@de'),
        ("geo:lat", '"1.0"^^xsd:float'),
    ]
