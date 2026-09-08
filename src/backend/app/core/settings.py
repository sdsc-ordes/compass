"""Compass platform settings (deployment), not use-case configuration."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Origins of the *page* that calls the API (Vite / preview), not the API port.
# Include both localhost and 127.0.0.1 — browsers treat them as different origins.
_DEV_ORIGINS = (
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:5174,http://127.0.0.1:5174,"
    "http://localhost:4173,http://127.0.0.1:4173"
)

# Any loopback Vite/preview port (5173 busy → 5174, etc.). Used when the widget
# still calls the API cross-origin instead of via the Vite /api proxy.
_DEV_ORIGIN_REGEX = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"


def _default_ontology_dir() -> Path:
    # app/core/settings.py -> app -> backend -> src -> ontology
    base = Path(__file__).resolve().parents[3]
    return base / "ontology"


class Settings(BaseSettings):
    """Process-wide Compass knobs loaded from the environment at startup."""

    model_config = SettingsConfigDict(extra="ignore")

    compass_cors_origins: str = Field(default=_DEV_ORIGINS)
    compass_reload_token: str = Field(default="")
    compass_ontology_dir: Path | None = Field(default=None)

    @field_validator("compass_ontology_dir", mode="before")
    @classmethod
    def _empty_ontology_dir_is_none(cls, value: object) -> object:
        if value == "" or value is None:
            return None
        return value

    @property
    def cors_origins(self) -> list[str]:
        """Origins allowed to call the API cross-origin; empty for same-origin only."""
        return [
            origin.strip()
            for origin in self.compass_cors_origins.split(",")
            if origin.strip()
        ]

    @property
    def reload_token(self) -> str:
        return self.compass_reload_token

    @property
    def ontology_dir(self) -> Path:
        if self.compass_ontology_dir is not None:
            return self.compass_ontology_dir
        return _default_ontology_dir()


settings = Settings()
