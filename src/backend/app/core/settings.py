"""Compass platform settings (deployment), not use-case configuration."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_ORIGINS = "http://localhost:5173,http://localhost:4173"


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
