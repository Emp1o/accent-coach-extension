from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class StressLookupResponse(BaseModel):
    word: str
    stressed: str | None = None
    found: bool
    source: str | None = None
    cached: bool = False
    note: str | None = None


class WordCreate(BaseModel):
    word: str = Field(min_length=1, max_length=200)
    stressed: str = Field(min_length=1, max_length=255)
    source: str = Field(default="manual")
    notes: str | None = Field(default=None, max_length=500)


class WordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    word: str
    stressed: str
    source: str
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class HealthResponse(BaseModel):
    status: str
    app: str
    ml_enabled: bool
    heuristic_enabled: bool
