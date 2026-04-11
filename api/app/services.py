from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from .config import get_settings
from .repository import StressRepository

COMBINING_ACUTE = "\u0301"
PROJECT_ROOT = Path(__file__).resolve().parents[1]
SERVER_DICTIONARY_PATH = PROJECT_ROOT / "data" / "server_dictionary.json"


@dataclass
class LookupResult:
    word: str
    stressed: str | None
    found: bool
    source: str | None = None
    cached: bool = False
    note: str | None = None


class ServerJsonDictionary:
    def __init__(self, path: Path = SERVER_DICTIONARY_PATH):
        self.path = path
        self._data = self._load()

    def _load(self) -> dict[str, str]:
        if not self.path.exists():
            return {}
        return json.loads(self.path.read_text(encoding="utf-8"))

    def lookup(self, word: str) -> str | None:
        return self._data.get(word)


class MLPredictor:
    """Optional local ML. Works best when russtress or stressrnn is installed.
    The service still returns a universal fallback if neither package is available.
    """

    def __init__(self) -> None:
        self._russtress_model = None
        self._stressrnn_model = None
        self._initialized = False
        self._init_errors: list[str] = []

    def _initialize(self) -> None:
        if self._initialized:
            return
        self._initialized = True

        try:
            from russtress import Accent  # type: ignore

            self._russtress_model = Accent()
        except Exception as exc:  # pragma: no cover
            self._init_errors.append(f"russtress unavailable: {exc}")

        try:
            import stressrnn  # type: ignore

            self._stressrnn_model = stressrnn
        except Exception as exc:  # pragma: no cover
            self._init_errors.append(f"stressrnn unavailable: {exc}")

    def predict(self, word: str) -> LookupResult | None:
        self._initialize()

        if self._russtress_model is not None:
            try:
                predicted = self._russtress_model.put_stress(word)
                if predicted and predicted != word:
                    return LookupResult(word=word, stressed=normalize_stress_marks(predicted), found=True, source="ml_russtress")
            except Exception:
                pass

        if self._stressrnn_model is not None:
            try:
                if hasattr(self._stressrnn_model, "stress_word"):
                    predicted = self._stressrnn_model.stress_word(word)
                elif hasattr(self._stressrnn_model, "put_stress"):
                    predicted = self._stressrnn_model.put_stress(word)
                else:
                    predicted = None
                if predicted and predicted != word:
                    return LookupResult(word=word, stressed=normalize_stress_marks(predicted), found=True, source="ml_stressrnn")
            except Exception:
                pass

        return None


class StressService:
    def __init__(self, session: Session):
        self.session = session
        self.repo = StressRepository(session)
        self.server_json = ServerJsonDictionary()
        self.ml = MLPredictor()
        self.settings = get_settings()

    def lookup(self, raw_word: str) -> LookupResult:
        word = normalize_word(raw_word)
        if not word:
            return LookupResult(word=raw_word, stressed=None, found=False, note="Word is empty or invalid")

        db_item = self.repo.get_by_word(word)
        if db_item:
            return LookupResult(word=word, stressed=db_item.stressed, found=True, source=db_item.source, cached=True)

        json_value = self.server_json.lookup(word)
        if json_value:
            saved = self.repo.upsert_word(word=word, stressed=json_value, source="server_json")
            return LookupResult(word=word, stressed=saved.stressed, found=True, source=saved.source, cached=False)

        if self.settings.enable_ml_fallback:
            predicted = self.ml.predict(word)
            if predicted and predicted.found and predicted.stressed:
                saved = self.repo.upsert_word(
                    word=word,
                    stressed=predicted.stressed,
                    source=predicted.source or "ml",
                    notes=predicted.note,
                )
                return LookupResult(word=word, stressed=saved.stressed, found=True, source=saved.source, cached=False, note=predicted.note)

        universal = universal_fallback(word)
        if universal:
            saved = self.repo.upsert_word(
                word=word,
                stressed=universal,
                source="fallback_last_vowel",
                notes="Fallback prediction. Verify rare or ambiguous words.",
            )
            return LookupResult(
                word=word,
                stressed=saved.stressed,
                found=True,
                source=saved.source,
                cached=False,
                note="Fallback prediction. Verify rare or ambiguous words.",
            )

        return LookupResult(word=word, stressed=word, found=True, source="fallback_passthrough", note="No vowel found")


def normalize_word(text: str) -> str:
    allowed = set("абвгдеёжзийклмнопрстуфхцчшщъыьэюя-")
    text = (text or "").strip().lower()
    cleaned = "".join(ch for ch in text if ch in allowed)
    return cleaned.strip("-")


def normalize_stress_marks(word: str) -> str:
    # Normalize accidental double marks from libraries and keep one acute mark after a vowel.
    word = word.replace("`", "").replace("'", "")
    word = word.replace("́́", "́")
    return word


def place_stress(word: str, index: int) -> str:
    if index < 0 or index >= len(word):
        return word
    if index + 1 < len(word) and word[index + 1] == COMBINING_ACUTE:
        return word
    return word[: index + 1] + COMBINING_ACUTE + word[index + 1 :]


def universal_fallback(word: str) -> str | None:
    if not word:
        return None
    if "ё" in word:
        return place_stress(word, word.index("ё"))

    vowel_positions = [i for i, ch in enumerate(word) if ch in "аеёиоуыэюя"]
    if not vowel_positions:
        return None
    if len(vowel_positions) == 1:
        return place_stress(word, vowel_positions[0])

    common_patterns = {
        "каталог": 5,
        "квартал": 4,
        "договор": 5,
        "звонит": 4,
        "торты": 1,
        "жалюзи": 6,
        "облегчить": 6,
        "кремень": 4,
    }
    if word in common_patterns:
        return place_stress(word, common_patterns[word])

    # broad fallback: stress the final vowel to guarantee an answer for any ordinary word token.
    return place_stress(word, vowel_positions[-1])
