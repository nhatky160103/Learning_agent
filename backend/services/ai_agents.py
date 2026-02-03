import json
from typing import List, Dict, Optional
from config import settings
from utils.prompts import (
    CONCEPT_EXPLANATION_PROMPT, DOCUMENT_SUMMARY_PROMPT,
    CHAT_SYSTEM_PROMPT, FLASHCARD_GENERATION_PROMPT
)


class AIAgentOrchestrator:
    """
    Multi-agent orchestrator for AI-powered learning features.
    
    Coordinates between different specialized agents:
    - Explanation Agent: Explains concepts at various levels
    - Summary Agent: Summarizes documents
    - Chat Agent: Conversational learning assistant
    - Concept Extractor: Extracts key concepts from content
    """
    
    def __init__(self, user_id: str = None):
        self.llm = None
        self.user_id = user_id
        self.vector_store = None
        self._init_llm()
        self._init_vector_store()
    
    def _init_llm(self):
        """Initialize LLM client with available API."""
        # Use Google Gemini if configured, especially if OpenAI is just a placeholder
        is_openai_placeholder = "your_openai_api_key_here" in settings.openai_api_key
        
        if settings.google_api_key:
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI
                self.llm = ChatGoogleGenerativeAI(
                    model="gemini-2.5-flash",
                    google_api_key=settings.google_api_key,
                    temperature=0.7
                )
                # If we successfully initialized Gemini and OpenAI is just a placeholder, we're done
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
    
    async def chat(
        self,
        message: str,
        context: str = "",
        history: List[Dict] = None,
        use_rag: bool = True,
        document_filters: Dict = None
    ) -> Dict:
        """
        Handle a chat message with context-aware responses and RAG.
        
        Args:
            message: User's message
            context: Document or study material context (legacy)
            history: Previous conversation messages
            use_rag: Whether to use RAG for context retrieval (default: True)
            document_filters: Optional filters for document retrieval
        
        Returns:
            Dict with response, sources, and suggested actions
        """
        if not self.llm:
            return {
                "response": "I apologize, but the AI service is not configured. Please add your API key in the settings.",
                "sources": None,
                "suggested_actions": ["Configure API key in .env file"]
            }
        
        # Retrieve context from vector store if RAG is enabled
        retrieved_context = ""
        sources = []
        
        if use_rag and self.vector_store and self.user_id:
            try:
                retrieved_chunks = await self._retrieve_context(
                    query=message,
                    top_k=getattr(settings, 'retrieval_top_k', 5),
                    filters=document_filters
                )
                
                if retrieved_chunks:
                    # Build context from retrieved chunks
                    context_parts = []
                    for chunk in retrieved_chunks:
                        context_parts.append(f"[From {chunk['metadata'].get('title', 'document')}]\n{chunk['text']}")
                    
                    retrieved_context = "\n\n".join(context_parts)
                    sources = self._format_sources(retrieved_chunks)
            except Exception as e:
                print(f"Error retrieving context: {e}")
        
        # Combine retrieved context with provided context
        full_context = retrieved_context if retrieved_context else context
        if not full_context:
            full_context = "No specific documents loaded."
        
        # Build conversation
        system_prompt = CHAT_SYSTEM_PROMPT.format(context=full_context[:5000])
        
        messages = [{"role": "system", "content": system_prompt}]
        
        if history:
            for msg in history[-10:]:  # Keep last 10 messages
                messages.append({"role": msg.role, "content": msg.content})
        
        messages.append({"role": "user", "content": message})
        
        try:
            from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
            
            lc_messages = []
            for msg in messages:
                if msg["role"] == "system":
                    lc_messages.append(SystemMessage(content=msg["content"]))
                elif msg["role"] == "user":
                    lc_messages.append(HumanMessage(content=msg["content"]))
                else:
                    lc_messages.append(AIMessage(content=msg["content"]))
            
            response = await self.llm.ainvoke(lc_messages)
            
            # Determine suggested actions based on response
            suggested_actions = self._extract_actions(response.content, message)
            
            return {
                "response": response.content,
                "sources": sources if sources else None,
                "suggested_actions": suggested_actions
            }
            
        except Exception as e:
            return {
                "response": f"I encountered an error: {str(e)}. Please try again.",
                "sources": None,
                "suggested_actions": None
            }

    async def chat_stream(
        self,
        message: str,
        context: str = "",
        history: List[Dict] = None,
        use_rag: bool = True,
        document_filters: Dict = None
    ):
        """
        Stream chat response with RAG context.
        Yields chunks of the response.
        """
        if not self.llm:
            yield "I apologize, but the AI service is not configured. Please add your API key in the settings."
            return

        # Retrieve context from vector store if RAG is enabled
        retrieved_context = ""
        sources = []
        
        if use_rag and self.vector_store and self.user_id:
            try:
                retrieved_chunks = await self._retrieve_context(
                    query=message,
                    top_k=getattr(settings, 'retrieval_top_k', 5),
                    filters=document_filters
                )
                
                if retrieved_chunks:
                    # Build context from retrieved chunks
                    context_parts = []
                    for chunk in retrieved_chunks:
                        context_parts.append(f"[From {chunk['metadata'].get('title', 'document')}]\n{chunk['text']}")
                    
                    retrieved_context = "\n\n".join(context_parts)
                    sources = self._format_sources(retrieved_chunks)
                    
                    # Yield sources first as a special event if needed, or just let the client handle it
                    # For simplicity, we can yield a JSON string with sources at the beginning or end
                    # But for now, let's just stream the text and we'll handle sources via a separate mechanism or structured chunk
                    
            except Exception as e:
                print(f"Error retrieving context: {e}")
        
        # Combine retrieved context with provided context
        full_context = retrieved_context if retrieved_context else context
        if not full_context:
            full_context = "No specific documents loaded."
        
        # Build conversation
        system_prompt = CHAT_SYSTEM_PROMPT.format(context=full_context[:5000])
        
        messages = [{"role": "system", "content": system_prompt}]
        
        if history:
            for msg in history[-10:]:  # Keep last 10 messages
                messages.append({"role": msg.role, "content": msg.content})
        
        messages.append({"role": "user", "content": message})
        
        try:
            from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
            
            lc_messages = []
            for msg in messages:
                if msg["role"] == "system":
                    lc_messages.append(SystemMessage(content=msg["content"]))
                elif msg["role"] == "user":
                    lc_messages.append(HumanMessage(content=msg["content"]))
                else:
                    lc_messages.append(AIMessage(content=msg["content"]))
            
            # Yield sources information first
            if sources:
                yield json.dumps({"type": "sources", "data": sources}) + "\n"
            
            # Stream the response
            async for chunk in self.llm.astream(lc_messages):
                if chunk.content:
                    yield json.dumps({"type": "token", "content": chunk.content}) + "\n"
                    
            # We could also yield suggested actions at the end if needed
            
        except Exception as e:
            yield json.dumps({"type": "error", "content": f"I encountered an error: {str(e)}. Please try again."}) + "\n"
    
    async def explain_concept(
        self,
        concept: str,
        level: str = "intermediate",
        context: str = ""
    ) -> Dict:
        """
        Generate a detailed explanation of a concept.
        
        Args:
            concept: The concept to explain
            level: Explanation level (eli5, intermediate, advanced)
            context: Additional context from documents
        
        Returns:
            Dict with definition, explanation, examples, related concepts
        """
        if not self.llm:
            return {
                "definition": f"{concept} - AI service not configured",
                "explanation": "Please configure an API key to use this feature.",
                "examples": [],
                "related_concepts": []
            }
        
        prompt = CONCEPT_EXPLANATION_PROMPT.format(
            concept=concept,
            context=context[:5000] if context else "No additional context provided.",
            level=level
        )
        
        try:
            response = await self.llm.ainvoke(prompt)
            response_text = response.content
            
            # Parse JSON response
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
            # Fallback to simpler response
            return {
                "definition": concept,
                "explanation": f"Unable to generate detailed explanation: {str(e)}",
                "examples": [],
                "related_concepts": []
            }
    
    async def summarize(self, content: str) -> str:
        """
        Generate a summary of the content.
        
        Args:
            content: Text content to summarize
        
        Returns:
            Summary string
        """
        if not self.llm:
            # Fallback: return first few sentences
            sentences = content.split(".")[:5]
            return ". ".join(sentences) + "."
        
        prompt = DOCUMENT_SUMMARY_PROMPT.format(content=content[:10000])
        
        try:
            response = await self.llm.ainvoke(prompt)
            response_text = response.content
            
            # Try to parse as JSON
            try:
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0]
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0]
                
                result = json.loads(response_text.strip())
                return result.get("summary", response_text)
            except json.JSONDecodeError:
                return response_text
                
        except Exception as e:
            sentences = content.split(".")[:3]
            return ". ".join(sentences) + "."
    
    async def extract_concepts(self, content: str) -> Dict:
        """
        Extract key concepts and topics from content.
        
        Args:
            content: Text content to analyze
        
        Returns:
            Dict with main_topics, key_terms, difficulty_level
        """
        if not self.llm:
            return {
                "main_topics": [],
                "key_terms": [],
                "difficulty_level": "unknown"
            }
        
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
            return {
                "main_topics": [],
                "key_terms": [],
                "difficulty_level": "unknown"
            }
    
    async def suggest_flashcards(self, text: str, count: int = 5) -> List[Dict]:
        """Suggest flashcards from selected text."""
        if not self.llm:
            return []
        
        prompt = FLASHCARD_GENERATION_PROMPT.format(
            content=text,
            count=count
        )
        
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
    
    async def _retrieve_context(
        self,
        query: str,
        top_k: int = 5,
        filters: Dict = None
    ) -> List[Dict]:
        """
        Retrieve relevant context from vector store.
        
        Args:
            query: Search query
            top_k: Number of chunks to retrieve
            filters: Optional metadata filters
        
        Returns:
            List of relevant chunks with metadata
        """
        if not self.vector_store or not self.user_id:
            return []
        
        try:
            # Add user_id to filters
            search_filters = {"user_id": self.user_id}
            if filters:
                search_filters.update(filters)
            
            # Retrieve from vector store
            results = await self.vector_store.search(
                query=query,
                top_k=top_k,
                filters=search_filters,
                similarity_threshold=getattr(settings, 'similarity_threshold', 0.7)
            )
            
            return results
            
        except Exception as e:
            print(f"Error in context retrieval: {e}")
            return []
    
    def _format_sources(self, chunks: List[Dict]) -> List[Dict]:
        """
        Format retrieved chunks as source citations.
        
        Args:
            chunks: Retrieved chunks from vector store
        
        Returns:
            List of formatted source citations
        """
        sources = []
        
        for chunk in chunks:
            metadata = chunk.get('metadata', {})
            source = {
                "document_id": metadata.get('document_id'),
                "document_title": metadata.get('title', 'Unknown'),
                "chunk_text": chunk.get('text', '')[:200] + "...",  # Preview
                "relevance_score": chunk.get('similarity_score', 0),
                "chunk_index": metadata.get('chunk_index', 0)
            }
            sources.append(source)
        
        return sources
    
    async def search_documents(
        self,
        query: str,
        filters: Dict = None,
        top_k: int = 10
    ) -> List[Dict]:
        """
        Search across user's documents.
        
        Args:
            query: Search query
            filters: Optional metadata filters
            top_k: Number of results
        
        Returns:
            List of search results
        """
        return await self._retrieve_context(query, top_k=top_k, filters=filters)
