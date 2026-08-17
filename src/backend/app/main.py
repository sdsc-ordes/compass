from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import filters, entities, states, stories
from .rdf import get_store


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_store()  # load the ontology before the first request
    yield


app = FastAPI(title="OceanCare Compass API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "OceanCare Compass API is running."}

app.include_router(filters.router, prefix="/api/filters", tags=["Filters"])
app.include_router(entities.router, prefix="/api/entities", tags=["Entities"])
app.include_router(states.router, prefix="/api/states", tags=["States"])
app.include_router(stories.router, prefix="/api", tags=["Stories"])
