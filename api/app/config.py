from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Russian Stress Trainer API"
    app_env: str = "development"
    database_url: str = "sqlite:///./stress_trainer.db"
    default_source: str = "server_dictionary"
    enable_ml_fallback: bool = True
    enable_heuristic_fallback: bool = True
    cors_origins: List[str] = ["http://localhost:8001", "http://127.0.0.1:8001", "http://localhost:8000", "http://127.0.0.1:8000"]

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        if isinstance(value, str):
            value = value.strip()
            if value == "*":
                return ["*"]
            if value.startswith("["):
                import json
                return json.loads(value)
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
