#!/usr/bin/env python3
"""Build taxonomy.xlsx from the taxonomy tables, for editing in Google Sheets.

The .tsv files under src/ontology/taxonomy/ are the source of truth: they are what
the generator reads and what diffs usefully in review. This script packs them into
one workbook to hand to whoever maintains the content, with the header frozen,
columns sized, and dropdowns on the columns that take a fixed set of values.

    uv run --group dev build_workbook.py

The round trip is: build the workbook, import it into Google Sheets, edit, export
each tab back over its .tsv, then `just data`. The workbook itself is a build
artifact and is not committed -- rebuild it whenever you need one.
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

# Fixed vocabularies offered as dropdowns, so these columns cannot drift.
CHOICES = {"dimension": gen.DIMENSIONS, "class": list(gen.CLASSES)}

# Roughly how wide each column wants to be, in characters. Long prose columns are
# capped and wrapped instead of stretching the sheet off-screen.
WIDTHS = {
    "id": 32, "dimension": 20, "class": 20, "name_en": 30, "name_de": 30,
    "long_name_en": 40, "long_name_de": 40, "lat": 10, "lon": 10, "location": 34,
    "description_en": 60,
    "description_de": 60, "founded": 9, "url": 28, "logo": 28,
    "wp_tag_id": 11, "wp_entity_tag_id_en": 12, "wp_entity_tag_id_de": 12,
    "iso_codes": 30, "links": 60, "notes": 60, "definition": 50,
}
WRAPPED = {
    "description_en", "description_de", "links", "notes", "definition",
    "iso_codes",
}


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle, delimiter="\t"))


def build(out: Path) -> None:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation

    workbook = Workbook()
    workbook.remove(workbook.active)

    header_font = Font(bold=True)
    header_fill = PatternFill("solid", fgColor="E8EEF4")

    for title, path, columns in TABS:
        sheet = workbook.create_sheet(title)
        sheet.append(columns)
        for cell in sheet[1]:
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(vertical="center")
        for row in read_rows(path):
            sheet.append([row.get(column, "") for column in columns])

        for index, column in enumerate(columns, start=1):
            letter = get_column_letter(index)
            sheet.column_dimensions[letter].width = WIDTHS.get(column, 18)
            if column in WRAPPED:
                for cell in sheet[letter][1:]:
                    cell.alignment = Alignment(wrap_text=True, vertical="top")

        # Freeze the header, and the id column with it, so wide rows stay readable.
        sheet.freeze_panes = "B2"
        sheet.auto_filter.ref = sheet.dimensions

        for index, column in enumerate(columns, start=1):
            if column not in CHOICES:
                continue
            validation = DataValidation(
                type="list",
                formula1='"' + ",".join(CHOICES[column]) + '"',
                allow_blank=False,
            )
            validation.error = f"Pick one of: {', '.join(CHOICES[column])}"
            sheet.add_data_validation(validation)
            letter = get_column_letter(index)
            validation.add(f"{letter}2:{letter}{sheet.max_row}")

    workbook.save(out)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=gen.TAXONOMY_DIR / "taxonomy.xlsx",
        help="where to write the workbook (default: src/ontology/taxonomy/taxonomy.xlsx)",
    )
    args = parser.parse_args(argv)
    build(args.out)
    print(f"wrote {gen.display(args.out)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
