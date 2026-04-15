# Feature Assessment — Compass

> Generated from codebase audit, April 2026.

## Map Display

| # | Feature | Status | Detail |
|---|---------|--------|--------|
| 1 | Flat map (view all at once) | ✅ Met | Default projection is Mercator — all entities visible without hidden hemisphere. |
| 2 | Globe (realistic sizes) | ✅ Met | MapLibre `globe` projection available, correct ocean/landmass proportions. |
| 3 | Toggle flat ↔ globe | ✅ Met | Projection toggle button in bottom-left corner of map (`toggleProjection()`). |
| 4 | Pins for international fora | ✅ Met | `InternationalForum` class defined (e.g. IOC-UNESCO, OSPAR, CTI-CFF). Color: amber. |
| 5 | Pins for projects | ✅ Met | `Project` class with geo coords, species, dates. Color: pink. |
| 6 | Pins for partner organisations | ✅ Met | `NGO`, `GovernmentAgency` classes cover partner orgs. Color: purple / orange. |
| 7 | Pins for networks | ✅ Met | `Network` class with `memberCount`, `memberStates`. Color: cyan. |
| 8 | Pins for research participation | ⚠️ Partial | Research institutes and universities have pins. No explicit "research participation" relationship linking people/roles to orgs — would need `compass:ResearchParticipation` class or similar. |
| 9 | Pins colour-coded by type | ✅ Met | 7 entity types × 7 distinct colors via `TYPE_COLORS` map + `typeColorExpression()`. |
| 10 | Legend for colour codes | ✅ Met | Map legend auto-generated from `TYPE_COLORS` with human-readable type names, plus OceanCare star entry and org↔project link explanation. |

## Performance & Technical

| # | Feature | Status | Detail |
|---|---------|--------|--------|
| 11 | Fast loading | ✅ Met | Single IIFE bundle (~1.15 MB, ~310 KB gzip). Vector tiles from OpenFreeMap. In-memory RDF store — no database round-trips. |
| 12 | No external includes (Google Fonts etc.) | ✅ Met | No Google Fonts, no external CDN fonts. System font stack in CSS. Only external fetch is OpenFreeMap tile server. MapLibre CSS is loaded from unpkg CDN inside Shadow DOM. |
| 13 | Structured data (schema.org) | ⚠️ Partial | Ontology uses `schema:foundingDate` and `schema:url`. API returns GeoJSON, not JSON-LD. No `@context` or `@type` annotations in responses. Embedding pages would need to add their own `<script type="application/ld+json">` blocks. |
| 14 | Web accessibility (BFSG) | ⚠️ Partial | `aria-label` on key buttons (filter collapse, sidebar close, filter reopen). Semantic HTML table in ListView. Missing: no `aria-live` regions for dynamic content, no skip-nav link, no focus management after filter/sidebar state changes, no high-contrast mode, no keyboard-only navigation testing documented. |
| 15 | Separate list view as alternative | ✅ Met | Map/List toggle in header. ListView renders a full `<table>` with name, key sentence, focus areas, region, funding, type badge, donation link per entity. |

## Internationalisation & Responsiveness

| # | Feature | Status | Detail |
|---|---------|--------|--------|
| 16 | DE/EN versions | ✅ Met | Language toggle in header. All UI strings in `i18n.ts` (24 keys × 2 languages). Filter labels, entity properties, and SHACL shape names all have `@en` / `@de` variants. Ontology data is multilingual (`rdf:langString`). |
| 17 | Mobile/desktop versions | ✅ Met | CSS media query at 900 px switches from side-by-side to stacked layout. Filter panel and sidebar collapse/expand. |
| 18 | Usability touch/mouse (touch points) | ⚠️ Partial | Pins are 8 px radius circles (16 px diameter) — slightly below the 44 × 44 px WCAG touch target guideline. Cluster bubbles are larger (16–28 px radius). Buttons use standard sizing. Slider/datepicker use native HTML inputs which have platform-appropriate touch targets. |
| 19 | Click or hover over pins | ✅ Met | Click selects entity (persistent, opens sidebar). Hover previews connections. Both `mouseenter`/`mouseleave` and `click` handlers on all point layers including the OceanCare star. |
| 20 | Embeddable module for landing pages / newsletters | ✅ Met | Built as a Web Component (`<compass-map apiurl="..." lang="en">`). Single `<script>` include. Shadow DOM isolation. Demonstrated in `test_embed.html`. |

## Map Interaction

| # | Feature | Status | Detail |
|---|---------|--------|--------|
| 21 | Scalability / zoomability | ✅ Met | MapLibre native pinch/scroll zoom. Cluster expansion on click. `fitBounds` with `maxZoom: 12` on data load. |
| 22 | Maps for specific regions (e.g. Mediterranean) | ⚠️ Partial | `fitBounds` auto-zooms to current entity extent after filtering. Selecting only Mediterranean entities (via country/region filters) effectively creates a Mediterranean map. No pre-defined "region view" buttons or saved region presets. |

## Filters

| # | Feature | Status | Detail |
|---|---------|--------|--------|
| 23 | Category filters (topics, regions) | ✅ Met | SHACL-driven filter schema: multiselect for focus area, country, entity type, region, funding, species, access type. Slider for founded year, budget, staff size. Datepicker for update date. |
| 24 | Per category multiple pins | ✅ Met | Each filter option matches multiple entities. Selecting "Marine Biology" returns all orgs with that focus area. |
| 25 | Per pin multiple categories | ✅ Met | Entities have multi-valued properties (multiple focus areas, species, etc.). All displayed as chips in sidebar and list view. |
| 26 | AND/OR selection for categories | ⚠️ Partial | **Within** a single filter: multiple values are OR'd (SPARQL `UNION`). **Across** filters: AND logic (all selected filters must match). No user-facing toggle to switch between AND/OR modes within a filter. |
| 27 | Clustering to avoid visual density | ✅ Met | MapLibre clustering enabled (`clusterRadius: 50`, `clusterMaxZoom: 14`). Cluster bubbles scale by count with numeric labels. Click-to-expand. |
| 28 | Manually select specific set of pins | ❌ Not met | No multi-select / lasso tool to hand-pick individual pins. Would need a "pin basket" or shift-click multi-select feature. |
| 29 | Link/Button for map state with selected categories | ✅ Met | "Share" button opens `ShareModal` which saves filter state + view mode + language to backend (`POST /api/states/save`). Returns short URL with `?state=<id>` that fully restores the map state. URL is displayed with a copy-to-clipboard button. |
| 30 | QR code / image export for map state | ⚠️ Partial | QR code is generated client-side via the `qrcode` library and displayed in `ShareModal` (200×200 px, dark-on-white). No map screenshot/image export — `map.getCanvas().toBlob()` could add that. |
| 31 | Visualize connectivity & overlapping layers | ⚠️ Partial | Org↔Project connection lines (dashed indigo) on hover/click. Region fill/outline layers exist. No overlapping thematic layers (whale habitat, shipping zones, etc.) — would need GeoJSON polygon data for environmental/activity zones and a layer toggle UI. |

## Information Display

| # | Feature | Status | Detail |
|---|---------|--------|--------|
| 32 | Info box with image, title, short sentence, link | ⚠️ Partial | EntitySidebar shows: title, key sentence, website link, donation link, focus areas, region, projects (with project images). **No entity-level symbolic image/logo** — only project images within the projects section. |
| 33 | Info box with video / film statement | ❌ Not met | No video embed field in ontology or UI. Would need `compass:videoUrl` property + embedded player in sidebar. |
| 34 | "Library" backend for adding new info/pins | ⚠️ Partial | Data is managed via Turtle files (`compass.ttl`). Adding a new entity means editing the TTL file and restarting the backend. No web-based admin UI / CMS for non-technical editors. |

## Calls to Action

| # | Feature | Status | Detail |
|---|---------|--------|--------|
| 35 | Petition/donation pop-up on category activation | ❌ Not met | Donation links appear in sidebar and list view per entity. No automatic pop-up / modal triggered by activating a specific filter category. |
| 36 | Neon-coloured pin for call to action | ✅ Met | CTA layer: hot pink (#f43f5e) with pale pink stroke and blur glow. Separate from regular pins. Requires `is_cta` property on features. |
| 37 | OceanCare as featured gold star pin | ✅ Met | OceanCare rendered as gold ★ symbol (`#f59e0b`) with white halo, excluded from regular circle layer, with legend entry. |

## Edge Cases

| # | Feature | Status | Detail |
|---|---------|--------|--------|
| 38 | Single pin for selected category → zoom in? | ⚠️ Partial | `fitBounds` with `maxZoom: 12` handles this: if only one entity matches, map zooms to it capped at zoom 12. Does not zoom all the way to street level. Consider adding `flyTo` with a tighter zoom when exactly 1 result is returned. |

---

## Summary

| Status | Count |
|--------|-------|
| ✅ Met | 22 |
| ⚠️ Partial | 11 |
| ❌ Not met | 5 |

### Priority gaps

| Gap | Effort | Notes |
|-----|--------|-------|
| Manual pin selection (lasso/basket) | High | Needs new UI interaction pattern + state management |
| Map image export | Low | `map.getCanvas().toBlob()` to download a PNG snapshot of the current view |
| Donation pop-up on filter activation | Medium | Trigger modal when specific filter IDs are selected |
| Video embed in sidebar | Low | Add `compass:videoUrl` property + `<iframe>`/`<video>` in EntitySidebar |
| Entity-level image/logo | Low | Add `compass:imageUrl` to Organization shape + render in sidebar |
| Admin UI for data entry | High | Full CMS or form-based Turtle editor — significant new module |
| Full BFSG/WCAG accessibility | Medium | Focus management, skip-nav, ARIA live regions, contrast audit, keyboard nav |
| Thematic overlay layers | High | Requires GeoJSON polygon data for habitats/shipping/etc. + layer toggle UI |
| Schema.org JSON-LD in API | Low | Add `@context` wrapper to GeoJSON responses |
| AND/OR filter toggle | Medium | UI toggle + SPARQL builder logic change |
