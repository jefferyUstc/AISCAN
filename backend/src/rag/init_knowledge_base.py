"""
Knowledge base initialization script for AISCAN RAG system.
Processes documents and populates the vector database.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import List, Optional

from ..config import Paths, get_settings
from .embedding_service import get_embedding_service, initialize_embedding_service
from .knowledge_processor import KnowledgeProcessor, load_knowledge_documents
from .vector_store import get_vector_store, initialize_vector_store

logger = logging.getLogger(__name__)


class KnowledgeBaseInitializer:
    """Initializes the knowledge base with documents and embeddings."""
    
    def __init__(self, 
                 knowledge_dir: Optional[str] = None,
                 vector_db_dir: Optional[str] = None,
                 embedding_model: Optional[str] = None):
        """Initialize the knowledge base initializer.
        
        Args:
            knowledge_dir: Directory containing knowledge documents (defaults to Paths.DOCS_DIR)
            vector_db_dir: Directory for vector database (defaults to Paths.VECTORS_DIR)
            embedding_model: Embedding model to use (defaults to settings)
        """
        settings = get_settings()
        
        self.knowledge_dir = knowledge_dir or Paths.get_knowledge_dir()
        self.vector_db_dir = vector_db_dir or Paths.get_vector_store_path()
        self.embedding_model = embedding_model or settings.embedding.model_name
        self.settings = settings
        
        self.embedding_service = initialize_embedding_service(
            model_name=self.embedding_model,
            cache_dir=Paths.get_embedding_model_path()
        )
        self.vector_store = initialize_vector_store(
            persist_directory=self.vector_db_dir,
            collection_name=settings.rag.collection_name
        )
        self.processor = KnowledgeProcessor()
    
    def initialize_knowledge_base(self, 
                                 reset_existing: bool = False,
                                 chunk_size: Optional[int] = None,
                                 overlap: Optional[int] = None) -> dict:
        """Initialize the complete knowledge base.
        
        Args:
            reset_existing: Whether to reset existing data
            chunk_size: Size of text chunks (defaults to settings)
            overlap: Overlap between chunks (defaults to settings)
            
        Returns:
            Dictionary with initialization results
        """
        chunk_size = chunk_size if chunk_size is not None else self.settings.rag.chunk_size
        overlap = overlap if overlap is not None else self.settings.rag.chunk_overlap
        
        try:
            if reset_existing:
                self.vector_store.reset_collection()
            
            current_count = self.vector_store.get_document_count()
            if current_count > 0 and not reset_existing:
                logger.info(f"Knowledge base already contains {current_count} documents")
                return {
                    "status": "already_initialized",
                    "document_count": current_count,
                    "message": "Knowledge base already populated. Use reset_existing=True to reinitialize."
                }
            
            documents = load_knowledge_documents(self.knowledge_dir)
            
            if not documents:
                logger.warning("No documents found to process")
                return {
                    "status": "no_documents",
                    "document_count": 0,
                    "message": f"No documents found in {self.knowledge_dir}"
                }
            
            
            all_chunks = []
            for doc in documents:
                chunks = self.processor.process_document(
                    text=doc["text"],
                    source=doc["source"],
                    chunk_size=chunk_size,
                    overlap=overlap
                )
                all_chunks.extend(chunks)
            
            
            texts = [chunk["text"] for chunk in all_chunks]
            embeddings = self.embedding_service.encode_batch(
                texts=texts,
                batch_size=32,
                show_progress=True
            )
            
            metadatas = [chunk["metadata"] for chunk in all_chunks]
            ids = [f"{chunk['metadata']['source']}_{chunk['metadata']['chunk_id']}" 
                  for chunk in all_chunks]
            
            added_ids = self.vector_store.add_documents(
                documents=texts,
                embeddings=embeddings,
                metadatas=metadatas,
                ids=ids
            )
            
            final_count = self.vector_store.get_document_count()
            
            result = {
                "status": "success",
                "document_count": final_count,
                "chunks_processed": len(all_chunks),
                "source_documents": len(documents),
                "embedding_dimension": self.embedding_service.embedding_dimension,
                "vector_store_info": self.vector_store.get_collection_info()
            }
            
            return result
            
        except Exception as e:
            logger.error(f"Knowledge base initialization failed: {e}")
            return {
                "status": "error",
                "error": str(e),
                "document_count": self.vector_store.get_document_count()
            }
    
    def test_retrieval(self, query: str = "T cell metabolism", top_k: int = 3) -> dict:
        """Test the retrieval system with a sample query.
        
        Args:
            query: Test query
            top_k: Number of results to retrieve
            
        Returns:
            Dictionary with test results
        """
        logger.info(f"Testing retrieval with query: '{query}'")
        
        try:
            results = self.vector_store.search_by_text(
                query_text=query,
                embedding_service=self.embedding_service,
                n_results=top_k
            )
            
            test_result = {
                "status": "success",
                "query": query,
                "results_count": len(results),
                "results": []
            }
            
            for i, result in enumerate(results):
                test_result["results"].append({
                    "rank": i + 1,
                    "similarity_score": result["similarity_score"],
                    "content_preview": result["content"][:200] + "..." if len(result["content"]) > 200 else result["content"],
                    "source": result["metadata"].get("source", "unknown"),
                    "topics": result["metadata"].get("topics", [])
                })
            
            logger.info(f"Test retrieval completed. Found {len(results)} results")
            return test_result
            
        except Exception as e:
            logger.error(f"Test retrieval failed: {e}")
            return {
                "status": "error",
                "error": str(e),
                "query": query
            }
    
    def get_system_status(self) -> dict:
        """Get the current status of the knowledge base system.
        
        Returns:
            Dictionary with system status
        """
        try:
            embedding_health = self.embedding_service.health_check()
            vector_health = self.vector_store.health_check()
            
            return {
                "embedding_service": embedding_health,
                "vector_store": vector_health,
                "knowledge_directory": str(Path(self.knowledge_dir).absolute()),
                "vector_db_directory": str(Path(self.vector_db_dir).absolute())
            }
        except Exception as e:
            return {
                "status": "error",
                "error": str(e)
            }


def main():
    """Main function to run knowledge base initialization."""
    import argparse
    
    # Get defaults from centralized configuration
    settings = get_settings()
    default_knowledge_dir = Paths.get_knowledge_dir()
    default_vector_db_dir = Paths.get_vector_store_path()
    
    parser = argparse.ArgumentParser(description="Initialize AISCAN Knowledge Base")
    parser.add_argument("--reset", action="store_true", help="Reset existing knowledge base")
    parser.add_argument("--test", action="store_true", help="Run test retrieval after initialization")
    parser.add_argument("--status", action="store_true", help="Show system status only")
    parser.add_argument("--knowledge-dir", default=default_knowledge_dir, 
                        help=f"Knowledge documents directory (default: {default_knowledge_dir})")
    parser.add_argument("--vector-db-dir", default=default_vector_db_dir, 
                        help=f"Vector database directory (default: {default_vector_db_dir})")
    parser.add_argument("--chunk-size", type=int, default=settings.rag.chunk_size, 
                        help=f"Chunk size for document splitting (default: {settings.rag.chunk_size})")
    parser.add_argument("--overlap", type=int, default=settings.rag.chunk_overlap, 
                        help=f"Overlap between chunks (default: {settings.rag.chunk_overlap})")
    
    args = parser.parse_args()
    
    args = parser.parse_args()
    
    initializer = KnowledgeBaseInitializer(
        knowledge_dir=args.knowledge_dir,
        vector_db_dir=args.vector_db_dir
    )
    
    if args.status:
        status = initializer.get_system_status()
        print("\n=== AISCAN Knowledge Base Status ===")
        print(f"Embedding Service: {status['embedding_service']['status']}")
        print(f"Vector Store: {status['vector_store']['status']}")
        print(f"Document Count: {status['vector_store'].get('document_count', 'unknown')}")
        print(f"Knowledge Directory: {status['knowledge_directory']}")
        print(f"Vector DB Directory: {status['vector_db_directory']}")
        return
    
    result = initializer.initialize_knowledge_base(
        reset_existing=args.reset,
        chunk_size=args.chunk_size,
        overlap=args.overlap
    )
    
    print("\n=== Knowledge Base Initialization Results ===")
    print(f"Status: {result['status']}")
    print(f"Document Count: {result.get('document_count', 0)}")
    
    if result['status'] == 'success':
        print(f"Chunks Processed: {result['chunks_processed']}")
        print(f"Source Documents: {result['source_documents']}")
        print(f"Embedding Dimension: {result['embedding_dimension']}")
    elif result['status'] == 'error':
        print(f"Error: {result['error']}")
        sys.exit(1)
    
        print(f"Error: {result['error']}")
        sys.exit(1)
    
    if args.test and result['status'] == 'success':
        print("\n=== Testing Retrieval System ===")
        test_result = initializer.test_retrieval()
        
        if test_result['status'] == 'success':
            print(f"Query: {test_result['query']}")
            print(f"Results Found: {test_result['results_count']}")
            
            for result_item in test_result['results']:
                print(f"\nRank {result_item['rank']} (Score: {result_item['similarity_score']:.3f})")
                print(f"Source: {result_item['source']}")
                print(f"Topics: {', '.join(result_item['topics'])}")
                print(f"Content: {result_item['content_preview']}")
        else:
            print(f"Test failed: {test_result['error']}")
    
    print("\nKnowledge base initialization completed!")


if __name__ == "__main__":
    main()
