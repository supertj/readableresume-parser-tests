// node --test lib/ats-checker/checks.test.ts
//
// SPDX-License-Identifier: AGPL-3.0-only
import assert from "node:assert/strict"
import { test } from "node:test"

import { findColumnGutter, runChecks } from "./checks.ts"
import type { ParsedResume } from "./parse.ts"
import type { PdfRead, PlacedItem } from "./read-pdf.ts"

type Job = { company: string; jobTitle: string; date: string; descriptions: string[] }

function parsed({
  name = "Jordan Avery",
  email = "jordan@example.com",
  phone = "(555) 555-0142",
  jobs = [{ company: "Acme", jobTitle: "Engineer", date: "2019 – 2023", descriptions: ["Built things"] }] as Job[],
  contactLines = ["Jordan Avery", "jordan@example.com ‖ (555) 555-0142"],
} = {}): ParsedResume {
  return {
    resume: {
      profile: { name, email, phone, url: "", summary: "", location: "" },
      workExperiences: jobs,
      educations: [],
      projects: [],
      skills: { featuredSkills: [], descriptions: [] },
      custom: { descriptions: [] },
    } as unknown as ParsedResume["resume"],
    lines: [],
    sections: [
      { title: "profile", lines: contactLines },
      { title: "EXPERIENCE", lines: ["Acme ‖ 2019 – 2023"] },
      { title: "EDUCATION", lines: ["University of Texas"] },
      { title: "SKILLS", lines: ["Python, SQL"] },
    ],
    headings: [],
  }
}

function read(texts: string[] = ["Jordan Avery"]): PdfRead {
  return {
    items: texts.map((text) => ({ text, x: 50, y: 700, width: 100, height: 10, fontName: "Arial", hasEOL: true })),
    placed: [],
    rawText: texts,
    pages: [{ width: 612, height: 792 }],
    totalPages: 1,
  }
}

const statusOf = (report: ReturnType<typeof runChecks>, id: string) => report.checks.find((check) => check.id === id)

test("a clean resume passes all ten", () => {
  const report = runChecks(read(), parsed())
  assert.equal(report.passed, 10)
  assert.equal(report.counted, 10)
})

test("a section heading taken for the name fails", () => {
  // Seen with a sidebar on the right: no name above the first heading, so OpenResume takes "EXPERIENCE"
  const name = statusOf(runChecks(read(), parsed({ name: "EXPERIENCE" })), "name")
  assert.equal(name?.status, "fail")
  assert.match(name!.detail, /section heading/)
  assert.equal(statusOf(runChecks(read(), parsed({ name: "Work History" })), "name")?.status, "fail")
  assert.equal(statusOf(runChecks(read(), parsed({ name: "" })), "name")?.status, "fail")
})

test("names that only look a little like headings still pass", () => {
  for (const name of ["Jobe Martin", "Skillman Rae", "Grace Summerfield", "José García"]) {
    assert.equal(statusOf(runChecks(read(), parsed({ name })), "name")?.status, "pass", name)
  }
})

test("an international phone in the contact lines counts; a date range doesn't", () => {
  const international = runChecks(
    read(),
    parsed({ phone: "", contactLines: ["Jordan Avery", "jordan@example.com ‖ +44 20 7946 0958"] })
  )
  assert.equal(statusOf(international, "phone")?.status, "pass")

  const datesOnly = runChecks(read(), parsed({ phone: "", contactLines: ["Jordan Avery", "2019 - 2021 ‖ 2015 - 2019"] }))
  assert.equal(statusOf(datesOnly, "phone")?.status, "fail")
})

test("no jobs skips the date check and leaves it out of the count", () => {
  const report = runChecks(read(), parsed({ jobs: [] }))
  assert.equal(statusOf(report, "dates")?.status, "skip")
  assert.equal(report.counted, 9)
})

test("joined letters and unreadable symbols are caught", () => {
  const report = runChecks(read(["Certiﬁed nurse", " Led a team", "Plain line"]), parsed())
  assert.equal(statusOf(report, "ligatures")?.status, "fail")
  assert.match(statusOf(report, "ligatures")!.detail, /Certiﬁed/)
  assert.equal(statusOf(report, "symbols")?.status, "fail")
  // The icon itself would show as nothing, so it's spelled out
  assert.match(statusOf(report, "symbols")!.detail, /\[U\+F0B7\]/)
})

function rows(count: number, top: number, step: number, x: number, width: number): PlacedItem[] {
  return Array.from({ length: count }, (_, index) => ({ text: "text", x, y: top - index * step, width, page: 1 }))
}

test("two columns with their own baselines are found", () => {
  const sidebar = rows(20, 700, 12, 50, 140)
  const main = rows(28, 696, 13, 230, 330)
  assert.ok(findColumnGutter([...sidebar, ...main]))
})

test("one column with dates right-aligned on the title lines is not two columns", () => {
  const items: PlacedItem[] = []
  for (let job = 0; job < 4; job++) {
    const top = 700 - job * 70
    items.push({ text: "Senior Engineer, Acme", x: 50, y: top, width: 160, page: 1 })
    items.push({ text: "2019 – 2023", x: 495, y: top, width: 65, page: 1 })
    items.push(...rows(4, top - 14, 13, 60, 500))
  }
  assert.equal(findColumnGutter(items), null)
})

test("two columns that line up row for row are found", () => {
  // Same font and spacing on both sides, so every row has text on the left and on the right
  assert.ok(findColumnGutter([...rows(24, 700, 14, 50, 230), ...rows(24, 700, 14, 320, 230)]))
})

test("a skills grid and a list with years on the right are not two columns", () => {
  const items: PlacedItem[] = []
  for (let row = 0; row < 6; row++) {
    for (const x of [50, 230, 410]) items.push({ text: "PostgreSQL", x, y: 700 - row * 14, width: 55, page: 1 })
  }
  for (let row = 0; row < 8; row++) {
    items.push({ text: "Dean's List, University of Texas", x: 50, y: 600 - row * 14, width: 170, page: 1 })
    items.push({ text: "2011", x: 538, y: 600 - row * 14, width: 22, page: 1 })
  }
  assert.equal(findColumnGutter(items), null)
})

test("a right-aligned sidebar is two columns, not dates on the title lines", () => {
  // Sidebar lines end at the right margin on baselines of their own, with nothing to their left
  const sidebar = Array.from({ length: 20 }, (_, index) => {
    const width = 60 + (index % 5) * 20
    return { text: "text", x: 560 - width, y: 703 - index * 14, width, page: 1 }
  })
  assert.ok(findColumnGutter([...rows(30, 700, 13, 50, 330), ...sidebar]))
})

test("a heading used twice fails its section check, because the parser drops the first block", () => {
  const base = parsed()
  const repeated: ParsedResume = {
    ...base,
    lines: ["Jordan Avery", "jordan@example.com", "EXPERIENCE", "Acme", "EDUCATION", "University of Texas", "EXPERIENCE", "Globex"],
    headings: [2, 4, 6],
  }
  const report = runChecks(read(), repeated)
  const experience = statusOf(report, "experience")
  assert.equal(experience?.status, "fail")
  assert.equal(experience?.repeatedHeading, true)
  assert.match(experience!.detail, /appears 2 times/)
  assert.equal(statusOf(report, "education")?.status, "pass")
})

test("a phone followed by another number in the next field is still found", () => {
  const report = runChecks(read(), parsed({ phone: "", contactLines: ["Jordan Avery", "+44 20 7946 0958 ‖ 12345"] }))
  assert.equal(statusOf(report, "phone")?.status, "pass")
  assert.match(statusOf(report, "phone")!.detail, /\+44 20 7946 0958/)
})
