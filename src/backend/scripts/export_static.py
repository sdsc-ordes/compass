"""
Write the SHACL introspection results the frontend cannot derive on its own into
src/frontend/src/generated/: specs.json and filters.<lang>.json. The Turtle
files themselves are read straight from src/ontology/ by the frontend.

Re-run after every ontology change, then rebuild the frontend:

    just export
"""
import json
import sys
from pathlib import Path

# Make the backend package importable regardless of the current directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.rdf import RDFStore  # noqa: E402

SRC = Path(__file__).resolve().parents[2]
ONTOLOGY = SRC / "ontology"
OUT_DIR = SRC / "frontend" / "src" / "generated"


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
