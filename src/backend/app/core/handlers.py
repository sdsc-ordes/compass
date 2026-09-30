"""Register exception handlers that emit one JSON error shape."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.exceptions import (
    AppError,
    QueryError,
    ReloadError,
    ReloadNotConfiguredError,
    UnauthorizedError,
)
from app.sparql_terms import InvalidTerm

logger = logging.getLogger(__name__)

# Handlers resolve by the exception's MRO, so AppError covers every subclass
# without an entry of its own.
_STATUS_BY_ERROR: dict[type[AppError], int] = {
    AppError: 400,
    UnauthorizedError: 401,
    ReloadNotConfiguredError: 503,
}


def _detail_handler(
    status_code: int,
) -> Callable[[Request, AppError], Awaitable[JSONResponse]]:
    async def handler(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=status_code, content={"detail": exc.detail})

    return handler


def register_exception_handlers(app: FastAPI) -> None:
    """Attach domain-error handlers that return a uniform JSON ``detail`` body.

    Args:
        app: FastAPI application to mutate in place.
    """
    for error_type, status_code in _STATUS_BY_ERROR.items():
        app.add_exception_handler(error_type, _detail_handler(status_code))

    @app.exception_handler(InvalidTerm)
    async def invalid_term(_request: Request, exc: InvalidTerm) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(ReloadError)
    async def reload_error(_request: Request, exc: ReloadError) -> JSONResponse:
        logger.warning("ontology reload rejected: %s", exc)
        return JSONResponse(
            status_code=409,
            content={
                "detail": {
                    "reloaded": False,
                    "reason": str(exc),
                    "serving": "the previously loaded ontology is still being served",
                }
            },
        )

    @app.exception_handler(QueryError)
    async def query_error(_request: Request, _exc: QueryError) -> JSONResponse:
        # RDFStore.query has already logged the failing query; keep it out of
        # the response.
        return JSONResponse(status_code=500, content={"detail": "SPARQL query failed"})
