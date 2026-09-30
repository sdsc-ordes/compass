"""Filter-panel route."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import Lang, StoreDep
from app.shacl_to_filters import FilterWidget, get_filters_from_shacl

router = APIRouter()


@router.get(
    "",
    response_model=list[FilterWidget],
    # Unset optional keys are omitted rather than sent as null.
    response_model_exclude_none=True,
    summary="List filter-panel widgets",
    description="Returns filter panel widgets derived from SHACL shapes.",
)
async def get_filters(lang: Lang, store: StoreDep) -> list[FilterWidget]:
    return get_filters_from_shacl(store.graph, lang=lang)
