"""Domain errors raised by the API and mapped to HTTP in handlers."""


class AppError(Exception):
    """Base for application errors that become a consistent JSON response.

    Attributes:
        detail: Human-readable error message returned to the client.
    """

    def __init__(self, detail: str):
        """Store *detail* and pass it to ``Exception``.

        Args:
            detail: Error message.
        """
        self.detail = detail
        super().__init__(detail)


class ReloadNotConfiguredError(AppError):
    """Reload was requested but no token is configured on the server."""


class UnauthorizedError(AppError):
    """The caller failed an authentication check."""


class UnsupportedLangError(AppError):
    """The lang query parameter is not in the use-case Config."""


class ReloadError(AppError):
    """The files on disk are not usable. The store already serving is untouched."""


class QueryError(AppError):
    """A SPARQL query could not be executed. Carries the query for the log.

    Attributes:
        sparql: The query text that failed.
        detail: Short summary of the underlying exception.
    """

    def __init__(self, sparql: str, cause: Exception):
        """Attach the failing query and summarize *cause*.

        Args:
            sparql: Query that Oxigraph rejected.
            cause: Underlying exception.
        """
        self.sparql = sparql
        super().__init__(f"{type(cause).__name__}: {cause}")
