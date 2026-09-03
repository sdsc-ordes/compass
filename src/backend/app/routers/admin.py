"""Reload the ontology from disk without restarting the API.

Editorial updates land as new Turtle files; this endpoint makes the running API
pick them up. A rejected reload leaves the previous version serving.
"""

import logging
import os

from fastapi import APIRouter, Header, HTTPException

from ..rdf import ReloadError, reload_store

logger = logging.getLogger(__name__)

router = APIRouter()

# Reloading re-parses the whole ontology, so it is not something an anonymous
# caller should be able to trigger. With no token configured the endpoint is
# closed rather than open: a deployment that forgot to set one is not exposed.
RELOAD_TOKEN_ENV = "COMPASS_RELOAD_TOKEN"


@router.post("/reload")
async def reload_ontology(x_reload_token: str = Header(default="")):
    """Re-read the Turtle files and serve them if they are usable."""
    expected = os.environ.get(RELOAD_TOKEN_ENV, "")
    if not expected:
        raise HTTPException(
            status_code=503,
            detail=(
                f"reload is not configured: set {RELOAD_TOKEN_ENV} on the API "
                "and send it as the X-Reload-Token header"
            ),
        )
    if x_reload_token != expected:
        raise HTTPException(status_code=401, detail="X-Reload-Token does not match")

    try:
        return reload_store()
    except ReloadError as exc:
        # 409: the request was well formed, the files on disk were not.
        logger.warning("ontology reload rejected: %s", exc)
        raise HTTPException(
            status_code=409,
            detail={
                "reloaded": False,
                "reason": str(exc),
                "serving": "the previously loaded ontology is still being served",
            },
        ) from exc
