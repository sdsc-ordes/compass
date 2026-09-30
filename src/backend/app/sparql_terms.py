"""Build SPARQL terms from untrusted input.

Every IRI and literal that reaches a query from an HTTP parameter goes through
here, so a caller can never close the term and append graph patterns.
"""

import re

# SPARQL 1.1 IRIREF: '<' ([^<>"{}|^`\] - [#x00-#x20])* '>'. Anything matching
# this cannot appear between the angle brackets.
_NOT_IN_IRIREF = re.compile(r'[<>"{}|^`\\\x00-\x20]')

# SPARQL 1.1 STRING_LITERAL2 forbids ", \, LF and CR unescaped. Tab is legal
# but escaped anyway, so a generated query stays on one line per clause.
_LITERAL_ESCAPES = {
    "\\": "\\\\",
    '"': '\\"',
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
}


class InvalidTerm(ValueError):
    """A value cannot be expressed as the SPARQL term it was asked for."""


def is_iri(value: str) -> bool:
    """Report whether *value* can be written between angle brackets unchanged.

    Args:
        value: Candidate IRI string.

    Returns:
        Whether *value* matches SPARQL 1.1 IRIREF character rules.
    """
    return bool(value) and _NOT_IN_IRIREF.search(value) is None


def iri_term(value: str) -> str:
    """Render *value* as an IRIREF.

    Args:
        value: Absolute IRI.

    Returns:
        SPARQL ``<...>`` term.

    Raises:
        InvalidTerm: When *value* is not a safe IRIREF.
    """
    if not is_iri(value):
        raise InvalidTerm(f"{value!r} is not a valid IRI")
    return f"<{value}>"


def string_literal(value: str) -> str:
    """Render *value* as a quoted SPARQL string literal, escapes included.

    Args:
        value: Untrusted string content.

    Returns:
        Double-quoted SPARQL literal with escapes applied.
    """
    escaped = "".join(_LITERAL_ESCAPES.get(char, char) for char in value)
    return f'"{escaped}"'
