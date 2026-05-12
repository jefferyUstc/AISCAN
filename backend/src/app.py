from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, List, Optional

from agents import set_tracing_disabled
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import Paths, get_settings
from .session import (
    SessionAwareAssistantEngine,
    SessionCleanupManager,
    SessionScheduler,
    initialize_scheduler,
    start_scheduler,
    stop_scheduler,
)
from .dataset_store import DatasetStore
from .rag import KnowledgeBaseInitializer
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

settings = get_settings()
set_tracing_disabled(not settings.api.tracing_enabled)

logging.basicConfig(level=getattr(logging, settings.api.log_level))
logger = logging.getLogger("aiscan")

dataset_path = Path(Paths.get_dataset_path()).expanduser()
dataset_store = DatasetStore.load(dataset_path)

assistant_engine = SessionAwareAssistantEngine(dataset_store)

cleanup_manager = SessionCleanupManager()

scheduler: Optional[SessionScheduler] = None

app = FastAPI(title="AISCAN API", version=settings.api.version)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.api.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    """Start background tasks on application startup."""
    global scheduler
    
    initializer = KnowledgeBaseInitializer()
    result = initializer.initialize_knowledge_base(reset_existing=False)
    
    if result["status"] == "error":
        raise RuntimeError(f"Knowledge base initialization failed: {result['error']}")
    
    scheduler = initialize_scheduler(cleanup_manager)
    await start_scheduler()
    
    kb_status = f"{result['document_count']} docs" if result["status"] == "success" else "no docs"
    logger.info(f"AISCAN started | LLM: {settings.llm.model_name} | KB: {kb_status} | Session: SDK SQLiteSession")


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up background tasks on application shutdown."""
    await stop_scheduler()
    logger.info("AISCAN shutdown complete")


@app.get("/api/dataset/overview", response_model=DatasetResponse)
async def get_dataset_overview() -> DatasetResponse:
    """Get the general overview of the dataset."""
    return dataset_store.get_overview()


@app.get("/api/dataset/embedding", response_model=EmbeddingResponse)
async def get_dataset_embedding(
    limit: int = 4000,
    embedding: Optional[str] = None,
    color_by: Optional[str] = None,
    filters: Optional[List[str]] = Query(None),
    sample_fraction: Optional[float] = None,
) -> EmbeddingResponse:
    """Get embedding data for visualization."""
    try:
        filter_objects: List[Filter] = []
        if filters:
            for raw in filters:
                if not raw:
                    continue
                if ":" not in raw:
                    continue
                dimension, value = raw.split(":", 1)
                if dimension and value:
                    filter_objects.append(Filter(dimension=dimension, value=value))
        return dataset_store.get_embedding(
            limit=limit,
            embedding_name=embedding,
            color_by=color_by,
            filters=filter_objects or None,
            sample_fraction=sample_fraction,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/dataset/options", response_model=DatasetOptionsResponse)
async def get_dataset_options() -> DatasetOptionsResponse:
    """Get available options for the dataset configuration."""
    return dataset_store.get_options()


@app.get("/api/dataset/deg", response_model=DegResponse)
async def get_deg(
    group: Optional[str] = None,
    groups_only: bool = False,
) -> DegResponse:
    """Get differentially expressed genes."""
    if groups_only:
        return DegResponse(groups=dataset_store.get_deg_groups())
    
    if group:
        return dataset_store.get_deg_data(group)
    
    return DegResponse(groups=dataset_store.get_deg_groups())


@app.get("/api/dataset/gene_expression", response_model=GeneExpressionResponse)
async def get_gene_expression(
    gene: str,
    groupby: Optional[str] = None,
) -> GeneExpressionResponse:
    """Get expression values for a specific gene."""
    try:
        return dataset_store.get_gene_expression_by_group(gene, groupby)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/dataset/gene_signature_violin", response_model=GeneSignatureViolinResponse)
async def get_gene_signature_violin(
    genes: str,
    groupby: str,
    signature_name: Optional[str] = "signature",
) -> GeneSignatureViolinResponse:
    """
    Compute gene signature scores and return violin plot data.
    
    Args:
        genes: Comma-separated list of gene names
        groupby: Observation column to group by for visualization
        signature_name: Name for the signature (optional)
    """
    try:
        gene_list = [g.strip() for g in genes.split(",") if g.strip()]
        if not gene_list:
            raise HTTPException(status_code=400, detail="No genes provided")
        return dataset_store.get_gene_signature_violin(gene_list, groupby, signature_name or "signature")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/dataset/categorical_columns")
async def get_categorical_columns() -> List[str]:
    """Get list of categorical observation columns available for grouping."""
    return dataset_store.get_categorical_obs_columns()


@app.get("/api/dataset/pathways/categories")
async def get_pathway_categories() -> List[str]:
    """List available pathway database categories."""
    return dataset_store.get_pathway_categories()


@app.get("/api/dataset/pathways/{category}/pathways")
async def get_pathways_in_category(category: str) -> List[str]:
    """List pathways within a specific category."""
    try:
        return dataset_store.get_pathways_in_category(category)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/dataset/pathways/{category}/{pathway}/genes")
async def get_genes_in_pathway(category: str, pathway: str) -> List[str]:
    """Get genes for a specific pathway."""
    try:
        return dataset_store.get_genes_in_pathway(category, pathway)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/dataset/go_enrichment", response_model=GOEnrichmentResponse)
async def get_go_enrichment(
    group: str,
    min_lfc: float = 0.5,
    max_pval: float = 0.05,
) -> GOEnrichmentResponse:
    """
    Perform GO enrichment analysis on differentially expressed genes.
    
    Args:
        group: Cluster/group name to analyze
        min_lfc: Minimum log fold change threshold (only positive LFC genes used)
        max_pval: Maximum adjusted p-value threshold
    """
    try:
        return dataset_store.get_go_enrichment(group, min_lfc, max_pval)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/api/dataset/drug2cell/status", response_model=Drug2CellStatusResponse)
async def get_drug2cell_status() -> Drug2CellStatusResponse:
    """Get current Drug2Cell computation status."""
    return dataset_store.get_drug2cell_status()


@app.post("/api/dataset/drug2cell/compute", response_model=Drug2CellStatusResponse)
async def compute_drug2cell(use_raw: bool = True) -> Drug2CellStatusResponse:
    """
    Compute Drug2Cell scores for cells.
    
    Args:
        use_raw: Whether to use raw data layer for expression values
    """
    return dataset_store.compute_drug2cell_score(use_raw)


@app.get("/api/dataset/drug2cell/dotplot", response_model=Drug2CellDotplotResponse)
async def get_drug2cell_dotplot(
    groupby: str,
    n_genes: int = 10,
    split_by: Optional[str] = None,
) -> Drug2CellDotplotResponse:
    """
    Get dotplot data for Drug2Cell visualization.
    
    Args:
        groupby: Observation column to group by (e.g., 'leiden', 'celltype')
        n_genes: Number of top drugs to show per group
        split_by: Optional column to split groups by (visualization only)
    """
    try:
        return dataset_store.get_drug2cell_dotplot(groupby, n_genes, split_by)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/assistant/chat", response_model=AssistantResponse)
async def chat(request: AssistantRequest) -> AssistantResponse:
    """Session-based chat endpoint with SDK session management."""
    context: Dict[str, object] = request.context or {}
    return await assistant_engine.generate_with_session(
        user_id=request.user_id,
        prompt=request.message,
        context=context,
        session_id=request.session_id
    )


@app.get("/api/assistant/session/{session_id}/messages")
async def get_session_messages(session_id: str, user_id: str = Query(...)):
    """Get messages for a specific session using SDK sessions."""
    try:
        messages = await assistant_engine.get_session_messages(user_id, session_id)
        return {"messages": messages, "session_id": session_id}
    except Exception as e:
        logger.warning(f"Could not retrieve session messages: {e}")
        return {"messages": [], "session_id": session_id}


@app.get("/api/assistant/session-stats")
async def get_session_stats():
    """Get session management statistics."""
    return cleanup_manager.get_session_stats()


@app.post("/api/assistant/cleanup-sessions")
async def cleanup_sessions():
    """Manually trigger session cleanup."""
    return cleanup_manager.cleanup_old_sessions()


@app.delete("/api/assistant/session/{session_id}")
async def clear_session(session_id: str, user_id: str = Query(...)):
    """Clear a specific session."""
    try:
        await assistant_engine.clear_session(user_id, session_id)
        return {"status": "cleared", "session_id": session_id}
    except Exception as e:
        logger.warning(f"Could not clear session: {e}")
        raise HTTPException(status_code=500, detail=str(e))
