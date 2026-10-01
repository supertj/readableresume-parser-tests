"""Download B1 (PDF) and B3 (.docx) for every file in manifest.json.

Both come from Google Docs' public export URLs, which is exactly what
"File → Download → PDF / Microsoft Word" produces. No Google credentials are
needed: the template documents are shared as "anyone with the link can view".

SPDX-License-Identifier: AGPL-3.0-only
"""

import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPORT_URL = "https://docs.google.com/document/d/{doc_id}/export?format={fmt}"


def download(url: str, target: Path) -> None:
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as response:
                body = response.read()
            if not body:
                raise ValueError("empty response")
            target.write_bytes(body)
            return
        except Exception as error:  # noqa: BLE001 - retry any network error, then give up
            if attempt == 3:
                raise RuntimeError(f"{url}: {error}") from error
            time.sleep(2 ** attempt)


def main() -> None:
    manifest = json.loads((ROOT / "manifest.json").read_text())
    only = set(sys.argv[1:])
    for key, entry in manifest["files"].items():
        if only and entry["template"] not in only and key not in only:
            continue
        folder = ROOT / "fixtures" / entry["template"]
        folder.mkdir(parents=True, exist_ok=True)
        for fmt in ("pdf", "docx"):
            download(EXPORT_URL.format(doc_id=entry["docId"], fmt=fmt), folder / f"{key}.{fmt}")
        print(f"fetched {key}")


if __name__ == "__main__":
    main()
