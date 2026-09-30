"""Generate compass.ttl and vocab.ttl from a use case's source-data.ods.

``COMPASS_USE_CASE`` (default ``oceancare``) selects the directory under
``src/ontology/``. Pins link to other rows by id in their ``links`` column; the
predicate a link becomes depends on the dimension or class of its target.
Concepts carry no links.

Subject order, predicate order and float precision are fixed, so unchanged input
produces byte-identical output.
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import pyshacl
from odf import teletype
from odf.opendocument import load
from odf.table import Table, TableCell, TableRow
from odf.text import P
from rdflib import Graph

REPO = Path(__file__).resolve().parents[2]
ONTOLOGY_DIR = REPO / "src" / "ontology"


def _resolve_use_case() -> str:
    """Return ``COMPASS_USE_CASE`` from the environment, else the repo ``.env``."""
    value = os.environ.get("COMPASS_USE_CASE", "").strip()
    if value:
        return value
    env_file = REPO / ".env"
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("COMPASS_USE_CASE="):
                value = line.split("=", 1)[1].split(" #", 1)[0].strip().strip("\"'")
                if value:
                    return value
    return "oceancare"


USE_CASE = _resolve_use_case()
USE_CASE_DIR = ONTOLOGY_DIR / USE_CASE
WORKBOOK = USE_CASE_DIR / "source-data.ods"
SCHEME_SHEET = "schemes"
CONCEPT_SHEET = "concepts"
PIN_SHEET = "pins"
SHAPES = ONTOLOGY_DIR / "shapes.ttl"
OUT_DATA = USE_CASE_DIR / "compass.ttl"
OUT_VOCAB = USE_CASE_DIR / "vocab.ttl"

ONTOLOGY_NS = "http://example.org/ocean-org/ontology#"
DATA_NS = "http://example.org/ocean-org/data#"

# In vocab.ttl section order.
DIMENSIONS = ["WorkArea", "Topic", "Programme", "Species", "CountryArea"]

# Entity class -> section title, in compass.ttl section order.
CLASSES = {
    "InternationalForum": "International Fora",
    "Network": "Networks",
    "PartnerOrganization": "Partner Organizations",
    "HostOrganization": "Host Organization",
}

# Keyed by the dimension or class of the link's target.
LINK_PREDICATE = {
    "WorkArea": "compass:workArea",
    "Topic": "compass:topic",
    "Programme": "compass:programme",
    "Species": "compass:species",
    "CountryArea": "compass:countryArea",
    "InternationalForum": "compass:forum",
    "PartnerOrganization": "compass:relatedOrganization",
    "Network": "compass:relatedOrganization",
    "HostOrganization": "compass:relatedOrganization",
}

SCHEME_COLUMNS = ["id", "name_en", "name_de", "definition_en", "definition_de"]
CONCEPT_COLUMNS = [
    "id",
    "dimension",
    "name_en",
    "name_de",
    "definition_en",
    "definition_de",
    "wp_tag_id",
    "notes",
]
PIN_COLUMNS = [
    "id",
    "class",
    "name_en",
    "name_de",
    "long_name_en",
    "long_name_de",
    "lat",
    "lon",
    "location_en",
    "location_de",
    "description_en",
    "description_de",
    "url",
    "logo",
    "wp_entity_tag_id",
    "links",
    "notes",
]

# Every predicate the generator emits, in the order it appears within a subject.
PREDICATE_ORDER = [
    "a",
    "compass:name",
    "rdfs:label",
    "skos:prefLabel",
    "skos:altLabel",
    "skos:definition",
    "compass:location",
    "compass:description",
    "schema:url",
    "schema:image",
    "compass:workArea",
    "compass:topic",
    "compass:programme",
    "compass:species",
    "compass:countryArea",
    "compass:forum",
    "compass:relatedOrganization",
    "compass:wpTagId",
    "compass:wpEntityTagId",
    "skos:hasTopConcept",
    "skos:inScheme",
    "skos:topConceptOf",
    "dct:isPartOf",
    "geo:lat",
    "geo:long",
]

LANGUAGE_ORDER = ["@en", "@de"]

BANNER = (
    "# GENERATED FILE -- do not edit.\n"
    "#\n"
    "# Regenerate with `just data::generate` after editing "
    f"src/ontology/{USE_CASE}/source-data.ods.\n"
)

PREFIXES = [
    ("rdf", "http://www.w3.org/1999/02/22-rdf-syntax-ns#"),
    ("rdfs", "http://www.w3.org/2000/01/rdf-schema#"),
    ("xsd", "http://www.w3.org/2001/XMLSchema#"),
    ("geo", "http://www.w3.org/2003/01/geo/wgs84_pos#"),
    ("schema", "https://schema.org/"),
    ("skos", "http://www.w3.org/2004/02/skos/core#"),
    ("dct", "http://purl.org/dc/terms/"),
    ("compass", ONTOLOGY_NS),
    ("ocinst", DATA_NS),
]

_TURTLE_ESCAPES = str.maketrans({"\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r"})


class SheetError(Exception):
    """A defect in the workbook, to be fixed there."""


def repo_relative(path: Path) -> str:
    """Return ``path`` relative to the repo root, or absolute if it lies outside."""
    try:
        return str(path.relative_to(REPO))
    except ValueError:
        return str(path)


@dataclass(frozen=True)
class Row:
    """One non-empty data row of a sheet."""

    number: int  # 1-based, as the spreadsheet shows it
    sheet: str
    cells: dict[str, str]

    def __getitem__(self, column: str) -> str:
        return self.cells[column]


@dataclass
class Problems:
    """Collect workbook defects so one run reports all of them."""

    items: list[str] = field(default_factory=list)

    def add(self, row: Row, message: str) -> None:
        self.items.append(f"  {row.sheet}:{row.number}  {message}")

    def raise_if_any(self) -> None:
        if self.items:
            raise SheetError(f"{len(self.items)} problem(s):\n" + "\n".join(self.items))


def _cell_text(cell) -> str:
    """Return a cell's stored number if it has one, else its displayed text."""
    if cell.getAttribute("valuetype") == "float":
        stored = cell.getAttribute("value")
        if stored is not None:
            return stored.removesuffix(".0")
    # str() drops the <text:s/> elements that pack runs of spaces; teletype expands them.
    return "\n".join(teletype.extractText(p) for p in cell.getElementsByType(P)).strip()


def _row_values(row, width: int) -> list[str]:
    """Return the first ``width`` cell texts of a row, expanding repeated cells."""
    values: list[str] = []
    for cell in row.getElementsByType(TableCell):
        if len(values) >= width:
            break
        repeat = int(cell.getAttribute("numbercolumnsrepeated") or 1)
        values.extend([_cell_text(cell)] * min(repeat, width - len(values)))
    return values + [""] * (width - len(values))


def _sheet(name: str):
    if not WORKBOOK.exists():
        raise SheetError(f"{repo_relative(WORKBOOK)} is missing")
    for table in load(WORKBOOK).spreadsheet.getElementsByType(Table):
        if table.getAttribute("name") == name:
            return table
    raise SheetError(f"{repo_relative(WORKBOOK)} has no sheet named {name!r}")


def read_sheet(name: str, columns: list[str]) -> list[Row]:
    """Read the non-empty rows of a workbook sheet whose header must equal ``columns``.

    Raises:
        SheetError: The workbook or sheet is missing or empty, or the header differs.
    """
    sheet_rows = _sheet(name).getElementsByType(TableRow)
    if not sheet_rows:
        raise SheetError(f"sheet {name!r} is empty")

    # Read past the expected width so that extra columns are reported.
    header = [h for h in _row_values(sheet_rows[0], len(columns) + 8) if h]
    if header != columns:
        missing = [c for c in columns if c not in header]
        extra = [c for c in header if c not in columns]
        parts = []
        if missing:
            parts.append(f"missing {missing}")
        if extra:
            parts.append(f"unexpected {extra}")
        detail = ", ".join(parts) or "columns are in the wrong order"
        raise SheetError(f"sheet {name!r}: {detail}")

    rows = []
    number = 1
    for sheet_row in sheet_rows[1:]:
        repeat = int(sheet_row.getAttribute("numberrowsrepeated") or 1)
        values = _row_values(sheet_row, len(columns))
        if any(values):
            rows += [
                Row(number + offset, name, dict(zip(columns, values, strict=True)))
                for offset in range(1, repeat + 1)
            ]
        number += repeat
    return rows


def index_terms(concepts: list[Row], pins: list[Row], problems: Problems) -> dict[str, str]:
    """Map every concept and pin id to its dimension or class."""
    kinds: dict[str, str] = {}
    seen: dict[str, Row] = {}
    for rows, column, allowed in (
        (concepts, "dimension", DIMENSIONS),
        (pins, "class", CLASSES),
    ):
        for row in rows:
            identifier = row["id"]
            if not identifier:
                problems.add(row, "row has no id")
            elif identifier in seen:
                first = seen[identifier]
                problems.add(
                    row,
                    f"id {identifier!r} is already used by {first.sheet}:{first.number}",
                )
            elif row[column] not in allowed:
                problems.add(
                    row, f"{column} {row[column]!r} is not one of {sorted(allowed)}"
                )
            else:
                seen[identifier] = row
                kinds[identifier] = row[column]
    return kinds


def parse_links(row: Row, kinds: dict[str, str], problems: Problems) -> dict[str, set[str]]:
    """Group the targets in a pin's ``links`` cell by the predicate each becomes."""
    grouped: dict[str, set[str]] = {}
    for target in (part.strip() for part in row["links"].split(",")):
        if not target:
            continue
        if target == row["id"]:
            problems.add(row, f"{target!r} links to itself")
        elif target not in kinds:
            problems.add(
                row, f"link to unknown id {target!r} -- check the spelling, or add the row"
            )
        else:
            prefix = "compass:" if kinds[target] in DIMENSIONS else "ocinst:"
            grouped.setdefault(LINK_PREDICATE[kinds[target]], set()).add(prefix + target)
    return grouped


def numeric_cell(row: Row, column: str, problems: Problems, parse: type) -> str:
    """Return the cell text, or "" after reporting a value ``parse`` rejects."""
    value = row[column]
    if not value:
        return ""
    try:
        parse(value)
    except ValueError:
        problems.add(row, f"{column} {value!r} is not a number")
        return ""
    return value


Triples = list[tuple[str, str]]  # (predicate qname, object term)


def literal(text: str, lang: str) -> str:
    return f'"{text.translate(_TURTLE_ESCAPES)}"@{lang}'


def typed(text: str, datatype: str) -> str:
    return f'"{text.translate(_TURTLE_ESCAPES)}"^^{datatype}'


def coordinate(value: str) -> str:
    return f'"{float(value):.5f}"^^xsd:float'


@dataclass
class Fallbacks:
    """Count the empty German cells that took the English text."""

    counts: Counter[str] = field(default_factory=Counter)

    def note(self, sheet: str, column: str) -> None:
        self.counts[f"{sheet}.{column}"] += 1

    def summary(self) -> str:
        if not self.counts:
            return "every German cell is filled"
        listed = ", ".join(f"{key} x{count}" for key, count in sorted(self.counts.items()))
        return f"English stood in for an empty German cell: {listed}"


def bilingual(row: Row, column: str, fallbacks: Fallbacks) -> tuple[str, str] | None:
    """Return the English and German text of ``<column>_en`` / ``<column>_de``.

    An empty German cell takes the English text and is noted in ``fallbacks``.
    Returns None when the English cell is empty.
    """
    english = row[f"{column}_en"]
    if not english:
        return None
    german = row[f"{column}_de"]
    if not german:
        fallbacks.note(row.sheet, f"{column}_de")
        german = english
    return english, german


def bilingual_triples(
    row: Row, column: str, predicate: str, fallbacks: Fallbacks
) -> Triples:
    pair = bilingual(row, column, fallbacks)
    if pair is None:
        return []
    english, german = pair
    return [(predicate, literal(english, "en")), (predicate, literal(german, "de"))]


def concept_triples(row: Row, problems: Problems, fallbacks: Fallbacks) -> Triples:
    dimension = row["dimension"]
    scheme = f"compass:{dimension}Scheme"
    triples: Triples = [("a", f"skos:Concept, compass:{dimension}")]
    triples += bilingual_triples(row, "name", "skos:prefLabel", fallbacks)
    triples += bilingual_triples(row, "definition", "skos:definition", fallbacks)
    wp_tag_id = numeric_cell(row, "wp_tag_id", problems, int)
    if wp_tag_id:
        triples.append(("compass:wpTagId", typed(wp_tag_id, "xsd:integer")))
    triples += [("skos:inScheme", scheme), ("skos:topConceptOf", scheme)]
    return triples


def pin_triples(
    row: Row, kinds: dict[str, str], problems: Problems, fallbacks: Fallbacks
) -> Triples:
    triples: Triples = [("a", f"compass:{row['class']}")]
    name = bilingual(row, "name", fallbacks)
    if name is None:
        problems.add(row, f"{row['id']!r} has no English name")
    else:
        for predicate in ("compass:name", "rdfs:label"):
            triples += [
                (predicate, literal(name[0], "en")),
                (predicate, literal(name[1], "de")),
            ]
    for column, predicate in (
        ("long_name", "skos:altLabel"),
        ("description", "compass:description"),
        ("location", "compass:location"),
    ):
        triples += bilingual_triples(row, column, predicate, fallbacks)

    if row["url"]:
        triples.append(("schema:url", typed(row["url"], "xsd:anyURI")))
    if row["logo"]:
        triples.append(("schema:image", typed(row["logo"], "xsd:anyURI")))
    wp_entity_tag_id = numeric_cell(row, "wp_entity_tag_id", problems, int)
    if wp_entity_tag_id:
        triples.append(("compass:wpEntityTagId", typed(wp_entity_tag_id, "xsd:integer")))

    links = parse_links(row, kinds, problems)
    triples += [
        (predicate, ", ".join(sorted(objects))) for predicate, objects in links.items()
    ]

    latitude = numeric_cell(row, "lat", problems, float)
    longitude = numeric_cell(row, "lon", problems, float)
    if latitude and longitude:
        triples.append(("geo:lat", coordinate(latitude)))
        triples.append(("geo:long", coordinate(longitude)))
    else:
        problems.add(
            row, f"{row['id']!r} has no coordinates, so it can never reach the map"
        )
    return triples


def order_key(triple: tuple[str, str]) -> tuple[int, int, str]:
    """Sort key: predicate, then language, then value."""
    predicate, value = triple
    suffix = value[-3:]
    language = (
        LANGUAGE_ORDER.index(suffix) if suffix in LANGUAGE_ORDER else len(LANGUAGE_ORDER)
    )
    return PREDICATE_ORDER.index(predicate), language, value


def render_subject(subject: str, triples: Triples) -> str:
    ordered = sorted(triples, key=order_key)
    body = " ;\n".join(f"    {predicate} {value}" for predicate, value in ordered)
    return f"{subject}\n{body} .\n"


def section_header(title: str) -> str:
    rule = "# " + "=" * 60
    return f"{rule}\n# {title}\n{rule}\n"


def render_file(sections: list[tuple[str, list[str]]]) -> str:
    parts = [BANNER, ""]
    parts += [f"@prefix {prefix}: <{ns}> ." for prefix, ns in PREFIXES]
    parts.append("")
    for title, blocks in sections:
        if not blocks:
            continue
        parts.append(section_header(title))
        parts.extend(blocks)
    return "\n".join(parts).rstrip("\n") + "\n"


def build_vocab(
    schemes: list[Row], concepts: list[Row], problems: Problems, fallbacks: Fallbacks
) -> str:
    by_id = {row["id"]: row for row in schemes}
    missing = [d for d in DIMENSIONS if d not in by_id]
    if missing:
        raise SheetError(f"sheet {SCHEME_SHEET!r} has no row for {missing}")

    sections: list[tuple[str, list[str]]] = []
    for dimension in DIMENSIONS:
        scheme = by_id[dimension]
        members = sorted(
            (r for r in concepts if r["dimension"] == dimension), key=lambda r: r["id"]
        )
        if not members:
            raise SheetError(f"dimension {dimension} has no concepts")

        scheme_triples: Triples = [("a", "skos:ConceptScheme")]
        scheme_triples += bilingual_triples(scheme, "name", "skos:prefLabel", fallbacks)
        scheme_triples += bilingual_triples(
            scheme, "definition", "skos:definition", fallbacks
        )
        scheme_triples += [("skos:hasTopConcept", f"compass:{m['id']}") for m in members]
        scheme_triples.append(("dct:isPartOf", f"<{ONTOLOGY_NS.rstrip('#')}>"))

        blocks = [render_subject(f"compass:{dimension}Scheme", scheme_triples)]
        blocks += [
            render_subject(f"compass:{m['id']}", concept_triples(m, problems, fallbacks))
            for m in members
        ]
        sections.append((f"{scheme['name_en']} ({len(members)} concepts)", blocks))
    return render_file(sections)


def build_data(
    pins: list[Row],
    kinds: dict[str, str],
    problems: Problems,
    fallbacks: Fallbacks,
) -> str:
    sections: list[tuple[str, list[str]]] = []
    for entity_class, title in CLASSES.items():
        members = sorted(
            (r for r in pins if r["class"] == entity_class), key=lambda r: r["id"]
        )
        blocks = [
            render_subject(f"ocinst:{m['id']}", pin_triples(m, kinds, problems, fallbacks))
            for m in members
        ]
        sections.append((f"{title} ({len(members)})", blocks))
    return render_file(sections)


def validate(data: str, vocab: str) -> None:
    """Raise SheetError unless the generated Turtle conforms to shapes.ttl."""
    shapes = Graph().parse(SHAPES, format="turtle")
    graph = Graph()
    graph.parse(data=data, format="turtle")
    graph.parse(data=vocab, format="turtle")
    graph.parse(SHAPES, format="turtle")
    conforms, _, report = pyshacl.validate(
        graph, shacl_graph=shapes, inference="rdfs", abort_on_first=False
    )
    if not conforms:
        raise SheetError(f"SHACL validation failed:\n{report}")


def generate(fallbacks: Fallbacks) -> tuple[str, str]:
    """Return the text of compass.ttl and vocab.ttl, noting German fallbacks.

    Raises:
        SheetError: The workbook has defects; the message lists all of them.
    """
    schemes = read_sheet(SCHEME_SHEET, SCHEME_COLUMNS)
    concepts = read_sheet(CONCEPT_SHEET, CONCEPT_COLUMNS)
    pins = read_sheet(PIN_SHEET, PIN_COLUMNS)

    problems = Problems()
    kinds = index_terms(concepts, pins, problems)
    problems.raise_if_any()  # ids must be sound before links can be checked

    vocab = build_vocab(schemes, concepts, problems, fallbacks)
    data = build_data(pins, kinds, problems, fallbacks)
    problems.raise_if_any()
    return data, vocab


def main(argv: list[str] | None = None) -> int:
    """Run the command line; return the exit status."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify the committed files match a fresh run; write nothing",
    )
    parser.add_argument(
        "--skip-validation",
        action="store_true",
        help="skip SHACL validation (for inspecting output that does not yet conform)",
    )
    args = parser.parse_args(argv)

    fallbacks = Fallbacks()
    try:
        data, vocab = generate(fallbacks)
        if not args.skip_validation:
            validate(data, vocab)
    except SheetError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.check:
        stale = [
            repo_relative(path)
            for path, fresh in ((OUT_DATA, data), (OUT_VOCAB, vocab))
            if not path.exists() or path.read_text(encoding="utf-8") != fresh
        ]
        if stale:
            print(
                f"error: {', '.join(stale)} differ from a fresh run. "
                "Run `just data::generate`.",
                file=sys.stderr,
            )
            return 1
        print("ontology is up to date")
        return 0

    OUT_DATA.write_text(data, encoding="utf-8", newline="\n")
    OUT_VOCAB.write_text(vocab, encoding="utf-8", newline="\n")
    print(f"wrote {repo_relative(OUT_DATA)} and {repo_relative(OUT_VOCAB)}")
    print(fallbacks.summary())
    return 0


if __name__ == "__main__":
    sys.exit(main())
