"""Compass platform settings (deployment), not use-case configuration."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_ontology_dir() -> Path:
    """Resolve the default ontology directory relative to this package.

    Returns:
        ``src/ontology`` when the layout matches a normal checkout.
    """
    # app/core/settings.py -> app -> backend -> src -> ontology
    base = Path(__file__).resolve().parents[3]
    return base / "ontology"


def _project_root_env_file() -> Path | None:
    """Return the project-root .env file if it exists.

    Returns:
        Path to ``.env`` at the repository root, or ``None`` when absent.
        Docker Compose injects variables directly, so the file is optional.
    """
    # app/core/settings.py -> app -> backend -> src -> project root
    env_file = Path(__file__).resolve().parents[4] / ".env"
    return env_file if env_file.exists() else None


class Settings(BaseSettings):
    """Process-wide Compass knobs loaded from the environment at startup."""

    model_config = SettingsConfigDict(
        extra="ignore",
        env_file=_project_root_env_file(),
        env_file_encoding="utf-8",
    )

    compass_environment: str = Field(
        default="development",
        description="Runtime environment: 'development' enables dev-only behavior.",
    )
    compass_cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        description="Comma-separated browser origins allowed for CORS.",
    )
    compass_reload_token: str = Field(
        default="",
        description="Shared secret for POST /api/v1/admin/reload; empty disables reload.",
    )
    compass_ontology_dir: Path | None = Field(
        default=None,
        description=(
            "Root ontology directory (shapes.ttl, shacl-shacl.ttl, template). "
            "Instance data lives under a use-case subdirectory."
        ),
    )
    compass_use_case: str = Field(
        default="oceancare",
        description=(
            "Use-case subdirectory under the ontology root that holds "
            "source-data.ods, compass.ttl, and vocab.ttl."
        ),
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

    @field_validator("compass_use_case", mode="before")
    @classmethod
    def _strip_use_case(cls, value: object) -> object:
        """Reject empty use-case names and strip whitespace.

        Args:
            value: Raw field value before validation.

        Returns:
            Stripped string, or *value* unchanged when not a string.
        """
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                raise ValueError("COMPASS_USE_CASE must be a non-empty directory name")
            return stripped
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
        """Root directory for shared ontology files (shapes, templates).

        Returns:
            Explicit ``compass_ontology_dir`` or the package-relative default.
        """
        if self.compass_ontology_dir is not None:
            return self.compass_ontology_dir
        return _default_ontology_dir()

    @property
    def use_case_dir(self) -> Path:
        """Directory holding this deployment's ``compass.ttl`` and ``vocab.ttl``.

        Returns:
            ``ontology_dir / compass_use_case``.
        """
        return self.ontology_dir / self.compass_use_case


settings = Settings()
