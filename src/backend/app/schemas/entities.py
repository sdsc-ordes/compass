"""GeoJSON response models that document and validate the entity list wire shape.

The features themselves are built with the ``geojson`` package in
``sparql_to_geojson_translator``.
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
    """Single GeoJSON Feature returned for a pin."""

    model_config = ConfigDict(extra="allow")

    type: Literal["Feature"] = Field(
        default="Feature",
        description="Always ``Feature`` per RFC 7946.",
    )
    geometry: GeoJSONGeometry | dict[str, Any] | None = Field(
        default=None,
        description="Point geometry of the pin.",
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
