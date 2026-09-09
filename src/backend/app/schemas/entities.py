"""Thin Pydantic GeoJSON models for entity list HTTP responses / OpenAPI.

Runtime GeoJSON is still built with the `geojson` package in
`sparql_to_geojson_translator`. These models exist only so FastAPI
`response_model` can document and validate the wire shape.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class GeoJSONGeometry(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: str
    coordinates: Any = None


class GeoJSONFeature(BaseModel):
    model_config = ConfigDict(extra="allow")

    type: Literal["Feature"] = "Feature"
    geometry: GeoJSONGeometry | dict[str, Any] | None = None
    properties: dict[str, Any] = Field(default_factory=dict)


class FeatureCollection(BaseModel):
    """Minimal FeatureCollection compatible with RFC 7946 / the widget."""

    model_config = ConfigDict(extra="allow")

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[GeoJSONFeature]
