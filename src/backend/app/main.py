"""FastAPI application entrypoint.

HTTP routes are documented via OpenAPI (``summary`` / ``description`` on
decorators, and the interactive UI at ``/docs`` when the API is running).
"""

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI

from app.config import config
from app.core.development import configure_development
from app.core.handlers import register_exception_handlers
from app.core.settings import settings
from app.rdf import RDFStore
from app.routers import admin, entities, filters, stories
from app.schemas.admin import RootMessage


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Load the ontology into the process-wide store before serving requests.

    Args:
        app: FastAPI application (unused; required by the lifespan protocol).

    Yields:
        Control to the running server until shutdown.
    """
    RDFStore.instance()  # load the ontology before the first request
    yield


app = FastAPI(
    title=config.api_title,
    lifespan=lifespan,
    redirect_slashes=False,
)
register_exception_handlers(app)

if settings.is_development:
    configure_development(app)


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
