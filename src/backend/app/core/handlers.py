"""Register exception handlers that emit one JSON error shape."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.exceptions import (
    AppError,
    QueryError,
    ReloadError,
    ReloadNotConfiguredError,
    UnauthorizedError,
    UnsupportedLangError,
)
from app.sparql_terms import InvalidTerm

logger = logging.getLogger(__name__)


def register_exception_handlers(app: FastAPI) -> None:
    """Attach domain-error handlers that return a uniform JSON ``detail`` body.

    Args:
        app: FastAPI application to mutate in place.
    """

    @app.exception_handler(UnsupportedLangError)
    async def unsupported_lang(
        _request: Request, exc: UnsupportedLangError
    ) -> JSONResponse:
        """Map unsupported ``lang`` to HTTP 400."""
        return JSONResponse(status_code=400, content={"detail": exc.detail})

    @app.exception_handler(ReloadNotConfiguredError)
    async def reload_not_configured(
        _request: Request, exc: ReloadNotConfiguredError
    ) -> JSONResponse:
        """Map missing reload token configuration to HTTP 503."""
        return JSONResponse(status_code=503, content={"detail": exc.detail})

    @app.exception_handler(UnauthorizedError)
    async def unauthorized(_request: Request, exc: UnauthorizedError) -> JSONResponse:
        """Map failed auth checks to HTTP 401."""
        return JSONResponse(status_code=401, content={"detail": exc.detail})

    @app.exception_handler(AppError)
    async def app_error(_request: Request, exc: AppError) -> JSONResponse:
        """Map generic ``AppError`` subclasses to HTTP 400."""
        return JSONResponse(status_code=400, content={"detail": exc.detail})

    @app.exception_handler(InvalidTerm)
    async def invalid_term(_request: Request, exc: InvalidTerm) -> JSONResponse:
        """Map unsafe SPARQL term construction to HTTP 400."""
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(ReloadError)
    async def reload_error(_request: Request, exc: ReloadError) -> JSONResponse:
        """Map a rejected ontology reload to HTTP 409, keeping the live store."""
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
    async def query_error(_request: Request, exc: QueryError) -> JSONResponse:
        """Map SPARQL failures to HTTP 500 without leaking the query text."""
        logger.exception("SPARQL query failed:\n%s", exc.sparql)
        return JSONResponse(
            status_code=500,
            content={"detail": "SPARQL query failed"},
        )
