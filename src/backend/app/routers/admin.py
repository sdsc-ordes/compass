"""Reload the ontology from disk without restarting the API.

Editorial updates land as new Turtle files; this endpoint makes the running API
pick them up. A rejected reload leaves the previous version serving. HTTP route
descriptions live in OpenAPI (``summary`` / ``description`` on the route
decorators).
"""

from __future__ import annotations

from fastapi import APIRouter, Header

from app.core.deps import SettingsDep
from app.core.exceptions import ReloadNotConfiguredError, UnauthorizedError
from app.rdf import RDFStore
from app.schemas.admin import ReloadSuccess

router = APIRouter()


@router.post(
    "/reload",
    response_model=ReloadSuccess,
    summary="Reload ontology from disk",
    description=(
        "Re-read the Turtle files and serve them if they are usable. "
        "Requires the X-Reload-Token header to match COMPASS_RELOAD_TOKEN. "
        "A rejected reload leaves the previous version serving."
    ),
)
async def reload_ontology(
    settings: SettingsDep,
    x_reload_token: str = Header(default=""),
) -> ReloadSuccess:
    expected = settings.reload_token
    if not expected:
        raise ReloadNotConfiguredError(
            "reload is not configured: set COMPASS_RELOAD_TOKEN on the API "
            "and send it as the X-Reload-Token header"
        )
    if x_reload_token != expected:
        raise UnauthorizedError("X-Reload-Token does not match")

    result = RDFStore.reload_instance()
    return ReloadSuccess.model_validate(result)
