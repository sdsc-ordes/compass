# Backend

## Running

```bash
uv run uvicorn app.main:app --reload --port 8000
```

## Tests

```bash
uv run pytest tests/ -v
```

---

## Design Explanations

### From SHACL & SPARQL to Filters & Entities



| Color | Script |
| --- | --- |
| Blue | API, `routers/filters.py` or `routers/entities.py`, Frontend |
| Orange | `rdf.py` |
| Purple | `shacl_to_filters.py` |
| Violet | `shacl_to_entities.py` |
| Green | `sparql_builder.py` |
| Pink | `sparql_to_geojson_translator.py` |
| Gray | Ontology Turtle / Oxigraph |

#### Boot — create filter panel

```mermaid
flowchart TB
  API["GET /api/v1/filters"]
  FR["get_filters<br/>validate FilterWidget models"]
  G["read_graph<br/>parse Turtle once"]
  TTL[("shapes.ttl compass.ttl vocab.ttl")]
  F["get_filters_from_shacl<br/>walk SHACL into FilterWidget"]
  N["get_shacl_property<br/>yield sh:property nodes"]
  L["get_shacl_label<br/>labels in lang"]
  OUT["JSON FilterWidget list<br/>TagPanel / legend"]

  API --> FR --> G
  TTL -.-> G
  G --> F --> N --> L --> OUT

  classDef router fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
  classDef rdf fill:#ffedd5,stroke:#ea580c,color:#7c2d12
  classDef filtermod fill:#ede9fe,stroke:#7c3aed,color:#3b0764
  classDef entitiesmod fill:#f3e8ff,stroke:#9333ea,color:#581c87
  classDef ontology fill:#f3f4f6,stroke:#6b7280,color:#1f2937

  class API,OUT,FR router
  class G rdf
  class F filtermod
  class N,L entitiesmod
  class TTL ontology
```

#### Map load / filter change

When language or filters change (`loadData` → `getEntities`). Builds SPARQL, fills instances, returns GeoJSON.

```mermaid
flowchart TB
  API["GET /api/v1/entities"]
  ER["get_entities<br/>orchestrate shapes SPARQL GeoJSON"]
  EF["get_entities<br/>cached EntityShape list"]
  EP["get_entity_shape_from_shacl<br/>project SHACL"]
  G["read_graph<br/>merged Graph"]
  TTL[("shapes.ttl compass.ttl vocab.ttl")]
  SHAPE["EntityShape list<br/>query and decode plan"]
  B["sparql_for_instances<br/>compile SELECT WHERE"]
  QSTR["SPARQL SELECT string"]
  Q["RDFStore.query"]
  OXI["Oxigraph<br/>match compass.ttl instances"]
  INST["instances<br/>one dict per entity"]
  GEO["instances_to_geojson<br/>decode via EntityShape"]
  FC["FeatureCollection"]
  MAP["Map / ListView / sidebar"]

  API --> ER --> EF
  EF -->|cache miss| EP --> G
  TTL -.-> G
  G --> SHAPE --> EF
  EF --> B --> QSTR --> Q --> OXI --> INST --> GEO --> FC --> MAP

  classDef router fill:#dbeafe,stroke:#2563eb,color:#1e3a5f
  classDef rdf fill:#ffedd5,stroke:#ea580c,color:#7c2d12
  classDef entitiesmod fill:#f3e8ff,stroke:#9333ea,color:#581c87
  classDef builder fill:#dcfce7,stroke:#16a34a,color:#14532d
  classDef translator fill:#fce7f3,stroke:#db2777,color:#9d174d
  classDef ontology fill:#f3f4f6,stroke:#6b7280,color:#1f2937

  class API,MAP,ER router
  class EF,G,Q rdf
  class EP,SHAPE entitiesmod
  class B,QSTR builder
  class GEO,FC,INST translator
  class TTL,OXI ontology
```

#### Filters & Entities

For the map user, the relationship is simple: **filters ask; entities answer.**

**Entities** are the **things on the map** (and in the list): a Project, Network,
Partner, or Forum as a pin, or a Country/Area as a shaded region. Click one and
the sidebar or list row shows name, type, and colored tag chips.

**Filters** are the **controls that narrow that set**: the filter panel (topics,
species, regions, …) plus the map legend type toggles. Choosing chips changes
which entities stay visible; the result-count badge is “how many entities match.”

| | Filter (UI) | Entity (UI) |
| --- | --- | --- |
| Looks like | Sections of clickable chips / legend dots | Pins, regions, list rows, detail sidebar |
| Role | “Show me only …” | “Here is one matching thing” |
| Example | Chip **Pollution → Plastics** | Project pin whose properties include that tag |

In the backend, those two faces are separate SHACL projections:

- `FilterWidget` → `GET /api/v1/filters` (`shacl_to_filters`) → Filter panel
- `EntityShape` → `GET /api/v1/entities` (`shacl_to_entities`) → SPARQL + GeoJSON → pins/list/sidebar
