#!/usr/bin/env python3
"""Quick test to verify ChromaDB connection"""
import chromadb

try:
    # Test connection
    client = chromadb.HttpClient(host="localhost", port=8000)
    heartbeat = client.heartbeat()
    print(f"✓ ChromaDB connection successful!")
    print(f"  Heartbeat: {heartbeat}")
    
    # Try to get or create collection
    try:
        collection = client.get_collection("learning_documents")
        print(f"✓ Found existing collection: learning_documents")
        print(f"  Total chunks: {collection.count()}")
    except:
        collection = client.create_collection(
            name="learning_documents",
            metadata={"hnsw:space": "cosine"}
        )
        print(f"✓ Created new collection: learning_documents")
    
    print("\n✅ ChromaDB is ready to use!")
    
except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()
