"""Check PDFs exported by hand (B2: Chrome print to PDF, B4: Word save as PDF).

These paths can't run in CI, so a person exports them and this script applies the
same field and text checks as the public proof. Results go to the sign-off record,
not to the published proof (PRD 4.3.5).

Usage:
  uv run python checks/verify_manual.py B2 <folder>   # folder holds {file-key}.pdf, e.g. jakes-resume-letter.pdf
  uv run python checks/verify_manual.py B4 <folder>

Writes signoff/{date}-{time}-{path}.json (never overwrites an earlier record), prints
one line per file, and exits non-zero if the folder has no resume PDFs or any file fails.

SPDX-License-Identifier: AGPL-3.0-only
"""

import json
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from compare import check_text, compare_fields  # noqa: E402
from pdf_text import read_pdf  # noqa: E402
from verify import ROOT, check_fonts, run_parser  # noqa: E402

PATHS = {"B2": "Chrome Print > Save as PDF", "B4": "Word for Windows > Save as PDF"}


def main() -> None:
    path_id, folder = sys.argv[1], Path(sys.argv[2])
    if path_id not in PATHS:
        sys.exit(f"path must be one of {list(PATHS)}")
    if not folder.is_dir():
        sys.exit(f"{folder} is not a folder")
    manifest = json.loads((ROOT / "manifest.json").read_text())["files"]
    records = []
    for pdf in sorted(folder.glob("*.pdf")):
        entry = manifest.get(pdf.stem)
        if not entry or entry["doc"] != "resume":
            print(f"skip  {pdf.name} (not a resume file key)")
            continue
        expected = json.loads((ROOT / "fixtures" / entry["template"] / "expected-resume.json").read_text())
        facts = read_pdf(str(pdf))
        items, structural = compare_fields(expected["resume"], run_parser(pdf)["resume"])
        text = check_text(expected, facts.lines)
        fonts = check_fonts(facts, expected["font"])
        passed = sum(1 for item in items if item["ok"])
        ok = (
            passed == len(items)
            and all(check["ok"] for check in structural)
            and text["ok"]
            and facts.pages == expected["expectedPages"]
        )
        records.append(
            {
                "file": pdf.stem,
                "path": path_id,
                "pass": ok,
                "c1": f"{passed}/{len(items)}",
                "failedItems": [i for i in items + structural if not i["ok"]],
                "text": {k: v for k, v in text.items() if k != "firstLines"},
                "pages": facts.pages,
                # 打印和 Word 另存的字体可能被系统替换，记录下来但不作为 C1 的判定条件
                "fonts": fonts,
            }
        )
        print(f"{'PASS' if ok else 'FAIL'}  {pdf.stem:32} {passed}/{len(items)}  pages={facts.pages}")
    if not records:
        sys.exit(f"no resume PDFs named by file key in {folder}; nothing recorded")
    stamp = datetime.now().strftime("%Y-%m-%d-%H%M%S")
    out = ROOT / "signoff" / f"{stamp}-{path_id}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({"path": PATHS[path_id], "checkedOn": str(date.today()), "files": records}, indent=2, ensure_ascii=False) + "\n")
    print(f"written {out.relative_to(ROOT)}")
    if not all(record["pass"] for record in records):
        sys.exit("some files failed; see the record above")


if __name__ == "__main__":
    main()
