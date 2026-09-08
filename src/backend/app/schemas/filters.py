"""Filter schema response models (SHACL-derived UI contract)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

FilterWidgetType = Literal["multiselect", "slider", "datepicker", "toggle"]


class FilterOption(BaseModel):
    value: str
    label: str


class FilterSchemaEntry(BaseModel):
    """One filter dimension. Optional fields depend on `type`."""

    id: str
    path: str
    label: str
    type: FilterWidgetType
    order: int = 0
    options: list[FilterOption] | None = None
    min: float | int | str | None = None
    max: float | int | str | None = None
