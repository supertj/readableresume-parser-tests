// Step 1 of the OpenResume parser: read the PDF into text items.
//
// Adapted from OpenResume src/app/lib/parse-resume-from-pdf/read-pdf.ts (commit 4f8255a). The
// text-item mapping inside the page loop is the upstream code, line for line, so the parser
// sees exactly what it sees on open-resume.com and in our proof repository. Changes:
// - takes the loaded pdf.js module and the file bytes instead of a URL, so the same code runs in
//   a Web Worker (the checker) and in Node (the parity script);
// - reads at most `maxPages` pages (PRD 4.3.10 rule 9: first 3 pages);
// - also returns each page's size and a copy of the items tagged with their page, which the
//   checker uses to spot two-column layouts. The parser itself still gets the upstream items;
// - also returns the text as the PDF stores it, before pdf.js's Unicode normalization (below).
//
// SPDX-License-Identifier: AGPL-3.0-only

import type { TextItem, TextItems } from "./open-resume/parse-resume-from-pdf/types"

type PdfJs = typeof import("pdfjs-dist")

export interface PageSize {
  width: number
  height: number
}

export interface PlacedItem {
  text: string
  x: number
  y: number
  width: number
  page: number
}

export interface PdfRead {
  /** What the parser gets: the upstream text items, empty spaces removed */
  items: TextItems
  /** Same items with their page number, before the parser merges them into lines */
  placed: PlacedItem[]
  /** The text line by line without Unicode normalization: "ﬁ" stays one character */
  rawText: string[]
  pages: PageSize[]
  /** Pages in the file, including the ones past `maxPages` */
  totalPages: number
}

export async function readPdf(pdfjs: PdfJs, data: Uint8Array, maxPages: number): Promise<PdfRead> {
  const task = pdfjs.getDocument({
    data,
    useSystemFonts: false,
    // Upstream also passes isEvalSupported: false. pdf.js 6 dropped the option along with the
    // eval-based font code it switched off, so there is nothing left to switch off.
    // Upstream targets pdf.js 3, which always sent a font's original name to the main thread.
    // From pdf.js 4 on it only does with fontExtraProperties, and the parser needs that name to
    // tell bold from regular (section headings, job titles).
    fontExtraProperties: true,
    // pdf.js's Node defaults, set here so the browser worker reads exactly what
    // scripts/ats-checker-parity.ts checked in Node. We only need text: no fonts get installed
    // and no images get decoded, and a Web Worker has no document to install fonts into anyway.
    disableFontFace: true,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
  })
  try {
    const pdfFile = await task.promise
    const pages: PageSize[] = []
    const placed: PlacedItem[] = []
    const rawText: string[] = []
    let textItems: TextItems = []
    const pageCount = Math.min(pdfFile.numPages, maxPages)

    for (let i = 1; i <= pageCount; i++) {
      // Parse each page into text content
      const page = await pdfFile.getPage(i)
      const viewport = page.getViewport({ scale: 1 })
      pages.push({ width: viewport.width, height: viewport.height })
      const textContent = await page.getTextContent()

      // Wait for font data to be loaded
      await page.getOperatorList()
      const commonObjs = page.commonObjs

      // Convert Pdfjs TextItem type to new TextItem type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pageTextItems = textContent.items.map((item: any) => {
        const {
          str: text,
          dir, // eslint-disable-line @typescript-eslint/no-unused-vars
          transform,
          fontName: pdfFontName,
          ...otherProps
        } = item

        // Extract x, y position of text item from transform.
        // As a side note, origin (0, 0) is bottom left.
        // Reference: https://github.com/mozilla/pdf.js/issues/5643#issuecomment-496648719
        const x = transform[4]
        const y = transform[5]

        // Use commonObjs to convert font name to original name (e.g. "GVDLYI+Arial-BoldMT")
        // since non system font name by default is a loaded name, e.g. "g_d8_f1"
        // Reference: https://github.com/mozilla/pdf.js/pull/15659
        const fontObj = commonObjs.get(pdfFontName)
        const fontName = fontObj.name

        // pdfjs reads a "-" as "-­‐" in some cases.
        // So a workaround is to replace "-­‐" with "-"
        const newText = text.replace(/-­‐/g, "-")

        const newItem = {
          ...otherProps,
          fontName,
          text: newText,
          x,
          y,
        }
        return newItem
      }) as TextItem[]

      // Some pdf's text items are not in order. This is most likely a result of creating it
      // from design softwares, e.g. canvas. The commented out method can sort pageTextItems
      // by y position to put them back in order. But it is not used since it might be more
      // helpful to let users know that the pdf is not in order.
      // pageTextItems.sort((a, b) => Math.round(b.y) - Math.round(a.y));

      // Add text items of each page to total
      textItems.push(...pageTextItems)
      for (const item of pageTextItems) placed.push({ text: item.text, x: item.x, y: item.y, width: item.width, page: i })

      // getTextContent() normalizes Unicode by default, which turns the ligature "ﬁ" into "fi" and
      // would hide exactly what the ligature check looks for. The parser keeps the normalized text
      // (upstream and the proof repository read it that way); the character checks read this copy.
      // pdf.js often puts a ligature in an item of its own ("of", "ﬁ", "ce hours"), so items are
      // joined into lines first; otherwise the example shown to the user would be a lone "ﬁ".
      const rawContent = await page.getTextContent({ disableNormalization: true })
      let rawLine = ""
      for (const item of rawContent.items) {
        if (!("str" in item)) continue
        rawLine += item.str
        if (!item.hasEOL) continue
        if (rawLine.trim() !== "") rawText.push(rawLine)
        rawLine = ""
      }
      if (rawLine.trim() !== "") rawText.push(rawLine)
    }

    // Filter out empty space textItem noise
    const isEmptySpace = (textItem: TextItem) => !textItem.hasEOL && textItem.text.trim() === ""
    textItems = textItems.filter((textItem) => !isEmptySpace(textItem))

    return {
      items: textItems,
      placed: placed.filter((item) => item.text.trim() !== ""),
      rawText,
      pages,
      totalPages: pdfFile.numPages,
    }
  } finally {
    // Free the worker side and the document whether or not reading succeeded
    await task.destroy()
  }
}
