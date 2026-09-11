"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Query

from app.config import Config, config
from app.core.exceptions import UnsupportedLangError
from app.core.settings import Settings, settings
from app.rdf import RDFStore


def get_settings() -> Settings:
    """Provide the process-wide deployment settings.

    Returns:
        Singleton ``Settings`` instance.
    """
    return settings


def get_config() -> Config:
    """Provide the use-case configuration.

    Returns:
        Singleton ``Config`` instance.
    """
    return config


def get_lang(
    cfg: Annotated[Config, Depends(get_config)],
    lang: Annotated[str, Query(description="UI language code")] = "en",
) -> str:
    """Validate and return the ``lang`` query parameter.

    Args:
        cfg: Use-case config (defines ``supported_langs``).
        lang: Requested language code.

    Returns:
        Validated language code.

    Raises:
        UnsupportedLangError: When *lang* is not in ``cfg.supported_langs``.
    """
    if lang not in cfg.supported_langs:
        raise UnsupportedLangError(
            f"Unsupported lang {lang!r}; supported: {', '.join(cfg.supported_langs)}"
        )
    return lang


Lang = Annotated[str, Depends(get_lang)]
StoreDep = Annotated[RDFStore, Depends(RDFStore.instance)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
ConfigDep = Annotated[Config, Depends(get_config)]
