"""Runtime compatibility helpers for environments running newer Python releases.

The FastAPI/Pydantic stack currently used by AISCAN pins Pydantic 1.x.
Python 3.12 changed ``typing.ForwardRef._evaluate`` to require a keyword-only
``recursive_guard`` argument. Older Pydantic releases (including 1.10.15) still
call this helper with positional arguments, which triggers ``TypeError`` during
module import when the backend starts.

To keep the dependency stack stable, we detect this signature change at import
time and monkey-patch ``pydantic.typing.evaluate_forwardref`` so it always
provides the keyword argument when required. The patch is a no-op on earlier
Python versions.
"""

from __future__ import annotations

import inspect
from typing import Any, ForwardRef


def _patch_pydantic_forward_ref_keyword() -> None:
    """Ensure Pydantic passes ``recursive_guard`` as a keyword argument.

    Pydantic 1.x implements ``evaluate_forwardref`` by delegating to
    ``typing.ForwardRef._evaluate``. On Python 3.12+, that helper expects the
    ``recursive_guard`` parameter as keyword-only. If we detect that calling it
    positionally would fail, we replace Pydantic's helper with one that forwards
    the argument using the modern signature. This mirrors the upstream fix that
    will ship in a future maintenance release.
    """

    try:
        import pydantic.typing as pyd_typing
    except Exception:
        return

    forward_eval = getattr(ForwardRef, "_evaluate", None)
    if forward_eval is None:
        return

    parameters = inspect.signature(forward_eval).parameters
    recursive_guard = parameters.get("recursive_guard")

    if not recursive_guard or recursive_guard.kind is not inspect.Parameter.KEYWORD_ONLY:
        return

    def evaluate_forwardref(type_: ForwardRef, globalns: Any, localns: Any) -> Any:
        return type_._evaluate(globalns, localns, recursive_guard=set())

    pyd_typing.evaluate_forwardref = evaluate_forwardref


_patch_pydantic_forward_ref_keyword()
