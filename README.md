# ReadableResume parser tests

[![verify](https://github.com/supertj/readableresume-parser-tests/actions/workflows/verify.yml/badge.svg)](https://github.com/supertj/readableresume-parser-tests/actions/workflows/verify.yml)

Every template on [ReadableResume](https://readableresume.com) is checked with the scripts in this repository. The results are published next to each template. This repository lets anyone rerun them.

## What is tested

For each template file (resume, cover letter, references page × US Letter and A4), and for each filled-in resume on the site's job example pages (`fixtures/example-<job>/`, US Letter only):

1. **Export.** The PDF and .docx are downloaded from the Google Doc's public export URL, the same files Google Docs gives you under *File > Download*. No Google credentials are used.
2. **Fields (resumes only).** The PDF is parsed with [OpenResume](https://github.com/xitanggg/open-resume), pinned as a git submodule. Every field and every bullet is compared with `fixtures/<template>/expected-resume.json`. All items must match.
3. **Text.** pdfminer.six extracts the plain text. Lines must come out in reading order, with no split words, no ligatures and no private-use characters, and no text outside the expected content.
4. **Fonts and pages.** Every visible character uses the template font, every font is embedded, and the page count is as expected.
5. **Word.** python-docx reads the exported .docx: text in order, bullets still list items, no bullet on a symbol font.

Values the parser cannot represent (a location on a job line, a second link, a UK phone number, a degree outside its list such as PharmD) are listed under `outOfScope` in the expected file. They are reported but not counted.

## Run it

```sh
git clone --recurse-submodules <this repository>
cd readableresume-parser-tests
make docker-verify        # pinned Node, Python and packages
```

Without Docker: Node 20+, [uv](https://docs.astral.sh/uv/), then `cd parser && npm ci && cd .. && make verify`.

Each run writes `results/<file>.proof.json` with the expected and actual value of every item, the tool versions and the SHA-256 of the PDF that was tested.

## Why the PDF reader is re-implemented

OpenResume's `read-pdf.ts` loads pdf.js through a browser worker entry, which doesn't run in Node. `parser/parse-pdf.ts` re-implements only that step, mirroring the upstream text-item mapping line for line, and imports the rest of the parser unchanged from the submodule.

## Continuous verification

`.github/workflows/verify.yml` runs on every push to `main`, weekly, and on demand. It runs the negative
self-tests, fetches every template from Google Docs again, and runs every check. The reports and the exact
files tested are kept as a workflow artifact for 90 days.

## ATS resume checker

The free checker at [readableresume.com/ats-resume-checker](https://readableresume.com/ats-resume-checker) runs the same OpenResume version in the visitor's browser. Its source is in [`checker/`](checker/), including a script that confirms it reads every fixture PDF exactly as `parser/parse-pdf.ts` does.

## Findings

One-off experiments live in `findings/`, each with the PDFs that were tested and the raw results, for
example how non-Latin names behave (`findings/2026-10-02-non-latin-names/`) and which fonts come through a
Google Docs PDF export cleanly (`findings/2026-10-05-font-export/`, `make font-study`).

## Known parser limits

See [How we test](https://readableresume.com/how-we-test#reproduce). In short: US-format phone numbers only, "City, ST" locations, one link, and the last line of each page is joined to the first line of the next.

## License

Scripts: AGPL-3.0 (same as OpenResume). OpenResume itself keeps its own AGPL-3.0 license. Files in `fixtures/`: see `fixtures/LICENSE.md`.
