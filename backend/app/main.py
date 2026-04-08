from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import filters, entities, states
from .rdf import get_store

app = FastAPI(title="OceanCare Compass API")

# CORS for WordPress or other embed domains
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to domain
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup event to verify ontology loading
@app.on_event("startup")
async def startup_event():
    store = get_store()
    print("Oxigraph Store Initialized with Ontology.")

@app.get("/")
async def root():
    return {"message": "OceanCare Compass API is running."}

app.include_router(filters.router, prefix="/api/filters", tags=["Filters"])
app.include_router(entities.router, prefix="/api/entities", tags=["Entities"])
app.include_router(states.router, prefix="/api/states", tags=["States"])
