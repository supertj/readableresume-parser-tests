"""Run every check on every fetched file and write results/{file}.proof.json.

Usage: uv run python checks/verify.py [template-or-file-key ...]

Exit code is non-zero if any file fails, so CI stops the release.

SPDX-License-Identifier: AGPL-3.0-only
"""

import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from compare import check_out_of_scope, check_text, compare_fields  # noqa: E402
from docx_text import check_docx  # noqa: E402
from pdf_text import read_pdf  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
PARSER_DIR = ROOT / "parser"
# PostScript family prefixes of the fonts the templates are allowed to use
FONT_PREFIX = {
    "Arial": "Arial",
    "Georgia": "Georgia",
    "Times New Roman": "TimesNewRoman",
    "Trebuchet MS": "TrebuchetMS",
    "Verdana": "Verdana",
}


def run_parser(pdf: Path) -> dict:
    env = {**os.environ, "NODE_PATH": str(PARSER_DIR / "node_modules")}
    result = subprocess.run(
        # The parser runs from parser/, so relative paths from the caller must be made absolute
        [str(PARSER_DIR / "node_modules" / ".bin" / "tsx"), "parse-pdf.ts", str(Path(pdf).resolve())],
        cwd=PARSER_DIR,
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def tool_versions() -> dict:
    commit = subprocess.run(
        ["git", "-C", str(ROOT / "vendor" / "open-resume"), "rev-parse", "HEAD"], capture_output=True, text=True, check=True
    ).stdout.strip()
    node = subprocess.run(["node", "--version"], capture_output=True, text=True, check=True).stdout.strip()
    pdfjs = json.loads((PARSER_DIR / "node_modules" / "pdfjs-dist" / "package.json").read_text())["version"]
    return {
        "openResumeCommit": commit,
        "pdfjsDist": pdfjs,
        "node": node,
        "pdfminerSix": version("pdfminer.six"),
        "pythonDocx": version("python-docx"),
    }


def check_fonts(facts, family: str) -> dict:
    """A2: every visible character uses the template font, and every font is embedded.

    Google Docs draws tab characters and the gap after a bullet with a default font
    (Arial or Times New Roman). Those are whitespace, never visible, so they are
    reported but not counted as a fallback.
    """
    prefix = FONT_PREFIX[family]
    wrong = {name: count for name, count in facts.visible_char_fonts.items() if not name.startswith(prefix)}
    not_embedded = [font["name"] for font in facts.fonts if not font["embedded"]]
    return {
        "expected": family,
        "found": sorted(facts.visible_char_fonts),
        "unexpected": sorted(wrong),
        "whitespaceFonts": facts.whitespace_char_fonts,
        "notEmbedded": not_embedded,
        "ok": not wrong and not not_embedded,
    }


def verify_file(key: str, entry: dict, versions: dict) -> dict:
    folder = ROOT / "fixtures" / entry["template"]
    pdf = folder / f"{key}.pdf"
    docx = folder / f"{key}.docx"
    expected = json.loads((folder / f"expected-{entry['doc']}.json").read_text())

    facts = read_pdf(str(pdf))
    pages_ok = facts.pages == expected["expectedPages"]
    text = check_text(expected, facts.lines)
    fonts = check_fonts(facts, expected["font"])
    c3 = check_docx(str(docx), expected)
    # Share of the text area used on the last page (reported, not gated). Margins are
    # symmetric in every template, so the gap above the first line stands in for both.
    margin = facts.page_height - facts.highest_text_y_first_page
    fill = round((facts.page_height - margin - facts.lowest_text_y_last_page) / (facts.page_height - 2 * margin), 3)

    report = {
        "file": key,
        "template": entry["template"],
        "doc": entry["doc"],
        "paper": entry["paper"],
        "exportPath": "B1: Google Docs File > Download > PDF (public export URL)",
        "source": f"https://docs.google.com/document/d/{entry['docId']}/export?format=pdf",
        "pdfSha256": hashlib.sha256(pdf.read_bytes()).hexdigest(),
        "docxSha256": hashlib.sha256(docx.read_bytes()).hexdigest(),
        "runAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "tools": versions,
        "pages": {"expected": expected["expectedPages"], "actual": facts.pages, "ok": pages_ok},
        "pageFill": fill,
        "fonts": fonts,
        "c2Text": text,
        "c3Docx": c3,
    }
    checks_ok = [pages_ok, fonts["ok"], text["ok"], c3["ok"]]

    if entry["doc"] == "resume":
        parsed = run_parser(pdf)
        items, structural = compare_fields(expected["resume"], parsed["resume"])
        passed = sum(1 for item in items if item["ok"])
        report["c1Parser"] = {
            "parser": f"OpenResume @{versions['openResumeCommit'][:7]}",
            "passed": passed,
            "total": len(items),
            "items": items,
            "structural": structural,
            "outOfScope": check_out_of_scope(expected, facts.lines),
            "parserLines": parsed["lines"],
        }
        checks_ok.append(passed == len(items) and all(check["ok"] for check in structural))

    report["pass"] = all(checks_ok)
    return report


def main() -> None:
    manifest = json.loads((ROOT / "manifest.json").read_text())
    only = set(sys.argv[1:])
    selected = {
        key: entry for key, entry in manifest["files"].items() if not only or entry["template"] in only or key in only
    }
    # A typo must not look like a clean run
    unknown = only - {entry["template"] for entry in manifest["files"].values()} - set(manifest["files"])
    if unknown or not selected:
        sys.exit(f"nothing to verify; unknown selector(s): {sorted(unknown) or sorted(only)}")
    versions = tool_versions()
    results_dir = ROOT / "results"
    results_dir.mkdir(exist_ok=True)
    summary_path = results_dir / "summary.json"
    # A partial run updates its own entries and keeps the rest of the summary
    summary = json.loads(summary_path.read_text()) if only and summary_path.exists() else {}
    for key, entry in selected.items():
        report = verify_file(key, entry, versions)
        (results_dir / f"{key}.proof.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
        c1 = report.get("c1Parser")
        score = f"{c1['passed']}/{c1['total']}" if c1 else "text only"
        summary[key] = {"pass": report["pass"], "c1": score, "pages": report["pages"]["actual"], "fill": report["pageFill"]}
        print(f"{'PASS' if report['pass'] else 'FAIL'}  {key:32} {score:>10}  pages={report['pages']['actual']}  fill={report['pageFill']}")
    summary_path.write_text(json.dumps(dict(sorted(summary.items())), indent=2) + "\n")
    if not all(summary[key]["pass"] for key in selected):
        sys.exit(1)


if __name__ == "__main__":
    main()
