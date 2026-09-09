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
    """Resolve the default ontology directory relative to this package.

    Returns:
        ``src/ontology`` when the layout matches a normal checkout.
    """
    # app/core/settings.py -> app -> backend -> src -> ontology
    base = Path(__file__).resolve().parents[3]
    return base / "ontology"


class Settings(BaseSettings):
    """Process-wide Compass knobs loaded from the environment at startup."""

    model_config = SettingsConfigDict(extra="ignore")

    compass_environment: str = Field(
        default="development",
        description="Runtime environment: 'development' enables dev-only behavior.",
    )
    compass_cors_origins: str = Field(
        default=_DEV_ORIGINS,
        description="Comma-separated browser origins allowed for CORS.",
    )
    compass_reload_token: str = Field(
        default="",
        description="Shared secret for POST /api/v1/admin/reload; empty disables reload.",
    )
    compass_ontology_dir: Path | None = Field(
        default=None,
        description="Directory containing compass.ttl, shapes.ttl, and vocab.ttl.",
    )

    @property
    def is_development(self) -> bool:
        """Whether the app is running in a development environment.

        Returns:
            ``True`` when ``compass_environment`` is 'development' or 'dev'.
        """
        return self.compass_environment.lower() in {"development", "dev"}

    @field_validator("compass_ontology_dir", mode="before")
    @classmethod
    def _empty_ontology_dir_is_none(cls, value: object) -> object:
        """Treat an empty string env override as unset.

        Args:
            value: Raw field value before validation.

        Returns:
            ``None`` for empty input, otherwise *value* unchanged.
        """
        if value == "" or value is None:
            return None
        return value

    @property
    def cors_origins(self) -> list[str]:
        """Origins allowed to call the API cross-origin; empty for same-origin only.

        Returns:
            Stripped origin strings from ``compass_cors_origins``.
        """
        return [
            origin.strip()
            for origin in self.compass_cors_origins.split(",")
            if origin.strip()
        ]

    @property
    def reload_token(self) -> str:
        """Token expected in the ``X-Reload-Token`` header.

        Returns:
            Configured reload secret (may be empty).
        """
        return self.compass_reload_token

    @property
    def ontology_dir(self) -> Path:
        """Directory that holds the Turtle ontology files.

        Returns:
            Explicit ``compass_ontology_dir`` or the package-relative default.
        """
        if self.compass_ontology_dir is not None:
            return self.compass_ontology_dir
        return _default_ontology_dir()


settings = Settings()
