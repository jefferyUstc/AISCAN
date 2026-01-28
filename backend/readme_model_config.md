## AISCAN LLM configuration (LiteLLM-only)

This document explains how to configure the AISCAN backend LLM using the LiteLLM-only path.

The backend uses the OpenAI Agents SDK with model strings of the form:

- `litellm/<provider>/<model>`

Examples:

- `litellm/openai/gpt-4o`
- `litellm/openai/gpt-4o-mini`
- `litellm/anthropic/claude-sonnet-4-5-20250929`
- `litellm/gemini/gemini-2.0-flash`

Internally, all model names are normalized to this format.

---

### 1. Primary environment variables

Recommended configuration:

```bash
export OPENAI_API_KEY=sk-...
export AISCAN_LLM__MODEL_NAME="litellm/openai/gpt-4o"
```

The `AISCAN_LLM__MODEL_NAME` setting is mapped to `settings.llm.model_name` via `pydantic-settings` with `env_nested_delimiter="__"`.

### 2. Provider-specific keys and gateways

LiteLLM reads provider credentials from standard environment variables. Common examples:

- OpenAI:
  - `OPENAI_API_KEY`
  - Optional: `OPENAI_API_BASE` for OpenAI-compatible gateways
- Anthropic:
  - `ANTHROPIC_API_KEY`
- Gemini:
  - `GEMINI_API_KEY`

You can also configure a LiteLLM proxy/gateway:

- `LITELLM_API_BASE`

These values are passed through to LiteLLM; AISCAN does not wrap or hide them.

---

### 3. Error behavior (no fallback)

The backend does **not** use a textual fallback response when the LLM call fails.

Instead:

- If the model is not configured:
  - `HTTP 500` with detail: `"LLM model is not configured."`
- If agent execution fails:
  - `HTTP 500` with JSON detail containing:
    - `"error"`: short description
    - `"model"`: the full `litellm/...` model string
    - `"exception_type"`: Python exception class name
    - `"message"`: underlying error message from the SDK/provider

Logs:

- The same error is printed to the backend logs in red (ANSI escape codes) for better visibility.

---

### 4. Examples

#### OpenAI (default)

```bash
export OPENAI_API_KEY=sk-...
export AISCAN_LLM__MODEL_NAME="litellm/openai/gpt-4o"
```

#### Anthropic

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export AISCAN_LLM__MODEL_NAME="litellm/anthropic/claude-sonnet-4-5-20250929"
```

#### Gemini

```bash
export GEMINI_API_KEY=sk-gem-...
export AISCAN_LLM__MODEL_NAME="litellm/gemini/gemini-2.0-flash"
```

#### OpenAI-compatible gateway

```bash
export OPENAI_API_KEY=sk-proxy-...
export OPENAI_API_BASE="https://your-gateway.example.com/v1"
export AISCAN_LLM__MODEL_NAME="litellm/openai/gpt-4o"
```

In all cases, the backend will use the normalized `settings.llm.model_name` and the relevant provider API keys via LiteLLM.

