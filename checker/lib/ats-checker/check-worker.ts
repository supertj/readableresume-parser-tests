// Runs in a Web Worker: reads the PDF, parses it and runs the checks, so a heavy or broken file
// can't freeze the page, and the page can stop it at any point by terminating the worker.
//
// SPDX-License-Identifier: AGPL-3.0-only

import { MAX_PAGES, runChecks } from "./checks"
import type { CheckRequest, CheckResponse } from "./messages"
import { parseResume } from "./parse"
import { readPdf } from "./read-pdf"

const reply = (message: CheckResponse) => postMessage(message)

addEventListener("message", async (event: MessageEvent<CheckRequest>) => {
  try {
    const pdfjs = await import("pdfjs-dist")
    // pdf.js normally starts a worker of its own. This already is one, so its worker code runs
    // here in the same thread, and terminating this worker stops everything.
    ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.min.mjs")
    reply({ type: "reading" })

    let read
    try {
      read = await readPdf(pdfjs, new Uint8Array(event.data.bytes), MAX_PAGES)
    } catch (error) {
      const name = error instanceof Error ? error.name : ""
      reply({ type: "error", reason: name === "PasswordException" ? "encrypted" : "unreadable" })
      return
    }
    if (read.items.length === 0) {
      reply({ type: "error", reason: "no-text" })
      return
    }
    const parsed = parseResume(read.items)
    reply({ type: "result", parsed, report: runChecks(read, parsed) })
  } catch {
    reply({ type: "error", reason: "unreadable" })
  }
})
