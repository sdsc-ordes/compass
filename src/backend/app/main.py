"""FastAPI application entrypoint."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import config
from app.core.cors import configure_cors
from app.core.handlers import register_exception_handlers
from app.core.settings import settings
from app.rdf import RDFStore
from app.routers import admin, entities, filters, stories
from app.schemas.admin import RootMessage


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Load and validate the ontology before serving the first request.

    Args:
        app: FastAPI application (unused; required by the lifespan protocol).

    Yields:
        Control to the running server until shutdown.

    Raises:
        ReloadError: When the configured ontology cannot drive the API.
    """
    RDFStore.instance().validate()
    yield


app = FastAPI(
    title=config.api_title,
    lifespan=lifespan,
    redirect_slashes=False,
)
register_exception_handlers(app)

if settings.cors_origins:
    configure_cors(app)


@app.get(
    "/",
    response_model=RootMessage,
    summary="API root",
    description="Returns the configured welcome message.",
)
async def root() -> RootMessage:
    return RootMessage(message=config.api_welcome_message)


@app.get(
    "/api/",
    response_model=RootMessage,
    summary="API welcome",
    description="Returns the configured welcome message at the API prefix.",
)
async def api_root() -> RootMessage:
    return RootMessage(message=config.api_welcome_message)


app.include_router(filters.router, prefix="/api/v1/filters", tags=["Filters"])
app.include_router(entities.router, prefix="/api/v1/entities", tags=["Entities"])
app.include_router(stories.router, prefix="/api/v1/stories", tags=["Stories"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
