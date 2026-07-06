"""Domain-exception invariants relied on by the API exception handlers."""

import errors


def test_not_found_is_exception_but_not_valueerror():
    exc = errors.NotFoundError("gene FOO not found")
    assert isinstance(exc, Exception)
    # Critical: it must NOT be a ValueError, so the NotFoundError->404 handler
    # wins over the ValueError->400 handler in app.py.
    assert not isinstance(exc, ValueError)
    assert str(exc) == "gene FOO not found"
