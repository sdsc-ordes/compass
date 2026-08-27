#!/usr/bin/env python3
"""Pack src/ontology/taxonomy/*.tsv into one .ods for editing in Google Sheets.

Import it, edit, export each tab back over its .tsv, then `just data`. The .tsv
files stay the source of truth; the workbook is a build artifact that goes stale
as soon as they change.
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import tsv_to_rdf as gen

TABS = [
    ("schemes", gen.SCHEMES, gen.SCHEME_COLUMNS),
    ("concepts", gen.CONCEPTS, gen.CONCEPT_COLUMNS),
    ("pins", gen.PINS, gen.PIN_COLUMNS),
]

# Roughly how wide each column wants to be, in characters. Long prose columns are
# capped and wrapped instead of stretching the sheet off-screen.
WIDTHS = {
    "id": 32, "dimension": 20, "class": 20, "name_en": 30, "name_de": 30,
    "long_name_en": 40, "long_name_de": 40, "lat": 10, "lon": 10, "location": 34,
    "description_en": 60, "description_de": 60, "founded": 9, "url": 28, "logo": 28,
    "wp_tag_id": 11, "wp_entity_tag_id_en": 12, "wp_entity_tag_id_de": 12,
    "iso_codes": 30, "links": 60, "notes": 60, "definition": 50,
}
WRAPPED = {
    "description_en", "description_de", "links", "notes", "definition",
    "iso_codes",
}

CHARACTER_CM = 0.21  # approximate width of one character at the default font size


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


def build(out: Path) -> None:
    from odf.opendocument import OpenDocumentSpreadsheet
    from odf.style import Style, TableCellProperties, TableColumnProperties, TextProperties
    from odf.table import Table, TableCell, TableColumn, TableRow
    from odf.text import P

    document = OpenDocumentSpreadsheet()

    header_style = Style(name="Header", family="table-cell")
    header_style.addElement(TextProperties(fontweight="bold"))
    header_style.addElement(TableCellProperties(backgroundcolor="#e8eef4"))
    document.automaticstyles.addElement(header_style)

    wrap_style = Style(name="Wrapped", family="table-cell")
    wrap_style.addElement(TableCellProperties(wrapoption="wrap"))
    document.automaticstyles.addElement(wrap_style)

    # One column style per distinct width, shared across tabs.
    column_styles: dict[int, object] = {}

    def column_style(width: int):
        if width not in column_styles:
            style = Style(name=f"col{width}", family="table-column")
            style.addElement(
                TableColumnProperties(columnwidth=f"{width * CHARACTER_CM:.2f}cm")
            )
            document.automaticstyles.addElement(style)
            column_styles[width] = style
        return column_styles[width]

    def cell(value: str, style=None) -> "TableCell":
        target = TableCell(valuetype="string")
        if style is not None:
            target.setAttribute("stylename", style)
        # An empty cell carries no paragraph; embedded newlines need one each.
        for line in value.split("\n") if value else []:
            target.addElement(P(text=line))
        return target

    for title, path, columns in TABS:
        table = Table(name=title)
        for column in columns:
            table.addElement(TableColumn(stylename=column_style(WIDTHS.get(column, 18))))

        header = TableRow()
        for column in columns:
            header.addElement(cell(column, header_style))
        table.addElement(header)

        for row in read_rows(path):
            line = TableRow()
            for column in columns:
                line.addElement(
                    cell(row.get(column, ""), wrap_style if column in WRAPPED else None)
                )
            table.addElement(line)

        document.spreadsheet.addElement(table)

    document.save(out)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=gen.TAXONOMY_DIR / "taxonomy.ods",
        help="where to write the workbook (default: src/ontology/taxonomy/taxonomy.ods)",
    )
    args = parser.parse_args(argv)
    build(args.out)
    print(f"wrote {gen.display(args.out)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
