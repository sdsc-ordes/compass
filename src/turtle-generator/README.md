# turtle-generator

Paths under `src/ontology/` are selected by `COMPASS_USE_CASE` (default
`oceancare`, also read from the repo-root `.env` when unset).

## Update the data

```bash
just data::generate
```

`ods_to_rdf.py` reads `src/ontology/<COMPASS_USE_CASE>/source-data.ods`, validates
the output with SHACL (`src/ontology/shapes.ttl`), and writes
`src/ontology/<COMPASS_USE_CASE>/compass.ttl` and
`src/ontology/<COMPASS_USE_CASE>/vocab.ttl`.

## Check the committed ontology is fresh

```bash
just data::check
```

Fails if the committed Turtle differs from a fresh run.

## Run the updater tests

To run only the generator tests:

```bash
cd src/turtle-generator
uv run --group dev pytest
```
