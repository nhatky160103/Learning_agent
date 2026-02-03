"""
Vector Store Service for ChromaDB Integration

This service provides vector embedding and semantic search capabilities
for the learning assistant application using ChromaDB.
"""

import logging
from typing import List, Dict, Optional, Any
from datetime import datetime
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
import numpy as np

from config import settings

logger = logging.getLogger(__name__)


class VectorStore:
    """
    Vector store service for document embeddings and semantic search.
    
    Features:
    - Document chunk embedding generation
    - Semantic similarity search
    - Hybrid search (semantic + keyword)
    - Metadata filtering
    - Batch processing
    """
    
    def __init__(self):
        """Initialize ChromaDB client and embedding model."""
        self.client = None
        self.collection = None
        self.embedding_model = None
        self._init_client()
        self._init_embedding_model()
    
    def _init_client(self):
        """Initialize ChromaDB client."""
        try:
            # Connect to ChromaDB server (newer version)
            self.client = chromadb.HttpClient(
                host=settings.chroma_host,
                port=settings.chroma_port
            )
            
            # Test connection
            self.client.heartbeat()
            logger.info(f"Connected to ChromaDB at {settings.chroma_host}:{settings.chroma_port}")
            
            # Get or create collection
            collection_name = getattr(settings, 'chroma_collection', 'learning_documents')
            
            try:
                self.collection = self.client.get_collection(name=collection_name)
                logger.info(f"Connected to existing collection: {collection_name}")
            except Exception:
                # Create new collection with cosine similarity
                self.collection = self.client.create_collection(
                    name=collection_name,
                    metadata={"hnsw:space": "cosine"}
                )
                logger.info(f"Created new collection: {collection_name}")
                
        except Exception as e:
            logger.error(f"Failed to initialize ChromaDB client: {e}")
            raise
    
    def _init_embedding_model(self):
        """Initialize sentence transformer model for embeddings."""
        try:
            model_name = getattr(
                settings, 
                'embedding_model', 
                'sentence-transformers/all-MiniLM-L6-v2'
            )
            self.embedding_model = SentenceTransformer(model_name)
            logger.info(f"Loaded embedding model: {model_name}")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            raise
    
    def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for a list of texts.
        
        Args:
            texts: List of text strings to embed
            
        Returns:
            List of embedding vectors
        """
        try:
            embeddings = self.embedding_model.encode(
                texts,
                convert_to_numpy=True,
                show_progress_bar=False
            )
            return embeddings.tolist()
        except Exception as e:
            logger.error(f"Error generating embeddings: {e}")
            raise
    
    async def add_document_chunks(
        self,
        document_id: str,
        chunks: List[str],
        metadata: Dict[str, Any]
    ) -> int:
        """
        Add document chunks to the vector store.
        
        Args:
            document_id: Unique document identifier
            chunks: List of text chunks from the document
            metadata: Document metadata (title, user_id, file_type, etc.)
            
        Returns:
            Number of chunks added
        """
        if not chunks:
            logger.warning(f"No chunks to add for document {document_id}")
            return 0
        
        try:
            # Generate unique IDs for each chunk
            chunk_ids = [
                f"{document_id}_chunk_{i}" 
                for i in range(len(chunks))
            ]
            
            # Prepare metadata for each chunk
            chunk_metadata = []
            for i, chunk in enumerate(chunks):
                meta = {
                    "document_id": document_id,
                    "chunk_index": i,
                    "chunk_count": len(chunks),
                    "text_length": len(chunk),
                    "created_at": datetime.utcnow().isoformat(),
                    **metadata  # Include document metadata
                }
                chunk_metadata.append(meta)
            
            # Generate embeddings
            logger.info(f"Generating embeddings for {len(chunks)} chunks...")
            embeddings = self.generate_embeddings(chunks)
            
            # Add to ChromaDB in batches (ChromaDB recommends batch size of 100-1000)
            batch_size = 100
            total_added = 0
            
            for i in range(0, len(chunks), batch_size):
                batch_end = min(i + batch_size, len(chunks))
                
                self.collection.add(
                    ids=chunk_ids[i:batch_end],
                    embeddings=embeddings[i:batch_end],
                    documents=chunks[i:batch_end],
                    metadatas=chunk_metadata[i:batch_end]
                )
                
                total_added += (batch_end - i)
                logger.info(f"Added batch {i//batch_size + 1}: {total_added}/{len(chunks)} chunks")
            
            logger.info(f"Successfully added {total_added} chunks for document {document_id}")
            return total_added
            
        except Exception as e:
            logger.error(f"Error adding document chunks: {e}")
            raise
    
    async def search(
        self,
        query: str,
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None,
        similarity_threshold: float = 0.0
    ) -> List[Dict[str, Any]]:
        """
        Perform semantic search across all documents.
        
        Args:
            query: Search query text
            top_k: Number of results to return
            filters: Metadata filters (e.g., {"user_id": "123", "file_type": "pdf"})
            similarity_threshold: Minimum similarity score (0-1)
            
        Returns:
            List of search results with chunks, scores, and metadata
        """
        try:
            # Generate query embedding
            query_embedding = self.generate_embeddings([query])[0]
            
            # Prepare where clause for filtering
            where_clause = filters if filters else None
            
            # Search in ChromaDB
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k,
                where=where_clause,
                include=["documents", "metadatas", "distances"]
            )
            
            # Format results
            formatted_results = []
            
            if results and results['ids'] and len(results['ids'][0]) > 0:
                for i in range(len(results['ids'][0])):
                    # Convert distance to similarity score (cosine distance -> similarity)
                    distance = results['distances'][0][i]
                    similarity_score = 1 - distance  # Cosine similarity
                    
                    # Apply threshold filter
                    if similarity_score < similarity_threshold:
                        continue
                    
                    result = {
                        "chunk_id": results['ids'][0][i],
                        "text": results['documents'][0][i],
                        "content": results['documents'][0][i], # Alias for frontend
                        "metadata": results['metadatas'][0][i],
                        "similarity_score": round(similarity_score, 4),
                        "score": round(similarity_score, 4), # Alias for frontend
                        "distance": round(distance, 4)
                    }
                    formatted_results.append(result)
            
            logger.info(f"Search returned {len(formatted_results)} results for query: {query[:50]}...")
            return formatted_results
            
        except Exception as e:
            logger.error(f"Error performing search: {e}")
            raise
    
    async def search_by_document(
        self,
        document_id: str,
        query: str,
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Search within a specific document.
        
        Args:
            document_id: Document to search within
            query: Search query
            top_k: Number of results
            
        Returns:
            List of relevant chunks from the document
        """
        filters = {"document_id": document_id}
        return await self.search(query, top_k=top_k, filters=filters)
    
    async def get_similar_chunks(
        self,
        chunk_text: str,
        top_k: int = 5,
        exclude_document_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Find similar chunks across all documents.
        
        Args:
            chunk_text: Reference chunk text
            top_k: Number of similar chunks to return
            exclude_document_id: Optional document ID to exclude from results
            
        Returns:
            List of similar chunks
        """
        results = await self.search(chunk_text, top_k=top_k * 2)
        
        # Filter out chunks from excluded document
        if exclude_document_id:
            results = [
                r for r in results 
                if r['metadata'].get('document_id') != exclude_document_id
            ]
        
        return results[:top_k]
    
    async def delete_document(self, document_id: str) -> bool:
        """
        Delete all chunks for a document from the vector store.
        
        Args:
            document_id: Document ID to delete
            
        Returns:
            True if successful
        """
        try:
            # Get all chunk IDs for this document
            results = self.collection.get(
                where={"document_id": document_id},
                include=[]
            )
            
            if results and results['ids']:
                chunk_ids = results['ids']
                self.collection.delete(ids=chunk_ids)
                logger.info(f"Deleted {len(chunk_ids)} chunks for document {document_id}")
                return True
            else:
                logger.warning(f"No chunks found for document {document_id}")
                return False
                
        except Exception as e:
            logger.error(f"Error deleting document chunks: {e}")
            raise
    
    async def get_document_chunks(
        self,
        document_id: str
    ) -> List[Dict[str, Any]]:
        """
        Retrieve all chunks for a specific document.
        
        Args:
            document_id: Document ID
            
        Returns:
            List of chunks with metadata
        """
        try:
            results = self.collection.get(
                where={"document_id": document_id},
                include=["documents", "metadatas"]
            )
            
            chunks = []
            if results and results['ids']:
                for i in range(len(results['ids'])):
                    chunk = {
                        "chunk_id": results['ids'][i],
                        "text": results['documents'][i],
                        "metadata": results['metadatas'][i]
                    }
                    chunks.append(chunk)
            
            # Sort by chunk_index
            chunks.sort(key=lambda x: x['metadata'].get('chunk_index', 0))
            return chunks
            
        except Exception as e:
            logger.error(f"Error retrieving document chunks: {e}")
            raise
    
    def get_collection_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the vector store collection.
        
        Returns:
            Dictionary with collection statistics
        """
        try:
            count = self.collection.count()
            return {
                "total_chunks": count,
                "collection_name": self.collection.name,
                "embedding_model": getattr(settings, 'embedding_model', 'all-MiniLM-L6-v2')
            }
        except Exception as e:
            logger.error(f"Error getting collection stats: {e}")
            return {"error": str(e)}
    
    async def update_document_chunks(
        self,
        document_id: str,
        chunks: List[str],
        metadata: Dict[str, Any]
    ) -> int:
        """
        Update document chunks (delete old, add new).
        
        Args:
            document_id: Document ID
            chunks: New chunks
            metadata: Updated metadata
            
        Returns:
            Number of chunks added
        """
        # Delete existing chunks
        await self.delete_document(document_id)
        
        # Add new chunks
        return await self.add_document_chunks(document_id, chunks, metadata)


# Global instance
_vector_store_instance = None


def get_vector_store() -> VectorStore:
    """
    Get or create the global VectorStore instance.
    
    Returns:
        VectorStore instance
    """
    global _vector_store_instance
    
    if _vector_store_instance is None:
        _vector_store_instance = VectorStore()
    
    return _vector_store_instance
