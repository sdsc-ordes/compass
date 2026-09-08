from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import config
from .core.handlers import register_exception_handlers
from .core.settings import settings
from .rdf import get_store
from .routers import admin, entities, filters, stories
from .schemas.admin import RootMessage


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_store()  # load the ontology before the first request
    yield


app = FastAPI(title=config.api_title, lifespan=lifespan)
register_exception_handlers(app)

# Deployment serves the widget and the API from one origin (see docker/nginx.conf),
# so this is an allowlist for development rather than a wildcard.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/", response_model=RootMessage)
async def root() -> RootMessage:
    return RootMessage(message=config.api_welcome_message)


app.include_router(filters.router, prefix="/api/v1/filters", tags=["Filters"])
app.include_router(entities.router, prefix="/api/v1/entities", tags=["Entities"])
app.include_router(stories.router, prefix="/api/v1/stories", tags=["Stories"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])
