#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["rdflib>=7.0,<8", "pyshacl>=0.30,<0.32"]
# ///
"""Generate compass.ttl and vocab.ttl from the tables in src/ontology/taxonomy/.

Rows carry their own `id` and link by id in a `links` column; a link's predicate
follows what it points at, so there is no mapping to configure.

    tsv_to_rdf.py            regenerate
    tsv_to_rdf.py --check    exit 1 if the committed files are stale

Subject order, predicate order and float precision are all pinned, so unchanged
input produces byte-identical output.
"""
from __future__ import annotations

import argparse
import csv
import sys
from dataclasses import dataclass, field
from pathlib import Path

from rdflib import Graph

REPO = Path(__file__).resolve().parents[2]
ONTOLOGY_DIR = REPO / "src" / "ontology"
TAXONOMY_DIR = ONTOLOGY_DIR / "taxonomy"
SCHEMES = TAXONOMY_DIR / "schemes.tsv"
CONCEPTS = TAXONOMY_DIR / "concepts.tsv"
PINS = TAXONOMY_DIR / "pins.tsv"
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

SCHEME_COLUMNS = ["id", "name_en", "name_de", "definition"]
CONCEPT_COLUMNS = [
    "id", "dimension", "name_en", "name_de", "wp_tag_id", "iso_codes", "links", "notes",
]
PIN_COLUMNS = [
    "id", "class", "name_en", "name_de", "long_name_en", "long_name_de",
    "lat", "lon", "location",
    "description_en", "description_de", "founded", "url", "logo",
    "wp_entity_tag_id_en", "wp_entity_tag_id_de", "links", "notes",
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
    "schema:foundingDate",
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
    "compass:wpEntityTagIdEn",
    "compass:wpEntityTagIdDe",
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
    "# Regenerate with `just data` after editing the tables in\n"
    "# src/ontology/taxonomy/.\n"
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

    def add(self, table: Path, row: int, message: str) -> None:
        self.items.append(f"  {table.name}:{row}  {message}")

    def raise_if_any(self) -> None:
        if self.items:
            raise SheetError(f"{len(self.items)} problem(s):\n" + "\n".join(self.items))


# ============================================================
# Reading
# ============================================================


@dataclass(frozen=True)
class Row:
    number: int  # 1-based, matching what a spreadsheet shows
    table: Path
    cells: dict[str, str]

    def __getitem__(self, column: str) -> str:
        return self.cells.get(column, "")


def read_table(path: Path, columns: list[str]) -> list[Row]:
    """Read one tab-separated table, requiring exactly the expected header."""
    if not path.exists():
        raise SheetError(f"{display(path)} is missing")
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        header = reader.fieldnames or []
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
            raise SheetError(f"{display(path)}: {detail}")
        rows = []
        for number, cells in enumerate(reader, start=2):
            stripped = {k: (v or "").strip() for k, v in cells.items() if k is not None}
            if not any(stripped.values()):
                continue  # a blank spacer row
            rows.append(Row(number=number, table=path, cells=stripped))
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
                    f"{seen[identifier].table.name}:{seen[identifier].number}",
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


def link_triples(grouped: dict[str, set[str]]) -> Triples:
    return [
        (predicate, ", ".join(sorted(objects)))
        for predicate, objects in sorted(grouped.items())
    ]


def concept_triples(row: Row, kinds: dict[str, str], problems: Problems) -> Triples:
    dimension = row["dimension"]
    scheme = f"compass:{dimension}Scheme"
    triples: Triples = [
        ("a", f"skos:Concept, compass:{dimension}"),
        ("skos:prefLabel", literal(row["name_en"], "en")),
        ("skos:prefLabel", literal(row["name_de"] or row["name_en"], "de")),
    ]
    wp_tag_id = number(row, "wp_tag_id", problems, int)
    if wp_tag_id:
        triples.append(("compass:wpTagId", typed(wp_tag_id, "xsd:integer")))
    # Only a single code is a boundary key; several means a dissolved region.
    if row["iso_codes"] and " " not in row["iso_codes"]:
        triples.append(("compass:isoCode", f'"{row["iso_codes"]}"'))
    triples += link_triples(parse_links(row, kinds, problems))
    triples += [("skos:inScheme", scheme), ("skos:topConceptOf", scheme)]
    return triples


def pin_triples(row: Row, kinds: dict[str, str], problems: Problems) -> Triples:
    name_de = row["name_de"] or row["name_en"]
    triples: Triples = [
        ("a", f"compass:{row['class']}"),
        ("compass:name", literal(row["name_en"], "en")),
        ("compass:name", literal(name_de, "de")),
        ("rdfs:label", literal(row["name_en"], "en")),
        ("rdfs:label", literal(name_de, "de")),
    ]
    for language in ("en", "de"):
        for column, predicate in (
            ("long_name", "skos:altLabel"),
            ("description", "compass:description"),
        ):
            value = row[f"{column}_{language}"]
            if value:
                triples.append((predicate, literal(value, language)))
    if row["location"]:
        triples.append(("compass:location", literal(row["location"], "en")))

    founded = number(row, "founded", problems, int)
    if founded:
        triples.append(("schema:foundingDate", typed(founded, "xsd:gYear")))
    if row["url"]:
        triples.append(("schema:url", typed(row["url"], "xsd:anyURI")))
    if row["logo"]:
        triples.append(("schema:image", typed(row["logo"], "xsd:anyURI")))
    for column, predicate in (
        ("wp_entity_tag_id_en", "compass:wpEntityTagIdEn"),
        ("wp_entity_tag_id_de", "compass:wpEntityTagIdDe"),
    ):
        value = number(row, column, problems, int)
        if value:
            triples.append((predicate, typed(value, "xsd:integer")))

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


def build_vocab(schemes: list[Row], concepts: list[Row], kinds, problems) -> str:
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

        scheme_triples: Triples = [
            ("a", "skos:ConceptScheme"),
            ("skos:prefLabel", literal(scheme["name_en"], "en")),
            ("skos:prefLabel", literal(scheme["name_de"], "de")),
            ("skos:definition", literal(scheme["definition"], "en")),
        ]
        scheme_triples += [
            ("skos:hasTopConcept", f"compass:{m['id']}") for m in members
        ]
        scheme_triples.append(("dct:isPartOf", f"<{ONTOLOGY_NS.rstrip('#')}>"))

        blocks = [render_subject(f"compass:{dimension}Scheme", scheme_triples)]
        blocks += [
            render_subject(f"compass:{m['id']}", concept_triples(m, kinds, problems))
            for m in members
        ]
        sections.append((f"{scheme['name_en']} ({len(members)} concepts)", blocks))
    return render_file(sections)


def build_data(pins: list[Row], kinds, problems) -> str:
    sections: list[tuple[str, list[str]]] = []
    for entity_class, title in CLASSES.items():
        members = sorted(
            (r for r in pins if r["class"] == entity_class), key=lambda r: r["id"]
        )
        blocks = [
            render_subject(f"ocinst:{m['id']}", pin_triples(m, kinds, problems))
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


def generate() -> tuple[str, str]:
    schemes = read_table(SCHEMES, SCHEME_COLUMNS)
    concepts = read_table(CONCEPTS, CONCEPT_COLUMNS)
    pins = read_table(PINS, PIN_COLUMNS)

    problems = Problems()
    kinds = index_terms(concepts, pins, problems)
    problems.raise_if_any()  # ids must be sound before links can be checked

    vocab = build_vocab(schemes, concepts, kinds, problems)
    data = build_data(pins, kinds, problems)
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

    try:
        data, vocab = generate()
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
    return 0


if __name__ == "__main__":
    sys.exit(main())
