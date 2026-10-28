# Layout test (2026-10-28)

Same resume, same words, same font, ten layouts. Each one goes through Google Docs and comes out as a PDF and a
.docx. How many fields does a resume parser still read correctly from the PDF, and where does the text sit in
the .docx?

## Method

- **Sample.** The Jake's sample resume (`fixtures/jakes/expected-resume.json`), US Letter, Times New Roman. In its
  own one-column layout it reads 46 of 46 fields. The 46 are the name, email, phone, link, location and summary (the
  last two should stay empty), the title, organization and dates of every job, school and project, every bullet,
  the GPA and the three skills lines.
- **Layouts.** Each version changes one thing and keeps the text, the font and the sizes. `test_analyze.py` checks
  that every run of text in every file in `docx/` has the same size, bold, italics and style as in the control:

  | File | What changes |
  |---|---|
  | `single-column` | Nothing. The control |
  | `photo` | A 0.75 in placeholder photo floats at the top right; the text wraps around it |
  | `contact-icons` | The contact line uses small icons (pictures) before each item instead of `\|` separators |
  | `skill-bars` | Each skills line ends with a five-step rating bar (a picture) |
  | `header-contact` | The name and contact line are in the page header (Insert > Headers) |
  | `table-dates-left` | Each entry is a borderless table row: dates in a 1.45 in left cell, the rest on the right |
  | `table-dates-narrow` | The same table with a 1.3 in date cell, too narrow for the job dates, which wrap |
  | `two-column-table` | Name and contact across the top, then a borderless two-cell table: education and skills in a 2.2 in left column, jobs and projects on the right |
  | `two-column-columns` | Name and contact across the top, then the rest in two columns (Format > Columns) |
  | `text-box-contact` | The name and contact line are in a borderless text box at the top of the page |

- **Export.** Each file in `docx/` was imported into Google Docs (Drive's .docx import, in a private folder) and
  exported through Drive as PDF (`gdocs-pdf/`) and as .docx (`gdocs-docx/`), the same files File > Download gives
  you. `export.json` records when.
- **PDF checks.** OpenResume (pinned, see `vendor/open-resume`) field by field against the expected values, with
  the same comparison rules as every template (`checks/compare.py`). pdfminer.six reports which expected values are
  missing from the PDF's text altogether, and how many images each page has.
- **.docx checks.** There's no parser here: OpenResume reads PDFs only. For each .docx we record where the
  expected text sits (main body, page header, text box) and whether all of it is there as text.
- **Raw results.** `results.json` has every field with its expected and actual value and the lines OpenResume
  read; `results.csv` has one row per layout. `test_analyze.py` tests the rules that sort the results.

## Results

| Layout | PDF fields read | Lost (by group) | Expected values missing from the PDF text | Contact details in the .docx |
|---|---:|---|---:|---|
| One column (control) | 46/46 | | 0 | body |
| Photo | 46/46 | | 0 | body |
| Contact icons | 46/46 | | 0 | body |
| Skill rating bars | 46/46 | | 0 | body |
| Contact details in the page header | 46/46 | | 0 | page header |
| Dates in a table column | 46/46 | | 0 | body |
| Dates in a table column too narrow for them | 40/46 | jobs 6 | 0 | body |
| Two columns, table | 42/46 | education 1, skills 3 | 0 | body |
| Two columns, Format > Columns | 42/46 | jobs 2, education 1, skills 1 | 0 | body |
| Text box | 34/46 | contact 6, education 6 | 5 | text box |

Every PDF is one page.

## What we found

- **The text box became a picture.** In the PDF, Google Docs drew the text box as an image. The name, phone number,
  email and both links were not in the PDF's text at all. With nothing above the first heading, OpenResume took the
  heading `EDUCATION` as the name, put the school's city in the location field and the rest of the education section
  in the summary, and found no education entry at all. The .docx from the same Google Doc still has the text, inside
  a text box.
- **The photo, contact icons and skill bars each read 46 of 46.** The pictures sit beside the text; the text
  itself is unchanged.
- **The parser read all of the page-header text in the PDF.** Google Docs drew the header text at the top of the
  page like any other line. In the .docx, the same text is stored in the header part of the file
  (`word/header1.xml`), separate from the main body.
- **Narrowing the date column from 1.45 in to 1.3 in dropped the score from 46/46 to 40/46.** With a 1.45 in date
  cell, the parser joined each date to the title next to it and read all 46 fields. At 1.3 in, the three job date
  ranges (11 pt) wrapped onto two lines. For each job, the year on the second line was read as the company (`2025`
  instead of `Ironhaw Freight`) and the date lost its end year. The education date (10.5 pt italic, as in the
  control) and the project dates still fit on one line and were read correctly.
- **Two columns: the columns stayed apart, wrapped lines didn't.** In both two-column PDFs, Google Docs stores each
  column's text in order, and the parser didn't mix the columns together. What it lost were lines that wrapped in
  the narrower columns. In the table version the degree was cut after its first line, and the three skills lines,
  each wrapped, came back as six. In the Format > Columns version the degree and one skills line were cut, and one
  job's date wrapped and its year was read as the company.

## Correction (2026-10-29)

The first version of this finding broke its own rule in three files. In both `table-dates` layouts the education
date was set in 11 pt regular type instead of the control's 10.5 pt italic, and in `two-column-table` the school's
city was set in 10.5 pt italic instead of 11 pt regular. So each of those changed two things, not one. In
`table-dates-narrow` the larger education date didn't fit the 1.3 in cell, wrapped, and split the education entry
in two: that version was reported at 34/46 (jobs 6, education 6).

We fixed the formatting, added the check in `test_analyze.py`, and exported all ten files again in one run
(2026-10-28 18:20 UTC). `table-dates-narrow` now reads 40/46. `table-dates-left` (46/46) and `two-column-table`
(42/46) lost the same fields as before. The PDFs of the other seven layouts came out byte for byte the same as in
the first export.

## Limits

- One sample, US Letter, one font, one export path (Google Docs). We didn't test Word's own Save as PDF: there's no
  Microsoft Word in the test setup. A LibreOffice export was tried and left out because it replaced Times New
  Roman with Liberation Serif, and its control already lost 3 fields, so a layout effect couldn't be told apart.
- One open-source parser. This says nothing direct about Workday, Greenhouse, iCIMS or other commercial systems.
  A field the parser misreads is not the same as a rejected application.
- The .docx results describe the file, not how any parser reads it.
- Google Docs changes over time. Exported 2026-10-28 (UTC).

## Reproduce

```sh
make layout-study    # or: uv run python findings/2026-10-28-layout/analyze.py
```

It runs `test_analyze.py`, then every check on the files in `gdocs-pdf/` and `gdocs-docx/`, and rewrites
`results.json` and `results.csv`. The results come out identical apart from `runAt` and the runtime versions
recorded under `tools`. To redo the export, import any file from `docx/` into Google Docs and use File > Download.

## License

Scripts: AGPL-3.0, like the rest of this repository. `results.csv` and `results.json`: CC BY 4.0, credit
"ReadableResume layout test, 2026". The .docx and PDF files are ReadableResume template files with fictional
sample content and fall under the same terms as `fixtures/` (see `fixtures/LICENSE.md`).
