Plan: OceanCare Interactive World Map (Compass)
Build a standalone, embeddable interactive world map widget powered by a FastAPI + pyoxigraph backend and an RDF knowledge graph. The ontology drives all filter logic — adding new categories to the RDF data auto-generates new filters in the UI. The frontend uses MapLibre GL JS (flat/globe toggle), delivered as a self-contained Web Component that WordPress or any CMS can embed via a <script> tag.

Architecture

[RDF Data (Turtle)]        │        ▼[FastAPI + pyoxigraph]  ──SPARQL──▶  [SHACL shape introspection]        │                                      │        ▼                                      ▼[REST API]                           [/api/filters/schema]   /api/entities (GeoJSON)             (auto-generated from ontology)   /api/entities/{id}   /api/states (saved map states)        │        ▼[Frontend: Svelte → Web Component + MapLibre GL JS]   <compass-map api-url="..." lang="en"></compass-map>
Phase 1: Foundation
Project scaffolding — Monorepo: frontend/ (Vite + Svelte + TS) + backend/ (FastAPI + pyoxigraph + uv) + ontology/ (Turtle files)
RDF ontology & SHACL shapes — Refine draft ontology for entity types (Forum, Project, PartnerOrg, Network, Research). Define SHACL shapes that describe filter dimensions: category enumerations for dropdowns, numeric ranges for sliders, boolean toggles. Multilingual labels via rdfs:label with @de/@en tags. Create 20-50 sample entities.
Backend API — FastAPI with pyoxigraph as embedded triplestore:
GET /api/filters/schema — introspects SHACL shapes → returns filter definitions (type, label, options, min/max)
GET /api/entities?topic=X&region=Y&year_min=2010 — returns GeoJSON FeatureCollection, filters applied via dynamic SPARQL
GET /api/entities/{id} — single entity detail for popup
?lang=de|en on all endpoints
Phase 2: Map Frontend
Map + flat/globe toggle (depends on 1) — MapLibre GL JS with Protomaps PMTiles (or OpenFreeMap). Globe ↔ Flat projection toggle. Responsive layout (mobile/desktop).
Pins & clustering (depends on 3, 4) — Render GeoJSON from API. MapLibre native clustering (expand on zoom). Color-coded pins by primary category + auto-generated legend.
Ontology-driven filter panel (depends on 3, 4) — Fetch /api/filters/schema on load → dynamically render: multi-select checkboxes, range sliders, AND/OR toggles per group. Filter changes re-fetch entities. Filter state synced to URL params.
Pin popups (depends on 5) — Click/tap → popup with image, title, description, link (all from RDF). Mobile: bottom sheet. Desktop: side panel. Touch targets ≥ 44px.
Phase 3: Advanced Features
Region highlighting & overlay layers (parallel with 9) — GeoJSON polygons for ocean regions, habitats, shipping zones. Toggle-able in filter panel (also ontology-driven).
Shareable map states (parallel with 8) — URL params for stateless sharing (auto-updates on interaction). POST/GET /api/states for server-side saved states → short link + QR code generation (client-side).
List view alternative (depends on 5) — Table view with same filters applied. Switch between map ↔ list. JSON-LD <script> tags for schema.org structured data.
i18n (DE/EN) (parallel) — Language toggle. UI labels from i18n dictionaries. Content from API ?lang= param. Filter labels from ontology.
CTA pins (depends on 5, 6) — Special neon-styled pins for petitions/donations. Subtle popup on category activation. Configurable via RDF (special entity type).
Phase 4: Packaging & Delivery
Web Component bundle — Build <compass-map> custom element. Attributes: api-url, lang, initial-filters, theme. Single JS + CSS output, shadow DOM encapsulated. Target < 500KB gzipped.
Backend Docker image — Dockerfile for FastAPI + Oxigraph. RDF data from mounted volume. CORS config for WordPress domain.
Accessibility audit — WCAG 2.1 AA (BFSG). Keyboard nav, screen reader labels, high contrast, prefers-reduced-motion.
Documentation — Embed guide for WordPress team, API docs (OpenAPI), ontology guide (how to add entities/categories).
Relevant files
backend/app/main.py — FastAPI app, startup, CORS
backend/app/rdf.py — Oxigraph store, SPARQL helpers, SHACL introspection for filter generation
backend/app/routers/entities.py — Entity endpoints returning GeoJSON
backend/app/routers/filters.py — Filter schema endpoint (the key ontology→UI bridge)
ontology/compass.ttl — Core ontology (classes, properties for all entity types)
ontology/shapes.ttl — SHACL shapes (drives filter auto-generation — defines what's a slider vs. checkbox vs. dropdown)
frontend/src/map/Map.svelte — MapLibre map with globe/flat toggle, layers, clustering
frontend/src/filters/FilterPanel.svelte — Dynamic filter panel rendered from schema
frontend/src/main.ts — Web Component registration and entry point
Verification
Ontology → Filter roundtrip: Add a new category to SHACL shapes → verify new filter appears in UI without code changes
Clustering: 500+ sample pins → clusters form, expand on zoom
Globe/flat toggle: Pins remain correctly placed on projection switch
i18n: Switch DE↔EN → all labels and content change
Embed test: <compass-map> in a plain HTML page works without extra setup
Mobile: Touch targets ≥ 44px, bottom sheet popups functional
Accessibility: axe-core audit — zero critical violations
Shareable URLs: Copy URL with filters → new tab → identical state
Performance: Initial load < 3s on 3G, smooth 60fps rendering
No external deps: Network tab shows zero calls to Google, font CDNs, etc.
Decisions
MapLibre GL JS for map rendering (open-source, globe+flat, clustering, WebGL)
FastAPI + pyoxigraph for backend (embedded RDF store, no separate DB service)
Svelte → Web Component for frontend (lightweight, compiles away, framework-agnostic output)
SHACL shapes drive filter generation (single source of truth = ontology)
GeoJSON as the data exchange format between API and frontend
URL params + SQLite-backed saved states for shareability
Open Items
Map tiles: Protomaps PMTiles (fully self-contained, no external calls) vs. OpenFreeMap (free, lighter setup but external calls). Recommend Protomaps if "no external includes" is strict.
Data update flow: (A) Spreadsheets → automated RDF conversion, (B) Simple admin UI, (C) Git-based Turtle editing. Recommend (A) for non-technical users — to be decided with OceanCare.
Frontend framework: Svelte (reactive, lightweight, compiles to Web Component nicely) vs. vanilla TS (simpler but more boilerplate). Recommend Svelte.