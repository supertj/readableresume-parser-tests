// Runs the OpenResume parser (vendor/open-resume, pinned by git submodule) on a PDF in Node.
//
// Only Step 1 (reading the PDF) is re-implemented here, because the upstream
// read-pdf.ts loads pdf.js through a browser worker entry. The text-item mapping below
// mirrors upstream read-pdf.ts line for line. Steps 2–4 are imported unchanged.
//
// Usage: npx tsx parse-pdf.ts <file.pdf>   → prints { resume, textItems, lines } as JSON
//
// SPDX-License-Identifier: AGPL-3.0-only

import "./node-globals";
import { readFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.js";
import { groupTextItemsIntoLines } from "lib/parse-resume-from-pdf/group-text-items-into-lines";
import { groupLinesIntoSections } from "lib/parse-resume-from-pdf/group-lines-into-sections";
import { extractResumeFromSections } from "lib/parse-resume-from-pdf/extract-resume-from-sections/index";

type TextItem = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
};

const readPdf = async (data: Uint8Array): Promise<TextItem[]> => {
  const pdfFile = await pdfjs.getDocument({ data, useSystemFonts: false, isEvalSupported: false })
    .promise;
  let textItems: TextItem[] = [];

  for (let i = 1; i <= pdfFile.numPages; i++) {
    const page = await pdfFile.getPage(i);
    const textContent = await page.getTextContent();

    // Wait for font data to be loaded (same as upstream)
    await page.getOperatorList();
    const commonObjs = page.commonObjs;

    const pageTextItems = textContent.items.map((item: any) => {
      const { str: text, dir, transform, fontName: pdfFontName, ...otherProps } = item;
      const x = transform[4];
      const y = transform[5];
      const fontObj = commonObjs.get(pdfFontName);
      const fontName = fontObj.name;
      const newText = text.replace(/-­‐/g, "-");
      return { ...otherProps, fontName, text: newText, x, y };
    });

    textItems.push(...pageTextItems);
  }

  const isEmptySpace = (textItem: TextItem) => !textItem.hasEOL && textItem.text.trim() === "";
  textItems = textItems.filter((textItem) => !isEmptySpace(textItem));

  return textItems;
};

const main = async () => {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: parse-pdf.ts <file.pdf>");
    process.exit(2);
  }
  const textItems = await readPdf(new Uint8Array(readFileSync(path)));
  // groupTextItemsIntoLines mutates items while merging, so keep a copy for the report
  const rawItems = textItems.map((item) => ({ ...item }));
  const lines = groupTextItemsIntoLines(textItems as any);
  const sections = groupLinesIntoSections(lines);
  const resume = extractResumeFromSections(sections);
  const out = {
    resume,
    lines: lines.map((line) => line.map((item) => item.text).join(" ‖ ")),
    textItemCount: rawItems.length,
    fonts: [...new Set(rawItems.map((item) => item.fontName))],
  };
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
