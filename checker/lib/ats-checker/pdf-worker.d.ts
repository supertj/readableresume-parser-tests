// pdf.js ships no types for its worker bundle; the checker only hands it back to pdf.js
declare module "pdfjs-dist/build/pdf.worker.min.mjs" {
  export const WorkerMessageHandler: unknown
}
