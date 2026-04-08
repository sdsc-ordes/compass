from fastapi import APIRouter, Depends, Query
from ..rdf import get_store, RDFStore

router = APIRouter()

@router.get("/schema")
async def get_filters_schema(
    lang: str = Query("en", pattern="^(en|de)$"),
    store: RDFStore = Depends(get_store)
):
    """Returns the filter schema based on SHACL shapes."""
    return store.get_filters_schema(lang=lang)
