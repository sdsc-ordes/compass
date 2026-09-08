"""Admin and common response models."""

from __future__ import annotations

from pydantic import BaseModel


class RootMessage(BaseModel):
    message: str


class ReloadSuccess(BaseModel):
    reloaded: bool
    source: str
    replaced_a_running_store: bool
