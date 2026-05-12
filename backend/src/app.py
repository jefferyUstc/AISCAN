from __future__ import annotations

import logging
import os
from contextlib import AsyncExitStack, asynccontextmanager
from pathlib import Path
from typing import AsyncIterator, Dict, List, Optional

from agents import set_tracing_disabled
from agents.mcp import MCPServerStdio
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import Paths, get_settings
from .dataset_store import DatasetStore
from .models import (
    AssistantRequest,
    AssistantResponse,
    DatasetOptionsResponse,
    DatasetResponse,
    EmbeddingResponse,
    Filter,
    DegResponse,
    GeneExpressionResponse,
    GeneSignatureViolinResponse,
    GOEnrichmentResponse,
    Drug2CellStatusResponse,
    Drug2CellDotplotResponse,
)
from .rag import KnowledgeBaseInitializer
from .session import (
    SessionAwareAssistantEngine,
    SessionCleanupManager,
    initialize_scheduler,
    start_scheduler,
    stop_scheduler,
)

logger = logging.getLogger("aiscan")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initialize dataset, knowledge base, MCP, and assistant engine; tear
    them down on shutdown via AsyncExitStack."""
    settings = get_settings()
    set_tracing_disabled(not settings.api.tracing_enabled)
    logging.basicConfig(level=getattr(logging, settings.api.log_level))

    dataset_path = Path(Paths.get_dataset_path()).expanduser()
    dataset_store = DatasetStore.load(dataset_path)

    kb_result = KnowledgeBaseInitializer().initialize_knowledge_base(reset_existing=False)
    if kb_result["status"] == "error":
        raise RuntimeError(f"Knowledge base initialization failed: {kb_result['error']}")

    cleanup_manager = SessionCleanupManager()
    initialize_scheduler(cleanup_manager)
    await start_scheduler()

    async with AsyncExitStack() as stack:
        chembl_mcp = None
        if settings.chembl_mcp_path and os.path.exists(settings.chembl_mcp_path):
            try:
                chembl_mcp = await stack.enter_async_context(
                    MCPServerStdio(
                        name="ChEMBL MCP",
                        params={"command": "node", "args": [settings.chembl_mcp_path]},
                        cache_tools_list=True,
                    )
                )
                logger.info("ChEMBL MCP server started")
            except (FileNotFoundError, OSError) as exc:
                logger.warning(
                    "ChEMBL MCP failed to start (%s: %s); continuing without it",
                    type(exc).__name__, exc,
                )

        assistant_engine = SessionAwareAssistantEngine(dataset_store, chembl_mcp=chembl_mcp)

        app.state.settings = settings
        app.state.dataset_store = dataset_store
        app.state.assistant_engine = assistant_engine
        app.state.cleanup_manager = cleanup_manager
        app.state.chembl_mcp = chembl_mcp

        kb_status = (
            f"{kb_result['document_count']} docs"
            if kb_result["status"] == "success" else "no docs"
        )
        logger.info(
            "AISCAN started | LLM: %s | KB: %s | MCP: %s | Tracing: %s",
            settings.llm.model_name,
            kb_status,
            "on" if chembl_mcp else "off",
            "on" if settings.api.tracing_enabled else "off",
        )

        try:
            yield
        finally:
            await stop_scheduler()
            logger.info("AISCAN shutdown complete")


_settings_for_app = get_settings()
app = FastAPI(
    title="AISCAN API",
    version=_settings_for_app.api.version,
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings_for_app.api.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_dataset_store(request: Request) -> DatasetStore:
    return request.app.state.dataset_store


def get_assistant_engine(request: Request) -> SessionAwareAssistantEngine:
    return request.app.state.assistant_engine


def get_cleanup_manager(request: Request) -> SessionCleanupManager:
    return request.app.state.cleanup_manager


@app.get("/api/dataset/overview", response_model=DatasetResponse)
async def get_dataset_overview(
    store: DatasetStore = Depends(get_dataset_store),
) -> DatasetResponse:
    return store.get_overview()


@app.get("/api/dataset/embedding", response_model=EmbeddingResponse)
async def get_dataset_embedding(
    limit: int = 4000,
    embedding: Optional[str] = None,
    color_by: Optional[str] = None,
    filters: Optional[List[str]] = Query(None),
    sample_fraction: Optional[float] = None,
    store: DatasetStore = Depends(get_dataset_store),
) -> EmbeddingResponse:
    try:
        filter_objects: List[Filter] = []
        for raw in filters or []:
            if not raw or ":" not in raw:
                continue
            dimension, value = raw.split(":", 1)
            if dimension and value:
                filter_objects.append(Filter(dimension=dimension, value=value))
        return store.get_embedding(
            limit=limit,
            embedding_name=embedding,
            color_by=color_by,
            filters=filter_objects or None,
            sample_fraction=sample_fraction,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/dataset/options", response_model=DatasetOptionsResponse)
async def get_dataset_options(
    store: DatasetStore = Depends(get_dataset_store),
) -> DatasetOptionsResponse:
    return store.get_options()


@app.get("/api/dataset/deg", response_model=DegResponse)
async def get_deg(
    group: Optional[str] = None,
    groups_only: bool = False,
    store: DatasetStore = Depends(get_dataset_store),
) -> DegResponse:
    if groups_only or not group:
        return DegResponse(groups=store.get_deg_groups())
    return store.get_deg_data(group)


@app.get("/api/dataset/gene_expression", response_model=GeneExpressionResponse)
async def get_gene_expression(
    gene: str,
    groupby: Optional[str] = None,
    store: DatasetStore = Depends(get_dataset_store),
) -> GeneExpressionResponse:
    try:
        return store.get_gene_expression_by_group(gene, groupby)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/dataset/gene_signature_violin", response_model=GeneSignatureViolinResponse)
async def get_gene_signature_violin(
    genes: str,
    groupby: str,
    signature_name: Optional[str] = "signature",
    store: DatasetStore = Depends(get_dataset_store),
) -> GeneSignatureViolinResponse:
    gene_list = [g.strip() for g in genes.split(",") if g.strip()]
    if not gene_list:
        raise HTTPException(status_code=400, detail="No genes provided")
    try:
        return store.get_gene_signature_violin(gene_list, groupby, signature_name or "signature")
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/dataset/categorical_columns")
async def get_categorical_columns(
    store: DatasetStore = Depends(get_dataset_store),
) -> List[str]:
    return store.get_categorical_obs_columns()


@app.get("/api/dataset/pathways/categories")
async def get_pathway_categories(
    store: DatasetStore = Depends(get_dataset_store),
) -> List[str]:
    return store.get_pathway_categories()


@app.get("/api/dataset/pathways/{category}/pathways")
async def get_pathways_in_category(
    category: str,
    store: DatasetStore = Depends(get_dataset_store),
) -> List[str]:
    try:
        return store.get_pathways_in_category(category)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/dataset/pathways/{category}/{pathway}/genes")
async def get_genes_in_pathway(
    category: str,
    pathway: str,
    store: DatasetStore = Depends(get_dataset_store),
) -> List[str]:
    try:
        return store.get_genes_in_pathway(category, pathway)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/dataset/go_enrichment", response_model=GOEnrichmentResponse)
async def get_go_enrichment(
    group: str,
    min_lfc: float = 0.5,
    max_pval: float = 0.05,
    store: DatasetStore = Depends(get_dataset_store),
) -> GOEnrichmentResponse:
    try:
        return store.get_go_enrichment(group, min_lfc, max_pval)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/dataset/drug2cell/status", response_model=Drug2CellStatusResponse)
async def get_drug2cell_status(
    store: DatasetStore = Depends(get_dataset_store),
) -> Drug2CellStatusResponse:
    return store.get_drug2cell_status()


@app.post("/api/dataset/drug2cell/compute", response_model=Drug2CellStatusResponse)
async def compute_drug2cell(
    use_raw: bool = True,
    store: DatasetStore = Depends(get_dataset_store),
) -> Drug2CellStatusResponse:
    return store.compute_drug2cell_score(use_raw)


@app.get("/api/dataset/drug2cell/dotplot", response_model=Drug2CellDotplotResponse)
async def get_drug2cell_dotplot(
    groupby: str,
    n_genes: int = 10,
    split_by: Optional[str] = None,
    store: DatasetStore = Depends(get_dataset_store),
) -> Drug2CellDotplotResponse:
    try:
        return store.get_drug2cell_dotplot(groupby, n_genes, split_by)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/assistant/chat", response_model=AssistantResponse)
async def chat(
    request: AssistantRequest,
    engine: SessionAwareAssistantEngine = Depends(get_assistant_engine),
) -> AssistantResponse:
    context: Dict[str, object] = request.context or {}
    return await engine.generate_with_session(
        user_id=request.user_id,
        prompt=request.message,
        context=context,
        session_id=request.session_id,
    )


@app.get("/api/assistant/session/{session_id}/messages")
async def get_session_messages(
    session_id: str,
    user_id: str = Query(...),
    engine: SessionAwareAssistantEngine = Depends(get_assistant_engine),
):
    messages = await engine.get_session_messages(user_id, session_id)
    return {"messages": messages, "session_id": session_id}


@app.get("/api/assistant/session-stats")
async def get_session_stats(
    manager: SessionCleanupManager = Depends(get_cleanup_manager),
):
    return manager.get_session_stats()


@app.post("/api/assistant/cleanup-sessions")
async def cleanup_sessions(
    manager: SessionCleanupManager = Depends(get_cleanup_manager),
):
    return manager.cleanup_old_sessions()


@app.delete("/api/assistant/session/{session_id}")
async def clear_session(
    session_id: str,
    user_id: str = Query(...),
    engine: SessionAwareAssistantEngine = Depends(get_assistant_engine),
):
    await engine.clear_session(user_id, session_id)
    return {"status": "cleared", "session_id": session_id}
