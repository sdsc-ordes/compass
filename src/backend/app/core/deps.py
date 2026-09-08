"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Query

from app.config import Config, config
from app.core.exceptions import UnsupportedLangError
from app.core.settings import Settings, settings
from app.rdf import RDFStore, get_store


def get_settings() -> Settings:
    return settings


def get_config() -> Config:
    return config


def get_lang(
    cfg: Annotated[Config, Depends(get_config)],
    lang: Annotated[str, Query(description="UI language code")] = "en",
) -> str:
    if lang not in cfg.supported_langs:
        raise UnsupportedLangError(
            f"Unsupported lang {lang!r}; supported: {', '.join(cfg.supported_langs)}"
        )
    return lang


Lang = Annotated[str, Depends(get_lang)]
StoreDep = Annotated[RDFStore, Depends(get_store)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
ConfigDep = Annotated[Config, Depends(get_config)]
