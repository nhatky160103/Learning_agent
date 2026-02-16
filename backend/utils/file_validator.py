"""
File validation utilities for secure document uploads.

This module provides security features for file uploads:
- Filename sanitization to prevent path traversal attacks
- MIME type validation to prevent file type spoofing
- Streaming file validation with size limits
- SHA256 hashing for duplicate detection
"""

import os
import re
import hashlib
import logging
import tempfile
from typing import Optional, Tuple
from fastapi import UploadFile, HTTPException

logger = logging.getLogger(__name__)

try:
    import magic
    MAGIC_AVAILABLE = True
except ImportError:
    MAGIC_AVAILABLE = False
    logger.warning("python-magic not installed. MIME type validation disabled.")


# Allowed MIME types mapping
ALLOWED_MIME_TYPES = {
    '.pdf': ['application/pdf'],
    '.docx': [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/zip',  # DOCX is a ZIP archive
        'application/octet-stream'  # Some systems report this for docx
    ],
    '.doc': ['application/msword'],
    '.txt': ['text/plain'],
    '.md': ['text/plain', 'text/markdown'],
    '.pptx': [
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/zip',
        'application/octet-stream'
    ],
    '.ppt': ['application/vnd.ms-powerpoint'],
}


def sanitize_filename(filename: str) -> str:
    """
    Sanitize user-provided filename to prevent security issues.
    
    - Removes path components (../../etc/passwd → passwd)
    - Replaces dangerous characters with underscores
    - Preserves extension
    
    Args:
        filename: Original filename from user
        
    Returns:
        Sanitized safe filename
    """
    # Remove any path components
    filename = os.path.basename(filename)
    
    # Split name and extension
    name, ext = os.path.splitext(filename)
    
    # Allow only alphanumeric, dots, hyphens, underscores, spaces
    safe_name = re.sub(r'[^a-zA-Z0-9._\-\s]', '_', name)
    safe_ext = re.sub(r'[^a-zA-Z0-9.]', '', ext.lower())
    
    # Truncate if too long (max 200 chars)
    if len(safe_name) > 200:
        safe_name = safe_name[:200]
    
    return f"{safe_name}{safe_ext}"


def verify_mime_type(file_path: str, expected_extension: str) -> bool:
    """
    Verify that file's actual MIME type matches its extension.
    
    Prevents attacks where malware.exe is renamed to malware.pdf
    
    Args:
        file_path: Path to file on disk
        expected_extension: Expected file extension (e.g., '.pdf')
        
    Returns:
        True if MIME type matches, False otherwise
    """
    if not MAGIC_AVAILABLE:
        # If python-magic not available, skip validation
        return True
    
    try:
        mime = magic.Magic(mime=True)
        detected_mime = mime.from_file(file_path)
        
        allowed_mimes = ALLOWED_MIME_TYPES.get(expected_extension, [])
        is_valid = detected_mime in allowed_mimes
        
        if not is_valid:
            logger.warning(
                "MIME type mismatch: expected one of %s for %s, got %s",
                allowed_mimes, expected_extension, detected_mime
            )
        
        return is_valid
        
    except Exception:
        logger.exception("MIME type validation error")
        # On error, allow upload (fail open for availability)
        return True


async def save_upload_with_validation(
    file: UploadFile,
    destination: str,
    max_size_bytes: int = 50 * 1024 * 1024,
    chunk_size: int = 8192
) -> Tuple[str, int, str]:
    """
    Save uploaded file with streaming and validation.
    
    Features:
    - Resets file stream position before reading
    - Streams file in chunks (memory efficient)
    - Enforces file size limit during streaming
    - Calculates SHA256 hash for duplicate detection
    - Validates MIME type after upload
    
    Args:
        file: FastAPI UploadFile object
        destination: Final destination path
        max_size_bytes: Maximum allowed file size (default: 50MB)
        chunk_size: Size of each chunk to read (default: 8KB)
        
    Returns:
        Tuple of (file_path, file_size, file_hash)
        
    Raises:
        HTTPException: If file too large, empty, or MIME type mismatch
    """
    total_size = 0
    sha256 = hashlib.sha256()
    
    # Create destination directory if needed
    dest_dir = os.path.dirname(destination)
    os.makedirs(dest_dir, exist_ok=True)
    
    # Create temp file in same directory for atomic move
    temp_fd, temp_path = tempfile.mkstemp(dir=dest_dir, suffix='.tmp')
    
    try:
        # Reset file position — critical fix for when the stream
        # has been partially or fully consumed by framework middleware
        await file.seek(0)
        
        # Stream file to disk in chunks
        with os.fdopen(temp_fd, 'wb') as f:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                
                total_size += len(chunk)
                
                # Enforce size limit during streaming (fail fast)
                if total_size > max_size_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Maximum size: {max_size_bytes / (1024*1024):.0f}MB"
                    )
                
                f.write(chunk)
                sha256.update(chunk)
        
        # Reject empty files
        if total_size == 0:
            raise HTTPException(
                status_code=400,
                detail="Uploaded file is empty."
            )
        
        file_hash = sha256.hexdigest()
        
        # Validate MIME type
        file_ext = os.path.splitext(destination)[1].lower()
        if not verify_mime_type(temp_path, file_ext):
            raise HTTPException(
                status_code=400,
                detail=f"File content doesn't match the expected type ({file_ext})."
            )
        
        # Atomic move: temp → final destination
        os.replace(temp_path, destination)
        
        logger.info(
            "File saved successfully: %s (%d bytes, hash=%s…)",
            os.path.basename(destination), total_size, file_hash[:12]
        )
        
        return destination, total_size, file_hash
        
    except Exception:
        # Cleanup temp file on any error
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
        raise


def calculate_file_hash(file_path: str) -> str:
    """
    Calculate SHA256 hash of a file for duplicate detection.
    
    Args:
        file_path: Path to file
        
    Returns:
        Hexadecimal hash string
    """
    sha256 = hashlib.sha256()
    
    with open(file_path, 'rb') as f:
        while chunk := f.read(8192):
            sha256.update(chunk)
    
    return sha256.hexdigest()
