from fastapi import APIRouter, Depends, Query

from ..rdf import RDFStore, get_store

router = APIRouter()


@router.get("/schema")
async def get_filters_schema(
    lang: str = Query("en", pattern="^(en|de)$"), store: RDFStore = Depends(get_store)
):
    """Returns the filter schema based on SHACL shapes."""
    return store.get_filters_schema(lang=lang)
