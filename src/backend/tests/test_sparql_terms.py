"""Term construction is the only barrier between a query parameter and the
query, so the properties it must hold are asserted over generated input rather
than a handful of examples.
"""

import re

import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.sparql_terms import InvalidTerm, iri_term, is_iri, string_literal

# The characters SPARQL 1.1 forbids inside an IRIREF.
FORBIDDEN = '<>"{}|^`\\' + "".join(chr(c) for c in range(0x21))


class TestIriTerm:
    def test_wraps_a_plain_iri(self):
        assert iri_term("http://example.org/a") == "<http://example.org/a>"

    @pytest.mark.parametrize("char", list(FORBIDDEN))
    def test_rejects_every_forbidden_character(self, char):
        with pytest.raises(InvalidTerm):
            iri_term(f"http://example.org/a{char}b")

    def test_rejects_empty(self):
        with pytest.raises(InvalidTerm):
            iri_term("")

    @given(st.text())
    def test_an_accepted_iri_never_closes_its_brackets(self, value):
        """Whatever is accepted must render as exactly one balanced IRIREF."""
        if not is_iri(value):
            return
        rendered = iri_term(value)
        assert rendered.startswith("<") and rendered.endswith(">")
        assert ">" not in rendered[1:-1]
        assert "<" not in rendered[1:-1]

    @given(st.text(min_size=1))
    def test_rejection_is_exactly_the_grammar(self, value):
        assert is_iri(value) == (re.search(f"[{re.escape(FORBIDDEN)}]", value) is None)


class TestStringLiteral:
    def test_quotes_plain_text(self):
        assert string_literal("plastic") == '"plastic"'

    def test_escapes_a_quote(self):
        assert string_literal('a"b') == '"a\\"b"'

    def test_escapes_a_backslash(self):
        assert string_literal("a\\b") == '"a\\\\b"'

    def test_escapes_a_newline(self):
        assert string_literal("a\nb") == '"a\\nb"'

    @given(st.text())
    def test_the_literal_is_always_one_closed_token(self, value):
        """No input may terminate the literal early or span a line."""
        rendered = string_literal(value)
        assert rendered.startswith('"') and rendered.endswith('"')
        body = rendered[1:-1]
        assert "\n" not in body and "\r" not in body
        # An unescaped quote would end the literal: every " must follow a
        # backslash that is not itself escaped.
        for match in re.finditer('"', body):
            preceding = len(body[: match.start()]) - len(body[: match.start()].rstrip("\\"))
            assert preceding % 2 == 1
