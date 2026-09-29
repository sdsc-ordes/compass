# Configuring the Ontology for a New Use-case

1. Create a use-case folder under `src/ontology/` (no spaces; use hyphens, e.g.
   `my-org`). Set `COMPASS_USE_CASE` to that name in `.env`.
2. Copy `src/ontology/template-source-data.ods` into the new folder and rename it
   `source-data.ods`.
3. Open the workbook in Google Sheets or another spreadsheet app, fill in the
   `schemes`, `concepts`, and `pins` sheets with the use-case data, then save it
   back as `.ods`.
4. Generate Turtle from the workbook:

   ```bash
   just data::generate
   ```

5. Continue with the [backend](configuration-backend.md) and
   [frontend](configuration-frontend.md) configuration steps before deploying.

Shared files (`shapes.ttl`, `shacl-shacl.ttl`, the template) stay at the ontology
root. Instance data (`source-data.ods`, generated `compass.ttl` / `vocab.ttl`)
lives under `src/ontology/<COMPASS_USE_CASE>/`.

