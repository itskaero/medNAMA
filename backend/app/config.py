import os
from pathlib import Path
from pydantic_settings import BaseSettings


def find_env_file() -> str:
    # Look for .env in current, parent, or grandparent dir
    start_dir = Path(__file__).resolve().parent
    for parent in [start_dir, start_dir.parent, start_dir.parent.parent]:
        env_path = parent / ".env"
        if env_path.exists():
            return str(env_path)
    return ".env"


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://medrag:medrag@localhost:5433/medrag"

    # DeepSeek (Phase 4)
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com/v1"
    deepseek_model: str = "deepseek-v4-flash"

    # Gemini vision (Phase 2)
    gemini_api_key: str = ""

    # Auth (Phase 7)
    jwt_secret: str = "dev-secret-change-in-production"

    # Ingestion
    max_upload_size_mb: int = 500

    # CORS
    allowed_origins: str = "http://localhost:3000,https://med-nama.vercel.app"

    model_config = {
        "env_file": find_env_file(), 
        "env_file_encoding": "utf-8",
        "extra": "ignore"
    }


settings = Settings()
