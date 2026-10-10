import { Check } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { AtsChecker } from "@/components/ats-checker/ats-checker"
import { Prose } from "@/components/content/article"
import { Faq } from "@/components/content/faq"
import { breadcrumbs, JsonLd } from "@/components/content/json-ld"
import { Container, Section } from "@/components/layout/container"
import { SectionHeader } from "@/components/layout/section-header"
import { TemplateGrid } from "@/components/templates/template-grid"
import { getSet } from "@/lib/catalog"
import { gridItem } from "@/lib/grid"
import { CHECKER_SOURCE_URL } from "@/lib/proof"
import { SITE_URL } from "@/lib/site"

const PATH = "/ats-resume-checker"

export const metadata: Metadata = {
  title: { absolute: "Free ATS Resume Checker: See What a Parser Reads" },
  description:
    "Drop in your resume PDF and see what an open-source ATS parser reads: name, contact details, jobs, dates and sections. Ten checks, each with a fix. Nothing is uploaded.",
  alternates: { canonical: PATH },
}

// Every one of these passes all ten checks, in both paper sizes
const TEMPLATE_SLUGS = ["jakes", "classic", "modern-minimal", "student", "technical", "plain"]

const CHECKS: { name: string; why: string }[] = [
  { name: "Name, email and phone", why: "read from the lines above your first heading." },
  { name: "Work experience, education and skills", why: "each found under a heading the parser recognizes." },
  { name: "Dates on every job", why: "so the parser can tell how long you held each one." },
  { name: "One column", why: "two blocks of text side by side get read straight across and mixed together." },
  { name: "No joined letters", why: "a PDF that stores “fi” as one character turns “certified” into a word nobody searches for." },
  { name: "No unreadable symbols", why: "bullets and icons from symbol fonts come out as characters no parser can read." },
]

const linkClass = "font-medium text-primary underline-offset-4 hover:underline"

export default function AtsResumeCheckerPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbs([
          { name: "Resume templates", path: "/" },
          { name: "ATS resume checker", path: PATH },
        ])}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "ATS resume checker",
          url: `${SITE_URL}${PATH}`,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Any",
          browserRequirements: "Requires JavaScript",
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }}
      />

      <AtsChecker>
        <h1 className="text-balance">Free ATS resume checker</h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground md:text-xl">
          See what a resume parser reads from your PDF, and what to fix before you apply.
        </p>
        <ul className="mt-8 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6">
          {["Your file stays in your browser", "No sign-up or email", "Open-source parser"].map((fact) => (
            <li key={fact} className="flex items-center gap-2">
              <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
              {fact}
            </li>
          ))}
        </ul>
      </AtsChecker>

      <div className="pt-12 md:pt-16">
        <Prose>
          <h2>How it works</h2>
          <p>
            When you choose a PDF, code running in this tab pulls the text out with pdf.js (the PDF reader built into
            Firefox) and hands it to OpenResume, an open-source resume parser. It&apos;s the same parser, at the same
            version, that we run on every one of our templates. The file isn&apos;t uploaded anywhere: close the tab and
            it&apos;s gone.
          </p>
          <p>Then it runs ten checks:</p>
          <ul>
            {CHECKS.map((check) => (
              <li key={check.name}>
                <strong>{check.name}</strong>, {check.why}
              </li>
            ))}
          </ul>
          <p>
            Below the checklist you get what the parser put in each field, and every line of text it read, so you can see
            the reason for each result yourself.
          </p>

          <h2>What it can&apos;t tell you</h2>
          <ul>
            <li>
              How Workday, Greenhouse, iCIMS or any other hiring system will read your resume. Each uses its own parser and
              none of them publish how it works. OpenResume is a stand-in that catches common layout problems.
            </li>
            <li>Whether your resume fits a job. It doesn&apos;t compare your resume with a job posting.</li>
            <li>Anything about resumes in other languages. OpenResume only looks for English section headings.</li>
            <li>
              Phone numbers and locations in non-US formats. OpenResume only reads (555) 555-5555 and &ldquo;City,
              ST&rdquo;. For the phone check we also look for other formats ourselves.
            </li>
            <li>Pages after the third, or Word files. Save a Word file as a PDF first.</li>
          </ul>

          <h2>Why there&apos;s no score</h2>
          <p>
            Most ATS checkers give you a number out of 100. Nobody outside those companies can say what goes into it, and
            a low number tends to come with an offer to rewrite your resume. Each check here is something you can see in
            the readout and fix yourself.
          </p>
          <p>
            The checker is open source under AGPL-3.0, like the parser it runs.{" "}
            <a href={CHECKER_SOURCE_URL} rel="nofollow" className={linkClass}>
              Read the source
            </a>
            , or see <Link href="/how-we-test">how we test our templates</Link> with the same parser.
          </p>
        </Prose>
      </div>

      <Section className="border-t border-border bg-secondary" aria-labelledby="checker-templates-heading">
        <Container>
          <SectionHeader
            id="checker-templates-heading"
            title="Templates that pass all ten checks"
            subtitle="Google Docs templates with one column and standard headings. Copy one in two clicks."
          />
          <div className="mt-8">
            <TemplateGrid
              items={TEMPLATE_SLUGS.map((slug) => gridItem(getSet(slug)!))}
              showFilters={false}
              columns={3}
            />
          </div>
          <p className="mt-8 text-center">
            <Link href="/ats-friendly-resume-template" className={linkClass}>
              See all ATS-friendly templates
            </Link>
          </p>
        </Container>
      </Section>

      <Faq
        items={[
          {
            question: "Is this ATS resume checker free?",
            answer: "Yes. There's no account, no email and no limit on how many times you check.",
          },
          {
            question: "Do you keep a copy of my resume?",
            answer:
              "No. The PDF is read by code running on this page and never sent to our server or anyone else's. We only record that a check ran and how many checks passed.",
          },
          {
            question: "If my resume passes here, will it pass Workday or Greenhouse?",
            answer:
              "Not necessarily. Passing means one open-source parser could read your layout; Workday and Greenhouse use their own. What it does catch are the layout problems that commonly scramble resumes: columns, symbol fonts, unusual headings, contact details hidden behind icons.",
          },
          {
            question: "Why is my phone number or location empty in the readout?",
            answer:
              "OpenResume only reads US formats: (555) 555-5555 and City, ST. If your number is written another way, the phone check still passes when we find it in your contact lines. The readout shows what OpenResume itself put in each field.",
          },
          {
            question: "Can I check a Word document?",
            answer: (
              <>
                Not yet. Save it as a PDF first: in Word, File &gt; Save As &gt; PDF; in Google Docs, File &gt; Download
                &gt; PDF Document. Our{" "}
                <Link href="/guides/export-resume-pdf-word" className={linkClass}>
                  export guide
                </Link>{" "}
                has the details.
              </>
            ),
          },
          {
            question: "Is the checker open source?",
            answer: (
              <>
                Yes. OpenResume is licensed under AGPL-3.0, so the checker is too. The{" "}
                <a href={CHECKER_SOURCE_URL} rel="nofollow" className={linkClass}>
                  source code
                </a>
                , including our checks, is in our public test repository.
              </>
            ),
          },
        ]}
      />
    </>
  )
}
