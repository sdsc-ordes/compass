"""Stories proxy response models."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

StoriesCountStatus = Literal["ok", "no_tags", "no_ID_mapping", "upstream_error"]


class StoriesCountResponse(BaseModel):
    count: int
    url: str
    status: StoriesCountStatus
    message: str | None = None
