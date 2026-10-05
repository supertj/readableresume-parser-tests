"""Tests for the rules analyze.py uses to classify each font. Runs before every `make font-study`.

Usage, from the repository root:

    uv run python findings/2026-10-05-font-export/test_analyze.py

SPDX-License-Identifier: AGPL-3.0-only
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from analyze import font_kept, read_cleanly, spacing_only  # noqa: E402

GPA_EXPECTED = "GPA: 3.7/4.0, Dean's List six semesters"


def case(name: str, passed: bool) -> bool:
    print(f"{'ok  ' if passed else 'FAIL'}  {name}")
    return passed


def clean_report(**changes) -> dict:
    """A report that reads cleanly; each test changes one thing."""
    report = {
        "fontKept": True,
        "pages": 1,
        "unmappedGlyphs": 0,
        "text": {"ok": True},
        "parser": {"passed": 46, "total": 46, "structuralFailed": []},
    }
    report.update(changes)
    return report


def main() -> None:
    results = [
        case(
            "a field that only lost a space is spacing-only",
            spacing_only({"path": "workExperiences[0].descriptions[3]", "expected": "checks first", "actual": "checksfirst"}),
        ),
        case(
            "a colon exported as a private-use character is not spacing-only",
            not spacing_only(
                {
                    "path": "educations[0].descriptions[0]",
                    "expected": GPA_EXPECTED,
                    "actual": GPA_EXPECTED.replace(": ", ""),
                }
            ),
        ),
        case(
            "a private-use character in place of a space is not spacing-only",
            not spacing_only({"path": "profile.phone", "expected": "(312) 555-0143", "actual": "312555-0143"}),
        ),
        case("an empty value is not spacing-only", not spacing_only({"path": "profile.phone", "expected": "(312) 555-0143", "actual": ""})),
        case("Aptos drawn entirely in Arial is not kept", not font_kept({"ArialMT": 2000, "Arial-BoldMT": 174}, "Aptos")),
        case("Arial drawn in Arial is kept", font_kept({"BAAAAA+ArialMT": 2000, "AAAAAA+Arial-BoldMT": 174}, "Arial")),
        case(
            "Times New Roman matches its PostScript names",
            font_kept({"TimesNewRomanPSMT": 1900, "TimesNewRomanPS-BoldMT": 274}, "Times New Roman"),
        ),
        case("one glyph in another font means the font was not kept", not font_kept({"Calibri": 2173, "ArialMT": 1}, "Calibri")),
        case("a report with nothing wrong reads cleanly", read_cleanly(clean_report())),
        case("font substitution alone stops a clean read", not read_cleanly(clean_report(fontKept=False))),
        case("a second page alone stops a clean read", not read_cleanly(clean_report(pages=2))),
        case("a failed text check alone stops a clean read", not read_cleanly(clean_report(text={"ok": False}))),
        case(
            "a failed structural check alone stops a clean read",
            not read_cleanly(
                clean_report(parser={"passed": 46, "total": 46, "structuralFailed": [{"name": "entry count", "ok": False}]})
            ),
        ),
        case("unmapped glyphs alone stop a clean read", not read_cleanly(clean_report(unmappedGlyphs=3))),
        case(
            "one wrong field alone stops a clean read",
            not read_cleanly(clean_report(parser={"passed": 45, "total": 46, "structuralFailed": []})),
        ),
    ]
    if not all(results):
        sys.exit(1)


if __name__ == "__main__":
    main()
