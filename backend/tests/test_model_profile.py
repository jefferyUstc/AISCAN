"""Model-family parameter routing.

Regression focus: `verbosity` is a GPT-5-only parameter and must NOT be sent to
o1/o3/o4 reasoning models (they reject it with HTTP 400).
"""

import model_profile as mp


def test_family_detection():
    assert mp.detect_profile("gpt-4o-mini").family == "chat"
    assert mp.detect_profile("gpt-5-chat-latest").family == "chat"
    assert mp.detect_profile("gpt-5").family == "reasoning"
    assert mp.detect_profile("o3").family == "reasoning"
    assert mp.detect_profile("o1-mini").family == "reasoning"


def test_verbosity_is_gpt5_only():
    assert mp._supports_verbosity("gpt-5") is True
    assert mp._supports_verbosity("gpt-5-mini") is True
    assert mp._supports_verbosity("o3") is False
    assert mp._supports_verbosity("o1") is False
    assert mp._supports_verbosity("gpt-4o-mini") is False


def test_chat_model_gets_temperature_no_reasoning():
    ms = mp.build_model_settings(
        "gpt-4o-mini", temperature=0.2, reasoning_effort="low", verbosity="medium"
    )
    assert ms.temperature == 0.2
    assert getattr(ms, "reasoning", None) is None
    assert getattr(ms, "verbosity", None) is None


def test_o3_gets_reasoning_but_not_verbosity_or_temperature():
    ms = mp.build_model_settings(
        "o3", temperature=0.5, reasoning_effort="high", verbosity="high"
    )
    assert getattr(ms, "temperature", None) is None
    assert getattr(ms, "reasoning", None) is not None
    assert getattr(ms, "verbosity", None) is None


def test_gpt5_gets_reasoning_and_verbosity():
    ms = mp.build_model_settings("gpt-5", reasoning_effort="low", verbosity="low")
    assert getattr(ms, "verbosity", None) == "low"
    assert getattr(ms, "reasoning", None) is not None
