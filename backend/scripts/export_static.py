"""
Write the SHACL introspection results the frontend cannot derive on its own into
frontend/src/generated/: specs.json and filters.<lang>.json. The Turtle files
themselves are read straight from ontology/ by the frontend.

Re-run after every ontology change, then rebuild the frontend:

    cd backend && uv run python scripts/export_static.py
"""
import json
import sys
from pathlib import Path

# Make the backend package importable regardless of the current directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.rdf import RDFStore  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
ONTOLOGY = REPO_ROOT / "ontology"
OUT_DIR = REPO_ROOT / "frontend" / "src" / "generated"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    store = RDFStore(
        data_path=str(ONTOLOGY / "compass.ttl"),
        shapes_path=str(ONTOLOGY / "shapes.ttl"),
        vocab_path=str(ONTOLOGY / "vocab.ttl"),
    )

    specs = store.get_property_specs()
    (OUT_DIR / "specs.json").write_text(json.dumps(specs, indent=2, ensure_ascii=False))

    for lang in ("en", "de"):
        schema = store.get_filters_schema(lang)
        (OUT_DIR / f"filters.{lang}.json").write_text(
            json.dumps(schema, indent=2, ensure_ascii=False)
        )

    print(f"Wrote specs.json, filters.en.json, filters.de.json to {OUT_DIR}")
    print(f"  {len(specs)} property specs")


if __name__ == "__main__":
    main()
