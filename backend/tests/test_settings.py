"""Settings env-loading: declarative aliases + legacy AISCAN_MODEL + defaults."""

import importlib

import pytest


@pytest.fixture
def load_settings(monkeypatch):
    """Return a factory that builds a fresh Settings after clearing the
    relevant env vars and the cached singleton."""

    def _load(**env):
        for key in [
            "OPENAI_API_KEY",
            "AISCAN_OPENAI_API_KEY",
            "AISCAN_ORGANISM",
            "AISCAN_MODEL",
            "AISCAN_LLM__MODEL_NAME",
        ]:
            monkeypatch.delenv(key, raising=False)
        for key, value in env.items():
            monkeypatch.setenv(key, value)
        settings_mod = importlib.import_module("config.settings")
        settings_mod.reset_settings()
        return settings_mod.get_settings()

    return _load


def test_openai_api_key_read_from_unprefixed_env(load_settings):
    assert load_settings(OPENAI_API_KEY="sk-test").openai_api_key == "sk-test"


def test_organism_maps_from_prefixed_env(load_settings):
    assert load_settings(AISCAN_ORGANISM="Mouse").organism == "Mouse"


def test_legacy_aiscan_model_maps_to_nested_llm(load_settings):
    assert load_settings(AISCAN_MODEL="gpt-5").llm.model_name == "gpt-5"


def test_nested_env_overrides_legacy(load_settings):
    settings = load_settings(AISCAN_MODEL="gpt-5", AISCAN_LLM__MODEL_NAME="gpt-4o-mini")
    assert settings.llm.model_name == "gpt-4o-mini"


def test_defaults_and_dead_field_removed(load_settings):
    settings = load_settings()
    assert settings.organism == "Unknown"
    assert settings.llm.model_name == "gpt-4o-mini"
    assert settings.web_search.max_results == 5
    # The dead `dataset_path` field was removed (path comes from Paths).
    assert not hasattr(settings, "dataset_path")
