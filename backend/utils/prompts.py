# Prompt templates for AI generation

FLASHCARD_GENERATION_PROMPT = """You are an expert educator creating high-quality flashcards for effective learning.

Analyze the following content and create {count} flashcards.

CONTENT:
{content}

REQUIREMENTS:
1. Each flashcard should test ONE specific concept
2. Questions should be clear, specific, and unambiguous
3. Answers should be concise but complete
4. Include difficulty ratings based on concept complexity
5. Add relevant tags for categorization

DIFFICULTY GUIDELINE:
- easy: Basic definitions, simple facts
- medium: Understanding relationships, applying concepts
- hard: Analysis, synthesis, complex problem-solving

OUTPUT FORMAT (JSON array):
[
  {{
    "question": "Clear, specific question",
    "answer": "Concise but complete answer",
    "hint": "Optional hint to help recall",
    "difficulty": "easy|medium|hard",
    "tags": ["topic1", "topic2"]
  }}
]

Generate exactly {count} flashcards. Output only valid JSON."""


QUIZ_MCQ_PROMPT = """Create a multiple choice question about the following concept.

CONCEPT: {concept}

CONTEXT:
{context}

DIFFICULTY: {difficulty}

REQUIREMENTS:
1. Question should be clear and unambiguous
2. Create 4 options (A, B, C, D)
3. Only ONE correct answer
4. Distractors should be plausible but clearly wrong
5. Include a brief explanation

OUTPUT FORMAT (JSON):
{{
  "question_type": "mcq",
  "question_text": "The question text",
  "correct_answer": "The correct option letter (A/B/C/D)",
  "options": {{
    "A": "Option A text",
    "B": "Option B text",
    "C": "Option C text",
    "D": "Option D text"
  }},
  "explanation": "Why the correct answer is right"
}}

Output only valid JSON."""


QUIZ_TRUE_FALSE_PROMPT = """Create a true/false question about the following concept.

CONCEPT: {concept}

CONTEXT:
{context}

DIFFICULTY: {difficulty}

REQUIREMENTS:
1. Statement should be clear and unambiguous
2. Must be definitively true or false
3. Avoid absolute words like "always" or "never" unless factually correct
4. Include a brief explanation

OUTPUT FORMAT (JSON):
{{
  "question_type": "true_false",
  "question_text": "A statement that is either true or false",
  "correct_answer": "True|False",
  "options": null,
  "explanation": "Why this is true/false"
}}

Output only valid JSON."""


QUIZ_FILL_BLANK_PROMPT = """Create a fill-in-the-blank question about the following concept.

CONCEPT: {concept}

CONTEXT:
{context}

DIFFICULTY: {difficulty}

REQUIREMENTS:
1. The blank should test a key term or concept
2. Use _____ to indicate the blank
3. Provide the exact expected answer
4. Include an explanation

OUTPUT FORMAT (JSON):
{{
  "question_type": "fill_blank",
  "question_text": "A sentence with _____ for the blank",
  "correct_answer": "The word/phrase that fills the blank",
  "options": null,
  "explanation": "Why this answer is correct"
}}

Output only valid JSON."""


CONCEPT_EXPLANATION_PROMPT = """You are an expert teacher explaining concepts at different levels.

CONCEPT: {concept}

KNOWLEDGE CONTEXT (if available):
{context}

EXPLANATION LEVEL: {level}
- eli5: Explain like I'm 5 - use very simple language, everyday analogies
- intermediate: Standard explanation with some technical terms
- advanced: Detailed technical explanation with depth

REQUIREMENTS:
1. Start with a clear, concise definition
2. Provide 2-3 real-world examples
3. Use analogies or metaphors when helpful
4. Mention common misconceptions if relevant
5. Suggest 3-5 related concepts to explore

OUTPUT FORMAT (JSON):
{{
  "definition": "Clear definition of the concept",
  "explanation": "Detailed explanation appropriate for the level",
  "examples": ["Example 1", "Example 2", "Example 3"],
  "analogies": ["Analogy if helpful"],
  "misconceptions": ["Common mistake 1"],
  "related_concepts": ["Related concept 1", "Related concept 2"]
}}

Output only valid JSON."""


DOCUMENT_SUMMARY_PROMPT = """Summarize the following document content concisely.

CONTENT:
{content}

REQUIREMENTS:
1. Provide a brief overview (2-3 sentences)
2. List the main topics covered
3. Extract 10-15 key concepts/terms
4. Identify the difficulty level of the content

OUTPUT FORMAT (JSON):
{{
  "summary": "Brief overview of the document",
  "main_topics": ["Topic 1", "Topic 2"],
  "key_concepts": ["Concept 1", "Concept 2"],
  "difficulty_level": "beginner|intermediate|advanced",
  "estimated_study_time_minutes": 30
}}

Output only valid JSON."""


CHAT_SYSTEM_PROMPT = """You are a helpful AI learning assistant for the Smart Learning Companion app.

Your capabilities:
- Help users understand concepts from their uploaded documents
- Answer questions about study materials
- Suggest study strategies and techniques
- Provide encouragement and motivation

CONTEXT (User's study materials):
{context}

GUIDELINES:
1. Be encouraging and supportive
2. Provide clear, accurate explanations
3. Reference the user's materials when relevant
4. Suggest flashcards or quizzes for concepts they're struggling with
5. Keep responses concise but helpful

If you don't have enough context to answer accurately, ask clarifying questions or suggest the user upload relevant materials."""


STUDY_RECOMMENDATION_PROMPT = """Based on the user's learning data, suggest an optimal study plan.

USER DATA:
- Weak topics: {weak_topics}
- Due for review: {due_cards} flashcards
- Recent accuracy: {accuracy}%
- Daily goal: {daily_goal} minutes
- Last studied: {last_studied}

REQUIREMENTS:
1. Prioritize due flashcard reviews (spaced repetition)
2. Focus on weak topics that need improvement
3. Balance review and new learning
4. Consider the user's available time

OUTPUT FORMAT (JSON):
{{
  "priority_actions": [
    {{
      "type": "flashcard_review|quiz|new_concept",
      "priority": 1,
      "title": "Action title",
      "description": "What to do",
      "estimated_time_minutes": 10,
      "topic": "Related topic"
    }}
  ],
  "motivational_message": "Encouragement for the user",
  "focus_areas": ["Topic to focus on"]
}}

Output only valid JSON."""
