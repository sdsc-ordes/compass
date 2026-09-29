from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import Lang, StoreDep
from app.schemas.filters import FilterWidget
from app.shacl_to_filters import get_filters_from_shacl

router = APIRouter()


@router.get(
    "",
    response_model=list[FilterWidget],
    # An option's `description` is its skos:definition, and most concepts define
    # none. Without this every one of them would carry `"description": null`,
    # against the contract the panel relies on: the key is absent, or it is a
    # string. It drops the widget's unset `options`/`min`/`max` too, which the
    # TypeScript side already declares optional.
    response_model_exclude_none=True,
    summary="List filter-panel widgets",
    description="Returns filter panel widgets derived from SHACL shapes.",
)
async def get_filters(lang: Lang, store: StoreDep) -> list[FilterWidget]:
    raw = get_filters_from_shacl(store.read_graph, lang=lang)
    return [FilterWidget.model_validate(item) for item in raw]
