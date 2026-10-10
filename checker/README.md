# ATS resume checker

Source code for [readableresume.com/ats-resume-checker](https://readableresume.com/ats-resume-checker). The checker runs OpenResume's parser, which is AGPL-3.0, so the checker is AGPL-3.0 as well and its source is published here.

## How it works

Everything runs in the visitor's browser. The page starts a Web Worker, sends it the PDF, and gets back the fields the parser read and the checklist. The file is never sent to a server. The only analytics event records that a check ran, whether the PDF was an upload or our sample, and how many checks passed.

| Path | What it is |
|---|---|
| `lib/ats-checker/check-worker.ts` | The Web Worker: loads pdf.js, reads the PDF, parses it, runs the checks |
| `lib/ats-checker/read-pdf.ts` | Reads at most 3 pages with pdf.js 6. The text-item mapping is OpenResume's `read-pdf.ts`, line for line |
| `lib/ats-checker/open-resume/` | OpenResume's parser at commit `4f8255a`, the same commit as `vendor/open-resume` in this repository. Only import paths differ from upstream, except `redux/resume-slice.ts`, which keeps just the two constants the parser needs and drops Redux |
| `lib/ats-checker/parse.ts` | Runs the parser's remaining steps and keeps the line text for the readout |
| `lib/ats-checker/checks.ts` | The ten counted checks and the facts shown but not counted |
| `components/ats-checker/`, `app/ats-resume-checker/` | The page. They use the site's shared layout and UI components (button, container, FAQ, template grid), which are not part of the checker and are not included |
| `scripts/ats-checker-parity.ts` | Consistency check, see below |

## Same results as the template tests

The site's templates are tested with `parser/parse-pdf.ts`, which uses pdf.js 3.7 in Node. The checker uses pdf.js 6 in the browser. `scripts/ats-checker-parity.ts` runs every PDF in `fixtures/` through both and fails if any field or line differs. It also fails if any template resume misses one of the ten checks, because the page says they all pass, and if the ligature or symbol check disagrees with pdfminer's counts on the 32 PDFs in `findings/2026-10-05-font-export/`. It runs from the site's repository against a checkout of this one:

```sh
npx tsx scripts/ats-checker-parity.ts <path to this repository>
```

Unit tests: `node --test lib/ats-checker/checks.test.ts` (Node 22.18 or later) and `npx tsx --test lib/ats-checker/parse.test.ts`.

Versions on the site: pdfjs-dist 6.4.299, Next.js 16.3.7, React 19.2.8.

This copy is updated whenever the checker changes on the site.
