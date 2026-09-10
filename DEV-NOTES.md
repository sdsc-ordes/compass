# DEV NOTES

## Frontend related

- the `share/index.html` for local dev / build. Can we move this into tools somehow for the frontend? 
- nginx and index.html setup is frontend related for the frontend Docker. Will this stay or be reworked? Could it live in `src/frontend`?
- The script for `build-tiles.mjs` fails to fetch some tiles. Did not fix this for the moment.
- Indicate somewhere on the map that this is a `Beta` version. (with the Beta Version mention somewhere).

## Ontology/Semantics related

- Oceancare specifics and wordpress specifics. The other ontology PR addresses this. 
- Is the entire nomenclature (functions, documentation) for SHACL, SPARQL to geojson flows correct? Please check it.

## Docs

- please read them, especially `configuration.md` and `design.md`.
- please read over the global README at root
- please read the backend READMEs

## Data Update 

- there should be an empty template `source-data.ods`, a `template-source-data.ods` if a new project wants to start. 