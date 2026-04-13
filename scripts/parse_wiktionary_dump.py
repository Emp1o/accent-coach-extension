from __future__ import annotations

import argparse
import json
import re
import xml.etree.ElementTree as ET
from collections import OrderedDict
from pathlib import Path

COMBINING_ACUTE = "́"
WIKI_NS = "{http://www.mediawiki.org/xml/export-0.11/}"
ACCENTED_WORD_RE = re.compile(r"[А-Яа-яЁё-]*[аеёиоуыэюяё]\u0301[А-Яа-яЁё-]*|[А-Яа-яЁё-]*ё[А-Яа-яЁё-]*")
CYRILLIC_TITLE_RE = re.compile(r"^[А-Яа-яЁё-]+$")
SECTION_RE = re.compile(r"==\s*(Русский|Russian)\s*==(?P<body>.*?)(?:(?:^==[^=].*?==\s*$)|\Z)", re.DOTALL | re.MULTILINE)
TEMPLATE_RE = re.compile(r"\{\{([^{}]+)\}\}")
TAG_RE = re.compile(r"<[^>]+>")
COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)


def remove_stress(text: str) -> str:
    return text.replace(COMBINING_ACUTE, "")


def normalize_word(text: str) -> str:
    text = remove_stress((text or "").strip().lower())
    allowed = set("абвгдеёжзийклмнопрстуфхцчшщъыьэюя-")
    return "".join(ch for ch in text if ch in allowed).strip("-")


def cleanup_wikitext(text: str) -> str:
    text = COMMENT_RE.sub(" ", text)
    text = TAG_RE.sub(" ", text)
    text = text.replace("[[", "").replace("]]", "")
    text = text.replace("''", "")
    return text


def russian_section(text: str) -> str:
    match = SECTION_RE.search(text)
    return match.group('body') if match else ""


def candidate_score(title: str, candidate: str, body: str) -> tuple[int, int]:
    score = 0
    if COMBINING_ACUTE in candidate:
        score += 5
    if "ё" in candidate:
        score += 4
    if candidate.lower().startswith(title[:4]):
        score += 1
    position = body.find(candidate)
    return score, -(position if position >= 0 else 10**9)


def find_candidates(title: str, text: str) -> list[str]:
    body = cleanup_wikitext(russian_section(text))
    if not body:
        return []

    title_norm = normalize_word(title)
    candidates: list[str] = []

    for candidate in ACCENTED_WORD_RE.findall(body):
        cand_norm = normalize_word(candidate)
        if cand_norm == title_norm and candidate not in candidates:
            candidates.append(candidate)

    for template_match in TEMPLATE_RE.finditer(body):
        parts = [part.strip() for part in template_match.group(1).split('|') if part.strip()]
        for part in parts:
            if COMBINING_ACUTE not in part and 'ё' not in part:
                continue
            cand = part.split('=')[-1].strip()
            cand_norm = normalize_word(cand)
            if cand_norm == title_norm and cand not in candidates:
                candidates.append(cand)

    candidates.sort(key=lambda item: candidate_score(title_norm, item, body), reverse=True)
    return candidates


def parse_dump(dump_path: Path, limit: int | None = None) -> OrderedDict[str, str]:
    result: OrderedDict[str, str] = OrderedDict()
    context = ET.iterparse(dump_path, events=("end",))
    processed = 0

    for _event, elem in context:
        if elem.tag != f"{WIKI_NS}page":
            continue

        title = elem.findtext(f"{WIKI_NS}title") or ""
        ns = elem.findtext(f"{WIKI_NS}ns") or ""
        text = elem.findtext(f"{WIKI_NS}revision/{WIKI_NS}text") or ""

        if ns == "0" and CYRILLIC_TITLE_RE.match(title):
            candidates = find_candidates(title, text)
            if candidates:
                result[normalize_word(title)] = candidates[0]

        processed += 1
        if processed % 1000 == 0:
            print(f"Processed {processed} pages, collected {len(result)} entries...", flush=True)
        elem.clear()
        if limit and processed >= limit:
            break

    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract Russian stress dictionary from a Wiktionary XML dump")
    parser.add_argument("--dump", required=True, help="Path to Wiktionary XML dump")
    parser.add_argument("--out", required=True, help="Path to output JSON file")
    parser.add_argument("--limit", type=int, default=None, help="Optional page processing limit for testing")
    args = parser.parse_args()

    dump_path = Path(args.dump)
    if not dump_path.exists():
        raise SystemExit(f"Dump file not found: {dump_path}")

    data = parse_dump(dump_path, limit=args.limit)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved {len(data)} entries to {out_path}")


if __name__ == "__main__":
    main()
