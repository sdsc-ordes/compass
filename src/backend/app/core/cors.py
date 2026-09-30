"""CORS for widgets served from another origin."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.settings import settings


def configure_cors(app: FastAPI) -> None:
    """Allow ``COMPASS_CORS_ORIGINS`` to call the API cross-origin.

    Args:
        app: The FastAPI application to configure.
    """
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
