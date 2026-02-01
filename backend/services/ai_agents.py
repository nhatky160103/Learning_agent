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
    
    def __init__(self):
        self.llm = None
        self._init_llm()
    
    def _init_llm(self):
        """Initialize LLM client with available API."""
        if settings.openai_api_key:
            try:
                from langchain_openai import ChatOpenAI
                self.llm = ChatOpenAI(
                    model="gpt-4o-mini",
                    api_key=settings.openai_api_key,
                    temperature=0.7
                )
                return
            except Exception:
                pass
        
        if settings.google_api_key:
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI
                self.llm = ChatGoogleGenerativeAI(
                    model="gemini-1.5-flash",
                    google_api_key=settings.google_api_key,
                    temperature=0.7
                )
            except Exception:
                pass
    
    async def chat(
        self,
        message: str,
        context: str = "",
        history: List[Dict] = None
    ) -> Dict:
        """
        Handle a chat message with context-aware responses.
        
        Args:
            message: User's message
            context: Document or study material context
            history: Previous conversation messages
        
        Returns:
            Dict with response, sources, and suggested actions
        """
        if not self.llm:
            return {
                "response": "I apologize, but the AI service is not configured. Please add your API key in the settings.",
                "sources": None,
                "suggested_actions": ["Configure API key in .env file"]
            }
        
        # Build conversation
        system_prompt = CHAT_SYSTEM_PROMPT.format(context=context[:5000] if context else "No specific documents loaded.")
        
        messages = [{"role": "system", "content": system_prompt}]
        
        if history:
            for msg in history[-10:]:  # Keep last 10 messages
                messages.append({"role": msg["role"], "content": msg["content"]})
        
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
                "sources": None,
                "suggested_actions": suggested_actions
            }
            
        except Exception as e:
            return {
                "response": f"I encountered an error: {str(e)}. Please try again.",
                "sources": None,
                "suggested_actions": None
            }
    
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
