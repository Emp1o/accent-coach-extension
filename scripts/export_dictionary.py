from __future__ import annotations

import argparse
import json
from pathlib import Path

import httpx


def main() -> None:
    parser = argparse.ArgumentParser(description="Export API dictionary to local JSON file")
    parser.add_argument("--api", required=True, help="API base URL, e.g. http://localhost:8000")
    parser.add_argument("--out", required=True, help="Output JSON file")
    args = parser.parse_args()

    api = args.api.rstrip("/")
    response = httpx.get(f"{api}/export/dictionary", timeout=30.0)
    response.raise_for_status()
    data = response.json()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Exported {len(data)} entries to {out_path}")


if __name__ == "__main__":
    main()
