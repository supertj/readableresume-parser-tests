// Titles and fixes for each check, and what to do after each kind of failure.
//
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"

import type { CheckId, FactResult } from "@/lib/ats-checker/checks"
import type { CheckFailure } from "@/lib/ats-checker/messages"

const linkClass = "font-medium text-primary underline-offset-4 hover:underline"

function GuideLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={linkClass}>
      {children}
    </Link>
  )
}

export const CHECK_TITLE: Record<CheckId, string> = {
  name: "Name",
  email: "Email address",
  phone: "Phone number",
  experience: "Work experience section",
  dates: "Dates on every job",
  education: "Education section",
  skills: "Skills section",
  columns: "One column",
  ligatures: "No joined letters (ﬁ, ﬂ)",
  symbols: "No unreadable symbols",
}

export const CHECK_FIX: Record<CheckId, React.ReactNode> = {
  name: (
    <>
      Put your name on the first line, on its own, as plain text in the body of the page, not in the header area or a text
      box. OpenResume only takes names in plain letters A to Z, so a name with accents can come out empty here; that one is
      a limit of this parser.
    </>
  ),
  email: (
    <>
      Write the address out in full near the top, in the body of the page. An email behind an icon, or in the header area,
      is easy for software to miss. <GuideLink href="/ats-friendly-resume-template">The rules our templates follow</GuideLink>
    </>
  ),
  phone: (
    <>
      Write the number out in full next to your email, as plain text in the body of the page, not in the header area or
      behind an icon.
    </>
  ),
  experience: (
    <>
      Give your jobs a heading on a line of its own, such as Experience or Work Experience. Parsers find sections by these
      words, so a heading like &ldquo;Where I&apos;ve Worked&rdquo; or &ldquo;Stage and Screen&rdquo; gets missed.
      &ldquo;Theatre Experience&rdquo; would work.
    </>
  ),
  dates: (
    <>
      Put the dates on the job title&apos;s line or the line under it, written like &ldquo;Jan 2021 – Present&rdquo; or
      &ldquo;2019 – 2023&rdquo;. A right tab stop keeps them lined up without a table.
    </>
  ),
  education: <>Give your schooling a heading of its own: Education.</>,
  skills: (
    <>
      Add a section with &ldquo;Skills&rdquo; in its heading, and list them as plain words separated by commas. Rating bars
      and icons don&apos;t come through as text. <GuideLink href="/resume-summary-and-skills">Writing the skills section</GuideLink>
    </>
  ),
  columns: (
    <>
      Move everything into one column. The usual cause is a sidebar with contact details and skills. Many parsers read
      straight across the page, so a line from the sidebar lands in the middle of a job. Put contact details under your
      name and skills in a section of their own.{" "}
      <GuideLink href="/ats-friendly-resume-template">One-column templates</GuideLink>
    </>
  ),
  ligatures: (
    <>
      The PDF stores letter pairs like fi and fl as single characters, so &ldquo;certiﬁed&rdquo; won&apos;t match a
      search for &ldquo;certified&rdquo;. It comes from the font and the way the PDF was made. Try a common font, or a
      different export: Save as PDF instead of Print to PDF.{" "}
      <GuideLink href="/resume-fonts">Fonts that export cleanly</GuideLink>
    </>
  ),
  symbols: (
    <>
      Usually bullets or icons set in a symbol font, like Wingdings or an icon font. Use the plain bullet (•) from your
      regular font, and write contact details out instead of using icons. It can also be the font itself: in our tests,
      Inter stored brackets, hyphens and colons this way.{" "}
      <GuideLink href="/resume-fonts">Fonts that export cleanly</GuideLink>
    </>
  ),
}

export const SKIPPED_FIX = <>Fix the work experience heading first, then check again.</>

export const REPEATED_HEADING_FIX = (
  <>
    Use each heading once and put everything for that section under it. If the section runs onto a second page, carry
    on there without repeating the heading.
  </>
)

export const FACT_LABEL: Record<FactResult["id"], string> = {
  pages: "Pages",
  words: "Text",
  link: "Link",
  location: "Location",
}

export const FAILURE: Record<CheckFailure, { title: string; next: React.ReactNode }> = {
  "not-pdf": {
    title: "That file isn't a PDF",
    next: (
      <>
        This checker reads PDFs only. Export your resume as a PDF and drop that in.{" "}
        <GuideLink href="/guides/export-resume-pdf-word">How to export from Google Docs or Word</GuideLink>
      </>
    ),
  },
  "too-large": {
    title: "That PDF is over 5 MB",
    next: (
      <>
        A resume that&apos;s mostly text is usually well under 1 MB, so most of this file is images. Export it again without
        photos or graphics, or compress it, and try again.
      </>
    ),
  },
  encrypted: {
    title: "This PDF has a password",
    next: <>Export a copy without a password and try again.</>,
  },
  "no-text": {
    title: "We couldn't find any text in this PDF",
    next: (
      <>
        It&apos;s probably a scan or a picture of your resume, and hiring software can&apos;t read that either. Export it
        again from Google Docs or Word, then check that you can select the text in the PDF.{" "}
        <GuideLink href="/guides/export-resume-pdf-word">How to export it</GuideLink>
      </>
    ),
  },
  unreadable: {
    title: "We couldn't open this PDF",
    next: (
      <>
        The file may be damaged. Export it again, with Download as PDF or Save as PDF rather than Print to PDF, and try
        again.
      </>
    ),
  },
  timeout: {
    title: "This PDF took too long to read",
    next: (
      <>
        We stop after 10 seconds. Large images or unusual fonts are the usual cause. Export it again a different way and
        try again.
      </>
    ),
  },
}
