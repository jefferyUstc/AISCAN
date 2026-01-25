"""Runtime primitives for the openai-agents powered assistant."""

from __future__ import annotations

from typing import List, Optional

from agents import Agent, ModelSettings
from pydantic import BaseModel

from .config import get_settings
from .models import Action, Filter
from .toolsets import (
    AgentContext,
    resolve_filters,
    resolve_gene,
    resolve_embedding,
    search_knowledge_base,
    web_search,
)

__all__ = ["AgentContext", "AssistantPayload", "build_base_agent", "BASE_INSTRUCTIONS"]


BASE_INSTRUCTIONS = (
    "You are an assistant to help explore the single-cell data and the related paper (in the knowledge base). "
    "Tools - Only use when NECESSARY: "
    "- search_knowledge_base(): First priority tool, use when user ask something about THIS dataset or the related paper. "
    "- web_search(): when user explicitly asks or fails to find the answer in the knowledge base. "
    "- resolve_filters(): Use this to VERIFY filters before adding them to your response."
    "  STEP 1: Check the 'Cell Metadata (obs)' section in context to see valid dimensions (columns) and values/categories."
    "  STEP 2: Based on user prompt, decide which dimension and value matches (e.g. User: 'Show treated', Context has 'condition' with 'treated', so Candidate: dimension='condition', value='treated')."
    "  STEP 3: Call resolve_filters(candidates=[{'dimension': '...', 'value': '...'}]) to check if they are valid."
    "  STEP 4: Include the VERIFIED filters returned by the tool in your final JSON response."
    "- resolve_gene(): Use this to VERIFY a gene exists in adata.var_names before instructing the UI to display it."
    "  STEP 1: Decide the candidate gene symbol/name from user prompt (e.g. 'color by RELN' => candidate 'RELN')."
    "  STEP 2: Call resolve_gene(candidates=['RELN']) to verify existence."
    "  STEP 3: If NOT found, respond EXACTLY: Gene: XXX  not exist (match spacing), and do NOT return actions."
    "  STEP 4: If found, include actions like:"
    "    actions=[{'type':'set_color_mode','value':'gene'},{'type':'set_gene','value':'RELN'}]"
    "- resolve_embedding(): Use this to VERIFY an embedding exists before switching the visualization."
    "  STEP 1: Check the 'Available embeddings' in context."
    "  STEP 2: If the user asks to switch embeddings (e.g. 'switch to tsne', 'use tSNE', 'show UMAP'), you MUST call resolve_embedding(candidates=[...]) to verify."
    "  STEP 3: If NOT found, respond: Embedding: XXX not exist, and do NOT return actions."
    "  STEP 4: If found, include actions like:"
    "    actions=[{'type':'set_embedding','value':'tsne'}]"
    "CRITICAL: Always respond with a single valid JSON object, no markdown fences, no extra text. "
    "Schema: {message: string, filters?: [{dimension: string, value: string}], actions?: [{type: string, value: string}], citations?: string[]}. "
    "If you cannot produce filters, return an empty filters list and explain in message."
)


def build_base_agent(model_name: Optional[str] = None) -> Agent:
    """Return the base Agent definition shared across requests.
    
    Args:
        model_name: Optional model name override. If None, uses config default.
    
    Returns:
        Agent configured with specified or default settings.
    """
    settings = get_settings()
    
    return Agent(
        name="AISCAN Assistant",
        instructions=BASE_INSTRUCTIONS,
        model=model_name or settings.llm.model_name,
        model_settings=ModelSettings(temperature=settings.llm.temperature),
        tools=[resolve_filters, resolve_gene, resolve_embedding, search_knowledge_base, web_search],
    )


class AssistantPayload(BaseModel):
    """Payload structure for assistant responses."""
    message: str
    title: Optional[str] = None
    summary: Optional[str] = None
    filters: Optional[List[Filter]] = None
    actions: Optional[List[Action]] = None
    citations: Optional[List[str]] = None
