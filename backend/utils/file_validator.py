"""
File validation utilities for secure document uploads.

This module provides security features for file uploads:
- Filename sanitization to prevent path traversal attacks
- MIME type validation to prevent file type spoofing
- Streaming file validation with size limits
"""

import os
import re
import hashlib
import tempfile
from typing import Optional, Tuple
from fastapi import UploadFile, HTTPException

try:
    import magic
    MAGIC_AVAILABLE = True
except ImportError:
    MAGIC_AVAILABLE = False
    print("Warning: python-magic not installed. MIME type validation disabled.")


# Allowed MIME types mapping
ALLOWED_MIME_TYPES = {
    '.pdf': ['application/pdf'],
    '.docx': [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/octet-stream'  # Some systems report this for docx
    ],
    '.doc': ['application/msword'],
    '.txt': ['text/plain'],
    '.md': ['text/plain', 'text/markdown'],
    '.pptx': [
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
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
        return detected_mime in allowed_mimes
        
    except Exception as e:
        print(f"MIME type validation error: {e}")
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
    - Streams file in chunks (memory efficient)
    - Enforces file size limit
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
        HTTPException: If file too large or MIME type mismatch
    """
    total_size = 0
    sha256 = hashlib.sha256()
    
    # Create temp file in same directory as destination
    # This ensures move operation is atomic (same filesystem)
    dest_dir = os.path.dirname(destination)
    os.makedirs(dest_dir, exist_ok=True)
    
    temp_fd, temp_path = tempfile.mkstemp(dir=dest_dir, suffix='.tmp')
    
    try:
        # Write file in chunks
        with os.fdopen(temp_fd, 'wb') as f:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                
                chunk_len = len(chunk)
                total_size += chunk_len
                
                # Check size limit
                if total_size > max_size_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Maximum size: {max_size_bytes / (1024*1024):.1f}MB"
                    )
                
                f.write(chunk)
                sha256.update(chunk)
        
        file_hash = sha256.hexdigest()
        
        # Validate MIME type
        file_ext = os.path.splitext(destination)[1].lower()
        if not verify_mime_type(temp_path, file_ext):
            os.remove(temp_path)
            raise HTTPException(
                status_code=400,
                detail=f"File type mismatch. Expected {file_ext} but file content doesn't match."
            )
        
        # Move temp file to final destination (atomic)
        os.replace(temp_path, destination)
        
        return destination, total_size, file_hash
        
    except Exception as e:
        # Cleanup temp file on any error
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except:
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
