from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import API_TITLE, API_WELCOME_MESSAGE, cors_origins
from .rdf import get_store
from .routers import admin, entities, filters, stories


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_store()  # load the ontology before the first request
    yield


app = FastAPI(title=API_TITLE, lifespan=lifespan)

# Deployment serves the widget and the API from one origin (see docker/nginx.conf),
# so this is an allowlist for development rather than a wildcard.
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": API_WELCOME_MESSAGE}


app.include_router(filters.router, prefix="/api/filters", tags=["Filters"])
app.include_router(entities.router, prefix="/api/entities", tags=["Entities"])
app.include_router(stories.router, prefix="/api", tags=["Stories"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
