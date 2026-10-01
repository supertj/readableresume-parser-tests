"""Check C3: read the .docx exported from Google Docs with python-docx.

- Text comes out in the expected order.
- Exactly the paragraphs that are bullets in our master are list items here, no
  more and no fewer, and each one resolves to a real bullet level.
- No bullet glyph is a private-use character and none sits on Symbol or Wingdings
  (those extract as U+F0B7 and similar), checked on each paragraph's effective
  level, including level overrides.
- No tables, no text boxes, and no text anywhere in any header or footer
  (structures parsers skip or scramble, and that our templates never use).

SPDX-License-Identifier: AGPL-3.0-only
"""

from docx import Document
from docx.oxml.ns import qn

from compare import PRIVATE_USE, check_text, normalize_description

SYMBOL_FONTS = {"symbol", "wingdings", "wingdings 2", "wingdings 3"}


def _numbering(document):
    try:
        return document.part.numbering_part.element
    except (KeyError, NotImplementedError):
        return None


def _effective_level(numbering, num_id: int, ilvl: int):
    """The w:lvl that actually applies: a level override on the num wins over the abstract definition."""
    if numbering is None or num_id == 0:
        return None
    num = next((n for n in numbering.findall(qn("w:num")) if int(n.get(qn("w:numId"))) == num_id), None)
    if num is None:
        return None
    for override in num.findall(qn("w:lvlOverride")):
        if int(override.get(qn("w:ilvl"))) == ilvl and override.find(qn("w:lvl")) is not None:
            return override.find(qn("w:lvl"))
    abstract_id = num.find(qn("w:abstractNumId")).get(qn("w:val"))
    abstract = next((a for a in numbering.findall(qn("w:abstractNum")) if a.get(qn("w:abstractNumId")) == abstract_id), None)
    if abstract is None:
        return None
    return next((lvl for lvl in abstract.findall(qn("w:lvl")) if int(lvl.get(qn("w:ilvl"))) == ilvl), None)


def _bullet_level(numbering, paragraph):
    """The paragraph's bullet level, or None if it isn't a bullet."""
    ppr = paragraph._p.pPr
    if ppr is None or ppr.numPr is None or ppr.numPr.numId is None:
        return None
    ilvl = ppr.numPr.ilvl.val if ppr.numPr.ilvl is not None else 0
    level = _effective_level(numbering, ppr.numPr.numId.val, ilvl)
    fmt = level.find(qn("w:numFmt")) if level is not None else None
    return level if fmt is not None and fmt.get(qn("w:val")) == "bullet" else None


def _glyph_problems(level) -> list[str]:
    problems = []
    text = level.find(qn("w:lvlText"))
    glyph = (text.get(qn("w:val")) if text is not None else "") or ""
    if any(ord(ch) in PRIVATE_USE for ch in glyph):
        problems.append(f"private-use bullet glyph U+{ord(glyph[0]):04X}")
    rpr = level.find(qn("w:rPr"))
    fonts = rpr.find(qn("w:rFonts")) if rpr is not None else None
    for attr in ("w:ascii", "w:hAnsi", "w:cs", "w:eastAsia"):
        font = (fonts.get(qn(attr)) or "") if fonts is not None else ""
        if font.casefold() in SYMBOL_FONTS:
            problems.append(f"bullet font {font}")
    return problems


def _structure_problems(document) -> list[str]:
    problems = set()
    body = document.element.body
    if body.findall(".//" + qn("w:tbl")):
        problems.add("contains a table")
    if body.findall(".//" + qn("w:txbxContent")):
        problems.add("contains a text box")
    for section in document.sections:
        for part in (
            section.header,
            section.footer,
            section.first_page_header,
            section.first_page_footer,
            section.even_page_header,
            section.even_page_footer,
        ):
            if part.is_linked_to_previous:
                continue
            # every text run in the part, tables and text boxes included
            if any((t.text or "").strip() for t in part._element.iter(qn("w:t"))):
                problems.add("text in a header or footer")
    return sorted(problems)


def check_docx(path: str, expected: dict) -> dict:
    document = Document(path)
    numbering = _numbering(document)
    paragraphs = [p for p in document.paragraphs if p.text.strip()]
    lines = [p.text.replace("\t", " ") for p in paragraphs]

    levels = [(p, _bullet_level(numbering, p)) for p in paragraphs]
    actual_bullets = [normalize_description(p.text) for p, level in levels if level is not None]
    expected_bullets = [normalize_description(t) for t in expected["bulletTexts"]]
    glyph_problems = sorted({problem for _, level in levels if level is not None for problem in _glyph_problems(level)})
    structure = _structure_problems(document)
    text = check_text(expected, lines)
    bullets_ok = actual_bullets == expected_bullets
    ok = text["ok"] and bullets_ok and not glyph_problems and not structure
    return {
        "bullets": {
            "expected": len(expected_bullets),
            "actual": len(actual_bullets),
            "ok": bullets_ok,
            "missing": [b for b in expected_bullets if b not in actual_bullets],
            "unexpected": [b for b in actual_bullets if b not in expected_bullets],
        },
        "bulletGlyphProblems": glyph_problems,
        "structureProblems": structure,
        "text": {k: v for k, v in text.items() if k != "firstLines"},
        "ok": ok,
    }
