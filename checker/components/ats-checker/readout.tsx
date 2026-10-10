// What OpenResume read, field by field, and the raw lines it worked from.
//
// SPDX-License-Identifier: AGPL-3.0-only

import type { ParsedResume } from "@/lib/ats-checker/parse"

const EMPTY = "(empty)"

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-3 px-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={value ? "col-span-2 break-words text-foreground" : "col-span-2 text-muted-foreground"}>
        {value || EMPTY}
      </dd>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <h4 className="text-sm font-semibold">{title}</h4>
      <dl className="mt-2 divide-y divide-border/60 rounded-lg border border-border">{children}</dl>
    </div>
  )
}

const bullets = (count: number) => (count === 0 ? "" : `${count} bullet${count === 1 ? "" : "s"}`)

export function FieldReadout({ parsed }: { parsed: ParsedResume }) {
  const { profile, workExperiences, educations, projects, skills } = parsed.resume
  // OpenResume returns one empty entry when a section has no lines it can use; showing it as
  // "Job 1: (empty)" says the same thing as the checklist, only louder
  const jobs = workExperiences.filter((job) => job.company || job.jobTitle || job.date || job.descriptions.length)
  const schools = educations.filter((school) => school.school || school.degree || school.date)
  const namedProjects = projects.filter((project) => project.project)

  return (
    <div className="min-w-0 rounded-xl border border-border bg-background p-5 md:p-6">
      <h3 className="text-base font-semibold">Field by field</h3>
      <p className="mt-1 text-sm text-muted-foreground">What OpenResume put in each field.</p>
      <div tabIndex={0} role="region" aria-label="Fields the parser read" className="mt-3 max-h-96 overflow-auto rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Group title="Contact">
          <Row label="Name" value={profile.name} />
          <Row label="Email" value={profile.email} />
          <Row label="Phone" value={profile.phone} />
          <Row label="Location" value={profile.location} />
          <Row label="Link" value={profile.url} />
        </Group>
        {jobs.length === 0 ? (
          <Group title="Jobs">
            <Row label="Jobs" value="" />
          </Group>
        ) : (
          jobs.map((job, index) => (
            <Group key={index} title={`Job ${index + 1}`}>
              <Row label="Company" value={job.company} />
              <Row label="Title" value={job.jobTitle} />
              <Row label="Dates" value={job.date} />
              <Row label="Bullets" value={bullets(job.descriptions.length)} />
            </Group>
          ))
        )}
        {schools.length === 0 ? (
          <Group title="Education">
            <Row label="School" value="" />
          </Group>
        ) : (
          schools.map((school, index) => (
            <Group key={index} title={`School ${index + 1}`}>
              <Row label="School" value={school.school} />
              <Row label="Degree" value={school.degree} />
              <Row label="Dates" value={school.date} />
              {school.gpa && <Row label="GPA" value={school.gpa} />}
            </Group>
          ))
        )}
        {namedProjects.length > 0 && (
          <Group title="Projects">
            {namedProjects.map((project, index) => (
              <Row key={index} label={`Project ${index + 1}`} value={project.project} />
            ))}
          </Group>
        )}
        <Group title="Skills">
          {skills.descriptions.length === 0 ? (
            <Row label="Skills" value="" />
          ) : (
            skills.descriptions.map((line, index) => <Row key={index} label={`Line ${index + 1}`} value={line} />)
          )}
        </Group>
      </div>
    </div>
  )
}

export function TextReadout({ parsed }: { parsed: ParsedResume }) {
  // Every line in reading order, headings flush left and the lines under them indented. Same
  // layout as the template pages' parser panel: pieces of one line separated by wide gaps.
  const headings = new Set(parsed.headings)
  const text = ["(Before the first heading)"]
  parsed.lines.forEach((line, index) => {
    if (headings.has(index)) text.push("", line)
    else text.push(`  ${line.split(" ‖ ").join("    ")}`)
  })

  return (
    <div className="min-w-0 rounded-xl border border-border bg-background p-5 md:p-6">
      <h3 className="text-base font-semibold">What the parser read</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Every line, in the order it was read, under the heading it was filed under. Lines that run together or jump around
        point to a layout problem.
      </p>
      <pre
        tabIndex={0}
        aria-label="Text extracted by the parser"
        className="mt-3 max-h-96 overflow-auto rounded-lg bg-secondary p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {text.join("\n")}
      </pre>
    </div>
  )
}
