"""Admin and common response models."""

from __future__ import annotations

from pydantic import BaseModel, Field


class RootMessage(BaseModel):
    """Payload returned by ``GET /``."""

    message: str = Field(description="Welcome / status message from use-case config.")


class ReloadSuccess(BaseModel):
    """Payload returned when ontology reload succeeds."""

    reloaded: bool = Field(description="Always true on success.")
    source: str = Field(description="Ontology directory that was loaded.")
    replaced_a_running_store: bool = Field(
        description="True when a previous live store was swapped out.",
    )
