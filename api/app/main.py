from __future__ import annotations

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel

from .config import get_settings
from .database import Base, SessionLocal, engine
from .repository import StressRepository
from .schemas import HealthResponse, StressLookupResponse, WordCreate, WordRead
from .services import StressService
from .punctuation import punctuate_text

settings = get_settings()
Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.app_name, version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class OverridePayload(BaseModel):
    word: str
    stressed: str


class PunctuatePayload(BaseModel):
    text: str


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        app=settings.app_name,
        ml_enabled=settings.enable_ml_fallback,
        heuristic_enabled=settings.enable_heuristic_fallback,
    )


@app.get("/stress", response_model=StressLookupResponse)
def lookup_stress(word: str = Query(..., min_length=1), db: Session = Depends(get_db)) -> StressLookupResponse:
    service = StressService(db)
    result = service.lookup(word)
    return StressLookupResponse(**result.__dict__)


@app.post("/stress/override")
def stress_override(payload: OverridePayload, db: Session = Depends(get_db)):
    repo = StressRepository(db)
    item = repo.upsert_word(word=payload.word.strip().lower(), stressed=payload.stressed, source='manual_override', notes='Saved from extension UI')
    db.commit()
    db.refresh(item)
    return {"ok": True, "word": item.word, "stressed": item.stressed, "source": item.source}


@app.post("/punctuate")
def punctuate(payload: PunctuatePayload):
    return punctuate_text(payload.text)


@app.get("/words", response_model=list[WordRead])
def list_words(db: Session = Depends(get_db)) -> list[WordRead]:
    repo = StressRepository(db)
    return repo.list_words()


@app.post("/words", response_model=WordRead)
def create_or_update_word(payload: WordCreate, db: Session = Depends(get_db)) -> WordRead:
    repo = StressRepository(db)
    item = repo.upsert_word(word=payload.word.strip().lower(), stressed=payload.stressed, source=payload.source, notes=payload.notes)
    db.commit()
    db.refresh(item)
    return item


@app.get("/export/dictionary")
def export_dictionary(db: Session = Depends(get_db)) -> dict[str, str]:
    repo = StressRepository(db)
    return {item.word: item.stressed for item in repo.list_words()}
