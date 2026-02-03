
import asyncio
import httpx
import json

BASE_URL = "http://localhost:8001/api"

async def test_streaming():
    async with httpx.AsyncClient() as client:
        # 1. Register/Login to get token
        email = "user3@example.com"
        password = "16012003"
        
        try:
            # Try login first
            print("Logging in...")
            resp = await client.post(f"{BASE_URL}/auth/login/json", json={"email": email, "password": password})
            if resp.status_code == 401 or resp.status_code == 404:
                print("Registering...")
                await client.post(f"{BASE_URL}/auth/register", json={"email": email, "password": password, "username": "streamtester"})
                resp = await client.post(f"{BASE_URL}/auth/login/json", json={"email": email, "password": password})
            
            token = resp.json()["access_token"]
            print(f"Got token: {token[:10]}...")
            
            # 2. Test Stream
            print("\nTesting Streaming Chat...")
            headers = {"Authorization": f"Bearer {token}"}
            payload = {
                "message": "Hello, how are you?",
                "conversation_history": []
            }
            
            async with client.stream("POST", f"{BASE_URL}/chat/stream", json=payload, headers=headers) as response:
                print(f"Status: {response.status_code}")
                async for line in response.aiter_lines():
                    if line:
                        print(f"Received chunk: {line}")
                        try:
                            data = json.loads(line)
                            if data['type'] == 'token':
                                print(f"Token: {data['content']}", end="", flush=True)
                            elif data['type'] == 'sources':
                                print(f"\nSources: {data['data']}")
                            elif data['type'] == 'error':
                                print(f"\nError: {data['content']}")
                        except:
                            print(f"\nRaw: {line}")
                            
            print("\n\nTest Complete.")
            
        except Exception as e:
            print(f"Test Failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_streaming())
