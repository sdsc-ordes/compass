"""Tests for the source-data to RDF generator."""
import sys
from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import tsv_to_rdf as gen  # noqa: E402


@pytest.fixture(scope="module")
def tables():
    schemes = gen.read_table(gen.SCHEMES, gen.SCHEME_COLUMNS)
    concepts = gen.read_table(gen.CONCEPTS, gen.CONCEPT_COLUMNS)
    pins = gen.read_table(gen.PINS, gen.PIN_COLUMNS)
    return schemes, concepts, pins


@pytest.fixture(scope="module")
def kinds(tables):
    _, concepts, pins = tables
    problems = gen.Problems()
    result = gen.index_terms(concepts, pins, problems)
    problems.raise_if_any()
    return result


def row(table, **cells):
    """A single in-memory row, for exercising one rule at a time."""
    columns = {
        gen.CONCEPTS: gen.CONCEPT_COLUMNS,
        gen.PINS: gen.PIN_COLUMNS,
    }[table]
    return gen.Row(number=42, table=table, cells={c: cells.get(c, "") for c in columns})


# ============================================================
# The tables are well formed
# ============================================================


def test_every_id_is_unique_and_typed(tables, kinds):
    _, concepts, pins = tables
    assert len(kinds) == len(concepts) + len(pins)


def test_every_dimension_and_class_is_populated(tables):
    """Each declared dimension and class has members, and no row invents one.

    build_vocab raises on a dimension with no concepts, so an empty one is a
    build failure rather than a quiet gap.
    """
    _, concepts, pins = tables
    assert {c["dimension"] for c in concepts} == set(gen.DIMENSIONS)
    assert {p["class"] for p in pins} == set(gen.CLASSES)


def test_every_link_resolves(tables, kinds):
    """No link on any pin points at an id that does not exist."""
    _, _, pins = tables
    problems = gen.Problems()
    for pin in pins:
        gen.parse_links(pin, kinds, problems)
    problems.raise_if_any()


def test_only_pins_carry_links():
    """Concepts never link out, so the sheet gives them nowhere to record a link."""
    assert "links" in gen.PIN_COLUMNS
    assert "links" not in gen.CONCEPT_COLUMNS


def test_every_pin_has_a_name_and_coordinates(tables):
    _, _, pins = tables
    for pin in pins:
        assert pin["name_en"], f"{pin['id']} has no English name"
        assert pin["lat"] and pin["lon"], f"{pin['id']} has no coordinates"


def test_every_dimension_has_a_scheme_row(tables):
    schemes, _, _ = tables
    assert {s["id"] for s in schemes} == set(gen.DIMENSIONS)


def test_every_kind_has_a_predicate():
    """A dimension or class with no predicate would drop every link into it."""
    for kind in [*gen.DIMENSIONS, *gen.CLASSES]:
        assert kind in gen.TAG_PREDICATE


# ============================================================
# Mistakes are reported, not swallowed
# ============================================================


def test_unknown_link_target_is_reported(kinds):
    problems = gen.Problems()
    gen.parse_links(row(gen.PINS, id="BEES", links="Whales, NoSuchThing"), kinds, problems)
    assert len(problems.items) == 1
    assert "NoSuchThing" in problems.items[0]


def test_self_link_is_reported(kinds):
    problems = gen.Problems()
    gen.parse_links(row(gen.PINS, id="BEES", links="BEES"), kinds, problems)
    assert len(problems.items) == 1
    assert "links to itself" in problems.items[0]


def test_problems_accumulate(kinds):
    """One run reports every mistake, rather than stopping at the first."""
    problems = gen.Problems()
    gen.parse_links(row(gen.PINS, id="BEES", links="Nope, AlsoNope"), kinds, problems)
    gen.parse_links(row(gen.PINS, id="CIT", links="StillNope"), kinds, problems)
    with pytest.raises(gen.SheetError, match="3 problem"):
        problems.raise_if_any()


def test_duplicate_id_is_reported():
    problems = gen.Problems()
    gen.index_terms(
        [row(gen.CONCEPTS, id="Whales", dimension="Species"),
         row(gen.CONCEPTS, id="Whales", dimension="Species")],
        [],
        problems,
    )
    assert len(problems.items) == 1
    assert "already used by" in problems.items[0]


def test_unknown_dimension_is_reported():
    problems = gen.Problems()
    gen.index_terms([row(gen.CONCEPTS, id="Kelp", dimension="Flora")], [], problems)
    assert len(problems.items) == 1
    assert "Flora" in problems.items[0]


def test_non_numeric_cell_is_reported():
    problems = gen.Problems()
    assert gen.number(row(gen.CONCEPTS, wp_tag_id="four-five-five"), "wp_tag_id", problems, int) == ""
    assert len(problems.items) == 1


def test_a_wrong_header_names_the_columns():
    with pytest.raises(gen.SheetError, match="missing"):
        gen.read_table(gen.CONCEPTS, gen.CONCEPT_COLUMNS + ["no_such_column"])


def test_an_unknown_sheet_is_named():
    with pytest.raises(gen.SheetError, match="no sheet named"):
        gen.read_table("nope", gen.SCHEME_COLUMNS)


@pytest.mark.parametrize(
    "text, expected",
    [("47.22953", "47.22953"), ("148.0", "148"), ("", "")],
)
def test_stored_numbers_beat_displayed_text(text, expected):
    """A spreadsheet may display a rounded number; the stored value is authoritative."""
    from odf.table import TableCell
    from odf.text import P

    cell = TableCell(valuetype="float", value=text) if text else TableCell(valuetype="string")
    cell.addElement(P(text="rounded"))
    assert gen._cell_text(cell) == (expected if text else "rounded")


def test_repeated_cells_expand():
    """Spreadsheets pack runs of identical cells; the reader must unpack them."""
    from odf.table import TableCell, TableRow
    from odf.text import P

    row = TableRow()
    first = TableCell(valuetype="string")
    first.addElement(P(text="a"))
    row.addElement(first)
    row.addElement(TableCell(valuetype="string", numbercolumnsrepeated=3))
    assert gen._row_values(row, 5) == ["a", "", "", "", ""]


# ============================================================
# Link direction
# ============================================================


@pytest.mark.parametrize(
    "target, predicate",
    [
        ("Dolphins", "compass:species"),
        ("Greece", "compass:countryArea"),
        ("AdvocacyWork", "compass:workArea"),
        ("PlasticPollution", "compass:pollution"),
        ("OceanConservation", "compass:conservation"),
        ("Shipping", "compass:topic"),
        ("ACCOBAMS", "compass:forum"),
        ("SAVEWhales", "compass:relatedProject"),
        ("OceanCare", "compass:relatedOrganization"),
    ],
)
def test_predicate_follows_the_target(kinds, target, predicate):
    """A link's predicate is decided by what it points at, not by the source row."""
    grouped = gen.parse_links(row(gen.PINS, id="BEES", links=target), kinds, gen.Problems())
    assert list(grouped) == [predicate]


# ============================================================
# Serialisation
# ============================================================


@given(value=st.floats(min_value=-180, max_value=180, allow_nan=False))
def test_coordinates_keep_five_decimals(value):
    rendered = gen.coordinate(str(value))
    assert rendered.endswith('"^^xsd:float')
    text = rendered.split('"')[1]
    assert len(text.split(".")[1]) == 5
    assert float(text) == pytest.approx(value, abs=1e-5)


@pytest.mark.parametrize(
    "text, expected",
    [
        ('plain', '"plain"@en'),
        ('a "quoted" word', '"a \\"quoted\\" word"@en'),
        ("back\\slash", '"back\\\\slash"@en'),
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
    ordered = [p for p, _ in sorted(triples, key=gen.order_key)]
    assert ordered == ["a", "compass:name", "compass:name", "geo:lat"]
    # English before German within one predicate.
    values = [v for _, v in sorted(triples, key=gen.order_key)]
    assert values[1] == '"A"@en' and values[2] == '"B"@de'


# ============================================================
# Determinism and conformance
# ============================================================


def test_output_matches_the_committed_files():
    data, vocab = gen.generate()
    assert gen.OUT_DATA.read_text(encoding="utf-8") == data, "compass.ttl is stale; run `just data`"
    assert gen.OUT_VOCAB.read_text(encoding="utf-8") == vocab, "vocab.ttl is stale; run `just data`"


def test_generation_is_repeatable():
    assert gen.generate() == gen.generate()


def test_generated_data_passes_shacl():
    data, vocab = gen.generate()
    gen.validate(data, vocab)
