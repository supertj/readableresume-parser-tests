"""Font export test (2026-10-05): check every PDF in pdf/ and write results.json and results.csv.

Usage, from the repository root:

    uv run python findings/2026-10-05-font-export/analyze.py

Each PDF is the Jake's sample resume (US Letter) with only the font changed, imported into Google Docs
and exported with File > Download > PDF. The checks are the ones every template goes through
(checks/pdf_text.py, checks/compare.py, and OpenResume through checks/verify.py), against
fixtures/jakes/expected-resume.json. The requested font is read from each .docx title in docx/.
The rules that decide a result (spacing_only, font_kept, read_cleanly) are tested in test_analyze.py.

SPDX-License-Identifier: AGPL-3.0-only
"""

import csv
import hashlib
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from docx import Document

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "checks"))

from compare import LIGATURES, PRIVATE_USE, check_text, compare_fields, normalize, normalize_description  # noqa: E402
from pdf_text import read_pdf  # noqa: E402
from verify import run_parser, tool_versions  # noqa: E402

EXPECTED = json.loads((ROOT / "fixtures" / "jakes" / "expected-resume.json").read_text())
EXPECTED_PAGES = 1


def squash(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def family(postscript_name: str) -> str:
    """'BAAAAA+TimesNewRomanPSMT' -> 'timesnewroman', 'Arial-BoldMT' -> 'arial', 'HelveticaNeue' stays itself."""
    base = postscript_name.split("+")[-1].split("-")[0]
    return squash(re.sub(r"(PSMT|MT|PS)$", "", base))


def spacing_only(item: dict) -> bool:
    """A failed field whose only difference is whitespace, e.g. "checks first" read as "checksfirst".

    Uses the same normalization as the field comparison and removes nothing but whitespace, so a
    character that changed (a colon exported as a private-use character) is never counted here.
    """
    norm = normalize_description if ".descriptions[" in item["path"] else normalize
    expected, actual = norm(str(item["expected"])), norm(str(item["actual"]))
    return bool(actual) and expected != actual and re.sub(r"\s+", "", expected) == re.sub(r"\s+", "", actual)


def font_kept(visible_char_fonts: dict[str, int], requested: str) -> bool:
    """True when every visible character in the PDF is drawn in the requested font family."""
    return all(family(name) == squash(requested) for name in visible_char_fonts)


def read_cleanly(report: dict) -> bool:
    """One page, the requested font kept, the text check passed, and every field and structural check passed."""
    parser = report["parser"]
    return (
        report["fontKept"]
        and report["text"]["ok"]
        and parser["passed"] == parser["total"]
        and not parser["structuralFailed"]
        and report["pages"] == EXPECTED_PAGES
        and not report["unmappedGlyphs"]
    )


def requested_font(stem: str) -> str:
    # Titles are written as "Font test – <font>" by the generator
    return Document(HERE / "docx" / f"{stem}.docx").core_properties.title.split("–", 1)[1].strip()


def analyze(pdf: Path) -> dict:
    requested = requested_font(pdf.stem)
    facts = read_pdf(str(pdf))
    raw = "\n".join(facts.lines)

    # Which fonts drew the visible characters. Google Docs keeps the font name in the document even when
    # it has no such font, so the PDF is the only place that shows what was really used.
    visible = facts.visible_char_fonts
    total = sum(visible.values()) or 1
    in_requested = sum(count for name, count in visible.items() if family(name) == squash(requested))

    text = check_text(EXPECTED, facts.lines)
    parsed = run_parser(pdf)
    items, structural = compare_fields(EXPECTED["resume"], parsed["resume"])
    failed = [item for item in items if not item["ok"]]
    spacing = [item["path"] for item in failed if spacing_only(item)]
    structural_failed = [check for check in structural if not check["ok"]]

    ligatures = Counter(ch for ch in raw if ord(ch) in LIGATURES)
    private_use = Counter(f"U+{ord(ch):04X}" for ch in raw if ord(ch) in PRIVATE_USE)
    unmapped = len(re.findall(r"\(cid:\d+\)", raw))  # glyphs pdfminer could not map back to text

    report = {
        "file": pdf.name,
        "requestedFont": requested,
        "pdfSha256": hashlib.sha256(pdf.read_bytes()).hexdigest(),
        "pages": facts.pages,
        "fontsInPdf": facts.fonts,
        "visibleCharFonts": visible,
        "familiesUsed": sorted({re.sub(r"(PSMT|MT|PS)$", "", name.split("+")[-1].split("-")[0]) for name in visible}),
        "shareInRequestedFont": round(in_requested / total, 3),
        "fontKept": font_kept(visible, requested),
        "ligatures": {f"U+{ord(ch):04X} {ch}": count for ch, count in sorted(ligatures.items())},
        "privateUseChars": dict(private_use),
        "unmappedGlyphs": unmapped,
        "text": text,
        "parser": {
            "passed": len(items) - len(failed),
            "total": len(items),
            # Every field with its expected and actual value; failedPaths lists the ones that differ
            "items": items,
            "failedPaths": [item["path"] for item in failed],
            "spacingOnlyFailures": len(spacing),
            "spacingOnlyPaths": spacing,
            "structuralFailed": structural_failed,
            "parserLines": parsed["lines"],
        },
    }
    report["readCleanly"] = read_cleanly(report)
    return report


def summary_row(report: dict) -> dict:
    text = report["text"]
    return {
        "font": report["requestedFont"],
        "font_kept": "yes" if report["fontKept"] else "no",
        "fonts_in_pdf": " ".join(report["familiesUsed"]),
        "pages": report["pages"],
        "ligature_chars": sum(report["ligatures"].values()),
        "private_use_chars": sum(report["privateUseChars"].values()),
        "unmapped_glyphs": report["unmappedGlyphs"],
        "split_words": len(text["splitWords"]),
        "values_out_of_order": len(text["notFoundInOrder"]),
        "parser_fields": f"{report['parser']['passed']}/{report['parser']['total']}",
        "spacing_only_failures": report["parser"]["spacingOnlyFailures"],
        "parser_failed_fields": " ".join(report["parser"]["failedPaths"]),
        "read_cleanly": "yes" if report["readCleanly"] else "no",
    }


def main() -> None:
    pdfs = sorted((HERE / "pdf").glob("*.pdf"))
    if not pdfs:
        sys.exit("no PDFs in pdf/")
    reports = [analyze(pdf) for pdf in pdfs]
    (HERE / "results.json").write_text(
        json.dumps(
            {
                "sample": "fixtures/jakes/expected-resume.json (Jake's sample resume, US Letter)",
                "exportPath": "Google Docs File > Download > PDF (Drive export of the imported document)",
                "runAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
                "tools": tool_versions(),
                "results": reports,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n"
    )
    rows = [summary_row(report) for report in reports]
    with open(HERE / "results.csv", "w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    for row in rows:
        print(
            f"{row['read_cleanly']:3} {row['font']:18} kept={row['font_kept']:3} pages={row['pages']} "
            f"lig={row['ligature_chars']} pua={row['private_use_chars']} cid={row['unmapped_glyphs']} "
            f"parser={row['parser_fields']:5} spacing={row['spacing_only_failures']} in_pdf={row['fonts_in_pdf'][:40]}"
        )


if __name__ == "__main__":
    main()
