// The checklist on /ats-resume-checker. Ten counted checks, each either read straight from what
// OpenResume extracted or measured on the PDF's text layer, plus a few facts shown but not counted.
// No score: the user decided on "N of 10 passed" so every point is something they can see and fix.
//
// SPDX-License-Identifier: AGPL-3.0-only

import type { ParsedResume } from "./parse"
import type { PdfRead, PlacedItem } from "./read-pdf"

export const MAX_PAGES = 3

export type CheckId =
  | "name"
  | "email"
  | "phone"
  | "experience"
  | "dates"
  | "education"
  | "skills"
  | "columns"
  | "ligatures"
  | "symbols"

export interface CheckResult {
  id: CheckId
  /** "skip" only for job dates when no job was found: one missing heading shouldn't cost two checks */
  status: "pass" | "fail" | "skip"
  /** What was found, in the user's own words from the PDF where possible */
  detail: string
  /** A section check failed because its heading appears more than once, which needs its own fix */
  repeatedHeading?: boolean
}

export interface FactResult {
  id: "pages" | "words" | "link" | "location"
  detail: string
  /** Worth a second look, though not counted as a failed check */
  flag?: boolean
}

export interface CheckReport {
  checks: CheckResult[]
  facts: FactResult[]
  passed: number
  counted: number
}

// Same keywords OpenResume uses to find each section (extract-work-experience.ts and friends)
const EXPERIENCE_KEYWORDS = ["work", "experience", "employment", "history", "job"]
const EDUCATION_KEYWORDS = ["education"]
const SKILL_KEYWORDS = ["skill"]

const hasKeyword = (title: string, keywords: string[]) => keywords.some((keyword) => title.toLowerCase().includes(keyword))

function findSection(parsed: ParsedResume, keywords: string[]) {
  return parsed.sections.find((section) => section.title !== "profile" && hasKeyword(section.title, keywords))
}

const quote = (text: string) => `“${text.trim()}”`

// Words that only ever appear in a section heading, never in a name. When there's no name above
// the first heading (a sidebar on the right can push it down), OpenResume takes the first bold
// line it finds, which can be "EXPERIENCE": that must not pass as a name.
const HEADING_WORDS =
  /\b(experience|education|skills?|employment|work history|projects?|summary|objective|profile|contact|certifications?|languages?)\b/i

function nameCheck(name: string): CheckResult {
  if (!name) return { id: "name", status: "fail", detail: "No line the parser takes for a name." }
  if (HEADING_WORDS.test(name)) {
    return { id: "name", status: "fail", detail: `Read as ${quote(name)}, which is a section heading, not a name.` }
  }
  return { id: "name", status: "pass", detail: `Read as ${quote(name)}.` }
}

function sectionCheck(id: CheckId, parsed: ParsedResume, keywords: string[], what: string): CheckResult {
  const section = findSection(parsed, keywords)
  if (!section) return { id, status: "fail", detail: `No heading the parser recognizes as ${what}.` }
  // OpenResume files sections by heading text, so a second "EXPERIENCE" replaces the first and
  // every job under the first is gone from what it extracts, while the rest can still look fine
  const repeats = parsed.headings.filter((index) => parsed.lines[index].trim() === section.title).length
  if (repeats > 1) {
    return {
      id,
      status: "fail",
      detail: `The heading ${quote(section.title)} appears ${repeats} times. The parser keeps only what's under the last one and drops the rest.`,
      repeatedHeading: true,
    }
  }
  if (section.lines.length === 0) return { id, status: "fail", detail: `Found the heading ${quote(section.title)}, but nothing under it.` }
  return { id, status: "pass", detail: `Found under ${quote(section.title)}.` }
}

// OpenResume only reads US-style numbers, (555) 555-5555. Most hiring systems read other formats,
// so a clearly written international number in the contact lines counts as found.
// Ten digits minimum (or a leading +) keeps date ranges like "2019 - 2021" out.
const PHONE_LIKE = /(?:\+\s?\d[\d\s().-]{6,}\d|\(?\d[\d\s().-]{8,}\d)/g

function findPhoneInText(lines: string[]) {
  // Match within each piece of a line, so a number in the next field ("+44 20 7946 0958 ‖ 12345")
  // isn't run together with the phone into one too-long string of digits
  for (const field of lines.flatMap((line) => line.split(" ‖ "))) {
    for (const match of field.matchAll(PHONE_LIKE)) {
      const digits = match[0].replace(/\D/g, "").length
      if (digits >= 10 && digits <= 15) return match[0].trim()
      if (match[0].trim().startsWith("+") && digits >= 8 && digits <= 15) return match[0].trim()
    }
  }
  return null
}

function phoneCheck(parsed: ParsedResume): CheckResult {
  const { phone } = parsed.resume.profile
  if (phone) return { id: "phone", status: "pass", detail: `Read as ${quote(phone)}.` }
  const contactLines = parsed.sections.find((section) => section.title === "profile")?.lines ?? []
  const written = findPhoneInText(contactLines)
  if (written) {
    return {
      id: "phone",
      status: "pass",
      detail: `${quote(written)} is in your contact lines as plain text. OpenResume itself only reads US-style numbers, so its phone field below stays empty.`,
    }
  }
  return { id: "phone", status: "fail", detail: "No phone number in the lines above your first section heading." }
}

function datesCheck(parsed: ParsedResume): CheckResult {
  const jobs = parsed.resume.workExperiences.filter(
    (job) => job.company || job.jobTitle || job.date || job.descriptions.length > 0
  )
  if (jobs.length === 0) return { id: "dates", status: "skip", detail: "Skipped: no jobs were read, so there are no dates to check." }
  const undated = jobs.filter((job) => !job.date)
  if (undated.length === 0) {
    return { id: "dates", status: "pass", detail: `All ${jobs.length} ${jobs.length === 1 ? "job has" : "jobs have"} dates.` }
  }
  const names = undated.map((job) => quote(job.company || job.jobTitle || job.descriptions[0] || "")).slice(0, 3)
  return {
    id: "dates",
    status: "fail",
    detail: `${undated.length} of ${jobs.length} ${jobs.length === 1 ? "job has" : "jobs have"} no dates the parser could read: ${names.join(", ")}.`,
  }
}

/**
 * Two blocks of text side by side. Looks for a vertical strip of white space that runs down a
 * large part of the page with text on both sides, which a one-column resume rarely has: its
 * full-width lines (bullets, summary) cut across any such strip within a few lines.
 * What a one-column page can still have, and doesn't count:
 * - a date or city right-aligned on the job title's line (short, ends at the right margin, and
 *   shares its line with text on the left: a right-aligned line on its own is a sidebar's);
 * - a centered name or heading;
 * - a skills grid or a list with years on the right, where every line that has text right of
 *   the strip also has text left of it. Columns usually don't line up that neatly: their
 *   baselines drift apart and one runs longer, so some lines have text only on the right.
 * Columns that do line up row for row (same font and spacing on both sides) are still told apart
 * from a grid by length: on many rows, both sides hold a run of text a fifth of the page wide or
 * more, which a grid of skills or a year on the right never has.
 */
export function findColumnGutter(items: PlacedItem[]) {
  if (items.length < 10) return null
  const left = Math.min(...items.map((item) => item.x))
  const right = Math.max(...items.map((item) => item.x + item.width))
  const span = right - left
  if (span <= 0) return null

  // Rows: items whose baselines are within 2pt, top of the page first. Within a row, items less
  // than 8pt apart (a word space or two) form one segment.
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: { y: number; segments: { start: number; end: number }[] }[] = []
  for (const item of sorted) {
    let row = rows[rows.length - 1]
    if (!row || row.y - item.y > 2) rows.push((row = { y: item.y, segments: [] }))
    row.segments.push({ start: item.x, end: item.x + item.width })
  }
  for (const row of rows) {
    row.segments.sort((a, b) => a.start - b.start)
    const merged: { start: number; end: number }[] = []
    for (const segment of row.segments) {
      const last = merged[merged.length - 1]
      if (last && segment.start - last.end < 8) last.end = Math.max(last.end, segment.end)
      else merged.push({ ...segment })
    }
    row.segments = merged
  }

  const top = rows[0].y
  const bottom = rows[rows.length - 1].y
  const textHeight = top - bottom
  if (textHeight <= 0) return null
  type Segment = { start: number; end: number }
  const middle = left + span / 2
  const isCentered = (segment: Segment) => Math.abs((segment.start + segment.end) / 2 - middle) < span * 0.02
  const isRightAligned = (segment: Segment) => right - segment.end < 4 && segment.end - segment.start < span * 0.4
  const hasLeftText = (row: (typeof rows)[number], x: number) =>
    row.segments.some((segment) => segment.end <= x && !isCentered(segment))
  const hasRightText = (row: (typeof rows)[number], x: number) =>
    row.segments.some(
      (segment) =>
        segment.start >= x && !isCentered(segment) && !(isRightAligned(segment) && hasLeftText(row, x))
    )
  const isLong = (segment: Segment) => segment.end - segment.start >= span * 0.2
  const hasLongTextBothSides = (row: (typeof rows)[number], x: number) =>
    row.segments.some((segment) => segment.end <= x && !isCentered(segment) && isLong(segment)) &&
    row.segments.some((segment) => segment.start >= x && !isCentered(segment) && !isRightAligned(segment) && isLong(segment))

  for (let x = left + span * 0.15; x <= left + span * 0.85; x += 1) {
    let runStart = 0
    for (let index = 0; index <= rows.length; index++) {
      const crosses =
        index === rows.length || rows[index].segments.some((segment) => segment.start - 2 < x && x < segment.end + 2)
      if (!crosses) continue
      const run = rows.slice(runStart, index)
      runStart = index + 1
      if (run.length < 10) continue
      const runHeight = run[0].y - run[run.length - 1].y
      if (runHeight < textHeight * 0.3) continue
      const leftRows = run.filter((row) => hasLeftText(row, x)).length
      const rightRows = run.filter((row) => hasRightText(row, x)).length
      const rightOnlyRows = run.filter((row) => hasRightText(row, x) && !hasLeftText(row, x)).length
      const pairedRows = run.filter((row) => hasLongTextBothSides(row, x)).length
      if ((leftRows >= 5 && rightRows >= 5 && rightOnlyRows >= 3) || pairedRows >= 8) {
        return { x, top: run[0].y, bottom: run[run.length - 1].y }
      }
    }
  }
  return null
}

function columnsCheck(read: PdfRead): CheckResult {
  for (let page = 1; page <= read.pages.length; page++) {
    const gutter = findColumnGutter(read.placed.filter((item) => item.page === page))
    if (gutter) {
      return {
        id: "columns",
        status: "fail",
        detail: `Page ${page} has two blocks of text side by side.`,
      }
    }
  }
  return { id: "columns", status: "pass", detail: "Text runs in one column, top to bottom." }
}

// ﬀ ﬁ ﬂ ﬃ ﬄ ﬅ ﬆ: one character standing in for two or three letters, so "certiﬁed" no longer
// matches a search for "certified"
const LIGATURE = /[ﬀ-ﬆ]/
// Replacement character, private-use code points (where symbol and icon fonts land when the PDF
// has no text mapping for them) and control characters other than tab and newlines
const UNREADABLE = /[\uFFFD\uE000-\uF8FF\u{F0000}-\u{10FFFF}\u0000-\u0008\u000B\u000C\u000E-\u001F]/u

const WORD_AROUND = (pattern: RegExp) => new RegExp(`\\S*${pattern.source}\\S*`, "gu")

// Unreadable characters are invisible or blank on screen, so examples spell them out: "[U+E081]312"
const spellOut = (word: string) =>
  word.replace(new RegExp(UNREADABLE.source, "gu"), (char) => `[U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}]`)

function characterCheck(id: CheckId, read: PdfRead, pattern: RegExp, found: (examples: string[], count: number) => string, clean: string): CheckResult {
  const examples = new Set<string>()
  let count = 0
  for (const text of read.rawText) {
    for (const match of text.matchAll(WORD_AROUND(pattern))) {
      count++
      if (examples.size < 3) examples.add(spellOut(match[0].slice(0, 40)))
    }
  }
  if (count === 0) return { id, status: "pass", detail: clean }
  return { id, status: "fail", detail: found([...examples].map(quote), count) }
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`

export function runChecks(read: PdfRead, parsed: ParsedResume): CheckReport {
  const { profile } = parsed.resume
  const checks: CheckResult[] = [
    nameCheck(profile.name),
    profile.email
      ? { id: "email", status: "pass", detail: `Read as ${quote(profile.email)}.` }
      : { id: "email", status: "fail", detail: "No email address in the lines above your first section heading." },
    phoneCheck(parsed),
    sectionCheck("experience", parsed, EXPERIENCE_KEYWORDS, "work experience"),
    datesCheck(parsed),
    sectionCheck("education", parsed, EDUCATION_KEYWORDS, "education"),
    sectionCheck("skills", parsed, SKILL_KEYWORDS, "skills"),
    columnsCheck(read),
    characterCheck(
      "ligatures",
      read,
      LIGATURE,
      (examples, count) => `${plural(count, "word")} with joined letters, such as ${examples.join(", ")}.`,
      "Every word comes out letter by letter."
    ),
    characterCheck(
      "symbols",
      read,
      UNREADABLE,
      (examples, count) => `${plural(count, "spot")} where the text has a symbol no parser can read, such as ${examples.join(", ")}.`,
      "No unreadable symbols in the text."
    ),
  ]

  const words = read.items.reduce((total, item) => total + item.text.split(/\s+/).filter(Boolean).length, 0)
  const facts: FactResult[] = [
    read.totalPages > MAX_PAGES
      ? { id: "pages", detail: `${read.totalPages} pages. We read the first ${MAX_PAGES}.`, flag: true }
      : { id: "pages", detail: plural(read.totalPages, "page") + "." },
    // A one-page resume runs 300–700 words. Far fewer usually means part of it is an image or
    // text converted to outlines, which no parser can read.
    words < 120
      ? { id: "words", detail: `Only ${plural(words, "word")} of text. If your resume has more, the rest is probably an image.`, flag: true }
      : { id: "words", detail: `${words} words of text.` },
    { id: "link", detail: profile.url ? `Read as ${quote(profile.url)}.` : "None read." },
    {
      id: "location",
      detail: profile.location
        ? `Read as ${quote(profile.location)}.`
        : "None read. OpenResume only reads US-style “City, ST”.",
    },
  ]

  const counted = checks.filter((check) => check.status !== "skip")
  return { checks, facts, passed: counted.filter((check) => check.status === "pass").length, counted: counted.length }
}
