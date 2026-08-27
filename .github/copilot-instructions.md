# Copilot Instructions for Compass

## Skill Routing

Use workspace skills from `.github/skills`.

1. Use `shacl` skill for requests about:
- SHACL node/property shapes
- SHACL validation reports and severity
- SHACL-SPARQL constraints
- Shape-driven UI scaffolding

2. Use `skos` skill for requests about:
- Concept schemes and top concepts
- Broader/narrower/related relationships
- Labeling (`prefLabel`, `altLabel`, multilingual)
- Taxonomy mapping and governance

3. Use `sparql` skill for requests about:
- Writing SPARQL queries and updates
- Query optimization and debugging
- Property paths and federation
- SPARQL integration with SHACL or ontology workflows

## Invocation Rules

1. Load up to three skills by default.
2. Use more skills only when the user explicitly asks for cross-domain synthesis.
3. Prefer concrete, executable examples tied to this repository (`src/ontology/`, `src/backend/`, `src/frontend/`).
4. When editing Turtle, preserve existing prefixes and naming conventions.
5. When suggesting commands, use reproducible project-local steps.
