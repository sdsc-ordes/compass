# Ontology Design Decisions

Open questions from translating the source data document (2026-06-15).

---

## Resolved

### 1. Country / Area entities as shaded map regions ✅
The 20 (now 21, incl. Australia) Country/Area entries are rendered as **shaded
polygons** on the map, not pins. They are kept as `compass:CountryArea` SKOS
concepts (no separate class); each carries a tag set and an optional
`compass:isoCode`. The backend emits them as geometry-less region features
(`is_region: true`, `regionKey`); the frontend joins boundary polygons from
`frontend/src/map/regions.json` (built by `scripts/build-regions.mjs` from
Natural Earth — countries by ISO, marine areas dissolved/clipped from named
seas). Clicking a region opens the detail panel.

> Note: region tag sets were seeded as the **union of tags from entities that
> reference each region**. Vera should confirm these against the source document.

### 5. "Dolphins" label ✅
Keep **"Dolphins"** (no rename to "Dolphins & Small Cetaceans"). No change.

### 6. "Corals" ✅
Stays a **species concept only** — there is no Corals project/region to pin. It
is used as a species tag (e.g. on Australia).

### 7. Australia ✅
Added as a `compass:CountryArea` region (`isoCode "AUS"`), tagged
`topic: Climate Protection` and `species: Corals`. Shades automatically.

---

## Open — to raise with Vera

### 2. "Aquatic Wild Meat" & "Out of Habitat" — also topic tags?
Currently these exist **only as projects** (`ocinst:AquaticWildMeat`,
`ocinst:OutOfHabitat`). The source document also uses them as **topic tags** on
other entities (e.g. BEES and Olive Ridley Project → Aquatic Wild Meat; England
→ Out of Habitat).
- **Question:** should they additionally become SKOS concepts in `TopicScheme`
  so they can tag other entities — while remaining projects?
- **Implication:** an entity could be both a project *and* a topic. Need to
  confirm that dual role is intended and which entities carry each tag.

### 3. "Because Our Planet Is Blue" — project or topic?
Appears only for OceanCare in the source document.
- **Question:** is it a **project** (→ needs coordinates + description) or a
  **thematic tag** (→ goes in `TopicScheme`)?
- **Implication:** determines whether it gets a pin on the map or becomes a
  filter chip.

### 4. "Events", "Research Expeditions", "Petitions" — work areas?
Listed under OceanCare's work areas in the source document; **only OceanCare**
has them.
- **Question:** add them as `WorkArea` concepts, or leave them out?
- **Consideration:** a filter chip that returns exactly one result isn't very
  useful. Recommendation: leave out unless other entities will use them.
