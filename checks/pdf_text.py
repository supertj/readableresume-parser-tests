"""Plain-text and font facts from a PDF, using pdfminer.six (check C2).

The text is read in the PDF's own content-stream order, with layout analysis
turned off and nothing sorted. That is the raw order any extractor starts from,
so a template only passes C2 if its PDF already stores text in reading order.
A new line starts when the baseline moves; a space is added where the PDF leaves
a horizontal gap but no space character (more than a quarter of the font size).
Adding spaces can only expose split words, never hide them.

SPDX-License-Identifier: AGPL-3.0-only
"""

from dataclasses import dataclass

from pdfminer.converter import PDFPageAggregator
from pdfminer.layout import LTChar, LTFigure
from pdfminer.pdfdocument import PDFDocument
from pdfminer.pdfinterp import PDFPageInterpreter, PDFResourceManager
from pdfminer.pdfpage import PDFPage
from pdfminer.pdfparser import PDFParser
from pdfminer.pdftypes import resolve1

NEW_LINE_BASELINE_SHIFT_PT = 2.0
WORD_GAP_OF_FONT_SIZE = 0.25


@dataclass
class PdfFacts:
    lines: list[str]
    pages: int
    page_height: float
    lowest_text_y_last_page: float  # PDF points from the bottom edge
    highest_text_y_first_page: float
    fonts: list[dict]
    visible_char_fonts: dict[str, int]  # fonts used by visible characters -> character count
    whitespace_char_fonts: dict[str, int]  # fonts used by whitespace (tab stops, the gap after a bullet)


def _chars_in_stream_order(container):
    """Characters in drawing order, including text inside Form XObjects (LTFigure)."""
    for item in container:
        if isinstance(item, LTChar):
            yield item
        elif isinstance(item, LTFigure):
            yield from _chars_in_stream_order(item)


def read_pdf(path: str) -> PdfFacts:
    resources = PDFResourceManager()
    device = PDFPageAggregator(resources, laparams=None)
    interpreter = PDFPageInterpreter(resources, device)
    lines: list[str] = []
    visible: dict[str, int] = {}
    whitespace: dict[str, int] = {}
    pages = 0
    page_height = lowest = highest = 0.0

    with open(path, "rb") as handle:
        for page in PDFPage.get_pages(handle):
            interpreter.process_page(page)
            layout = device.get_result()
            pages += 1
            page_height = layout.height
            chars = list(_chars_in_stream_order(layout))
            current, previous = "", None
            for char in chars:
                text = char.get_text()
                if previous is not None and abs(char.y0 - previous.y0) > NEW_LINE_BASELINE_SHIFT_PT:
                    lines.append(current)
                    current = ""
                elif (
                    previous is not None
                    and char.x0 - previous.x1 > WORD_GAP_OF_FONT_SIZE * char.size
                    and not current.endswith(" ")
                    and not text.isspace()
                ):
                    current += " "
                current += text
                previous = char
                bucket = whitespace if text.isspace() else visible
                name = char.fontname.split("+")[-1]
                bucket[name] = bucket.get(name, 0) + 1
            lines.append(current)
            ink = [c for c in chars if not c.get_text().isspace()]
            lowest = min((c.y0 for c in ink), default=layout.height)
            if pages == 1:
                highest = max((c.y1 for c in ink), default=0.0)

    lines = [line.strip() for line in lines if line.strip()]
    return PdfFacts(lines, pages, page_height, lowest, highest, _fonts(path), visible, whitespace)


def _fonts(path: str) -> list[dict]:
    """Font names and whether each one is embedded, including fonts used inside Form XObjects."""
    found: dict[str, dict] = {}

    def visit(resources, seen: set[int]) -> None:
        resources = resolve1(resources) or {}
        for font_ref in (resolve1(resources.get("Font")) or {}).values():
            font = resolve1(font_ref)
            name = _name(font.get("BaseFont"))
            descriptor = resolve1(font.get("FontDescriptor"))
            if descriptor is None and font.get("DescendantFonts"):
                descendant = resolve1(resolve1(font["DescendantFonts"])[0])
                descriptor = resolve1(descendant.get("FontDescriptor"))
            embedded = bool(descriptor) and any(k in descriptor for k in ("FontFile", "FontFile2", "FontFile3"))
            found[name] = {"name": name, "embedded": embedded}
        for xobject_ref in (resolve1(resources.get("XObject")) or {}).values():
            if id(xobject_ref) in seen:
                continue
            seen.add(id(xobject_ref))
            xobject = resolve1(xobject_ref)
            attrs = getattr(xobject, "attrs", {})
            if _name(attrs.get("Subtype")) == "Form":
                visit(attrs.get("Resources"), seen)

    with open(path, "rb") as handle:
        document = PDFDocument(PDFParser(handle))
        for page in PDFPage.create_pages(document):
            visit(page.resources, set())
    return sorted(found.values(), key=lambda f: f["name"])


def _name(value) -> str:
    raw = getattr(value, "name", value)
    return raw.decode() if isinstance(raw, bytes) else str(raw)

