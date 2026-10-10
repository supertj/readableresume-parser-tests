/**
 * 检测工具和证明仓库读数一致性核对。工具在浏览器里用站点的 pdf.js 6，证明仓库在 Node 里用 pdf.js 3.7；
 * 同一份 PDF 两边读出的字段和行必须完全一样，否则工具上"解析器读到的"和模板页公布的结果会对不上。
 *
 *   npx tsx scripts/ats-checker-parity.ts <proof 仓库目录>
 *
 * 会对 <proof>/fixtures 下所有 PDF 各跑一遍两条路径，逐份比 resume 和 lines，有差异就打印并以 1 退出。
 * 顺带核对页面上"Templates that pass all ten checks"这句：模板的简历样本（不含岗位示例）必须 10 项全过。
 * 再拿 findings/2026-10-05-font-export 的 32 份字体样本核对连字和特殊符号两项：pdfminer 在那里数出过
 * 连字（如 Lora 的 ﬁ）和私用区字符（如 Inter 的图标），工具的判定必须和它一致。
 */
import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"

import { MAX_PAGES, runChecks } from "../lib/ats-checker/checks"
import { parseResume } from "../lib/ats-checker/parse"
import { readPdf } from "../lib/ats-checker/read-pdf"

const proofDir = resolve(process.argv[2] ?? "")
const fixtureDir = join(proofDir, "fixtures")
const pdfs = readdirSync(fixtureDir, { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".pdf"))
  .sort()

function proofRunner(pdf: string) {
  const out = execFileSync("npx", ["tsx", "parse-pdf.ts", pdf], {
    cwd: join(proofDir, "parser"),
    env: { ...process.env, NODE_PATH: "./node_modules" },
    encoding: "utf8",
    // 子进程的 tsx 告警不看；它真出错时 execFileSync 会抛出，错误里带着 stderr
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 20 * 1024 * 1024,
  })
  const { resume, lines } = JSON.parse(out)
  return { resume, lines }
}

async function main() {
  let mismatches = 0
  for (const file of pdfs) {
    const pdf = join(fixtureDir, file)
    // 证明仓库读全部页，这里也读全部页，才能逐行比；页数上限另外测
    const read = await readPdf(pdfjs as never, new Uint8Array(readFileSync(pdf)), Infinity)
    const ours = parseResume(read.items)
    const theirs = proofRunner(pdf)
    if (/-resume-(letter|a4)\.pdf$/.test(file) && !file.startsWith("example-")) {
      const limited = await readPdf(pdfjs as never, new Uint8Array(readFileSync(pdf)), MAX_PAGES)
      const report = runChecks(limited, parseResume(limited.items))
      if (report.passed !== report.counted || report.counted !== 10) {
        mismatches++
        const failed = report.checks.filter((check) => check.status !== "pass")
        console.log(`FAIL  ${file} ${report.passed}/${report.counted}: ${failed.map((check) => `${check.id} ${check.detail}`).join("; ")}`)
      }
    }
    const sameResume = JSON.stringify(ours.resume) === JSON.stringify(theirs.resume)
    const sameLines = JSON.stringify(ours.lines) === JSON.stringify(theirs.lines)
    if (sameResume && sameLines) {
      console.log(`same  ${file}`)
      continue
    }
    mismatches++
    console.log(`DIFF  ${file}${sameResume ? "" : " resume"}${sameLines ? "" : " lines"}`)
    if (!sameLines) {
      const count = Math.max(ours.lines.length, theirs.lines.length)
      for (let index = 0; index < count; index++) {
        if (ours.lines[index] === theirs.lines[index]) continue
        console.log(`  line ${index}\n    pdf.js 6: ${ours.lines[index]}\n    pdf.js 3: ${theirs.lines[index]}`)
      }
    }
    if (!sameResume) {
      console.log(`  pdf.js 6: ${JSON.stringify(ours.resume)}\n  pdf.js 3: ${JSON.stringify(theirs.resume)}`)
    }
  }
  // 字体样本：pdfminer 数到连字的，连字检查必须不过；数到私用区字符的，特殊符号检查必须不过；反之亦然
  const fontDir = join(proofDir, "findings/2026-10-05-font-export")
  const fontResults: { file: string; ligatures: Record<string, number>; privateUseChars: Record<string, number> }[] =
    JSON.parse(readFileSync(join(fontDir, "results.json"), "utf8")).results
  for (const font of fontResults) {
    const read = await readPdf(pdfjs as never, new Uint8Array(readFileSync(join(fontDir, "pdf", font.file))), MAX_PAGES)
    const report = runChecks(read, parseResume(read.items))
    const status = (id: string) => report.checks.find((check) => check.id === id)?.status
    const expected = {
      ligatures: Object.keys(font.ligatures).length ? "fail" : "pass",
      symbols: Object.keys(font.privateUseChars).length ? "fail" : "pass",
    }
    const wrong = (["ligatures", "symbols"] as const).filter((id) => status(id) !== expected[id])
    if (wrong.length) {
      mismatches++
      console.log(`FAIL  font ${font.file}: ${wrong.map((id) => `${id} ${status(id)}, pdfminer says ${expected[id]}`).join("; ")}`)
    } else {
      console.log(`same  font ${font.file} ligatures ${expected.ligatures} symbols ${expected.symbols}`)
    }
  }

  console.log(`\n${pdfs.length} files and ${fontResults.length} font samples, ${mismatches} with differences or failed checks`)
  process.exit(mismatches ? 1 : 0)
}

main()
