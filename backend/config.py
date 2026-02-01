from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import List
import json


class Settings(BaseSettings):
    # App
    app_name: str = "Smart Learning Companion"
    debug: bool = True
    
    # API Keys
    openai_api_key: str = ""
    google_api_key: str = ""
    
    # Database
    database_url: str = "postgresql+asyncpg://learning_user:learning_pass@localhost:5432/learning_assistant"
    redis_url: str = "redis://localhost:6379"
    
    # ChromaDB
    chroma_host: str = "localhost"
    chroma_port: int = 8000
    
    # JWT
    secret_key: str = "your-super-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # CORS
    cors_origins: str = '["http://localhost:3000"]'
    
    @property
    def cors_origins_list(self) -> List[str]:
        return json.loads(self.cors_origins)
    
    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
