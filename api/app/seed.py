from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

from .database import Base, engine, get_session
from .repository import StressRepository

COMBINING_ACUTE = "́"


def normalize_word(text: str) -> str:
    text = (text or "").strip().lower().replace(COMBINING_ACUTE, "")
    allowed = set("абвгдеёжзийклмнопрстуфхцчшщъыьэюя-")
    return "".join(ch for ch in text if ch in allowed).strip("-")


def load_dictionary(path: Path) -> dict[str, str]:
    suffix = path.suffix.lower()

    if suffix == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        return {normalize_word(word): stressed for word, stressed in data.items() if normalize_word(word) and stressed}

    if suffix in {".tsv", ".txt", ".csv"}:
        delimiter = "	" if suffix in {".tsv", ".txt"} else ","
        loaded: dict[str, str] = {}
        with path.open("r", encoding="utf-8", newline="") as file_obj:
            reader = csv.reader(file_obj, delimiter=delimiter)
            for row in reader:
                if len(row) < 2:
                    continue
                word = normalize_word(row[0])
                stressed = row[1].strip()
                if word and stressed:
                    loaded[word] = stressed
        return loaded

    raise SystemExit(f"Unsupported file type: {path.suffix}. Use .json, .tsv, .txt or .csv")


def main() -> None:
    parser = argparse.ArgumentParser(description="Import stress dictionary into SQLite")
    parser.add_argument("--json", help="Path to source JSON dictionary")
    parser.add_argument("--input", help="Path to source dictionary (.json, .tsv, .txt, .csv)")
    parser.add_argument("--source", default="seed_import", help="Source label to save in DB")
    args = parser.parse_args()

    source_arg = args.input or args.json
    if not source_arg:
        raise SystemExit("Provide --input PATH or --json PATH")

    source_path = Path(source_arg)
    if not source_path.exists():
        raise SystemExit(f"File not found: {source_path}")

    Base.metadata.create_all(bind=engine)
    data = load_dictionary(source_path)

    with get_session() as session:
        repo = StressRepository(session)
        for word, stressed in data.items():
            repo.upsert_word(word=word, stressed=stressed, source=args.source)

    print(f"Imported {len(data)} words from {source_path}")


if __name__ == "__main__":
    main()
