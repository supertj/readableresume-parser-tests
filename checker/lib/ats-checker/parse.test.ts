// npx tsx --test lib/ats-checker/parse.test.ts
// (tsx, not plain node --test: the vendored OpenResume files import each other without file
// extensions, which Node's own TypeScript support can't resolve)
//
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { test } from "node:test"

import type { TextItems } from "./open-resume/parse-resume-from-pdf/types"
import { parseResume } from "./parse"

// One text item per line; headings in a bold font, the way a real PDF marks them
const lineItems = (lines: { text: string; bold?: boolean }[]): TextItems =>
  lines.map(({ text, bold }, index) => ({
    text,
    x: 50,
    y: 700 - index * 14,
    width: text.length * 5,
    height: 10,
    fontName: bold ? "Arial-BoldMT" : "ArialMT",
    hasEOL: true,
  }))

test("a heading that appears twice still shows both blocks in reading order", () => {
  const parsed = parseResume(
    lineItems([
      { text: "Jordan Avery", bold: true },
      { text: "jordan@example.com" },
      { text: "EXPERIENCE", bold: true },
      { text: "Acme Corp" },
      { text: "EDUCATION", bold: true },
      { text: "University of Texas" },
      { text: "EXPERIENCE", bold: true },
      { text: "Globex" },
    ])
  )
  // OpenResume itself keeps only the last EXPERIENCE block…
  assert.deepEqual(parsed.sections.find((section) => section.title === "EXPERIENCE")?.lines, ["Globex"])
  // …but the readout gets every heading, so "Acme Corp" stays visible under the first one
  assert.deepEqual(parsed.headings, [2, 4, 6])
  assert.equal(parsed.lines[3], "Acme Corp")
})
