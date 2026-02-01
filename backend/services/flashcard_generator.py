import json
from typing import List, Dict
from config import settings
from utils.prompts import FLASHCARD_GENERATION_PROMPT


class FlashcardGenerator:
    """Service for generating flashcards using AI."""
    
    def __init__(self):
        self.llm = None
        self._init_llm()
    
    def _init_llm(self):
        """Initialize LLM client."""
        if settings.openai_api_key:
            try:
                from langchain_openai import ChatOpenAI
                self.llm = ChatOpenAI(
                    model="gpt-4o-mini",
                    api_key=settings.openai_api_key,
                    temperature=0.7
                )
            except Exception:
                pass
        
        if not self.llm and settings.google_api_key:
            try:
                from langchain_google_genai import ChatGoogleGenerativeAI
                self.llm = ChatGoogleGenerativeAI(
                    model="gemini-1.5-flash",
                    google_api_key=settings.google_api_key,
                    temperature=0.7
                )
            except Exception:
                pass
    
    async def generate(
        self,
        content: str,
        count: int = 10,
        difficulty: str = "mixed"
    ) -> List[Dict]:
        """
        Generate flashcards from content.
        
        Args:
            content: Source content to create flashcards from
            count: Number of flashcards to generate
            difficulty: Target difficulty (easy/medium/hard/mixed)
        
        Returns:
            List of flashcard dictionaries with question, answer, hint, difficulty, tags
        """
        if not self.llm:
            return self._generate_fallback(content, count)
        
        # Prepare prompt
        prompt = FLASHCARD_GENERATION_PROMPT.format(
            content=content[:8000],  # Limit content size
            count=count
        )
        
        try:
            response = await self.llm.ainvoke(prompt)
            response_text = response.content
            
            # Parse JSON response
            # Handle markdown code blocks
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]
            
            flashcards = json.loads(response_text.strip())
            
            # Validate and filter by difficulty if specified
            valid_cards = []
            for card in flashcards:
                if all(key in card for key in ["question", "answer"]):
                    # Ensure required fields
                    card.setdefault("hint", None)
                    card.setdefault("difficulty", "medium")
                    card.setdefault("tags", [])
                    
                    if difficulty == "mixed" or card.get("difficulty") == difficulty:
                        valid_cards.append(card)
            
            return valid_cards[:count]
            
        except Exception as e:
            print(f"Error generating flashcards: {e}")
            return self._generate_fallback(content, count)
    
    def _generate_fallback(self, content: str, count: int) -> List[Dict]:
        """Generate simple flashcards without AI."""
        flashcards = []
        
        # Split content into sentences
        sentences = content.replace("\n", " ").split(".")
        sentences = [s.strip() for s in sentences if len(s.strip()) > 20]
        
        for i, sentence in enumerate(sentences[:count]):
            # Create simple Q&A from sentence
            words = sentence.split()
            if len(words) < 5:
                continue
            
            # Hide a key word for fill-in-the-blank style
            key_word_idx = len(words) // 2
            key_word = words[key_word_idx]
            
            question = " ".join(words[:key_word_idx]) + " _____ " + " ".join(words[key_word_idx+1:]) + "?"
            answer = key_word
            
            flashcards.append({
                "question": f"Complete: {question}",
                "answer": answer,
                "hint": f"The answer starts with '{key_word[0]}'",
                "difficulty": "medium",
                "tags": ["auto-generated"]
            })
        
        return flashcards
