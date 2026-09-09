"""Facet count response: dimension id → tag IRI → count."""

from __future__ import annotations

FacetCounts = dict[str, dict[str, int]]
"""Mapping of filter dimension id to ``{tag_iri: entity_count}``."""
