"""Model capability profile and ModelSettings factory.

OpenAI segments its models into two API-incompatible families:

- Chat models (gpt-4o*, gpt-4.1*, gpt-5-chat-latest, gpt-3.5-turbo):
  accept temperature/top_p, do NOT accept reasoning.effort.
- Reasoning models (gpt-5*, o1*, o3*, o4*):
  reject temperature/top_p with HTTP 400, accept reasoning.effort + verbosity.

This module centralizes the rules so the rest of the codebase can use a
single configuration shape and have parameters routed correctly per model.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, Literal, Optional

from agents import ModelSettings

ReasoningEffort = Literal["minimal", "low", "medium", "high"]
Verbosity = Literal["low", "medium", "high"]
ModelFamily = Literal["chat", "reasoning"]


@dataclass(frozen=True)
class ModelProfile:
    family: ModelFamily
    supports_temperature: bool
    supports_top_p: bool
    supports_reasoning_effort: bool
    supports_verbosity: bool


_REASONING_PATTERNS = (
    re.compile(r"^gpt-5(?!-chat)"),
    re.compile(r"^o[134](?:[-.]|$)"),
)

_REASONING_PROFILE = ModelProfile(
    family="reasoning",
    supports_temperature=False,
    supports_top_p=False,
    supports_reasoning_effort=True,
    supports_verbosity=True,
)

_CHAT_PROFILE = ModelProfile(
    family="chat",
    supports_temperature=True,
    supports_top_p=True,
    supports_reasoning_effort=False,
    supports_verbosity=False,
)


def detect_profile(model: str) -> ModelProfile:
    name = (model or "").lower().strip()
    if any(p.match(name) for p in _REASONING_PATTERNS):
        return _REASONING_PROFILE
    return _CHAT_PROFILE


def build_model_settings(
    model: str,
    *,
    temperature: Optional[float] = None,
    top_p: Optional[float] = None,
    reasoning_effort: Optional[ReasoningEffort] = None,
    verbosity: Optional[Verbosity] = None,
) -> ModelSettings:
    """Construct ModelSettings, silently dropping params unsupported by `model`.

    The same config dict can drive chat and reasoning models without 400s.
    """
    profile = detect_profile(model)
    kwargs: Dict[str, Any] = {}

    if profile.supports_temperature and temperature is not None:
        kwargs["temperature"] = temperature
    if profile.supports_top_p and top_p is not None:
        kwargs["top_p"] = top_p
    if profile.supports_reasoning_effort and reasoning_effort is not None:
        from openai.types.shared.reasoning import Reasoning
        kwargs["reasoning"] = Reasoning(effort=reasoning_effort)
    if profile.supports_verbosity and verbosity is not None:
        kwargs["verbosity"] = verbosity

    return ModelSettings(**kwargs)
