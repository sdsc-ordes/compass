"""Stories proxy response models."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

StoriesCountStatus = Literal["ok", "no_tags", "no_ID_mapping", "upstream_error"]


class StoriesCountResponse(BaseModel):
    """Result of ``GET /api/v1/stories/count``."""

    count: int = Field(description="Number of matching stories (0 on error paths).")
    url: str = Field(description="Public stories URL for user navigation.")
    status: StoriesCountStatus = Field(
        description="ok | no_tags | no_ID_mapping | upstream_error.",
    )
    message: str | None = Field(
        default=None,
        description="Optional user-facing error message from use-case config.",
    )
