# Turtle generator

`ods_to_rdf.py` reads `src/ontology/<COMPASS_USE_CASE>/source-data.ods`,
validates the result against `src/ontology/shapes.ttl`, and writes `compass.ttl`
and `vocab.ttl` next to the workbook. `COMPASS_USE_CASE` (default `oceancare`)
is read from the environment, then from the repository-root `.env`.

```bash
just data::generate    # regenerate the Turtle
just data::check       # fail if the committed Turtle differs from a fresh run
```

Output is deterministic: unchanged input gives byte-identical files.

## Test

```bash
cd src/turtle-generator && uv run pytest
```
