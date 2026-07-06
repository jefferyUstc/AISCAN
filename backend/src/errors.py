"""Domain exceptions for the AISCAN backend.

Keeping a small typed exception lets the API layer map "resource does not
exist" to HTTP 404 in one place, instead of catching a blanket ``ValueError``
per endpoint (which would also mask genuine bugs as 404s).
"""

from __future__ import annotations


class NotFoundError(Exception):
    """A requested dataset resource (gene, group, embedding, pathway, obs
    column, …) does not exist. Mapped to HTTP 404 by the API layer."""
