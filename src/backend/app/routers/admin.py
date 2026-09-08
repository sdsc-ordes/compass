"""Reload the ontology from disk without restarting the API.

Editorial updates land as new Turtle files; this endpoint makes the running API
pick them up. A rejected reload leaves the previous version serving.
"""

from __future__ import annotations

from fastapi import APIRouter, Header

from app.core.deps import SettingsDep
from app.core.exceptions import ReloadNotConfiguredError, UnauthorizedError
from app.rdf import reload_store
from app.schemas.admin import ReloadSuccess

router = APIRouter()


@router.post("/reload", response_model=ReloadSuccess)
async def reload_ontology(
    settings: SettingsDep,
    x_reload_token: str = Header(default=""),
) -> ReloadSuccess:
    """Re-read the Turtle files and serve them if they are usable."""
    expected = settings.reload_token
    if not expected:
        raise ReloadNotConfiguredError(
            "reload is not configured: set COMPASS_RELOAD_TOKEN on the API "
            "and send it as the X-Reload-Token header"
        )
    if x_reload_token != expected:
        raise UnauthorizedError("X-Reload-Token does not match")

    result = reload_store()
    return ReloadSuccess.model_validate(result)
