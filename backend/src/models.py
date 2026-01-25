from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class Filter(BaseModel):
    dimension: str
    value: str


class Action(BaseModel):
    """UI actions that the frontend can execute deterministically."""
    type: str
    value: str


class DatasetOverview(BaseModel):
    id: str
    name: str
    organism: str
    cellCount: int
    geneCount: int
    activeEmbedding: str
    availableEmbeddings: List[str] = Field(default_factory=list)
    obsStats: Dict[str, Any] = Field(default_factory=dict)
    metrics: List[Dict[str, Any]]
    description: Optional[str] = None


class DatasetResponse(BaseModel):
    dataset: DatasetOverview
    activeFilters: List[Filter] = Field(default_factory=list)


class AssistantRequest(BaseModel):
    user_id: str
    message: str
    context: Optional[Dict[str, Any]] = None
    session_id: str


class AssistantAnnotations(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    filters: Optional[List[Filter]] = None
    actions: Optional[List[Action]] = None
    citations: Optional[List[str]] = None


class AssistantResponse(BaseModel):
    reply: str
    annotations: Optional[AssistantAnnotations] = None


class EmbeddingPoint(BaseModel):
    id: str
    x: float
    y: float
    cluster: Optional[str] = None
    condition: Optional[str] = None
    label: Optional[str] = None
    value: Optional[float] = None
    z: Optional[float] = None


class EmbeddingResponse(BaseModel):
    embedding: str
    totalCells: int
    sampledCells: int
    points: List[EmbeddingPoint]
    colorBy: Optional[str] = None
    colorMode: Optional[str] = None
    dimensions: int = 2


class ObservationAttribute(BaseModel):
    name: str
    label: str
    kind: str
    cardinality: Optional[int] = None
    dtype: Optional[str] = None
    categories: Optional[List[str]] = None
    colors: Optional[Dict[str, str]] = None


class GeneOption(BaseModel):
    id: str
    name: str
    symbol: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class EmbeddingOption(BaseModel):
    name: str
    dimensions: int
    key: Optional[str] = None


class DegGene(BaseModel):
    id: str
    name: str
    logfoldchanges: float
    pvals: float
    pvals_adj: float
    scores: float
    mean_expression: Optional[float] = None
    pct_nz_group: Optional[float] = None
    pct_nz_reference: Optional[float] = None


class DegResponse(BaseModel):
    groups: List[str]
    currentGroup: Optional[str] = None
    genes: List[DegGene] = Field(default_factory=list)


class GeneExpressionPoint(BaseModel):
    id: str
    group: str
    value: float


class GeneExpressionResponse(BaseModel):
    gene: str
    points: List[GeneExpressionPoint]


class GeneSignatureViolinResponse(BaseModel):
    """Response for gene signature scoring violin plot data."""
    signature_name: str
    genes_found: List[str]
    genes_not_found: List[str]
    groupby: str
    points: List[GeneExpressionPoint]


class GOEnrichmentTerm(BaseModel):
    """Individual GO term enrichment result."""
    term: str
    pval: float
    pval_adj: float
    neg_log10_pval_adj: float
    odds_ratio: float
    overlap_count: int
    gene_set_size: int
    genes: List[str]


class GOEnrichmentResponse(BaseModel):
    """Response for GO enrichment analysis."""
    group: str
    total_deg_genes: int
    filtered_genes: List[str]
    terms: List[GOEnrichmentTerm]


class DatasetOptionsResponse(BaseModel):
    obsAttributes: List[ObservationAttribute]
    geneOptions: List[GeneOption]
    embeddings: List[EmbeddingOption]


class Drug2CellStatusResponse(BaseModel):
    """Response for Drug2Cell computation status."""
    status: str
    message: str
    use_raw: Optional[bool] = None


class Drug2CellDotplotData(BaseModel):
    """Single data point for dotplot."""
    drug: str
    group: str
    mean_expression: float
    fraction_expressing: float


class Drug2CellDotplotResponse(BaseModel):
    """Response for Drug2Cell dotplot visualization."""
    groupby: str
    groups: List[str]
    drugs: List[str]
    data: List[Drug2CellDotplotData]
    n_genes: int


__all__ = [
    "AssistantAnnotations",
    "AssistantRequest",
    "AssistantResponse",
    "DatasetOverview",
    "DatasetResponse",
    "EmbeddingPoint",
    "EmbeddingResponse",
    "ObservationAttribute",
    "GeneOption",
    "DatasetOptionsResponse",
    "EmbeddingOption",
    "Filter",
    "DegGene",
    "DegResponse",
    "GeneExpressionPoint",
    "GeneExpressionResponse",
    "GeneSignatureViolinResponse",
    "GOEnrichmentTerm",
    "GOEnrichmentResponse",
    "Drug2CellStatusResponse",
    "Drug2CellDotplotData",
    "Drug2CellDotplotResponse",
]

