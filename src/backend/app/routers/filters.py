from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import Lang, StoreDep
from app.schemas.filters import FilterSchemaEntry

router = APIRouter()


@router.get("/schema", response_model=list[FilterSchemaEntry])
async def get_filters_schema(lang: Lang, store: StoreDep) -> list[FilterSchemaEntry]:
    """Returns the filter schema based on SHACL shapes."""
    raw = store.get_filters_schema(lang=lang)
    return [FilterSchemaEntry.model_validate(item) for item in raw]
