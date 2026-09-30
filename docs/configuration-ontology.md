# Ontology configuration

To set up a new use-case:

1. Create a folder under `src/ontology/` (no spaces, e.g. `my-org`) and set
   `COMPASS_USE_CASE` to its name in `.env`.
2. Copy `src/ontology/template-source-data.ods` into it as `source-data.ods`.
3. Fill in the `schemes`, `concepts` and `pins` sheets and save as `.ods`.
4. Generate the Turtle:

   ```bash
   just data::generate
   ```

5. Continue with the [backend](configuration-backend.md) and
   [frontend](configuration-frontend.md) configuration.

Shared files (`shapes.ttl`, `shacl-shacl.ttl`, the template) stay at the
ontology root. `source-data.ods`, `compass.ttl` and `vocab.ttl` live in
`src/ontology/<COMPASS_USE_CASE>/`. Workbook rules are in the
[overview](index.md#map-data).
