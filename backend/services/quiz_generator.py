import json
import random
from typing import List, Dict
from config import settings
from utils.prompts import QUIZ_MCQ_PROMPT, QUIZ_TRUE_FALSE_PROMPT, QUIZ_FILL_BLANK_PROMPT


class QuizGenerator:
    """Service for generating quizzes using AI."""
    
    def __init__(self):
        self.llm = None
        self._init_llm()
        
        self.question_prompts = {
            "mcq": QUIZ_MCQ_PROMPT,
            "true_false": QUIZ_TRUE_FALSE_PROMPT,
            "fill_blank": QUIZ_FILL_BLANK_PROMPT
        }
    
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
        question_types: List[str] = None,
        difficulty: str = "medium"
    ) -> List[Dict]:
        """
        Generate quiz questions from content.
        
        Args:
            content: Source content
            count: Number of questions
            question_types: Types of questions to generate
            difficulty: Target difficulty
        
        Returns:
            List of question dictionaries
        """
        if question_types is None:
            question_types = ["mcq", "true_false", "fill_blank"]
        
        if not self.llm:
            return self._generate_fallback(content, count, question_types)
        
        questions = []
        
        # Extract key concepts from content
        concepts = self._extract_concepts(content)
        
        # Distribute question types
        questions_per_type = count // len(question_types)
        remainder = count % len(question_types)
        
        for i, q_type in enumerate(question_types):
            type_count = questions_per_type + (1 if i < remainder else 0)
            
            for _ in range(type_count):
                if not concepts:
                    break
                
                concept = random.choice(concepts)
                concepts.remove(concept)  # Don't reuse concepts
                
                question = await self._generate_question(
                    concept=concept,
                    context=content[:4000],
                    question_type=q_type,
                    difficulty=difficulty
                )
                
                if question:
                    questions.append(question)
        
        return questions
    
    def _extract_concepts(self, content: str) -> List[str]:
        """Extract key concepts from content for question generation."""
        # Simple extraction: find capitalized words and important phrases
        concepts = []
        
        sentences = content.split(".")
        for sentence in sentences:
            sentence = sentence.strip()
            if len(sentence) > 20 and len(sentence) < 200:
                concepts.append(sentence)
        
        return concepts[:30]  # Limit concepts
    
    async def _generate_question(
        self,
        concept: str,
        context: str,
        question_type: str,
        difficulty: str
    ) -> Dict:
        """Generate a single question."""
        prompt_template = self.question_prompts.get(question_type, QUIZ_MCQ_PROMPT)
        
        prompt = prompt_template.format(
            concept=concept,
            context=context,
            difficulty=difficulty
        )
        
        try:
            response = await self.llm.ainvoke(prompt)
            response_text = response.content
            
            # Parse JSON
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]
            
            question = json.loads(response_text.strip())
            
            # Validate required fields
            if "question_text" in question and "correct_answer" in question:
                question.setdefault("question_type", question_type)
                question.setdefault("explanation", "")
                question.setdefault("difficulty", difficulty)
                return question
                
        except Exception as e:
            print(f"Error generating question: {e}")
        
        return None
    
    def _generate_fallback(
        self,
        content: str,
        count: int,
        question_types: List[str]
    ) -> List[Dict]:
        """Generate simple questions without AI."""
        questions = []
        sentences = [s.strip() for s in content.split(".") if len(s.strip()) > 30]
        
        for i, sentence in enumerate(sentences[:count]):
            if "mcq" in question_types:
                questions.append({
                    "question_type": "mcq",
                    "question_text": f"Which of the following is correct? '{sentence[:50]}...'",
                    "correct_answer": "A",
                    "options": {
                        "A": sentence,
                        "B": "This statement is incorrect",
                        "C": "None of the above",
                        "D": "All of the above"
                    },
                    "explanation": "This is directly from the source material."
                })
            elif "true_false" in question_types and i % 2 == 0:
                questions.append({
                    "question_type": "true_false",
                    "question_text": sentence,
                    "correct_answer": "True",
                    "options": None,
                    "explanation": "This statement is from the source material."
                })
        
        return questions[:count]
