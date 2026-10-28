"""Tests for the rules analyze.py uses to sort failed fields and to find where text sits in a .docx.
Runs before every `make layout-study`.

Usage, from the repository root:

    uv run python findings/2026-10-28-layout/test_analyze.py

SPDX-License-Identifier: AGPL-3.0-only
"""

import sys
import tempfile
from pathlib import Path

from docx import Document
from docx.oxml import parse_xml

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from analyze import docx_summary, docx_text, lost_by_group, where  # noqa: E402

TEXT_BOX_RUN = (
    '<w:r xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
    ' xmlns:v="urn:schemas-microsoft-com:vml"><mc:AlternateContent>'
    "<mc:Choice Requires=\"wps\"><w:drawing><w:txbxContent><w:p><w:r><w:t>Boxed Name</w:t></w:r></w:p></w:txbxContent></w:drawing></mc:Choice>"
    "<mc:Fallback><w:pict><v:shape><v:textbox><w:txbxContent><w:p><w:r><w:t>Boxed Name</w:t></w:r></w:p></w:txbxContent>"
    "</v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent></w:r>"
)


def case(name: str, passed: bool) -> bool:
    print(f"{'ok  ' if passed else 'FAIL'}  {name}")
    return passed


def sample_docx(folder: Path) -> Path:
    """Header text, a body paragraph that anchors a text box (with a fallback copy), and a table."""
    document = Document()
    document.sections[0].header.paragraphs[0].text = "Header Name"
    anchor = document.add_paragraph("Body line")
    anchor._p.append(parse_xml(TEXT_BOX_RUN))
    table = document.add_table(rows=1, cols=2)
    table.cell(0, 0).text = "Left cell"
    table.cell(0, 1).text = "Right cell"
    path = folder / "sample.docx"
    document.save(str(path))
    return path


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        text = docx_text(sample_docx(Path(tmp)))
    results = [
        case(
            "failed fields are counted by group, groups with nothing lost are left out",
            lost_by_group(["profile.name", "profile.email", "workExperiences[1].date", "workExperiences[1].descriptions[0]", "skills.descriptions[2]"])
            == {"contact": 2, "jobs": 1, "job bullets": 1, "skills": 1},
        ),
        case("header text is filed under header, not body", where("Header Name", text) == "header" and "header name" not in text["body"]),
        case("text box text is filed under text box, not body", where("Boxed Name", text) == "text box" and "boxed name" not in text["body"]),
        case("the fallback copy of a text box is not counted again", text["text box"].count("boxed name") == 1),
        case("table cells count as body, left cell first", text["body"].index("left cell") < text["body"].index("right cell")),
        case("a value that isn't anywhere is missing", where("Not in the file", text) == "missing"),
        case(
            "contact details split between places are reported as both",
            docx_summary({"contactIn": {"name": "header", "phone": "body", "email": "body", "url": "body"}, "valuesInBody": 1,
                          "valuesAsText": 1, "valuesTotal": 1, "tables": 0, "textBoxes": 0, "images": 0})["contactIn"]
            == "body and header",
        ),
        # The committed Google Docs export of the text box layout: the text is still text in the .docx
        case(
            "Google Docs' .docx keeps the text box contents as text",
            where("jordan.ellis@example.com", docx_text(HERE / "gdocs-docx" / "text-box-contact.docx")) == "text box",
        ),
    ]
    if not all(results):
        sys.exit(1)


if __name__ == "__main__":
    main()
