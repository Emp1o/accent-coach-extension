from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import StressWord


class StressRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_by_word(self, word: str) -> StressWord | None:
        stmt = select(StressWord).where(StressWord.word == word)
        return self.session.execute(stmt).scalar_one_or_none()

    def list_words(self) -> list[StressWord]:
        stmt = select(StressWord).order_by(StressWord.word.asc())
        return list(self.session.execute(stmt).scalars().all())

    def upsert_word(self, *, word: str, stressed: str, source: str, notes: str | None = None) -> StressWord:
        existing = self.get_by_word(word)
        if existing:
            existing.stressed = stressed
            existing.source = source
            existing.notes = notes
            self.session.add(existing)
            self.session.flush()
            return existing

        item = StressWord(word=word, stressed=stressed, source=source, notes=notes)
        self.session.add(item)
        self.session.flush()
        return item
