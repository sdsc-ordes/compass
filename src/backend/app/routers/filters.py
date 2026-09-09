from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import Lang, StoreDep
from app.schemas.filters import FilterWidget
from app.shacl_to_filters import get_filters_from_shacl

router = APIRouter()


@router.get("/", response_model=list[FilterWidget])
async def get_filters(lang: Lang, store: StoreDep) -> list[FilterWidget]:
    """Returns filter panel widgets derived from SHACL shapes."""
    raw = get_filters_from_shacl(store.read_graph, lang=lang)
    return [FilterWidget.model_validate(item) for item in raw]
