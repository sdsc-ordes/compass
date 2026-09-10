# update-data

## Update the data

```bash
just data::update
```

`tsv_to_rdf.py` reads `src/ontology/source-data.ods`, validates the output with SHACL, and writes `src/ontology/compass.ttl` and `src/ontology/vocab.ttl`.

## Check the committed ontology is fresh

```bash
just data::check
```

Fails if the committed Turtle differs from a fresh run.

## Run the updater tests

To run only the generator tests:

```bash
cd src/update-data
uv run --group dev pytest
```
