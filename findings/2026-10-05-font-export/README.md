# Font export test (2026-10-05)

If you build a resume in Google Docs and change only the font, does it still come out of
File > Download > PDF in a form a resume parser reads correctly? We tested 32 fonts.

## Method

- **Sample.** The Jake's sample resume (`fixtures/jakes/expected-resume.json`), US Letter. Same sizes (name 22 pt,
  headings 12 pt, body 11 pt, detail lines 10.5 pt) and same layout for every font; only the font changes. In its
  original font, Times New Roman, it reads 46 of 46 fields. Its text has "fi", "fl", "ff" and "ffi" in words such as
  first, profile, Flask, conflict and office, which is where ligatures show up.
- **Fonts.** 26 that Google Docs offers: the five our templates use (Arial, Georgia, Times New Roman, Trebuchet MS,
  Verdana), Calibri, Cambria, Tahoma, Courier New, EB Garamond, and Google Fonts that resume guides often recommend.
  Plus 6 that are common in Word or on a Mac but that Docs may not have: Aptos (the default in recent versions of
  Word), Garamond, Helvetica, Century Gothic, Book Antiqua and Palatino Linotype.
- **Export.** Each file in `docx/` was imported into Google Docs (Drive's .docx import, in a private folder) and
  exported as PDF through Drive's export, which gives the same file as File > Download > PDF. The PDFs are in `pdf/`.
- **Checks.** The ones every template goes through: pdfminer.six text in the PDF's own order (ligatures U+FB00 to
  U+FB06, private-use characters, order of every value), the fonts that drew the visible text, the page count, and
  OpenResume (pinned, see `vendor/open-resume`) field by field against the expected values.
- **Raw results.** `results.json` has every item, expected and actual; `results.csv` has one row per font.

## Results

| Font | Font in the PDF | Pages | Ligatures | Private-use chars | OpenResume fields |
|---|---|---:|---|---:|---:|
| Aptos | Arial | 1 | none | 0 | 36/46 |
| Arial | same | 1 | none | 0 | 46/46 |
| Book Antiqua | same | 1 | none | 0 | 46/46 |
| Calibri | same | 1 | none | 0 | 46/46 |
| Cambria | same | 1 | none | 0 | 46/46 |
| Century Gothic | same | 2 | none | 0 | 41/46 |
| Courier New | same | 2 | none | 0 | 10/46 |
| EB Garamond | same | 1 | none | 0 | 46/46 |
| Garamond | same | 1 | none | 0 | 46/46 |
| Georgia | same | 1 | none | 0 | 46/46 |
| Helvetica | Helvetica Neue | 1 | fi ×4, fl ×1, ffi ×1 | 0 | 43/46 |
| Inter | same | 1 | none | 4 | 44/46 |
| Lato | same | 1 | fi ×5, fl ×1 | 0 | 43/46 |
| Libre Baskerville | same | 2 | fi ×4, fl ×1, ffi ×1 | 0 | 39/46 |
| Lora | same | 1 | fi ×5, fl ×1 | 0 | 43/46 |
| Merriweather | same | 2 | fi ×5, fl ×1 | 0 | 40/46 |
| Montserrat | same | 2 | fi ×5, fl ×1 | 0 | 39/46 |
| Nunito | same | 2 | fi ×5, fl ×1 | 0 | 40/46 |
| Open Sans | same | 2 | fi ×4, fl ×1, ffi ×1 | 0 | 39/46 |
| Palatino Linotype | same | 2 | fi ×4, fl ×1, ffi ×1 | 0 | 40/46 |
| Playfair Display | same | 2 | fi ×4, fl ×1 | 0 | 40/46 |
| Poppins | same | 2 | none | 0 | 37/46 |
| PT Serif | same | 2 | fi ×5, fl ×1 | 0 | 30/46 |
| Raleway | same | 1 | fi ×4, fl ×1, ffi ×1 | 0 | 43/46 |
| Roboto | same | 1 | fi ×4, fl ×1, ffi ×1 | 0 | 43/46 |
| Roboto Slab | same | 2 | fi ×5, fl ×1 | 0 | 29/46 |
| Source Sans 3 | same | 2 | ff ×1 | 0 | 43/46 |
| Tahoma | same | 1 | none | 0 | 36/46 |
| Times New Roman | same | 1 | none | 0 | 46/46 |
| Trebuchet MS | same | 1 | none | 0 | 46/46 |
| Verdana | same | 2 | none | 0 | 41/46 |
| Work Sans | same | 2 | fi ×4, fl ×1 | 0 | 40/46 |

"Font in the PDF" is the font that drew the visible text, which shows what Google Docs actually used.

## What we found

- **9 of 32 read cleanly**: Arial, Book Antiqua, Calibri, Cambria, EB Garamond, Garamond, Georgia, Times New Roman and
  Trebuchet MS. One page, the right font, no odd characters, 46 of 46 fields.
- **Ligatures, 16 fonts.** The PDF stores "fi" and "fl" (in some fonts also "ffi" or "ff") as a single character,
  so pdfminer reads `ﬁrst` instead of `first`. OpenResume also dropped the space before those words: "checks first"
  came out as `checksfirst`. That costs 3 of the 46 fields even when nothing else goes wrong (Lato, Lora, Raleway,
  Roboto).
- **Substituted fonts.** Google Docs drew Aptos in Arial and Helvetica in Helvetica Neue.
- **Company on the date line.** With Aptos (drawn in Arial), Tahoma and Roboto Slab, OpenResume joined each company
  name onto the end of the date above it: `May 2025 – Aug 2025Ironhaw Freight`. The company and date fields failed
  for every job.
- **Inter.** The brackets and hyphen in `(312) 555-0143` and the colon after "GPA" came out as private-use characters
  (U+E081, U+E082, U+E088, U+E092). The phone field came back empty.
- **Courier New.** OpenResume ran many words together (`Builta shipmentstatusAPI inGoto`): 18 fields differ only in
  spacing, 10 of 46 read correctly. pdfminer's text was fine.
- **Length.** At the same point sizes, 15 fonts pushed the one-page sample onto a second page. When that happens,
  OpenResume joins the last line of page 1 to the first line of page 2 (a known limit), which explains part of the
  lower scores in those rows. Verdana, Libre Baskerville and Courier New also wrapped the contact line.

## Limits

- One sample, one layout (Jake's), US Letter, one export path (Google Docs PDF).
- One open-source parser and one text extractor. This says nothing direct about Workday, Greenhouse, iCIMS or other
  commercial systems, which may or may not normalize ligatures.
- Google Docs changes over time. Tested 2026-10-05.
- The Google Docs themselves are private. The exact .docx inputs and the PDFs they produced are in this folder.

## Reproduce

```sh
make font-study    # or: uv run python findings/2026-10-05-font-export/analyze.py
```

It runs every check on the PDFs in `pdf/` and rewrites `results.json` and `results.csv`, identical apart from
`runAt`. With Docker: `make docker-verify` builds the pinned image; then
`docker run --rm readableresume-parser-tests make font-study`. To redo the export itself, import any file from
`docx/` into Google Docs and use File > Download > PDF.
