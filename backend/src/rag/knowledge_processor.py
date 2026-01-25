"""
Knowledge document processor for AISCAN RAG system.
Handles document chunking, metadata extraction, and preprocessing.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from llama_index.core import Document
from llama_index.core.node_parser import SemanticSplitterNodeParser
from llama_index.core.embeddings import BaseEmbedding

from .embedding_service import get_embedding_service

logger = logging.getLogger(__name__)

class AISCANEmbeddingAdapter(BaseEmbedding):
    """Adapter for AISCAN Embedding Service to LlamaIndex BaseEmbedding."""
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._service = get_embedding_service()
        
    def _get_query_embedding(self, query: str) -> List[float]:
        return self._service.encode_text(query)

    def _get_text_embedding(self, text: str) -> List[float]:
        return self._service.encode_text(text)
        
    async def _aget_query_embedding(self, query: str) -> List[float]:
        return self._get_query_embedding(query)

    async def _aget_text_embedding(self, text: str) -> List[float]:
        return self._get_text_embedding(text)


class KnowledgeProcessor:
    """Processes scientific documents for the RAG system."""
    
    def __init__(self):
        """Initialize the knowledge processor."""
        self.gene_pattern = re.compile(r'\b[A-Z][A-Z0-9]{2,}[A-Z0-9]*\b')
        self.cell_type_pattern = re.compile(r'\b(?:T[\s-]?cell|B[\s-]?cell|NK[\s-]?cell|HeLa|PBMC|monocyte|macrophage|neutrophil|lymphocyte|fibroblast|epithelial|endothelial)\b', re.IGNORECASE)
        self.method_pattern = re.compile(r'\b(?:single[\s-]?cell|scRNA[\s-]?seq|RNA[\s-]?seq|FACS|flow[\s-]?cytometry|mass[\s-]?cytometry|CyTOF|proteomics|metabolomics|transcriptomics|genomics)\b', re.IGNORECASE)
        self.pathway_pattern = re.compile(r'\b(?:glycolysis|TCA[\s-]?cycle|oxidative[\s-]?phosphorylation|apoptosis|cell[\s-]?cycle|DNA[\s-]?repair|immune[\s-]?response|inflammation|metabolism)\b', re.IGNORECASE)
        
        # Initialize Semantic Splitter once
        try:
            self.embed_model = AISCANEmbeddingAdapter()
            self.splitter = SemanticSplitterNodeParser(
                buffer_size=1, 
                breakpoint_percentile_threshold=95, 
                embed_model=self.embed_model
            )
        except Exception as e:
            logger.warning(f"Failed to initialize SemanticSplitter: {e}")
            self.splitter = None
    
    def split_document(self, 
                      text: str, 
                      chunk_size: int = 500, 
                      overlap: int = 50,
                      min_chunk_size: int = 100) -> List[str]:
        """Split document into overlapping chunks using Semantic Splitting.
        
        Args:
            text: Input document text
            chunk_size: Maximum size of each chunk (used as guide/fallback)
            overlap: Overlap between consecutive chunks
            min_chunk_size: Minimum size for a chunk
            
        Returns:
            List of text chunks
        """
        if not text or len(text.strip()) < min_chunk_size:
            return []
            
        text = self._clean_text(text)
        
        # Try semantic splitting via LlamaIndex
        if self.splitter:
            try:
                # Process
                doc = Document(text=text)
                nodes = self.splitter.get_nodes_from_documents([doc])
                
                chunks = [node.text for node in nodes]
                if chunks:
                    logger.info(f"Semantic splitting produced {len(chunks)} chunks")
                    return chunks
                    
                # Fallback if no chunks produced
                logger.warning("Semantic splitting produced 0 chunks, falling back to regex")
                
            except Exception as e:
                logger.error(f"Semantic splitting failed: {e}. Falling back to regex.")
        else:
             logger.warning("Semantic splitter not initialized, falling back to regex")
            
        # Fallback to original regex-based splitting
        sentences = self._split_into_sentences(text)
        chunks = []
        current_chunk = ""
        current_size = 0
        
        for sentence in sentences:
            sentence_size = len(sentence)
            
            if current_size + sentence_size > chunk_size and current_chunk:
                if len(current_chunk.strip()) >= min_chunk_size:
                    chunks.append(current_chunk.strip())
                
                if overlap > 0 and chunks:
                    overlap_text = self._get_overlap_text(current_chunk, overlap)
                    current_chunk = overlap_text + " " + sentence
                    current_size = len(current_chunk)
                else:
                    current_chunk = sentence
                    current_size = sentence_size
            else:
                if current_chunk:
                    current_chunk += " " + sentence
                else:
                    current_chunk = sentence
                current_size = len(current_chunk)
        
        if current_chunk and len(current_chunk.strip()) >= min_chunk_size:
            chunks.append(current_chunk.strip())
        
        return chunks
    
    def extract_metadata(self, text: str) -> Dict[str, List[str]]:
        """Extract biological metadata from text.
        
        Args:
            text: Input text
            
        Returns:
            Dictionary with extracted metadata
        """
        metadata = {
            "genes": [],
            "cell_types": [],
            "methods": [],
            "pathways": [],
            "topics": []
        }
        
        genes = list(set(self.gene_pattern.findall(text)))
        genes = [g for g in genes if len(g) >= 3 and g not in ['THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'HAD', 'BUT', 'HAS']]
        metadata["genes"] = genes[:10]
        
        cell_types = list(set([match.group().lower() for match in self.cell_type_pattern.finditer(text)]))
        metadata["cell_types"] = cell_types
        
        methods = list(set([match.group().lower() for match in self.method_pattern.finditer(text)]))
        metadata["methods"] = methods
        
        pathways = list(set([match.group().lower() for match in self.pathway_pattern.finditer(text)]))
        metadata["pathways"] = pathways
        
        topics = self._generate_topics(text, metadata)
        metadata["topics"] = topics
        
        return metadata
    
    def process_document(self, 
                        text: str,
                        source: str = "unknown",
                        chunk_size: int = 500,
                        overlap: int = 50) -> List[Dict[str, any]]:
        """Process a complete document into chunks with metadata.
        
        Args:
            text: Document text
            source: Source identifier
            chunk_size: Size of text chunks
            overlap: Overlap between chunks
            
        Returns:
            List of processed chunks with metadata
        """
        chunks = self.split_document(text, chunk_size, overlap)
        
        processed_chunks = []
        for i, chunk in enumerate(chunks):
            chunk_metadata = self.extract_metadata(chunk)
            
            chunk_data = {
                "text": chunk,
                "metadata": {
                    "source": source,
                    "chunk_id": i,
                    "chunk_count": len(chunks),
                    "char_count": len(chunk),
                    "word_count": len(chunk.split()),
                    "genes": ", ".join(chunk_metadata.get("genes", [])),
                    "cell_types": ", ".join(chunk_metadata.get("cell_types", [])),
                    "methods": ", ".join(chunk_metadata.get("methods", [])),
                    "pathways": ", ".join(chunk_metadata.get("pathways", [])),
                    "topics": ", ".join(chunk_metadata.get("topics", []))
                }
            }
            
            processed_chunks.append(chunk_data)
        
        return processed_chunks
    
    def _clean_text(self, text: str) -> str:
        """Clean and normalize text."""
        text = re.sub(r'\s+', ' ', text)
        
        text = re.sub(r'[^\w\s\-\.\,\;\:\(\)\[\]\/\%\+\=\<\>]', ' ', text)
        
        text = re.sub(r'\s+', ' ', text)
        
        return text.strip()
    
    def _split_into_sentences(self, text: str) -> List[str]:
        """Split text into sentences."""
        sentences = re.split(r'(?<=[.!?])\s+', text)
        return [s.strip() for s in sentences if s.strip()]
    
    def _get_overlap_text(self, text: str, overlap_size: int) -> str:
        """Get overlap text from the end of a chunk."""
        if len(text) <= overlap_size:
            return text
        
        overlap_text = text[-overlap_size:]
        space_idx = overlap_text.find(' ')
        if space_idx > 0:
            return overlap_text[space_idx:].strip()
        return overlap_text
    
    def _generate_topics(self, text: str, metadata: Dict[str, List[str]]) -> List[str]:
        topics = set()
        
        if metadata.get("cell_types"):
            topics.add("cell_biology")
        if metadata.get("genes"):
            topics.add("genomics")
        if metadata.get("methods"):
            if any("rna" in method for method in metadata["methods"]):
                topics.add("transcriptomics")
            if any("single" in method for method in metadata["methods"]):
                topics.add("single_cell")
        if metadata.get("pathways"):
            topics.add("pathway_analysis")
        
        text_lower = text.lower()
        
        if any(word in text_lower for word in ["metabol", "glycol", "tca", "atp"]):
            topics.add("metabolism")
        if any(word in text_lower for word in ["immune", "inflamm", "cytokine"]):
            topics.add("immunology")
        if any(word in text_lower for word in ["cancer", "tumor", "oncol"]):
            topics.add("oncology")
        if any(word in text_lower for word in ["drug", "treatment", "inhibit", "compound"]):
            topics.add("pharmacology")
        if any(word in text_lower for word in ["cluster", "dimension", "embedding", "umap", "tsne"]):
            topics.add("data_analysis")
        
        return list(topics)


def load_knowledge_documents(knowledge_dir: str = None) -> List[Dict[str, str]]:
    """Load all knowledge documents from directory.
    
    Args:
        knowledge_dir: Directory containing knowledge files (defaults to Paths.DOCS_DIR)
        
    Returns:
        List of document dictionaries with text and source
    """
    from ..config.paths import Paths
    knowledge_path = Path(knowledge_dir or Paths.get_knowledge_dir())
    if not knowledge_path.exists():
        logger.warning(f"Knowledge directory not found: {knowledge_dir}")
        return []
    
    documents = []
    
    for file_path in knowledge_path.glob("*.txt"):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            documents.append({
                "text": content,
                "source": file_path.stem,
                "file_path": str(file_path),
                "file_size": len(content)
            })
            
        except Exception as e:
            logger.error(f"Failed to load {file_path}: {e}")
    
    return documents
