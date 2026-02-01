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
from services.vector_store import get_vector_store


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
        self.vector_store = None
        try:
            self.vector_store = get_vector_store()
        except Exception as e:
            print(f"Warning: Vector store not available: {e}")
    
    async def process(self, file_path: str, document_id: str = None, metadata: Dict = None) -> Dict:
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
        
        # Generate chunks
        chunks = self._chunk_content(content)
        
        # Generate summary and extract concepts
        result = {
            "content": content,
            "summary": await self._generate_summary(content),
            "concepts": await self._extract_concepts(content),
            "chunk_count": len(chunks)
        }
        
        # Store embeddings in vector store if document_id provided
        if document_id and self.vector_store and metadata:
            try:
                await self._store_embeddings(document_id, chunks, metadata)
                result["embedding_status"] = "ready"
            except Exception as e:
                print(f"Error storing embeddings: {e}")
                result["embedding_status"] = "error"
        
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
    
    def _chunk_content(self, content: str, chunk_size: int = None, overlap: int = None) -> List[str]:
        """Split content into overlapping chunks with semantic boundaries."""
        if chunk_size is None:
            chunk_size = getattr(settings, 'chunk_size', 500)
        if overlap is None:
            overlap = getattr(settings, 'chunk_overlap', 50)
        
        chunks = []
        
        # Try to split by paragraphs first (semantic chunking)
        paragraphs = content.split("\n\n")
        current_chunk = ""
        
        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
                
            # If adding this paragraph exceeds chunk size
            if len(current_chunk) + len(para) + 2 > chunk_size:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                    # Add overlap from end of previous chunk
                    if overlap > 0 and len(current_chunk) > overlap:
                        current_chunk = current_chunk[-overlap:] + "\n\n" + para
                    else:
                        current_chunk = para
                else:
                    current_chunk = para
            else:
                if current_chunk:
                    current_chunk += "\n\n" + para
                else:
                    current_chunk = para
        
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        # If no paragraph breaks or chunks too large, split by sentences
        if len(chunks) == 1 and len(content) > chunk_size:
            chunks = []
            sentences = content.replace("\n", " ").split(". ")
            current_chunk = ""
            
            for sentence in sentences:
                if len(current_chunk) + len(sentence) + 2 > chunk_size:
                    if current_chunk:
                        chunks.append(current_chunk.strip())
                        if overlap > 0:
                            current_chunk = current_chunk[-overlap:] + ". " + sentence
                        else:
                            current_chunk = sentence
                    else:
                        current_chunk = sentence
                else:
                    current_chunk += ". " + sentence if current_chunk else sentence
            
            if current_chunk:
                chunks.append(current_chunk.strip())
        
        # Filter out very small chunks
        chunks = [c for c in chunks if len(c.strip()) > 50]
        
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
    
    async def _store_embeddings(self, document_id: str, chunks: List[str], metadata: Dict):
        """Store document chunks in vector store."""
        if not self.vector_store:
            return
        
        try:
            await self.vector_store.add_document_chunks(
                document_id=document_id,
                chunks=chunks,
                metadata=metadata
            )
        except Exception as e:
            print(f"Error storing embeddings for document {document_id}: {e}")
            raise
    
    async def reprocess_document(self, document_id: str, file_path: str, metadata: Dict) -> Dict:
        """Reprocess an existing document and update embeddings."""
        # Delete old embeddings
        if self.vector_store:
            try:
                await self.vector_store.delete_document(document_id)
            except Exception as e:
                print(f"Error deleting old embeddings: {e}")
        
        # Process document again
        return await self.process(file_path, document_id, metadata)
    
    async def delete_document_embeddings(self, document_id: str):
        """Delete document embeddings from vector store."""
        if self.vector_store:
            try:
                await self.vector_store.delete_document(document_id)
            except Exception as e:
                print(f"Error deleting embeddings: {e}")
                raise
