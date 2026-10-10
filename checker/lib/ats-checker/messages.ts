// What the page and the check worker send each other.
//
// SPDX-License-Identifier: AGPL-3.0-only

import type { CheckReport } from "./checks"
import type { ParsedResume } from "./parse"

export interface CheckRequest {
  bytes: ArrayBuffer
}

export type CheckFailure = "not-pdf" | "too-large" | "encrypted" | "no-text" | "unreadable" | "timeout"

export type CheckResponse =
  // pdf.js is loaded and reading has started. The page starts the 10-second limit here, so a slow
  // connection fetching pdf.js doesn't count against the file.
  | { type: "reading" }
  | { type: "result"; parsed: ParsedResume; report: CheckReport }
  | { type: "error"; reason: "encrypted" | "no-text" | "unreadable" }
