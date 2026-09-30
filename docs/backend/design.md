# Design

## Request flow

Node colours in the diagrams:

| Colour | Module |
| --- | --- |
| Blue | API, `routers/filters.py` or `routers/entities.py`, Frontend |
| Orange | `rdf.py` |
| Purple | `shacl_to_filters.py` |
| Violet | `shacl_to_entities.py` |
| Green | `sparql_builder.py` |
| Pink | `sparql_to_geojson_translator.py` |
| Grey | Ontology Turtle / Oxigraph |

### Filter panel (on load)

```mermaid
flowchart TB
  API["GET /api/v1/filters"]
  FR["get_filters<br/>validate FilterWidget models"]
  G["RDFStore.graph<br/>parse Turtle once"]
  TTL[("shapes.ttl compass.ttl vocab.ttl")]
  F["get_filters_from_shacl<br/>walk SHACL into FilterWidget"]
  N["map_property_shapes<br/>yield sh:property nodes"]
  L["get_label<br/>labels in lang"]
  OUT["JSON FilterWidget list<br/>filter accordion / type pills"]

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

### Entities (on load and on every filter or language change)

The widget calls `getEntities` from `loadData`. The backend compiles SPARQL
from the entity shapes, runs it, and returns GeoJSON.

```mermaid
flowchart TB
  API["GET /api/v1/entities"]
  ER["get_entities<br/>orchestrate shapes SPARQL GeoJSON"]
  EF["RDFStore.entity_shapes<br/>cached EntityShape list"]
  EP["get_entity_shapes_from_shacl<br/>project SHACL"]
  G["RDFStore.graph<br/>merged Graph"]
  TTL[("shapes.ttl compass.ttl vocab.ttl")]
  SHAPE["EntityShape list<br/>query and decode plan"]
  B["sparql_for_instances<br/>compile SELECT WHERE"]
  QSTR["SPARQL SELECT string"]
  Q["RDFStore.query"]
  OXI["Oxigraph<br/>match compass.ttl instances"]
  INST["instances<br/>one dict per entity"]
  GEO["instances_to_geojson<br/>decode via EntityShape"]
  FC["FeatureCollection"]
  MAP["Stage / sidebar / detail pane"]

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

## Filters and entities

- **Entities** are the pins: forums, networks, partner organisations and the
  host organisation. Clicking one opens the detail pane (name, type, tag chips).
- **Filters** narrow the set: the filter sections (work areas, topics,
  programmes, species, countries / regions) and the entity-type pills. The
  result count is the number of matching entities.

The backend builds both from separate SHACL projections:

| Model | Endpoint | Module | Feeds |
| --- | --- | --- | --- |
| `FilterWidget` | `GET /api/v1/filters` | `shacl_to_filters` | Filter panel |
| `EntityShape` | `GET /api/v1/entities` | `shacl_to_entities` | SPARQL query and GeoJSON: pins, sidebar, detail pane |
