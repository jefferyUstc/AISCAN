# AISCAN backend

FastAPI service providing dataset metadata and an agent-powered assistant endpoint.

## Configuration

All configuration is managed through `src/config/settings.py` with support for environment variable overrides.

### LLM configuration (LiteLLM-only)

AISCAN backend uses the OpenAI Agents SDK with a LiteLLM-only model path. Models are selected via a `litellm/<provider>/<model>` string.

Key environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `AISCAN_LLM__MODEL_NAME` | `litellm/openai/gpt-4o` | Canonical LiteLLM-style model string |
| `OPENAI_API_KEY` | - | OpenAI API key (used by LiteLLM when provider is `openai`) |
| `ANTHROPIC_API_KEY` | - | Anthropic API key (when provider is `anthropic`) |
| `GEMINI_API_KEY` | - | Gemini API key (when provider is `gemini`) |
| `OPENAI_API_BASE` | - | Optional custom OpenAI-compatible base URL |
| `LITELLM_API_BASE` | - | Optional LiteLLM proxy/gateway base URL |
| `AISCAN_DATASET` | (Optional) | Path to `.h5ad` file. If unset, uses the first `.h5ad` in `data/` |
| `AISCAN_ORGANISM` | `Unknown` | Default organism name |

For more examples, see `backend/readme_model_config.md`.

### Data Management

Instead of setting paths via environment variables, you can simply place your files in the `data/` directory:
- **Dataset**: Place your `.h5ad` file directly in `backend/data/`. The app will automatically load the first one it finds.
- **Knowledge Base**: Place text files (`*.txt`) in `backend/data/docs/`. These will be indexed automatically on startup.

### Configuration Categories

The settings are organized into categories (see `src/config/settings.py`):

- **LLM Settings**: `model_name`, `temperature`, `max_conversation_history`
- **Embedding Settings**: `model_name`, `batch_size`, `device`
- **RAG Settings**: `collection_name`, `chunk_size`, `chunk_overlap`, `search_top_k`
- **Session Settings**: `max_session_age_hours`, `max_idle_hours`, `cleanup_interval_minutes`
- **Web Search Settings**: `max_results`, `request_timeout`, `retry_count`
- **Dataset Settings**: `default_embedding_limit`, `random_seed`, `max_category_values`
- **API Settings**: `version`, `cors_origins`, `log_level`

### Agent tooling
- `summarize_dataset`: returns dataset-level context plus the available conditions and cluster labels.
- `resolve_filters`: converts natural-language requests into valid filter clauses.
- `search_knowledge_base`: performs semantic search on the RAG knowledge base (docs folder).
- `web_search`: searches the web using DuckDuckGo (free, no API key required).

These tools are declared with `@function_tool` in `backend/src/agent_runtime.py` so the hosted model receives structured responses while heavy computation stays local.

### Knowledge Base (RAG)
The backend automatically initializes a knowledge base on startup:
- Documents are loaded from `data/docs/*.txt`
- Text is chunked, embedded, and stored in ChromaDB (`data/vectors/`)
- The `search_knowledge_base` tool enables semantic search during conversations

## Run the backend locally

```bash
cd backend
python -m uvicorn src.app:app --reload --host 0.0.0.0 --port 8000
```
