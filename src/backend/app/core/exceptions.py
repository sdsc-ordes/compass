"""Domain errors raised by the API and mapped to HTTP in handlers."""


class AppError(Exception):
    """Base for application errors that become a consistent JSON response."""

    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


class ReloadNotConfiguredError(AppError):
    """Reload was requested but no token is configured on the server."""


class UnauthorizedError(AppError):
    """The caller failed an authentication check."""


class UnsupportedLangError(AppError):
    """The lang query parameter is not in the use-case Config."""
