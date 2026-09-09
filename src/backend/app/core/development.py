"""Development-only FastAPI configuration.

"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .settings import settings


def configure_development(app: FastAPI) -> None:
    """Add development-only middleware and routes.

    Args:
        app: The FastAPI application to configure.
    """

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
