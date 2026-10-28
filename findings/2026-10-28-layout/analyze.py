"""Layout test (2026-10-28): check every file in gdocs-pdf/ and gdocs-docx/ and write results.json and results.csv.

Usage, from the repository root:

    uv run python findings/2026-10-28-layout/analyze.py

Each layout is the Jake's sample resume (US Letter, Times New Roman) with one thing changed. The .docx in docx/
was imported into Google Docs and exported twice, the same files File > Download > PDF and File > Download >
Microsoft Word (.docx) give you.

- PDF: OpenResume (pinned, see vendor/open-resume) field by field against fixtures/jakes/expected-resume.json,
  the same comparison every template goes through (checks/compare.py), plus which expected values are missing
  from the PDF's text layer altogether (pdfminer.six) and how many images the page has.
- .docx: no parser. OpenResume reads PDFs only, so for the .docx we record where the text sits in the file
  (main body, page header, text box) and whether every expected value is there as text.

The rules that turn a report into the published numbers are tested in test_analyze.py.

SPDX-License-Identifier: AGPL-3.0-only
"""

import csv
import hashlib
import json
import re
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from docx import Document
from lxml import etree
from pdfminer.high_level import extract_pages
from pdfminer.layout import LTFigure, LTImage

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "checks"))

from compare import check_text, compare_fields, normalize, normalize_description  # noqa: E402
from pdf_text import read_pdf  # noqa: E402
from verify import run_parser, tool_versions  # noqa: E402

EXPECTED = json.loads((ROOT / "fixtures" / "jakes" / "expected-resume.json").read_text())
# Control first, then roughly from the least to the most disruptive change
ORDER = [
    "single-column",
    "photo",
    "contact-icons",
    "skill-bars",
    "header-contact",
    "table-dates-left",
    "table-dates-narrow",
    "two-column-table",
    "two-column-columns",
    "text-box-contact",
]
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
MC = "http://schemas.openxmlformats.org/markup-compatibility/2006"
CONTACT = ["name", "phone", "email", "url"]
# Groups for "what was lost", in the order a recruiter reads a resume
GROUPS = ["contact", "jobs", "job bullets", "education", "projects", "skills"]


def group(path: str) -> str:
    """'workExperiences[0].company' -> 'jobs'; '...descriptions[2]' of a job -> 'job bullets'."""
    if path.startswith("profile."):
        return "contact"
    if path.startswith("workExperiences["):
        return "job bullets" if ".descriptions[" in path else "jobs"
    if path.startswith("educations["):
        return "education"
    if path.startswith("projects["):
        return "projects"
    if path.startswith("skills."):
        return "skills"
    raise ValueError(path)


def lost_by_group(failed_paths: list[str]) -> dict[str, int]:
    counts = {name: 0 for name in GROUPS}
    for path in failed_paths:
        counts[group(path)] += 1
    return {name: count for name, count in counts.items() if count}


def images_on_pages(pdf: Path) -> int:
    def walk(container) -> int:
        found = 0
        for item in container:
            if isinstance(item, LTImage):
                found += 1
            elif isinstance(item, LTFigure):
                found += walk(item)
        return found

    return sum(walk(page) for page in extract_pages(str(pdf)))


def analyze_pdf(pdf: Path) -> dict:
    facts = read_pdf(str(pdf))
    text = check_text(EXPECTED, facts.lines)
    parsed = run_parser(pdf)
    items, structural = compare_fields(EXPECTED["resume"], parsed["resume"])
    items = [{**item, "group": group(item["path"])} for item in items]
    failed = [item["path"] for item in items if not item["ok"]]
    return {
        "file": f"{pdf.parent.name}/{pdf.name}",
        "pdfSha256": hashlib.sha256(pdf.read_bytes()).hexdigest(),
        "pages": facts.pages,
        "images": images_on_pages(pdf),
        "fontsInPdf": sorted(facts.visible_char_fonts),
        "text": {
            # Expected values that aren't in the PDF's text layer at all (drawn as a picture, or dropped)
            "missingOccurrences": text["missingOccurrences"],
            "forbiddenChars": text["forbiddenChars"],
            "splitWords": text["splitWords"],
        },
        "parser": {
            "passed": len(items) - len(failed),
            "total": len(items),
            "items": items,
            "failedPaths": failed,
            "lostByGroup": lost_by_group(failed),
            "structuralFailed": [check for check in structural if not check["ok"]],
            "parserLines": parsed["lines"],
        },
    }


# ---------- .docx ----------


def _own_text(paragraph) -> str:
    """Text of this paragraph only, not of paragraphs nested in a text box inside it."""
    parts = []
    for node in paragraph.iter(f"{{{W}}}t"):
        owner = next(node.iterancestors(f"{{{W}}}p"))
        if owner is paragraph:
            parts.append(node.text or "")
    return "".join(parts)


def docx_text(path: Path) -> dict[str, str]:
    """Text of a .docx by where it sits: 'body', 'text box', 'header' (headers and footers).

    Table cells count as body, in the order they're stored (row by row, left cell first). A text box is
    stored twice when the file carries a fallback copy for older readers (mc:Fallback); only the first copy counts.
    """
    places = {"body": [], "text box": [], "header": []}
    with zipfile.ZipFile(path) as archive:
        body = etree.fromstring(archive.read("word/document.xml"))
        for paragraph in body.iter(f"{{{W}}}p"):
            ancestors = {etree.QName(node).localname for node in paragraph.iterancestors()}
            if "Fallback" in ancestors:
                continue
            places["text box" if "txbxContent" in ancestors else "body"].append(_own_text(paragraph))
        for name in sorted(archive.namelist()):
            if re.fullmatch(r"word/(header|footer)\d*\.xml", name):
                part = etree.fromstring(archive.read(name))
                places["header"].extend(_own_text(p) for p in part.iter(f"{{{W}}}p"))
    return {place: normalize(" ".join(lines)) for place, lines in places.items()}


def expected_values() -> list[str]:
    """Every distinct value of the sample text (a school that is also an employer counts once)."""
    values = []
    for entry in EXPECTED["textSequence"]:
        values.extend(entry["anyOrder"] if isinstance(entry, dict) else [entry])
    return list(dict.fromkeys(values))


def where(value: str, text: dict[str, str]) -> str:
    needle = normalize_description(value)
    return next((place for place, content in text.items() if needle in content), "missing")


def analyze_docx(path: Path) -> dict:
    text = docx_text(path)
    values = expected_values()
    places = {value: where(value, text) for value in values}
    document = Document(str(path))
    body = document.element.body
    with zipfile.ZipFile(path) as archive:
        images = sum(1 for name in archive.namelist() if name.startswith("word/media/"))
    contact = {field: places[EXPECTED["resume"]["profile"][field]] for field in CONTACT}
    return {
        "file": f"{path.parent.name}/{path.name}",
        "docxSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "tables": len(body.findall(f".//{{{W}}}tbl")),
        "textBoxes": len([box for box in body.iter(f"{{{W}}}txbxContent") if f"{{{MC}}}Fallback" not in {a.tag for a in box.iterancestors()}]),
        "images": images,
        "contactIn": contact,
        "valuesTotal": len(values),
        "valuesInBody": sum(1 for place in places.values() if place == "body"),
        "valuesAsText": sum(1 for place in places.values() if place != "missing"),
        "notInBody": {value: place for value, place in places.items() if place != "body"},
    }


def docx_summary(report: dict) -> dict:
    places = sorted(set(report["contactIn"].values()))
    return {
        "contactIn": places[0] if len(places) == 1 else " and ".join(places),
        "valuesInBody": report["valuesInBody"],
        "valuesAsText": report["valuesAsText"],
        "valuesTotal": report["valuesTotal"],
        "tables": report["tables"],
        "textBoxes": report["textBoxes"],
        "images": report["images"],
    }


def label(stem: str) -> str:
    # Titles are written as "Layout test – <label>" by the generator
    return Document(str(HERE / "docx" / f"{stem}.docx")).core_properties.title.split("–", 1)[1].strip()


def analyze(stem: str) -> dict:
    docx = analyze_docx(HERE / "gdocs-docx" / f"{stem}.docx")
    return {
        "layout": stem,
        "label": label(stem),
        "gdocsPdf": analyze_pdf(HERE / "gdocs-pdf" / f"{stem}.pdf"),
        "gdocsDocx": {**docx, "summary": docx_summary(docx)},
    }


def summary_row(report: dict) -> dict:
    pdf, docx = report["gdocsPdf"], report["gdocsDocx"]["summary"]
    return {
        "layout": report["layout"],
        "description": report["label"],
        "pdf_fields_read": pdf["parser"]["passed"],
        "pdf_fields_total": pdf["parser"]["total"],
        "pdf_pages": pdf["pages"],
        "pdf_images": pdf["images"],
        "pdf_values_missing_from_text": len(pdf["text"]["missingOccurrences"]),
        "pdf_fields_lost_by_group": "; ".join(f"{name} {count}" for name, count in pdf["parser"]["lostByGroup"].items()),
        "pdf_failed_fields": " ".join(pdf["parser"]["failedPaths"]),
        "docx_contact_details_in": docx["contactIn"],
        "docx_values_in_body": docx["valuesInBody"],
        "docx_values_as_text": docx["valuesAsText"],
        "docx_values_total": docx["valuesTotal"],
        "docx_tables": docx["tables"],
        "docx_text_boxes": docx["textBoxes"],
        "docx_images": docx["images"],
    }


def main() -> None:
    stems = sorted(p.stem for p in (HERE / "docx").glob("*.docx"))
    if sorted(stems) != sorted(ORDER):
        sys.exit(f"docx/ and ORDER disagree: {sorted(set(stems) ^ set(ORDER))}")
    reports = [analyze(stem) for stem in ORDER]
    (HERE / "results.json").write_text(
        json.dumps(
            {
                "sample": "fixtures/jakes/expected-resume.json (Jake's sample resume, US Letter, Times New Roman)",
                "exportPath": "Google Docs: .docx imported through Drive, exported as PDF and as .docx (same files as File > Download)",
                # When the files in gdocs-pdf/ and gdocs-docx/ were exported, written by the generator
                "exportedAt": json.loads((HERE / "export.json").read_text())["exportedAt"],
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
            f"{row['layout']:20} pdf={row['pdf_fields_read']}/{row['pdf_fields_total']} pages={row['pdf_pages']} "
            f"img={row['pdf_images']} missing={row['pdf_values_missing_from_text']} lost=[{row['pdf_fields_lost_by_group']}] "
            f"docx contact={row['docx_contact_details_in']} body={row['docx_values_in_body']}/{row['docx_values_total']} "
            f"text={row['docx_values_as_text']}"
        )


if __name__ == "__main__":
    main()
