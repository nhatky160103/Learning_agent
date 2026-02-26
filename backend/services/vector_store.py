"""
Vector Store Service - Nâng cấp với Hybrid Search & Reranking
"""

import logging
import re
from typing import List, Dict, Optional, Any, Tuple
from datetime import datetime
import chromadb
from sentence_transformers import SentenceTransformer, CrossEncoder
import numpy as np

from config import settings

logger = logging.getLogger(__name__)


class VectorStore:
    """
    Vector store nâng cấp:
    - Hybrid search: semantic + BM25 keyword
    - Cross-encoder reranking
    - Query expansion
    - MMR (Maximal Marginal Relevance) để giảm trùng lặp
    - Per-chunk metadata
    """

    def __init__(self):
        self.client = None
        self.collection = None
        self.embedding_model = None
        self.reranker = None
        self._init_client()
        self._init_embedding_model()
        self._init_reranker()

    def _init_client(self):
        try:
            self.client = chromadb.HttpClient(
                host=settings.chroma_host,
                port=settings.chroma_port
            )
            self.client.heartbeat()
            logger.info(f"Connected to ChromaDB at {settings.chroma_host}:{settings.chroma_port}")

            collection_name = getattr(settings, 'chroma_collection', 'learning_documents')
            try:
                self.collection = self.client.get_collection(name=collection_name)
                logger.info(f"Connected to existing collection: {collection_name}")
            except Exception:
                self.collection = self.client.create_collection(
                    name=collection_name,
                    metadata={"hnsw:space": "cosine"}
                )
                logger.info(f"Created new collection: {collection_name}")
        except Exception as e:
            logger.error(f"Failed to initialize ChromaDB: {e}")
            raise

    def _init_embedding_model(self):
        try:
            model_name = getattr(settings, 'embedding_model', 'sentence-transformers/all-MiniLM-L6-v2')
            self.embedding_model = SentenceTransformer(model_name)
            logger.info(f"Loaded embedding model: {model_name}")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            raise

    def _init_reranker(self):
        """Load cross-encoder reranker nếu có."""
        try:
            reranker_model = getattr(settings, 'reranker_model', 'cross-encoder/ms-marco-MiniLM-L-6-v2')
            self.reranker = CrossEncoder(reranker_model)
            logger.info(f"Loaded reranker: {reranker_model}")
        except Exception as e:
            logger.warning(f"Reranker not available (optional): {e}")
            self.reranker = None

    def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        embeddings = self.embedding_model.encode(
            texts,
            convert_to_numpy=True,
            show_progress_bar=False,
            batch_size=32
        )
        return embeddings.tolist()

    async def add_document_chunks(
        self,
        document_id: str,
        chunks: List[str],
        metadata: Dict[str, Any],
        per_chunk_metadata: List[Dict] = None
    ) -> int:
        """Thêm chunks với per-chunk metadata."""
        if not chunks:
            return 0

        try:
            chunk_ids = [f"{document_id}_chunk_{i}" for i in range(len(chunks))]

            chunk_metadata = []
            for i, chunk in enumerate(chunks):
                base_meta = per_chunk_metadata[i] if per_chunk_metadata else metadata
                meta = {
                    "document_id": document_id,
                    "chunk_index": i,
                    "chunk_count": len(chunks),
                    "text_length": len(chunk),
                    "created_at": datetime.utcnow().isoformat(),
                    **{k: str(v) if v is not None else "" for k, v in base_meta.items()}
                }
                chunk_metadata.append(meta)

            logger.info(f"Generating embeddings for {len(chunks)} chunks...")
            embeddings = self.generate_embeddings(chunks)

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

            logger.info(f"Added {total_added} chunks for document {document_id}")
            return total_added
        except Exception as e:
            logger.error(f"Error adding document chunks: {e}")
            raise

    async def search(
        self,
        query: str,
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None,
        similarity_threshold: float = 0.0,
        use_reranking: bool = True,
        use_mmr: bool = False,
        mmr_diversity: float = 0.3
    ) -> List[Dict[str, Any]]:
        """
        Semantic search với optional reranking và MMR.
        """
        try:
            # Lấy nhiều hơn để rerank
            fetch_k = min(top_k * 3, 20) if (use_reranking and self.reranker) else top_k

            query_embedding = self.generate_embeddings([query])[0]
            where_clause = filters if filters else None

            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=fetch_k,
                where=where_clause,
                include=["documents", "metadatas", "distances"]
            )

            if not results or not results['ids'] or not results['ids'][0]:
                return []

            formatted = []
            for i in range(len(results['ids'][0])):
                distance = results['distances'][0][i]
                similarity = 1 - distance

                if similarity < similarity_threshold:
                    continue

                formatted.append({
                    "chunk_id": results['ids'][0][i],
                    "text": results['documents'][0][i],
                    "content": results['documents'][0][i],
                    "metadata": results['metadatas'][0][i],
                    "similarity_score": round(similarity, 4),
                    "score": round(similarity, 4),
                    "distance": round(distance, 4)
                })

            # Reranking với cross-encoder
            if use_reranking and self.reranker and len(formatted) > top_k:
                formatted = self._rerank(query, formatted, top_k)
            
            # MMR để đa dạng hóa kết quả
            if use_mmr and len(formatted) > top_k:
                formatted = self._mmr_select(query, formatted, top_k, mmr_diversity)

            return formatted[:top_k]

        except Exception as e:
            logger.error(f"Error performing search: {e}")
            raise

    async def hybrid_search(
        self,
        query: str,
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None,
        semantic_weight: float = 0.7,
        keyword_weight: float = 0.3,
        use_reranking: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Hybrid search: kết hợp semantic search và BM25 keyword search.
        semantic_weight + keyword_weight = 1.0
        """
        try:
            fetch_k = min(top_k * 4, 30)

            # 1. Semantic search
            semantic_results = await self.search(
                query=query,
                top_k=fetch_k,
                filters=filters,
                similarity_threshold=0.0,
                use_reranking=False,
                use_mmr=False
            )

            # 2. BM25 keyword search (approximate với ChromaDB where contains)
            keyword_results = await self._keyword_search(query, fetch_k, filters)

            # 3. Reciprocal Rank Fusion
            fused = self._reciprocal_rank_fusion(
                [semantic_results, keyword_results],
                [semantic_weight, keyword_weight]
            )

            # 4. Rerank top results
            if use_reranking and self.reranker and len(fused) > top_k:
                fused = self._rerank(query, fused, top_k)

            return fused[:top_k]

        except Exception as e:
            logger.error(f"Hybrid search error: {e}")
            # Fallback về semantic search
            return await self.search(query, top_k, filters)

    async def multi_query_search(
        self,
        query: str,
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Multi-query retrieval: generate nhiều biến thể query, merge kết quả.
        Giúp tìm được thông tin mà single query bỏ sót.
        """
        # Tạo query variations đơn giản (không cần LLM)
        query_variations = self._generate_query_variations(query)

        all_results = {}
        for q in query_variations:
            try:
                results = await self.search(q, top_k=top_k, filters=filters, use_reranking=False)
                for r in results:
                    chunk_id = r["chunk_id"]
                    if chunk_id not in all_results:
                        all_results[chunk_id] = r
                    else:
                        # Boost score nếu xuất hiện ở nhiều queries
                        all_results[chunk_id]["score"] = min(
                            1.0,
                            all_results[chunk_id]["score"] + 0.05
                        )
            except Exception:
                continue

        merged = sorted(all_results.values(), key=lambda x: x["score"], reverse=True)

        # Final rerank
        if self.reranker and len(merged) > top_k:
            merged = self._rerank(query, merged, top_k)

        return merged[:top_k]

    async def search_by_document(
        self,
        document_id: str,
        query: str,
        top_k: int = 5,
        use_hybrid: bool = True
    ) -> List[Dict[str, Any]]:
        """Search trong một tài liệu cụ thể."""
        filters = {"document_id": document_id}
        if use_hybrid:
            return await self.hybrid_search(query, top_k=top_k, filters=filters)
        return await self.search(query, top_k=top_k, filters=filters)

    async def get_similar_chunks(
        self,
        chunk_text: str,
        top_k: int = 5,
        exclude_document_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        results = await self.search(chunk_text, top_k=top_k * 2)
        if exclude_document_id:
            results = [r for r in results if r['metadata'].get('document_id') != exclude_document_id]
        return results[:top_k]

    async def delete_document(self, document_id: str) -> bool:
        try:
            results = self.collection.get(
                where={"document_id": document_id},
                include=[]
            )
            if results and results['ids']:
                self.collection.delete(ids=results['ids'])
                logger.info(f"Deleted {len(results['ids'])} chunks for document {document_id}")
                return True
            return False
        except Exception as e:
            logger.error(f"Error deleting document: {e}")
            raise

    async def get_document_chunks(self, document_id: str) -> List[Dict[str, Any]]:
        try:
            results = self.collection.get(
                where={"document_id": document_id},
                include=["documents", "metadatas"]
            )
            chunks = []
            if results and results['ids']:
                for i in range(len(results['ids'])):
                    chunks.append({
                        "chunk_id": results['ids'][i],
                        "text": results['documents'][i],
                        "metadata": results['metadatas'][i]
                    })
            chunks.sort(key=lambda x: x['metadata'].get('chunk_index', 0))
            return chunks
        except Exception as e:
            logger.error(f"Error retrieving document chunks: {e}")
            raise

    def get_collection_stats(self) -> Dict[str, Any]:
        try:
            count = self.collection.count()
            return {
                "total_chunks": count,
                "collection_name": self.collection.name,
                "embedding_model": getattr(settings, 'embedding_model', 'all-MiniLM-L6-v2'),
                "reranker_available": self.reranker is not None
            }
        except Exception as e:
            return {"error": str(e)}

    async def update_document_chunks(
        self,
        document_id: str,
        chunks: List[str],
        metadata: Dict[str, Any]
    ) -> int:
        await self.delete_document(document_id)
        return await self.add_document_chunks(document_id, chunks, metadata)

    # ─── Private helpers ─────────────────────────────────────────────────────

    def _rerank(self, query: str, results: List[Dict], top_k: int) -> List[Dict]:
        """Cross-encoder reranking."""
        try:
            pairs = [(query, r["text"]) for r in results]
            scores = self.reranker.predict(pairs)
            for result, score in zip(results, scores):
                result["rerank_score"] = float(score)
                result["score"] = float(score)
            results.sort(key=lambda x: x.get("rerank_score", 0), reverse=True)
            return results[:top_k]
        except Exception as e:
            logger.warning(f"Reranking failed, using original order: {e}")
            return results[:top_k]

    def _mmr_select(
        self,
        query: str,
        results: List[Dict],
        top_k: int,
        diversity: float = 0.3
    ) -> List[Dict]:
        """
        Maximal Marginal Relevance: cân bằng relevance và diversity.
        diversity: 0=pure relevance, 1=pure diversity
        """
        if len(results) <= top_k:
            return results

        query_emb = np.array(self.generate_embeddings([query])[0])
        doc_embs = np.array(self.generate_embeddings([r["text"] for r in results]))

        selected_indices = []
        remaining = list(range(len(results)))

        # Chọn chunk đầu tiên có score cao nhất
        first = max(remaining, key=lambda i: results[i]["score"])
        selected_indices.append(first)
        remaining.remove(first)

        while len(selected_indices) < top_k and remaining:
            mmr_scores = []
            for i in remaining:
                # Relevance với query
                rel = float(np.dot(query_emb, doc_embs[i]) /
                            (np.linalg.norm(query_emb) * np.linalg.norm(doc_embs[i]) + 1e-9))
                # Max similarity với selected
                sim_selected = max(
                    float(np.dot(doc_embs[i], doc_embs[j]) /
                          (np.linalg.norm(doc_embs[i]) * np.linalg.norm(doc_embs[j]) + 1e-9))
                    for j in selected_indices
                )
                mmr = (1 - diversity) * rel - diversity * sim_selected
                mmr_scores.append((i, mmr))

            best = max(mmr_scores, key=lambda x: x[1])[0]
            selected_indices.append(best)
            remaining.remove(best)

        return [results[i] for i in selected_indices]

    async def _keyword_search(
        self,
        query: str,
        top_k: int,
        filters: Optional[Dict] = None
    ) -> List[Dict[str, Any]]:
        """
        BM25-style keyword search (approximate với ChromaDB).
        ChromaDB không hỗ trợ BM25 native, ta dùng embedding của keywords.
        """
        # Extract keywords từ query
        keywords = self._extract_keywords(query)
        if not keywords:
            return []

        keyword_query = " ".join(keywords)
        return await self.search(keyword_query, top_k=top_k, filters=filters, use_reranking=False)

    def _reciprocal_rank_fusion(
        self,
        result_lists: List[List[Dict]],
        weights: List[float],
        k: int = 60
    ) -> List[Dict]:
        """Reciprocal Rank Fusion để merge nhiều ranked lists."""
        scores: Dict[str, float] = {}
        docs: Dict[str, Dict] = {}

        for result_list, weight in zip(result_lists, weights):
            for rank, doc in enumerate(result_list):
                doc_id = doc["chunk_id"]
                rrf_score = weight / (k + rank + 1)
                scores[doc_id] = scores.get(doc_id, 0) + rrf_score
                if doc_id not in docs:
                    docs[doc_id] = doc

        sorted_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
        result = []
        for doc_id in sorted_ids:
            doc = docs[doc_id].copy()
            doc["score"] = round(scores[doc_id], 6)
            doc["similarity_score"] = doc["score"]
            result.append(doc)

        return result

    def _generate_query_variations(self, query: str) -> List[str]:
        """Tạo query variations để multi-query retrieval."""
        variations = [query]

        # Rút gọn query (lấy noun phrases chính)
        words = query.split()
        if len(words) > 5:
            # Short version: lấy các từ quan trọng
            stopwords = {'what', 'is', 'are', 'how', 'does', 'do', 'the', 'a', 'an',
                        'in', 'of', 'to', 'for', 'and', 'or', 'can', 'tell', 'me', 'about'}
            keywords = [w for w in words if w.lower() not in stopwords]
            if keywords:
                variations.append(" ".join(keywords))

        # Question to statement
        if query.lower().startswith(('what is', 'what are')):
            statement = re.sub(r'^what (is|are)\s+', '', query, flags=re.IGNORECASE)
            variations.append(statement)
        elif query.lower().startswith('how'):
            variations.append(re.sub(r'^how\s+', '', query, flags=re.IGNORECASE))

        return list(dict.fromkeys(variations))  # deduplicate

    def _extract_keywords(self, text: str) -> List[str]:
        """Extract keywords đơn giản từ query."""
        stopwords = {
            'what', 'is', 'are', 'how', 'does', 'do', 'the', 'a', 'an', 'in',
            'of', 'to', 'for', 'and', 'or', 'can', 'tell', 'me', 'about', 'explain',
            'describe', 'give', 'list', 'show', 'find', 'search', 'get', 'please'
        }
        words = re.findall(r'\b\w{3,}\b', text.lower())
        return [w for w in words if w not in stopwords]


# Global instance
_vector_store_instance = None


def get_vector_store() -> VectorStore:
    global _vector_store_instance
    if _vector_store_instance is None:
        _vector_store_instance = VectorStore()
    return _vector_store_instance
