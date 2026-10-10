// Steps 2–4 of the OpenResume parser, unchanged, plus the line text the checker shows.
//
// SPDX-License-Identifier: AGPL-3.0-only

import type { Resume } from "./open-resume/redux/types"
import { extractResumeFromSections } from "./open-resume/parse-resume-from-pdf/extract-resume-from-sections/index"
import { groupLinesIntoSections } from "./open-resume/parse-resume-from-pdf/group-lines-into-sections"
import { groupTextItemsIntoLines } from "./open-resume/parse-resume-from-pdf/group-text-items-into-lines"
import type { TextItems } from "./open-resume/parse-resume-from-pdf/types"

export type { Resume }

export interface ParsedResume {
  resume: Resume
  /** Each line the parser formed, its text items joined by " ‖ " (same format as the proof repository) */
  lines: string[]
  /** Section heading as the parser found it ("profile" for the lines before the first heading) → line text */
  sections: { title: string; lines: string[] }[]
  /**
   * Indexes into `lines` of the lines the parser took as section headings, in reading order.
   * OpenResume keys sections by heading text, so when a heading appears twice only its last block
   * survives in `sections` (and in what it extracts). The readout walks `lines` with these instead,
   * so the block the parser dropped is still there to see.
   */
  headings: number[]
}

const joinLine = (line: TextItems) => line.map((item) => item.text).join(" ‖ ")

export function parseResume(items: TextItems): ParsedResume {
  const lines = groupTextItemsIntoLines(items)
  const sections = groupLinesIntoSections(lines)
  const resume = extractResumeFromSections(sections)
  // Same test OpenResume applies (group-lines-into-sections.ts, not exported): a heading is a
  // one-item line past the first two. Matching on the heading texts it kept finds every line it
  // used as one, repeats included.
  const titles = new Set(Object.keys(sections).filter((title) => title !== "profile"))
  const headings = lines.flatMap((line, index) =>
    index >= 2 && line.length === 1 && titles.has(line[0].text.trim()) ? [index] : []
  )
  return {
    resume,
    lines: lines.map(joinLine),
    sections: Object.entries(sections).map(([title, sectionLines]) => ({ title, lines: sectionLines.map(joinLine) })),
    headings,
  }
}
