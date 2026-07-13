# Compass

An interactive map of ocean-focused research institutes, NGOs, and intergovernmental bodies — powered by a SHACL-validated RDF ontology.

## Architecture

```
ontology/   – Turtle files (ontology, shapes, vocab)
backend/    – FastAPI + RDFLib, serves GeoJSON via SPARQL
frontend/   – Svelte + MapLibre GL, rendered as a Web Component
```

## Prerequisites

[Nix](https://nixos.org/download) with flakes enabled, or manually install **Python 3.11**, **uv**, and **Node 22**.

With Nix, enter the dev shell once and all tools are ready:

```bash
nix develop
```

## Running locally

Open two terminals inside the dev shell.

**Backend**
```bash
cd backend
uv run uvicorn app.main:app --reload --port 8000
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

Then open <http://localhost:5173>.

## Tests

```bash
cd backend
uv run pytest tests/ -v
```

## Ontology

The data lives in `ontology/compass.ttl`. To add an organisation or project, copy an existing instance block and adjust the properties.

| File | Purpose |
|---|---|
| `compass.ttl` | Instance data |
| `shapes.ttl` | SHACL shapes (drives filters, property specs, and instance validation) |
| `vocab.ttl` | SKOS controlled vocabularies |
| `shacl-shacl.ttl` | Meta-shapes that validate `shapes.ttl` is itself well-formed |
