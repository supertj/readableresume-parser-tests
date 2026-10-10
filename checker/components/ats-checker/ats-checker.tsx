"use client"

// The checker itself: a sheet of paper to drop a PDF on, then the checklist and the readouts.
// The file never leaves the browser: it goes to a Web Worker on this page and nowhere else.
//
// SPDX-License-Identifier: AGPL-3.0-only

import { track } from "@vercel/analytics"
import { Check, FileText, Loader2, Minus, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import {
  CHECK_FIX,
  CHECK_TITLE,
  FACT_LABEL,
  FAILURE,
  REPEATED_HEADING_FIX,
  SKIPPED_FIX,
} from "@/components/ats-checker/check-copy"
import { FieldReadout, TextReadout } from "@/components/ats-checker/readout"
import { Container } from "@/components/layout/container"
import { Button } from "@/components/ui/button"
import type { CheckReport, CheckResult } from "@/lib/ats-checker/checks"
import type { CheckFailure, CheckRequest, CheckResponse } from "@/lib/ats-checker/messages"
import type { ParsedResume } from "@/lib/ats-checker/parse"
import { cn } from "@/lib/utils"

const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 10_000
const SAMPLE = { url: "/samples/Jakes-Resume-US-Letter.pdf", name: "Jakes-Resume-US-Letter.pdf" }

type Source = "upload" | "sample"
type State =
  | { phase: "idle" }
  | { phase: "working"; fileName: string }
  | { phase: "done"; fileName: string; parsed: ParsedResume; report: CheckReport }
  | { phase: "failed"; fileName: string; reason: CheckFailure }

// pdf.js accepts a few bytes of junk before the header, so look for it in the first 1 KB
function looksLikePdf(bytes: ArrayBuffer) {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 1024))
  return head.includes("%PDF-")
}

export function AtsChecker({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ phase: "idle" })
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const downloadRef = useRef<AbortController | null>(null)
  // Bumped by every new check and by Cancel. Work still in flight from an earlier attempt (the
  // sample download, a file being read, a worker reply) compares its number and drops its result,
  // so a cancelled or replaced check can never overwrite the one on screen.
  const attemptRef = useRef(0)
  const resultsRef = useRef<HTMLHeadingElement>(null)

  const stop = useCallback(() => {
    attemptRef.current++
    downloadRef.current?.abort()
    downloadRef.current = null
    workerRef.current?.terminate()
    workerRef.current = null
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  useEffect(() => stop, [stop])

  // Ends whatever was running and returns a test for "is this still the latest attempt?"
  const begin = useCallback(() => {
    stop()
    const attempt = attemptRef.current
    return () => attemptRef.current === attempt
  }, [stop])

  const fail = useCallback(
    (fileName: string, reason: CheckFailure, source: Source) => {
      stop()
      setState({ phase: "failed", fileName, reason })
      track("ats_check", { outcome: reason, source })
    },
    [stop]
  )

  const run = useCallback(
    (fileName: string, bytes: ArrayBuffer, source: Source, isCurrent: () => boolean) => {
      if (!looksLikePdf(bytes)) return fail(fileName, "not-pdf", source)

      const worker = new Worker(new URL("../../lib/ats-checker/check-worker.ts", import.meta.url), { type: "module" })
      workerRef.current = worker
      worker.onmessage = (event: MessageEvent<CheckResponse>) => {
        if (!isCurrent()) return
        const message = event.data
        if (message.type === "reading") {
          timerRef.current = setTimeout(() => fail(fileName, "timeout", source), TIMEOUT_MS)
          return
        }
        if (message.type === "error") return fail(fileName, message.reason, source)
        // pdf.js's worker bundle, once imported inside our worker, announces itself to whichever page
        // started that worker with a message of its own ({ action: "ready", … }); skip anything not ours
        if (message.type !== "result") return
        stop()
        setState({ phase: "done", fileName, parsed: message.parsed, report: message.report })
        // Counts only: no file name, no text from the resume
        track("ats_check", {
          outcome: "checked",
          source,
          passed: message.report.passed,
          counted: message.report.counted,
        })
      }
      worker.onerror = () => {
        if (isCurrent()) fail(fileName, "unreadable", source)
      }
      const request: CheckRequest = { bytes }
      worker.postMessage(request, [bytes])
    },
    [fail, stop]
  )

  // Bring the results into view once, when they arrive, and move focus there for screen readers
  const resultKey = state.phase === "done" ? state.report : null
  useEffect(() => {
    if (!resultKey || !resultsRef.current) return
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    resultsRef.current.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" })
    resultsRef.current.focus({ preventScroll: true })
  }, [resultKey])

  async function checkFile(file: File | undefined) {
    if (!file) return
    const isCurrent = begin()
    // Turn away an oversized file by its size alone, without reading it into memory first
    if (file.size > MAX_BYTES) return fail(file.name, "too-large", "upload")
    setState({ phase: "working", fileName: file.name })
    try {
      const bytes = await file.arrayBuffer()
      if (isCurrent()) run(file.name, bytes, "upload", isCurrent)
    } catch {
      if (isCurrent()) fail(file.name, "unreadable", "upload")
    }
  }

  async function checkSample() {
    const isCurrent = begin()
    const download = new AbortController()
    downloadRef.current = download
    setState({ phase: "working", fileName: SAMPLE.name })
    try {
      const response = await fetch(SAMPLE.url, { signal: download.signal })
      if (!response.ok) throw new Error(String(response.status))
      const bytes = await response.arrayBuffer()
      if (isCurrent()) run(SAMPLE.name, bytes, "sample", isCurrent)
    } catch {
      if (isCurrent()) fail(SAMPLE.name, "unreadable", "sample")
    }
  }

  function cancel() {
    stop()
    setState({ phase: "idle" })
  }

  function chooseFile() {
    inputRef.current?.click()
  }

  return (
    <>
      <section className="border-b border-border bg-secondary">
        <Container className="grid items-center gap-10 py-12 md:py-16 lg:grid-cols-2 lg:gap-16 lg:py-20">
          <div>{children}</div>

          <div
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={(event) => {
              // dragleave also fires when moving onto a child element; only reset when leaving the sheet
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              if (state.phase !== "working") void checkFile(event.dataTransfer.files[0])
            }}
            className={cn(
              "relative mx-auto flex min-h-80 w-full max-w-md flex-col justify-center rounded-sm border bg-background p-6 shadow-lifted transition-[border-color,box-shadow] duration-150 ease-out md:p-8 lg:aspect-17/22",
              dragging ? "border-primary ring-2 ring-primary" : "border-border"
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                void checkFile(event.target.files?.[0])
                // Same file picked twice in a row should still trigger a check
                event.target.value = ""
              }}
            />
            <Sheet state={state} onChoose={chooseFile} onSample={checkSample} onCancel={cancel} />
          </div>
        </Container>
      </section>

      {state.phase === "done" && (
        <Results
          headingRef={resultsRef}
          fileName={state.fileName}
          parsed={state.parsed}
          report={state.report}
          onChoose={chooseFile}
        />
      )}
    </>
  )
}

function Sheet({
  state,
  onChoose,
  onSample,
  onCancel,
}: {
  state: State
  onChoose: () => void
  onSample: () => void
  onCancel: () => void
}) {
  return (
    <div aria-live="polite" className="flex flex-col items-center text-center">
      {state.phase === "idle" && (
        <>
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-primary">
            <FileText className="size-6" aria-hidden="true" />
          </span>
          <p className="mt-5 text-xl font-semibold text-foreground">Drop your resume PDF here</p>
          <p className="mt-2 text-sm text-muted-foreground">PDF up to 5 MB. We read the first 3 pages.</p>
          <Button size="hero" className="mt-6 w-full sm:w-auto" onClick={onChoose}>
            Choose a PDF
          </Button>
          <Button variant="link" className="mt-4" onClick={onSample}>
            Try it with our sample resume
          </Button>
        </>
      )}

      {state.phase === "working" && (
        <>
          <Loader2 className="size-8 text-primary motion-safe:animate-spin" aria-hidden="true" />
          <p className="mt-5 text-xl font-semibold text-foreground">Reading your PDF</p>
          <p className="mt-2 max-w-full truncate text-sm text-muted-foreground">{state.fileName}</p>
          <Button variant="secondary" className="mt-6" onClick={onCancel}>
            Cancel
          </Button>
        </>
      )}

      {state.phase === "failed" && (
        <>
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-destructive">
            <X className="size-6" aria-hidden="true" />
          </span>
          <p className="mt-5 text-xl font-semibold text-foreground">{FAILURE[state.reason].title}</p>
          <p className="mt-2 max-w-full truncate text-sm text-muted-foreground">{state.fileName}</p>
          {/* Several lines of advice: left-aligned even on a centered sheet */}
          <p className="mt-4 text-left text-base text-muted-foreground">{FAILURE[state.reason].next}</p>
          <Button size="hero" className="mt-6 w-full sm:w-auto" onClick={onChoose}>
            Choose another PDF
          </Button>
        </>
      )}

      {state.phase === "done" && (
        <>
          <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-6" aria-hidden="true" />
          </span>
          <p className="mt-5 text-xl font-semibold text-foreground">
            {state.report.passed} of {state.report.counted} checks passed
          </p>
          <p className="mt-2 max-w-full truncate text-sm text-muted-foreground">{state.fileName}</p>
          <Button size="hero" className="mt-6 w-full sm:w-auto" onClick={onChoose}>
            Check another PDF
          </Button>
          <a href="#results" className="mt-4 text-sm font-medium text-primary underline-offset-4 hover:underline">
            See the checklist
          </a>
        </>
      )}
    </div>
  )
}

const STATUS_ICON = {
  pass: { icon: Check, className: "bg-primary text-primary-foreground", label: "Passed" },
  fail: { icon: X, className: "bg-destructive text-destructive-foreground", label: "Failed" },
  skip: { icon: Minus, className: "bg-secondary text-muted-foreground", label: "Skipped" },
}

function CheckRow({ check }: { check: CheckResult }) {
  const status = STATUS_ICON[check.status]
  const Icon = status.icon
  const fix =
    check.status === "skip"
      ? SKIPPED_FIX
      : check.status === "fail"
        ? check.repeatedHeading
          ? REPEATED_HEADING_FIX
          : CHECK_FIX[check.id]
        : null
  return (
    <li className="flex gap-4 px-5 py-4 md:px-6">
      <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full", status.className)}>
        <Icon className="size-3.5" aria-label={status.label} />
      </span>
      <div className="min-w-0">
        <p className="text-base font-semibold text-foreground">{CHECK_TITLE[check.id]}</p>
        <p className="mt-1 text-base break-words text-muted-foreground">{check.detail}</p>
        {fix && <p className="mt-3 text-base text-foreground">{fix}</p>}
      </div>
    </li>
  )
}

function Results({
  headingRef,
  fileName,
  parsed,
  report,
  onChoose,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>
  fileName: string
  parsed: ParsedResume
  report: CheckReport
  onChoose: () => void
}) {
  // What needs fixing first, then the rest in their usual order
  const order = { fail: 0, skip: 1, pass: 2 }
  const checks = [...report.checks].sort((a, b) => order[a.status] - order[b.status])

  return (
    <section id="results" aria-labelledby="results-heading" className="scroll-mt-20 py-12 md:py-16">
      <Container>
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 id="results-heading" ref={headingRef} tabIndex={-1} className="scroll-mt-24 focus:outline-none">
                {report.passed} of {report.counted} checks passed
              </h2>
              <p className="mt-2 truncate text-base text-muted-foreground">{fileName}, read in your browser by OpenResume</p>
            </div>
            <Button variant="secondary" className="w-full sm:w-auto" onClick={onChoose}>
              Check another PDF
            </Button>
          </div>

          <ul className="mt-8 divide-y divide-border rounded-xl border border-border bg-background">
            {checks.map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
          </ul>

          <h3 className="mt-10 text-base font-semibold">Also read, not counted</h3>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-base sm:grid-cols-2">
            {report.facts.map((fact) => (
              <div key={fact.id} className="flex gap-3">
                <dt className="w-20 shrink-0 text-muted-foreground">{FACT_LABEL[fact.id]}</dt>
                <dd className={cn("min-w-0 break-words", fact.flag ? "text-destructive" : "text-foreground")}>{fact.detail}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl gap-6 lg:grid-cols-2">
          <FieldReadout parsed={parsed} />
          <TextReadout parsed={parsed} />
        </div>
      </Container>
    </section>
  )
}
