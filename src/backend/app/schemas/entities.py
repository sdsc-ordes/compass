"""Thin Pydantic GeoJSON models for entity list HTTP responses / OpenAPI.

Runtime GeoJSON is still built with the `geojson` package in
`sparql_to_geojson_translator`. These models exist only so FastAPI
`response_model` can document and validate the wire shape.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class GeoJSONGeometry(BaseModel):
    """GeoJSON geometry object (Point or opaque dict for OpenAPI)."""

    model_config = ConfigDict(extra="allow")

    type: str = Field(description="GeoJSON geometry type (e.g. Point).")
    coordinates: Any = Field(
        default=None,
        description="Coordinate array; shape depends on ``type``.",
    )


class GeoJSONFeature(BaseModel):
    """Single GeoJSON Feature returned for a pin or region."""

    model_config = ConfigDict(extra="allow")

    type: Literal["Feature"] = Field(
        default="Feature",
        description="Always ``Feature`` per RFC 7946.",
    )
    geometry: GeoJSONGeometry | dict[str, Any] | None = Field(
        default=None,
        description="Point for pins; null for shaded regions.",
    )
    properties: dict[str, Any] = Field(
        default_factory=dict,
        description="Entity id, label, type, tags, and display fields.",
    )


class FeatureCollection(BaseModel):
    """Minimal FeatureCollection compatible with RFC 7946 / the widget."""

    model_config = ConfigDict(extra="allow")

    type: Literal["FeatureCollection"] = Field(
        default="FeatureCollection",
        description="Always ``FeatureCollection``.",
    )
    features: list[GeoJSONFeature] = Field(
        description="Matching entities as GeoJSON Features.",
    )
