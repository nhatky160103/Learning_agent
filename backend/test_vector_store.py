"""
Test script for ChromaDB vector store integration
"""
import asyncio
import sys
sys.path.insert(0, '/home/kydinh/projects/learning_assistant/backend')

async def test_vector_store():
    print("=" * 60)
    print("Testing ChromaDB Vector Store Integration")
    print("=" * 60)
    
    try:
        from services.vector_store import get_vector_store
        
        print("\n1. Initializing vector store...")
        vs = get_vector_store()
        print("   ✓ Vector store initialized successfully")
        
        print(f"\n2. Collection info:")
        print(f"   - Name: {vs.collection.name}")
        stats = vs.get_collection_stats()
        print(f"   - Total chunks: {stats.get('total_chunks', 0)}")
        print(f"   - Embedding model: {stats.get('embedding_model', 'N/A')}")
        
        print("\n3. Testing embedding generation...")
        test_texts = [
            "Machine learning is a subset of artificial intelligence.",
            "Python is a popular programming language for data science."
        ]
        embeddings = vs.generate_embeddings(test_texts)
        print(f"   ✓ Generated {len(embeddings)} embeddings")
        print(f"   - Embedding dimension: {len(embeddings[0])}")
        
        print("\n4. Testing document chunk addition...")
        test_metadata = {
            "user_id": "test-user-123",
            "title": "Test Document",
            "file_type": "txt"
        }
        
        count = await vs.add_document_chunks(
            document_id="test-doc-001",
            chunks=test_texts,
            metadata=test_metadata
        )
        print(f"   ✓ Added {count} chunks to vector store")
        
        print("\n5. Testing semantic search...")
        results = await vs.search(
            query="What is machine learning?",
            top_k=2,
            filters={"user_id": "test-user-123"}
        )
        print(f"   ✓ Search returned {len(results)} results")
        
        if results:
            print(f"\n   Top result:")
            print(f"   - Text: {results[0]['text'][:80]}...")
            print(f"   - Similarity: {results[0]['similarity_score']:.4f}")
            print(f"   - Document: {results[0]['metadata'].get('title')}")
        
        print("\n6. Cleaning up test data...")
        await vs.delete_document("test-doc-001")
        print("   ✓ Test data deleted")
        
        print("\n" + "=" * 60)
        print("✓ All tests passed successfully!")
        print("=" * 60)
        
        return True
        
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = asyncio.run(test_vector_store())
    sys.exit(0 if success else 1)
