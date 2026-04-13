from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

COMBINING_ACUTE = "́"


def normalize_word(text: str) -> str:
    text = (text or "").strip().lower().replace(COMBINING_ACUTE, "")
    allowed = set("абвгдеёжзийклмнопрстуфхцчшщъыьэюя-")
    return "".join(ch for ch in text if ch in allowed).strip("-")


def load_source(path: Path) -> dict[str, str]:
    suffix = path.suffix.lower()
    if suffix == '.json':
        data = json.loads(path.read_text(encoding='utf-8'))
        return {normalize_word(k): str(v).strip() for k, v in data.items() if normalize_word(k) and str(v).strip()}

    if suffix in {'.tsv', '.csv', '.txt'}:
        delimiter = '	' if suffix in {'.tsv', '.txt'} else ','
        result: dict[str, str] = {}
        with path.open('r', encoding='utf-8', newline='') as f:
            reader = csv.reader(f, delimiter=delimiter)
            for row in reader:
                if len(row) < 2:
                    continue
                word = normalize_word(row[0])
                stressed = row[1].strip()
                if word and stressed:
                    result[word] = stressed
        return result

    raise SystemExit(f'Unsupported file type: {path.suffix}')


def main() -> None:
    parser = argparse.ArgumentParser(description='Merge multiple dictionaries into one normalized JSON file')
    parser.add_argument('--out', required=True, help='Output JSON file')
    parser.add_argument('sources', nargs='+', help='Source files: .json, .tsv, .csv, .txt')
    args = parser.parse_args()

    merged: dict[str, str] = {}
    for source_str in args.sources:
        source = Path(source_str)
        if not source.exists():
            raise SystemExit(f'File not found: {source}')
        loaded = load_source(source)
        merged.update(loaded)
        print(f'Loaded {len(loaded)} entries from {source}')

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(dict(sorted(merged.items())), ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Saved {len(merged)} merged entries to {out_path}')


if __name__ == '__main__':
    main()
