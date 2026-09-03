#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["rdflib>=7.0,<8", "pyshacl>=0.30,<0.32", "odfpy>=1.4"]
# ///
"""Generate compass.ttl and vocab.ttl from src/ontology/source-data.ods.

Pin rows carry their own `id` and link by id in a `links` column; a link's
predicate follows what it points at, so there is no mapping to configure.
Concepts never link out: a tag is recorded on the pin that carries it, so a
region is on the map only because some pin points at it.

    tsv_to_rdf.py            regenerate
    tsv_to_rdf.py --check    exit 1 if the committed files are stale

Subject order, predicate order and float precision are all pinned, so unchanged
input produces byte-identical output.
"""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from pathlib import Path

from rdflib import Graph

REPO = Path(__file__).resolve().parents[2]
ONTOLOGY_DIR = REPO / "src" / "ontology"
WORKBOOK = ONTOLOGY_DIR / "source-data.ods"
SCHEMES = "schemes"
CONCEPTS = "concepts"
PINS = "pins"
SHAPES = ONTOLOGY_DIR / "shapes.ttl"
OUT_DATA = ONTOLOGY_DIR / "compass.ttl"
OUT_VOCAB = ONTOLOGY_DIR / "vocab.ttl"

ONTOLOGY_NS = "http://example.org/ocean-org/ontology#"
DATA_NS = "http://example.org/ocean-org/data#"

# The six tag dimensions, in the order their sections appear in vocab.ttl.
DIMENSIONS = ["WorkArea", "Conservation", "Topic", "Pollution", "Species", "CountryArea"]

# The four entity classes, in the order their sections appear in compass.ttl.
CLASSES = {
    "InternationalForum": "International Forums",
    "Network": "Networks",
    "PartnerOrganization": "Partner Organizations",
    "Project": "Projects and Programmes",
}

# Which predicate a link becomes, keyed by what the link points at.
TAG_PREDICATE = {
    "WorkArea": "compass:workArea",
    "Conservation": "compass:conservation",
    "Topic": "compass:topic",
    "Pollution": "compass:pollution",
    "Species": "compass:species",
    "CountryArea": "compass:countryArea",
    "InternationalForum": "compass:forum",
    "Project": "compass:relatedProject",
    "PartnerOrganization": "compass:relatedOrganization",
    "Network": "compass:relatedOrganization",
}

# compass:managedByOceanCare is true for every Project plus these ids.
MANAGED_BY_OCEANCARE = {"OceanCare"}

SCHEME_COLUMNS = ["id", "name_en", "name_de", "definition_en", "definition_de"]
CONCEPT_COLUMNS = [
    "id", "dimension", "name_en", "name_de", "wp_tag_id", "iso_codes", "notes",
]
PIN_COLUMNS = [
    "id", "class", "name_en", "name_de", "long_name_en", "long_name_de",
    "lat", "lon", "location_en", "location_de",
    "description_en", "description_de", "url", "logo",
    "wp_entity_tag_id", "links", "notes",
]

# Emission order within a subject block. Anything unlisted sorts last, by name.
PREDICATE_ORDER = [
    "compass:name",
    "rdfs:label",
    "skos:prefLabel",
    "skos:altLabel",
    "skos:definition",
    "compass:location",
    "compass:description",
    "schema:url",
    "schema:image",
    "compass:isoCode",
    "compass:managedByOceanCare",
    "compass:workArea",
    "compass:conservation",
    "compass:topic",
    "compass:pollution",
    "compass:species",
    "compass:countryArea",
    "compass:forum",
    "compass:relatedOrganization",
    "compass:relatedProject",
    "compass:wpTagId",
    "compass:wpEntityTagId",
    "skos:hasTopConcept",
    "skos:inScheme",
    "skos:topConceptOf",
    "dct:isPartOf",
    "geo:lat",
    "geo:long",
]

# English first, then German, then anything else -- the order the files read in.
LANGUAGE_ORDER = ["@en", "@de"]

BANNER = (
    "# GENERATED FILE -- do not edit.\n"
    "#\n"
    "# Regenerate with `just data` after editing src/ontology/source-data.ods.\n"
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


class SheetError(Exception):
    """A defect in the tables that the operator must resolve."""


def display(path: Path) -> str:
    """Repo-relative where possible, absolute otherwise, so messages never crash."""
    try:
        return str(path.relative_to(REPO))
    except ValueError:
        return str(path)


@dataclass
class Problems:
    """Collects every defect in one pass, so a run reports all of them at once."""

    items: list[str] = field(default_factory=list)

    def add(self, table: str, row: int, message: str) -> None:
        self.items.append(f"  {table}:{row}  {message}")

    def raise_if_any(self) -> None:
        if self.items:
            raise SheetError(f"{len(self.items)} problem(s):\n" + "\n".join(self.items))


# ============================================================
# Reading
# ============================================================


@dataclass(frozen=True)
class Row:
    number: int  # 1-based, matching what a spreadsheet shows
    table: str  # sheet name
    cells: dict[str, str]

    def __getitem__(self, column: str) -> str:
        return self.cells.get(column, "")


def _cell_text(cell) -> str:
    """A cell's value, preferring the stored number over its displayed form."""
    from odf.text import P

    if cell.getAttribute("valuetype") == "float":
        stored = cell.getAttribute("value")
        if stored is not None:
            # Trim the trailing .0 a spreadsheet adds to whole numbers.
            return stored[:-2] if stored.endswith(".0") else stored
    return "\n".join(str(p) for p in cell.getElementsByType(P)).strip()


def _row_values(row, width: int) -> list[str]:
    """Expand a row's cells, honouring the repeat counts spreadsheets pack with."""
    from odf.table import TableCell

    values: list[str] = []
    for cell in row.getElementsByType(TableCell):
        if len(values) >= width:
            break
        repeat = int(cell.getAttribute("numbercolumnsrepeated") or 1)
        values.extend([_cell_text(cell)] * min(repeat, width - len(values)))
    return values + [""] * (width - len(values))


def _sheet(name: str):
    from odf.opendocument import load
    from odf.table import Table

    if not WORKBOOK.exists():
        raise SheetError(f"{display(WORKBOOK)} is missing")
    for table in load(WORKBOOK).spreadsheet.getElementsByType(Table):
        if table.getAttribute("name") == name:
            return table
    raise SheetError(f"{display(WORKBOOK)} has no sheet named {name!r}")


def read_table(name: str, columns: list[str]) -> list[Row]:
    """Read one sheet of the workbook, requiring exactly the expected header."""
    from odf.table import TableRow

    sheet_rows = _sheet(name).getElementsByType(TableRow)
    if not sheet_rows:
        raise SheetError(f"sheet {name!r} is empty")

    header = [h for h in _row_values(sheet_rows[0], len(columns) + 8) if h]
    if header != columns:
        missing = [c for c in columns if c not in header]
        extra = [c for c in header if c not in columns]
        detail = ", ".join(
            part
            for part in (
                f"missing {missing}" if missing else "",
                f"unexpected {extra}" if extra else "",
                "" if (missing or extra) else "columns are in the wrong order",
            )
            if part
        )
        raise SheetError(f"sheet {name!r}: {detail}")

    rows = []
    number = 1
    for sheet_row in sheet_rows[1:]:
        repeat = int(sheet_row.getAttribute("numberrowsrepeated") or 1)
        values = _row_values(sheet_row, len(columns))
        # A repeated row is spreadsheet padding, so only a filled one counts.
        for _ in range(repeat if any(values) else 1):
            number += 1
            if any(values):
                rows.append(Row(number=number, table=name, cells=dict(zip(columns, values))))
    return rows


# ============================================================
# Validation
# ============================================================


def index_terms(concepts: list[Row], pins: list[Row], problems: Problems) -> dict[str, str]:
    """Map every id to the dimension or class it belongs to."""
    kinds: dict[str, str] = {}
    seen: dict[str, Row] = {}
    for rows, column, allowed in ((concepts, "dimension", DIMENSIONS), (pins, "class", CLASSES)):
        for row in rows:
            identifier = row["id"]
            if not identifier:
                problems.add(row.table, row.number, "row has no id")
                continue
            if identifier in seen:
                problems.add(
                    row.table, row.number,
                    f"id {identifier!r} is already used by "
                    f"{seen[identifier].table}:{seen[identifier].number}",
                )
                continue
            if row[column] not in allowed:
                problems.add(
                    row.table, row.number,
                    f"{column} {row[column]!r} is not one of {sorted(allowed)}",
                )
                continue
            seen[identifier] = row
            kinds[identifier] = row[column]
    return kinds


def parse_links(row: Row, kinds: dict[str, str], problems: Problems) -> dict[str, set[str]]:
    """Resolve a links cell into objects grouped by the predicate they become."""
    grouped: dict[str, set[str]] = {}
    for target in (part.strip() for part in row["links"].split(",")):
        if not target:
            continue
        if target == row["id"]:
            problems.add(row.table, row.number, f"{target!r} links to itself")
            continue
        if target not in kinds:
            problems.add(
                row.table, row.number,
                f"link to unknown id {target!r} -- check the spelling, or add the row",
            )
            continue
        predicate = TAG_PREDICATE[kinds[target]]
        prefix = "compass:" if kinds[target] in DIMENSIONS else "ocinst:"
        grouped.setdefault(predicate, set()).add(prefix + target)
    return grouped


def number(row: Row, column: str, problems: Problems, kind: type) -> str:
    """Validate a numeric cell, reporting rather than raising on a bad value."""
    value = row[column]
    if not value:
        return ""
    try:
        kind(value)
    except ValueError:
        problems.add(row.table, row.number, f"{column} {value!r} is not a number")
        return ""
    return value


# ============================================================
# Triple assembly
# ============================================================

Triples = list[tuple[str, str]]  # (predicate qname, object term)


def literal(text: str, lang: str) -> str:
    escaped = text.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"@{lang}'


def typed(text: str, datatype: str) -> str:
    escaped = text.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"^^{datatype}'


def coordinate(value: str) -> str:
    return f'"{float(value):.5f}"^^xsd:float'


@dataclass
class Fallbacks:
    """Counts German cells that were empty and took the English text instead."""

    counts: dict[str, int] = field(default_factory=dict)

    def note(self, table: str, column: str) -> None:
        key = f"{table}.{column}"
        self.counts[key] = self.counts.get(key, 0) + 1

    def summary(self) -> str:
        if not self.counts:
            return "every German cell is filled"
        listed = ", ".join(f"{key} x{count}" for key, count in sorted(self.counts.items()))
        return f"English stood in for an empty German cell: {listed}"


def bilingual(row: Row, column: str, fallbacks: Fallbacks) -> tuple[str, str] | None:
    """The English and German text of a `<column>_en` / `<column>_de` pair.

    An empty German cell takes the English text, so a German reader never gets
    a blank where an English one gets prose. Each substitution is counted, so a
    missing translation stays visible instead of silently shipping.
    """
    english = row[f"{column}_en"]
    if not english:
        return None
    german = row[f"{column}_de"]
    if not german:
        fallbacks.note(row.table, f"{column}_de")
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


def link_triples(grouped: dict[str, set[str]]) -> Triples:
    return [
        (predicate, ", ".join(sorted(objects)))
        for predicate, objects in sorted(grouped.items())
    ]


def concept_triples(row: Row, problems: Problems, fallbacks: Fallbacks) -> Triples:
    dimension = row["dimension"]
    scheme = f"compass:{dimension}Scheme"
    triples: Triples = [("a", f"skos:Concept, compass:{dimension}")]
    triples += bilingual_triples(row, "name", "skos:prefLabel", fallbacks)
    wp_tag_id = number(row, "wp_tag_id", problems, int)
    if wp_tag_id:
        triples.append(("compass:wpTagId", typed(wp_tag_id, "xsd:integer")))
    if row["iso_codes"]:
        triples.append(("compass:isoCode", f'"{row["iso_codes"]}"'))
    triples += [("skos:inScheme", scheme), ("skos:topConceptOf", scheme)]
    return triples


def pin_triples(
    row: Row, kinds: dict[str, str], problems: Problems, fallbacks: Fallbacks
) -> Triples:
    triples: Triples = [("a", f"compass:{row['class']}")]
    name = bilingual(row, "name", fallbacks)
    if name is None:
        problems.add(row.table, row.number, f"{row['id']!r} has no English name")
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
    wp_entity_tag_id = number(row, "wp_entity_tag_id", problems, int)
    if wp_entity_tag_id:
        triples.append(("compass:wpEntityTagId", typed(wp_entity_tag_id, "xsd:integer")))

    managed = row["class"] == "Project" or row["id"] in MANAGED_BY_OCEANCARE
    triples.append(("compass:managedByOceanCare", "true" if managed else "false"))
    triples += link_triples(parse_links(row, kinds, problems))

    latitude = number(row, "lat", problems, float)
    longitude = number(row, "lon", problems, float)
    if latitude and longitude:
        triples.append(("geo:lat", coordinate(latitude)))
        triples.append(("geo:long", coordinate(longitude)))
    else:
        problems.add(
            row.table, row.number,
            f"{row['id']!r} has no coordinates, so it can never reach the map",
        )
    return triples


# ============================================================
# Serialisation
# ============================================================


def order_key(triple: tuple[str, str]) -> tuple[int, str, int, str]:
    """Total order over a subject's triples: predicate, then language, then value."""
    predicate, value = triple
    if predicate == "a":
        rank = -1
    elif predicate in PREDICATE_ORDER:
        rank = PREDICATE_ORDER.index(predicate)
    else:
        rank = len(PREDICATE_ORDER)
    suffix = value[-3:]
    language = LANGUAGE_ORDER.index(suffix) if suffix in LANGUAGE_ORDER else len(LANGUAGE_ORDER)
    return (rank, predicate if rank == len(PREDICATE_ORDER) else "", language, value)


def render_subject(subject: str, triples: Triples) -> str:
    ordered = sorted(triples, key=order_key)
    body = " ;\n".join(f"    {predicate} {value}" for predicate, value in ordered)
    return f"{subject}\n{body} .\n"


def header(title: str) -> str:
    rule = "# " + "=" * 60
    return f"{rule}\n# {title}\n{rule}\n"


def render_file(sections: list[tuple[str, list[str]]]) -> str:
    parts = [BANNER, ""]
    parts += [f"@prefix {prefix}: <{ns}> ." for prefix, ns in PREFIXES]
    parts.append("")
    for title, blocks in sections:
        if not blocks:
            continue
        parts.append(header(title))
        parts.extend(blocks)
    return "\n".join(parts).rstrip("\n") + "\n"


def build_vocab(
    schemes: list[Row], concepts: list[Row], problems, fallbacks: Fallbacks
) -> str:
    by_id = {row["id"]: row for row in schemes}
    missing = [d for d in DIMENSIONS if d not in by_id]
    if missing:
        raise SheetError(f"{SCHEMES.name} has no row for {missing}")

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
        scheme_triples += [
            ("skos:hasTopConcept", f"compass:{m['id']}") for m in members
        ]
        scheme_triples.append(("dct:isPartOf", f"<{ONTOLOGY_NS.rstrip('#')}>"))

        blocks = [render_subject(f"compass:{dimension}Scheme", scheme_triples)]
        blocks += [
            render_subject(
                f"compass:{m['id']}", concept_triples(m, problems, fallbacks)
            )
            for m in members
        ]
        sections.append((f"{scheme['name_en']} ({len(members)} concepts)", blocks))
    return render_file(sections)


def build_data(pins: list[Row], kinds, problems, fallbacks: Fallbacks) -> str:
    sections: list[tuple[str, list[str]]] = []
    for entity_class, title in CLASSES.items():
        members = sorted(
            (r for r in pins if r["class"] == entity_class), key=lambda r: r["id"]
        )
        blocks = [
            render_subject(
                f"ocinst:{m['id']}", pin_triples(m, kinds, problems, fallbacks)
            )
            for m in members
        ]
        sections.append((f"{title} ({len(members)})", blocks))
    return render_file(sections)


# ============================================================
# Validation and entry point
# ============================================================


def validate(data: str, vocab: str) -> None:
    import pyshacl

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


def generate(fallbacks: Fallbacks | None = None) -> tuple[str, str]:
    """The two Turtle files. Pass a Fallbacks to learn which translations are missing."""
    schemes = read_table(SCHEMES, SCHEME_COLUMNS)
    concepts = read_table(CONCEPTS, CONCEPT_COLUMNS)
    pins = read_table(PINS, PIN_COLUMNS)

    problems = Problems()
    fallbacks = fallbacks if fallbacks is not None else Fallbacks()
    kinds = index_terms(concepts, pins, problems)
    problems.raise_if_any()  # ids must be sound before links can be checked

    vocab = build_vocab(schemes, concepts, problems, fallbacks)
    data = build_data(pins, kinds, problems, fallbacks)
    problems.raise_if_any()
    return data, vocab


def main(argv: list[str] | None = None) -> int:
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
        drift = [
            path.relative_to(REPO)
            for path, fresh in ((OUT_DATA, data), (OUT_VOCAB, vocab))
            if not path.exists() or path.read_text(encoding="utf-8") != fresh
        ]
        if drift:
            print(
                f"error: {', '.join(str(p) for p in drift)} differ from a fresh run. "
                f"Run `just data`.",
                file=sys.stderr,
            )
            return 1
        print("ontology is up to date")
        return 0

    OUT_DATA.write_text(data, encoding="utf-8", newline="\n")
    OUT_VOCAB.write_text(vocab, encoding="utf-8", newline="\n")
    print(f"wrote {OUT_DATA.relative_to(REPO)} and {OUT_VOCAB.relative_to(REPO)}")
    print(fallbacks.summary())
    return 0


if __name__ == "__main__":
    sys.exit(main())
