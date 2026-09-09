"""FastAPI application entrypoint.

HTTP routes are documented via OpenAPI (``summary`` / ``description`` on
decorators, and the interactive UI at ``/docs`` when the API is running).
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import config
from .core.development import configure_development
from .core.handlers import register_exception_handlers
from .core.settings import settings
from .rdf import RDFStore
from .routers import admin, entities, filters, stories
from .schemas.admin import RootMessage


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the ontology into the process-wide store before serving requests.

    Args:
        app: FastAPI application (unused; required by the lifespan protocol).

    Yields:
        Control to the running server until shutdown.
    """
    RDFStore.instance()  # load the ontology before the first request
    yield


app = FastAPI(title=config.api_title, lifespan=lifespan)
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


app.include_router(filters.router, prefix="/api/v1/filters", tags=["Filters"])
app.include_router(entities.router, prefix="/api/v1/entities", tags=["Entities"])
app.include_router(stories.router, prefix="/api/v1/stories", tags=["Stories"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
