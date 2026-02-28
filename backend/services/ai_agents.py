import json
import re
import logging
from typing import List, Dict, Optional
from config import settings
from utils.prompts import (
    CONCEPT_EXPLANATION_PROMPT, DOCUMENT_SUMMARY_PROMPT,
    CHAT_SYSTEM_PROMPT, FLASHCARD_GENERATION_PROMPT,
    DOCUMENT_REVIEW_PROMPT, CHAT_SYSTEM_PROMPT_WITH_CITATIONS
)


logger = logging.getLogger(__name__)


def _friendly_error_message(exc: Exception) -> str:
    """Convert raw API exceptions into clean, user-friendly messages."""
    msg = str(exc)

    # Rate-limit / quota errors
    if "429" in msg or "quota" in msg.lower() or "rate" in msg.lower():
        # Try to extract retry delay
        retry_match = re.search(r'retry\s*(?:in|after)?\s*([\d.]+)\s*s', msg, re.IGNORECASE)
        if retry_match:
            seconds = int(float(retry_match.group(1)))
            return f"⏳ API quota exceeded. Please wait ~{seconds}s and try again."
        return "⏳ API quota exceeded. Please wait a moment and try again."

    # Auth errors
    if "401" in msg or "403" in msg or "api key" in msg.lower():
        return "🔑 API authentication failed. Please check your API key in settings."

    # Server errors
    if "500" in msg or "502" in msg or "503" in msg:
        return "🔧 AI service is temporarily unavailable. Please try again shortly."

    # Timeout
    if "timeout" in msg.lower() or "timed out" in msg.lower():
        return "⏱️ Request timed out. Please try again with a shorter message."

    # Connection errors
    if "connection" in msg.lower():
        return "🌐 Connection error. Please check your internet and try again."

    # Generic fallback — keep it short
    return "❌ Something went wrong. Please try again."


class AIAgentOrchestrator:
    """
    Multi-agent orchestrator for AI-powered learning features.
    
    Coordinates between different specialized agents:
    - Explanation Agent: Explains concepts at various levels
    - Summary Agent: Summarizes documents
    - Chat Agent: Conversational learning assistant with RAG
    - Concept Extractor: Extracts key concepts from content
    - Document Reviewer: Deep analysis and review of uploaded documents
    """

    def __init__(self, user_id: str = None):
        self.llm = None
        self.user_id = user_id
        self.vector_store = None
        self._init_llm()
        self._init_vector_store()

    def _init_llm(self):
        """Initialize LLM client with available API."""
        is_openai_placeholder = "your_openai_api_key_here" in settings.openai_api_key

        if settings.google_api_key:
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI
                self.llm = ChatGoogleGenerativeAI(
                    model="gemini-2.5-flash",
                    google_api_key=settings.google_api_key,
                    temperature=0.7
                )
                if is_openai_placeholder:
                    return
            except Exception:
                pass

        if settings.openai_api_key and not is_openai_placeholder:
            try:
                from langchain_openai import ChatOpenAI
                self.llm = ChatOpenAI(
                    model="gpt-4o-mini",
                    api_key=settings.openai_api_key,
                    temperature=0.7
                )
            except Exception:
                pass

    def _init_vector_store(self):
        """Initialize vector store for RAG."""
        try:
            from services.vector_store import get_vector_store
            self.vector_store = get_vector_store()
        except Exception as e:
            print(f"Warning: Vector store not available for RAG: {e}")
            self.vector_store = None

    # ─── Chat ────────────────────────────────────────────────────────────────

    async def chat(
        self,
        message: str,
        context: str = "",
        history: List[Dict] = None,
        use_rag: bool = True,
        document_filters: Dict = None,
        search_mode: str = "hybrid"  # hybrid | semantic | multi_query
    ) -> Dict:
        """
        Handle a chat message with RAG.
        search_mode: hybrid (default) | semantic | multi_query
        """
        if not self.llm:
            return {
                "response": "AI service not configured. Please add your API key in the settings.",
                "sources": None,
                "suggested_actions": ["Configure API key in .env file"]
            }

        retrieved_chunks = []
        sources = []

        if use_rag and self.vector_store and self.user_id:
            try:
                retrieved_chunks = await self._retrieve_context(
                    query=message,
                    top_k=getattr(settings, 'retrieval_top_k', 7),
                    filters=document_filters,
                    search_mode=search_mode
                )
                if retrieved_chunks:
                    sources = self._format_sources(retrieved_chunks)
            except Exception as e:
                print(f"Error retrieving context: {e}")

        # Build context string với citation markers
        full_context = self._build_context_with_citations(retrieved_chunks) if retrieved_chunks else context
        if not full_context:
            full_context = "No specific documents loaded."

        # Dùng prompt có citation nếu có sources
        if retrieved_chunks:
            system_prompt = CHAT_SYSTEM_PROMPT_WITH_CITATIONS.format(context=full_context[:6000])
        else:
            system_prompt = CHAT_SYSTEM_PROMPT.format(context=full_context[:6000])

        lc_messages = self._build_lc_messages(system_prompt, history, message)

        try:
            response = await self.llm.ainvoke(lc_messages)
            suggested_actions = self._extract_actions(response.content, message)

            return {
                "response": response.content,
                "sources": sources if sources else None,
                "suggested_actions": suggested_actions
            }
        except Exception as e:
            logger.error(f"Chat error: {e}")
            return {
                "response": _friendly_error_message(e),
                "sources": None,
                "suggested_actions": None
            }

    async def chat_stream(
        self,
        message: str,
        context: str = "",
        history: List[Dict] = None,
        use_rag: bool = True,
        document_filters: Dict = None,
        search_mode: str = "hybrid"
    ):
        """Stream chat response với RAG."""
        if not self.llm:
            yield json.dumps({"type": "error", "content": "AI service not configured."}) + "\n"
            return

        retrieved_chunks = []
        sources = []

        if use_rag and self.vector_store and self.user_id:
            try:
                retrieved_chunks = await self._retrieve_context(
                    query=message,
                    top_k=getattr(settings, 'retrieval_top_k', 7),
                    filters=document_filters,
                    search_mode=search_mode
                )
                if retrieved_chunks:
                    sources = self._format_sources(retrieved_chunks)
            except Exception as e:
                print(f"Error retrieving context: {e}")

        full_context = self._build_context_with_citations(retrieved_chunks) if retrieved_chunks else context
        if not full_context:
            full_context = "No specific documents loaded."

        if retrieved_chunks:
            system_prompt = CHAT_SYSTEM_PROMPT_WITH_CITATIONS.format(context=full_context[:6000])
        else:
            system_prompt = CHAT_SYSTEM_PROMPT.format(context=full_context[:6000])

        lc_messages = self._build_lc_messages(system_prompt, history, message)

        # Yield sources trước
        if sources:
            yield json.dumps({"type": "sources", "data": sources}) + "\n"

        try:
            async for chunk in self.llm.astream(lc_messages):
                if chunk.content:
                    yield json.dumps({"type": "token", "content": chunk.content}) + "\n"
        except Exception as e:
            logger.error(f"Chat stream error: {e}")
            yield json.dumps({"type": "error", "content": _friendly_error_message(e)}) + "\n"

    # ─── Document Review ──────────────────────────────────────────────────────

    async def review_document(self, content: str, title: str = "") -> Dict:
        """
        Deep review tài liệu: phân tích cấu trúc, chất lượng, học tập.
        
        Returns:
            - overview: tổng quan
            - structure_analysis: phân tích cấu trúc
            - key_concepts: khái niệm chính
            - learning_objectives: mục tiêu học tập
            - difficulty_assessment: đánh giá độ khó
            - study_recommendations: gợi ý học tập
            - potential_quiz_topics: chủ đề có thể ra quiz
            - estimated_study_time: thời gian học ước tính
        """
        if not self.llm:
            return {"error": "AI service not configured"}

        prompt = DOCUMENT_REVIEW_PROMPT.format(
            title=title or "Untitled",
            content=content[:12000]
        )

        try:
            response = await self.llm.ainvoke(prompt)
            response_text = response.content

            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]

            return json.loads(response_text.strip())
        except Exception as e:
            return {"error": f"Failed to review document: {str(e)}"}

    async def analyze_document_gaps(self, content: str, user_weak_topics: List[str] = None) -> Dict:
        """
        Phân tích gaps trong tài liệu so với kiến thức người dùng.
        Tìm các chủ đề cần bổ sung hoặc học sâu hơn.
        """
        if not self.llm:
            return {"error": "AI service not configured"}

        weak_topics_str = ", ".join(user_weak_topics) if user_weak_topics else "not specified"

        prompt = f"""Analyze this document and identify learning gaps.

Document content:
{content[:8000]}

User's weak topics: {weak_topics_str}

Provide analysis in JSON format:
{{
  "topics_covered": ["topic1", "topic2"],
  "topics_missing": ["missing topic that should be here"],
  "depth_assessment": {{
    "shallow_topics": ["topics only briefly mentioned"],
    "deep_topics": ["topics covered in depth"]
  }},
  "prerequisite_knowledge": ["what you need to know before this"],
  "follow_up_topics": ["what to study after this"],
  "personalized_focus": ["topics to focus on based on user weaknesses"]
}}

Output only valid JSON."""

        try:
            response = await self.llm.ainvoke(prompt)
            response_text = response.content
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]
            return json.loads(response_text.strip())
        except Exception as e:
            return {"error": str(e)}

    async def generate_study_guide(self, content: str, title: str = "") -> Dict:
        """
        Tạo study guide từ tài liệu: outline, key points, mnemonics, practice questions.
        """
        if not self.llm:
            return {"error": "AI service not configured"}

        prompt = f"""Create a comprehensive study guide from this document.

Title: {title or "Document"}
Content:
{content[:10000]}

Output a study guide in JSON format:
{{
  "title": "Study Guide: {title}",
  "outline": [
    {{
      "section": "Section name",
      "key_points": ["point 1", "point 2"],
      "summary": "One sentence summary"
    }}
  ],
  "must_know_facts": ["Critical fact 1", "Critical fact 2"],
  "memory_aids": [
    {{
      "concept": "concept name",
      "mnemonic": "memory trick or acronym"
    }}
  ],
  "common_exam_questions": ["Typical question 1", "Typical question 2"],
  "quick_review_checklist": ["Can I explain X?", "Do I understand Y?"],
  "estimated_mastery_time_hours": 2
}}

Output only valid JSON."""

        try:
            response = await self.llm.ainvoke(prompt)
            response_text = response.content
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]
            return json.loads(response_text.strip())
        except Exception as e:
            return {"error": str(e)}

    # ─── Existing methods (nâng cấp) ─────────────────────────────────────────

    async def explain_concept(
        self,
        concept: str,
        level: str = "intermediate",
        context: str = "",
        use_rag: bool = True
    ) -> Dict:
        """Explain concept - thêm RAG support."""
        if not self.llm:
            return {
                "definition": f"{concept} - AI service not configured",
                "explanation": "Please configure an API key.",
                "examples": [],
                "related_concepts": []
            }

        # Nếu có vector store, tìm context liên quan
        rag_context = context
        if use_rag and self.vector_store and self.user_id and not context:
            try:
                chunks = await self._retrieve_context(concept, top_k=3)
                if chunks:
                    rag_context = "\n\n".join(c["text"] for c in chunks)
            except Exception:
                pass

        prompt = CONCEPT_EXPLANATION_PROMPT.format(
            concept=concept,
            context=rag_context[:5000] if rag_context else "No additional context provided.",
            level=level
        )

        try:
            response = await self.llm.ainvoke(prompt)
            response_text = response.content

            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]

            result = json.loads(response_text.strip())
            return {
                "definition": result.get("definition", ""),
                "explanation": result.get("explanation", ""),
                "examples": result.get("examples", []),
                "analogies": result.get("analogies", []),
                "misconceptions": result.get("misconceptions", []),
                "related_concepts": result.get("related_concepts", [])
            }
        except Exception as e:
            return {
                "definition": concept,
                "explanation": f"Unable to generate explanation: {str(e)}",
                "examples": [],
                "related_concepts": []
            }

    async def summarize(self, content: str) -> str:
        """Generate summary."""
        if not self.llm:
            sentences = content.split(".")[:5]
            return ". ".join(sentences) + "."

        prompt = DOCUMENT_SUMMARY_PROMPT.format(content=content[:10000])

        try:
            response = await self.llm.ainvoke(prompt)
            response_text = response.content

            try:
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0]
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0]
                result = json.loads(response_text.strip())
                return result.get("summary", response_text)
            except json.JSONDecodeError:
                return response_text
        except Exception:
            sentences = content.split(".")[:3]
            return ". ".join(sentences) + "."

    async def extract_concepts(self, content: str) -> Dict:
        """Extract key concepts."""
        if not self.llm:
            return {"main_topics": [], "key_terms": [], "difficulty_level": "unknown"}

        prompt = f"""Analyze this content and extract:
1. Main topics covered (3-5 topics)
2. Key terms and concepts (10-15 terms)
3. Difficulty level (beginner/intermediate/advanced)

Content:
{content[:8000]}

Output format (JSON):
{{
  "main_topics": ["topic1", "topic2"],
  "key_terms": ["term1", "term2"],
  "difficulty_level": "intermediate"
}}

Output only valid JSON."""

        try:
            response = await self.llm.ainvoke(prompt)
            response_text = response.content

            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]

            return json.loads(response_text.strip())
        except Exception:
            return {"main_topics": [], "key_terms": [], "difficulty_level": "unknown"}

    async def suggest_flashcards(self, text: str, count: int = 5) -> List[Dict]:
        """Suggest flashcards from selected text."""
        if not self.llm:
            return []

        prompt = FLASHCARD_GENERATION_PROMPT.format(content=text, count=count)

        try:
            response = await self.llm.ainvoke(prompt)
            response_text = response.content

            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]

            return json.loads(response_text.strip())
        except Exception:
            return []

    async def search_documents(
        self,
        query: str,
        filters: Dict = None,
        top_k: int = 10
    ) -> List[Dict]:
        """Search across user's documents."""
        return await self._retrieve_context(query, top_k=top_k, filters=filters)

    # ─── Private helpers ──────────────────────────────────────────────────────

    async def _retrieve_context(
        self,
        query: str,
        top_k: int = 7,
        filters: Dict = None,
        search_mode: str = "hybrid"
    ) -> List[Dict]:
        """
        Retrieve relevant context với adaptive threshold và multiple search modes.
        """
        if not self.vector_store or not self.user_id:
            return []

        try:
            search_filters = {"user_id": self.user_id}
            if filters:
                search_filters.update(filters)

            # Dùng threshold thấp hơn (0.3) để tránh bỏ sót, reranker sẽ lọc
            threshold = getattr(settings, 'similarity_threshold', 0.3)

            if search_mode == "hybrid":
                results = await self.vector_store.hybrid_search(
                    query=query,
                    top_k=top_k,
                    filters=search_filters,
                    use_reranking=True
                )
            elif search_mode == "multi_query":
                results = await self.vector_store.multi_query_search(
                    query=query,
                    top_k=top_k,
                    filters=search_filters
                )
            else:
                results = await self.vector_store.search(
                    query=query,
                    top_k=top_k,
                    filters=search_filters,
                    similarity_threshold=threshold,
                    use_reranking=True
                )

            return results

        except Exception as e:
            print(f"Error in context retrieval: {e}")
            return []

    def _build_context_with_citations(self, chunks: List[Dict]) -> str:
        """Build context string với numbered citations."""
        parts = []
        for i, chunk in enumerate(chunks, 1):
            title = chunk.get("metadata", {}).get("title", "Document")
            section = chunk.get("metadata", {}).get("section", "")
            page = chunk.get("metadata", {}).get("page", "")

            citation_info = f"[{i}] {title}"
            if section:
                citation_info += f" - {section}"
            if page:
                citation_info += f" (Page {page})"

            parts.append(f"{citation_info}\n{chunk['text']}")

        return "\n\n---\n\n".join(parts)

    def _format_sources(self, chunks: List[Dict]) -> List[Dict]:
        """Format retrieved chunks as source citations."""
        sources = []
        for i, chunk in enumerate(chunks, 1):
            metadata = chunk.get('metadata', {})
            source = {
                "citation_number": i,
                "document_id": metadata.get('document_id'),
                "document_title": metadata.get('title', 'Unknown'),
                "section": metadata.get('section', ''),
                "page": metadata.get('page', ''),
                "chunk_text": chunk.get('text', '')[:300] + "...",
                "relevance_score": round(chunk.get('similarity_score', 0), 3),
                "chunk_index": metadata.get('chunk_index', 0)
            }
            sources.append(source)
        return sources

    def _build_lc_messages(self, system_prompt: str, history: List[Dict], message: str):
        """Build LangChain messages list."""
        from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

        lc_messages = [SystemMessage(content=system_prompt)]

        if history:
            for msg in history[-10:]:
                if msg["role"] == "user":
                    lc_messages.append(HumanMessage(content=msg["content"]))
                else:
                    lc_messages.append(AIMessage(content=msg["content"]))

        lc_messages.append(HumanMessage(content=message))
        return lc_messages

    def _extract_actions(self, response: str, query: str) -> List[str]:
        """Extract suggested actions from AI response."""
        actions = []
        query_lower = query.lower()

        if any(word in query_lower for word in ["explain", "what is", "define", "how"]):
            actions.append("Create flashcards from this explanation")
        if any(word in query_lower for word in ["study", "learn", "practice"]):
            actions.append("Generate a quiz")
            actions.append("Review flashcards")
        if any(word in query_lower for word in ["difficult", "confused", "don't understand"]):
            actions.append("Try simpler explanation (ELI5)")
            actions.append("See related concepts")

        return actions if actions else None


# ─── Cached factory ──────────────────────────────────────────────────────────
_orchestrator_cache: Dict[str, AIAgentOrchestrator] = {}


def get_orchestrator(user_id: str = None) -> AIAgentOrchestrator:
    """
    Get or create an AIAgentOrchestrator, caching the LLM/vector store
    so they are not re-initialized on every request.
    """
    cache_key = user_id or "__default__"
    if cache_key not in _orchestrator_cache:
        _orchestrator_cache[cache_key] = AIAgentOrchestrator(user_id=user_id)
    return _orchestrator_cache[cache_key]
