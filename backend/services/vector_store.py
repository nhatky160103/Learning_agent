"""
Vector Store Service - Elasticsearch Implementation
Hybrid Search: native BM25 + kNN (HNSW) + native RRF
với Cross-encoder Reranking và MMR diversity
"""

import logging
import re
from typing import List, Dict, Optional, Any
from datetime import datetime

import numpy as np
from elasticsearch import AsyncElasticsearch, NotFoundError
from elasticsearch.helpers import async_bulk
from sentence_transformers import SentenceTransformer, CrossEncoder

from config import settings

logger = logging.getLogger(__name__)

# Số chiều của embedding model all-MiniLM-L6-v2
EMBEDDING_DIMS = 384

# Mapping cho Elasticsearch index
INDEX_MAPPINGS = {
    "mappings": {
        "properties": {
            "document_id":  {"type": "keyword"},
            "user_id":      {"type": "keyword"},
            "chunk_index":  {"type": "integer"},
            "chunk_count":  {"type": "integer"},
            "text_length":  {"type": "integer"},
            "created_at":   {"type": "date"},
            # Full-text field - ES dùng BM25 thật để tìm kiếm
            "text": {
                "type": "text",
                "analyzer": "standard"
            },
            # Dense vector field - ES dùng HNSW để kNN search
            "embedding": {
                "type": "dense_vector",
                "dims": EMBEDDING_DIMS,
                "index": True,
                "similarity": "cosine",
                "index_options": {
                    "type": "hnsw",
                    "m": 16,
                    "ef_construction": 100
                }
            }
        }
    },
    "settings": {
        "number_of_shards": 1,
        "number_of_replicas": 0
    }
}


class VectorStore:
    """
    Vector store dùng Elasticsearch:
    - kNN semantic search (HNSW index, cosine similarity)
    - BM25 keyword search 
    - Hybrid search với native RRF (Reciprocal Rank Fusion)
    - Cross-encoder reranking
    - MMR (Maximal Marginal Relevance) để giảm trùng lặp
    - Multi-query retrieval
    """

    def __init__(self):
        self.es: Optional[AsyncElasticsearch] = None
        self.index_name: str = ""
        self.embedding_model: Optional[SentenceTransformer] = None
        self.reranker: Optional[CrossEncoder] = None
        self._index_ready: bool = False

        self._init_es_client()
        self._init_embedding_model()
        self._init_reranker()

    def _init_es_client(self):
        """Khởi tạo AsyncElasticsearch client (kết nối lazy - thực sự kết nối khi gọi request đầu tiên)."""
        try:
            self.index_name = settings.es_index_name

            # Build connection params
            # Dùng https nếu có ca_cert (local WSL2), http nếu không có (Docker/Railway)
            scheme = "https" if settings.es_ca_cert else "http"

            conn_kwargs = {
                "hosts": [f"{scheme}://{settings.es_host}:{settings.es_port}"],
                "basic_auth": (settings.es_username, settings.es_password),
                "verify_certs": bool(settings.es_ca_cert),
            }

            if settings.es_ca_cert:
                conn_kwargs["ca_certs"] = settings.es_ca_cert

            self.es = AsyncElasticsearch(**conn_kwargs)
            logger.info(f"Elasticsearch client initialized → {settings.es_host}:{settings.es_port}, index='{self.index_name}'")

        except Exception as e:
            logger.error(f"Failed to initialize Elasticsearch client: {e}")
            raise

    def _init_embedding_model(self):
        """Load SentenceTransformer embedding model."""
        try:
            model_name = getattr(settings, "embedding_model", "sentence-transformers/all-MiniLM-L6-v2")
            self.embedding_model = SentenceTransformer(model_name)
            logger.info(f"Loaded embedding model: {model_name}")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            raise

    def _init_reranker(self):
        """Load cross-encoder reranker (optional)."""
        try:
            reranker_model = getattr(settings, "reranker_model", "cross-encoder/ms-marco-MiniLM-L-6-v2")
            self.reranker = CrossEncoder(reranker_model)
            logger.info(f"Loaded reranker: {reranker_model}")
        except Exception as e:
            logger.warning(f"Reranker not available (optional): {e}")
            self.reranker = None

    # ─── Index Management ─────────────────────────────────────────────────────

    async def _ensure_index(self):
        """Tạo index nếu chưa tồn tại."""
        if self._index_ready:
            return
        try:
            exists = await self.es.indices.exists(index=self.index_name)
            if not exists:
                await self.es.indices.create(index=self.index_name, body=INDEX_MAPPINGS)
                logger.info(f"Created Elasticsearch index: '{self.index_name}'")
            else:
                logger.info(f"Connected to existing index: '{self.index_name}'")
            self._index_ready = True
        except Exception as e:
            logger.error(f"Failed to ensure index: {e}")
            raise

    # ─── Embeddings ───────────────────────────────────────────────────────────

    def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        embeddings = self.embedding_model.encode(
            texts,
            convert_to_numpy=True,
            show_progress_bar=False,
            batch_size=32
        )
        return embeddings.tolist()

    # ─── CRUD Operations ──────────────────────────────────────────────────────

    async def add_document_chunks(
        self,
        document_id: str,
        chunks: List[str],
        metadata: Dict[str, Any],
        per_chunk_metadata: List[Dict] = None
    ) -> int:
        """
        Index document chunks vào Elasticsearch.
        Dùng bulk API để tăng hiệu năng.
        """
        if not chunks:
            return 0

        await self._ensure_index()

        try:
            logger.info(f"Generating embeddings for {len(chunks)} chunks...")
            embeddings = self.generate_embeddings(chunks)

            now = datetime.utcnow().isoformat()

            # Chuẩn bị bulk actions
            actions = []
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                base_meta = per_chunk_metadata[i] if per_chunk_metadata else metadata
                doc = {
                    "_index": self.index_name,
                    "_id": f"{document_id}_chunk_{i}",
                    "_source": {
                        "document_id": document_id,
                        "chunk_index": i,
                        "chunk_count": len(chunks),
                        "text": chunk,
                        "text_length": len(chunk),
                        "created_at": now,
                        "embedding": embedding,
                        **{k: str(v) if v is not None else "" for k, v in base_meta.items()}
                    }
                }
                actions.append(doc)

            # Bulk index
            success, errors = await async_bulk(self.es, actions, chunk_size=100, raise_on_error=False)

            if errors:
                logger.warning(f"Bulk index had {len(errors)} errors for document {document_id}")

            logger.info(f"Indexed {success} chunks for document {document_id}")
            return success

        except Exception as e:
            logger.error(f"Error adding document chunks: {e}")
            raise

    async def delete_document(self, document_id: str) -> bool:
        """Xóa tất cả chunks của một document."""
        await self._ensure_index()
        try:
            response = await self.es.delete_by_query(
                index=self.index_name,
                body={"query": {"term": {"document_id": document_id}}},
                refresh=True
            )
            deleted = response.get("deleted", 0)
            if deleted > 0:
                logger.info(f"Deleted {deleted} chunks for document {document_id}")
                return True
            return False
        except Exception as e:
            logger.error(f"Error deleting document: {e}")
            raise

    async def update_document_chunks(
        self,
        document_id: str,
        chunks: List[str],
        metadata: Dict[str, Any]
    ) -> int:
        """Xóa cũ rồi index lại."""
        await self.delete_document(document_id)
        return await self.add_document_chunks(document_id, chunks, metadata)

    async def get_document_chunks(self, document_id: str) -> List[Dict[str, Any]]:
        """Lấy tất cả chunks của một document theo thứ tự."""
        await self._ensure_index()
        try:
            response = await self.es.search(
                index=self.index_name,
                body={
                    "query": {"term": {"document_id": document_id}},
                    "sort": [{"chunk_index": "asc"}],
                    "size": 10000,
                    "_source": {"excludes": ["embedding"]}
                }
            )
            chunks = []
            for hit in response["hits"]["hits"]:
                src = hit["_source"]
                chunks.append({
                    "chunk_id": hit["_id"],
                    "text": src.get("text", ""),
                    "metadata": {k: v for k, v in src.items() if k != "text"}
                })
            return chunks
        except Exception as e:
            logger.error(f"Error retrieving document chunks: {e}")
            raise

    # ─── Search Operations ────────────────────────────────────────────────────

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
        Semantic search thuần (kNN với HNSW index).
        Dùng khi cần tốc độ cao, không cần hybrid.
        """
        await self._ensure_index()
        try:
            fetch_k = min(top_k * 3, 50) if (use_reranking and self.reranker) else top_k
            query_vector = self.generate_embeddings([query])[0]

            knn_body = {
                "field": "embedding",
                "query_vector": query_vector,
                "k": fetch_k,
                "num_candidates": fetch_k * 5,
            }
            filter_clauses = self._build_filter(filters)
            if filter_clauses:
                knn_body["filter"] = {"bool": {"must": filter_clauses}}

            response = await self.es.search(
                index=self.index_name,
                body={
                    "knn": knn_body,
                    "size": fetch_k,
                    "_source": {"excludes": ["embedding"]}
                }
            )

            results = self._parse_hits(response["hits"]["hits"], score_field="_score")

            # Filter theo similarity threshold
            if similarity_threshold > 0:
                results = [r for r in results if r["similarity_score"] >= similarity_threshold]

            # Reranking với cross-encoder
            if use_reranking and self.reranker and len(results) > top_k:
                results = self._rerank(query, results, top_k)

            # MMR để đa dạng hóa kết quả
            if use_mmr and len(results) > top_k:
                results = self._mmr_select(query, results, top_k, mmr_diversity)

            return results[:top_k]

        except Exception as e:
            logger.error(f"Error performing kNN search: {e}")
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
        Hybrid search dùng ES native RRF (Reciprocal Rank Fusion).
        Kết hợp BM25 thật + kNN vector search.

        Đây là điểm mạnh nhất của Elasticsearch so với ChromaDB:
        - BM25 native (không phải fake keyword search)
        - RRF native (không cần tự implement)
        - Chạy hoàn toàn trong ES, không cần Python merge
        """
        await self._ensure_index()
        try:
            query_vector = self.generate_embeddings([query])[0]
            filter_clauses = self._build_filter(filters)
            rank_window = min(top_k * 6, 100)

            fetch_size = min(top_k * 3, 50) if (use_reranking and self.reranker) else top_k

            # 1. BM25 search
            bm25_body = {
                "query": self._build_bm25_query(query, filter_clauses),
                "size": rank_window,
                "_source": {"excludes": ["embedding"]}
            }
            bm25_resp = await self.es.search(index=self.index_name, body=bm25_body)

            # 2. kNN search
            knn_body_inner = {
                "field": "embedding",
                "query_vector": query_vector,
                "k": rank_window,
                "num_candidates": rank_window * 3,
            }
            if filter_clauses:
                knn_body_inner["filter"] = {"bool": {"must": filter_clauses}}
            knn_resp = await self.es.search(
                index=self.index_name,
                body={"knn": knn_body_inner, "size": rank_window, "_source": {"excludes": ["embedding"]}}
            )

            # 3. Manual RRF merge
            rank_constant = 60
            rrf_scores: Dict[str, float] = {}
            rrf_docs: Dict[str, Dict] = {}

            for rank, hit in enumerate(bm25_resp["hits"]["hits"], start=1):
                doc_id = hit["_id"]
                rrf_scores[doc_id] = rrf_scores.get(doc_id, 0) + 1 / (rank_constant + rank)
                rrf_docs[doc_id] = hit

            for rank, hit in enumerate(knn_resp["hits"]["hits"], start=1):
                doc_id = hit["_id"]
                rrf_scores[doc_id] = rrf_scores.get(doc_id, 0) + 1 / (rank_constant + rank)
                if doc_id not in rrf_docs:
                    rrf_docs[doc_id] = hit

            # Sort by RRF score
            sorted_ids = sorted(rrf_scores, key=lambda x: rrf_scores[x], reverse=True)
            merged_hits = []
            for doc_id in sorted_ids[:fetch_size]:
                hit = rrf_docs[doc_id]
                hit["_score"] = rrf_scores[doc_id]
                merged_hits.append(hit)

            response = {"hits": {"hits": merged_hits}}

            results = self._parse_hits(response["hits"]["hits"], score_field="_score")

            # Rerank top results với cross-encoder
            if use_reranking and self.reranker and len(results) > top_k:
                results = self._rerank(query, results, top_k)

            return results[:top_k]

        except Exception as e:
            logger.error(f"Hybrid search error: {e}")
            logger.warning("Falling back to semantic search")
            return await self.search(query, top_k, filters)

    async def multi_query_search(
        self,
        query: str,
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Multi-query retrieval: tạo nhiều query variations, merge kết quả.
        Giúp tìm được thông tin mà single query bỏ sót.
        """
        await self._ensure_index()

        query_variations = self._generate_query_variations(query)

        all_results: Dict[str, Dict] = {}
        for q in query_variations:
            try:
                results = await self.hybrid_search(
                    q, top_k=top_k, filters=filters, use_reranking=False
                )
                for r in results:
                    chunk_id = r["chunk_id"]
                    if chunk_id not in all_results:
                        all_results[chunk_id] = r
                    else:
                        # Boost score nếu xuất hiện ở nhiều queries
                        all_results[chunk_id]["score"] = min(
                            1.0, all_results[chunk_id]["score"] + 0.05
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
            results = [r for r in results if r["metadata"].get("document_id") != exclude_document_id]
        return results[:top_k]

    def get_collection_stats(self) -> Dict[str, Any]:
        """Trả về thống kê cơ bản (sync)."""
        return {
            "index_name": self.index_name,
            "es_host": f"{settings.es_host}:{settings.es_port}",
            "embedding_model": getattr(settings, "embedding_model", "all-MiniLM-L6-v2"),
            "reranker_available": self.reranker is not None
        }

    async def get_index_stats(self) -> Dict[str, Any]:
        """Lấy thống kê chi tiết từ ES (async)."""
        await self._ensure_index()
        try:
            stats = await self.es.indices.stats(index=self.index_name)
            count_resp = await self.es.count(index=self.index_name)
            return {
                "total_chunks": count_resp["count"],
                "index_name": self.index_name,
                "index_size_bytes": stats["indices"][self.index_name]["total"]["store"]["size_in_bytes"],
                "embedding_model": getattr(settings, "embedding_model", "all-MiniLM-L6-v2"),
                "reranker_available": self.reranker is not None
            }
        except Exception as e:
            return {"error": str(e)}

    # ─── Private Helpers ──────────────────────────────────────────────────────

    def _build_filter(self, filters: Optional[Dict[str, Any]]) -> List[Dict]:
        """Convert filters dict → ES term clauses."""
        if not filters:
            return []
        return [{"term": {field: str(value)}} for field, value in filters.items()]

    def _build_bm25_query(self, query: str, filter_clauses: List[Dict]) -> Dict:
        """Xây dựng BM25 bool query với optional filter."""
        if filter_clauses:
            return {
                "bool": {
                    "must": [{"match": {"text": {"query": query}}}],
                    "filter": filter_clauses
                }
            }
        return {"match": {"text": {"query": query}}}

    def _parse_hits(self, hits: List[Dict], score_field: str = "_score") -> List[Dict[str, Any]]:
        """Parse ES hits thành format thống nhất."""
        results = []
        for hit in hits:
            src = hit.get("_source", {})
            score = hit.get(score_field, 0.0) or 0.0
            results.append({
                "chunk_id": hit["_id"],
                "text": src.get("text", ""),
                "content": src.get("text", ""),
                "metadata": {k: v for k, v in src.items() if k != "text"},
                "similarity_score": round(float(score), 4),
                "score": round(float(score), 4),
            })
        return results

    def _rerank(self, query: str, results: List[Dict], top_k: int) -> List[Dict]:
        """Cross-encoder reranking để cải thiện độ chính xác."""
        try:
            pairs = [(query, r["text"]) for r in results]
            scores = self.reranker.predict(pairs)
            for result, score in zip(results, scores):
                result["rerank_score"] = float(score)
                result["score"] = float(score)
                result["similarity_score"] = float(score)
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

        first = max(remaining, key=lambda i: results[i]["score"])
        selected_indices.append(first)
        remaining.remove(first)

        while len(selected_indices) < top_k and remaining:
            mmr_scores = []
            for i in remaining:
                rel = float(
                    np.dot(query_emb, doc_embs[i]) /
                    (np.linalg.norm(query_emb) * np.linalg.norm(doc_embs[i]) + 1e-9)
                )
                sim_selected = max(
                    float(
                        np.dot(doc_embs[i], doc_embs[j]) /
                        (np.linalg.norm(doc_embs[i]) * np.linalg.norm(doc_embs[j]) + 1e-9)
                    )
                    for j in selected_indices
                )
                mmr = (1 - diversity) * rel - diversity * sim_selected
                mmr_scores.append((i, mmr))

            best = max(mmr_scores, key=lambda x: x[1])[0]
            selected_indices.append(best)
            remaining.remove(best)

        return [results[i] for i in selected_indices]

    def _generate_query_variations(self, query: str) -> List[str]:
        """Tạo query variations cho multi-query retrieval."""
        variations = [query]

        words = query.split()
        if len(words) > 5:
            stopwords = {
                "what", "is", "are", "how", "does", "do", "the", "a", "an",
                "in", "of", "to", "for", "and", "or", "can", "tell", "me", "about"
            }
            keywords = [w for w in words if w.lower() not in stopwords]
            if keywords:
                variations.append(" ".join(keywords))

        if query.lower().startswith(("what is", "what are")):
            statement = re.sub(r"^what (is|are)\s+", "", query, flags=re.IGNORECASE)
            variations.append(statement)
        elif query.lower().startswith("how"):
            variations.append(re.sub(r"^how\s+", "", query, flags=re.IGNORECASE))

        return list(dict.fromkeys(variations))  # deduplicate giữ thứ tự


# ─── Singleton ────────────────────────────────────────────────────────────────

_vector_store_instance: Optional[VectorStore] = None


def get_vector_store() -> VectorStore:
    global _vector_store_instance
    if _vector_store_instance is None:
        _vector_store_instance = VectorStore()
    return _vector_store_instance
