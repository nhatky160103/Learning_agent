import os
import json
from typing import Dict, List, Optional
import asyncio

# PDF processing
try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    from pypdf import PdfReader
except ImportError:
    try:
        from PyPDF2 import PdfReader
    except ImportError:
        PdfReader = None

# DOCX processing
try:
    from docx import Document as DocxDocument
except ImportError:
    DocxDocument = None

# PPTX processing
try:
    from pptx import Presentation
except ImportError:
    Presentation = None

from config import settings


class DocumentProcessor:
    """Service for processing various document types."""
    
    def __init__(self):
        self.supported_types = {
            "pdf": self._process_pdf,
            "docx": self._process_docx,
            "doc": self._process_docx,
            "txt": self._process_txt,
            "md": self._process_txt,
            "pptx": self._process_pptx,
            "ppt": self._process_pptx,
        }
    
    async def process(self, file_path: str) -> Dict:
        """Process a document and return structured content."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        
        # Get file extension
        ext = os.path.splitext(file_path)[1].lower().lstrip(".")
        
        if ext not in self.supported_types:
            raise ValueError(f"Unsupported file type: {ext}")
        
        # Process document
        processor = self.supported_types[ext]
        content = await asyncio.to_thread(processor, file_path)
        
        # Generate summary and extract concepts
        result = {
            "content": content,
            "summary": await self._generate_summary(content),
            "concepts": await self._extract_concepts(content),
            "chunk_count": len(self._chunk_content(content))
        }
        
        return result
    
    def _process_pdf(self, file_path: str) -> str:
        """Extract text from PDF file."""
        text_parts = []
        
        # Try pdfplumber first (better layout preservation)
        if pdfplumber:
            try:
                with pdfplumber.open(file_path) as pdf:
                    for page in pdf.pages:
                        text = page.extract_text()
                        if text:
                            text_parts.append(text)
                if text_parts:
                    return "\n\n".join(text_parts)
            except Exception:
                pass
        
        # Fallback to PyPDF2
        if PdfReader:
            try:
                reader = PdfReader(file_path)
                for page in reader.pages:
                    text = page.extract_text()
                    if text:
                        text_parts.append(text)
                return "\n\n".join(text_parts)
            except Exception as e:
                raise Exception(f"Failed to process PDF: {e}")
        
        raise Exception("No PDF processing library available")
    
    def _process_docx(self, file_path: str) -> str:
        """Extract text from DOCX file."""
        if not DocxDocument:
            raise Exception("python-docx not installed")
        
        try:
            doc = DocxDocument(file_path)
            paragraphs = []
            
            for para in doc.paragraphs:
                if para.text.strip():
                    paragraphs.append(para.text)
            
            # Also extract from tables
            for table in doc.tables:
                for row in table.rows:
                    row_text = " | ".join(cell.text for cell in row.cells if cell.text.strip())
                    if row_text:
                        paragraphs.append(row_text)
            
            return "\n\n".join(paragraphs)
        except Exception as e:
            raise Exception(f"Failed to process DOCX: {e}")
    
    def _process_txt(self, file_path: str) -> str:
        """Read plain text file."""
        encodings = ['utf-8', 'latin-1', 'cp1252']
        
        for encoding in encodings:
            try:
                with open(file_path, 'r', encoding=encoding) as f:
                    return f.read()
            except UnicodeDecodeError:
                continue
        
        raise Exception("Failed to decode text file")
    
    def _process_pptx(self, file_path: str) -> str:
        """Extract text from PowerPoint file."""
        if not Presentation:
            raise Exception("python-pptx not installed")
        
        try:
            prs = Presentation(file_path)
            slides_text = []
            
            for i, slide in enumerate(prs.slides, 1):
                slide_content = [f"--- Slide {i} ---"]
                
                for shape in slide.shapes:
                    if hasattr(shape, "text") and shape.text.strip():
                        slide_content.append(shape.text)
                
                slides_text.append("\n".join(slide_content))
            
            return "\n\n".join(slides_text)
        except Exception as e:
            raise Exception(f"Failed to process PPTX: {e}")
    
    def _chunk_content(self, content: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
        """Split content into overlapping chunks."""
        chunks = []
        
        # Try to split by paragraphs first
        paragraphs = content.split("\n\n")
        current_chunk = ""
        
        for para in paragraphs:
            if len(current_chunk) + len(para) < chunk_size:
                current_chunk += para + "\n\n"
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = para + "\n\n"
        
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        # If no paragraph breaks, split by character count
        if len(chunks) == 1 and len(content) > chunk_size:
            chunks = []
            for i in range(0, len(content), chunk_size - overlap):
                chunks.append(content[i:i + chunk_size])
        
        return chunks
    
    async def _generate_summary(self, content: str) -> str:
        """Generate a summary of the content using AI."""
        from services.ai_agents import AIAgentOrchestrator
        
        try:
            orchestrator = AIAgentOrchestrator()
            summary = await orchestrator.summarize(content[:10000])  # Limit content
            return summary
        except Exception as e:
            # Fallback to simple summary
            sentences = content.split(".")[:5]
            return ". ".join(sentences) + "."
    
    async def _extract_concepts(self, content: str) -> Dict:
        """Extract key concepts from content."""
        from services.ai_agents import AIAgentOrchestrator
        
        try:
            orchestrator = AIAgentOrchestrator()
            concepts = await orchestrator.extract_concepts(content[:10000])
            return concepts
        except Exception:
            # Fallback: return empty concepts
            return {
                "main_topics": [],
                "key_terms": [],
                "difficulty_level": "unknown"
            }
