import { getFile } from "@/lib/catalog"
import { OG_CONTENT_TYPE, OG_SIZE, shareImage } from "@/lib/og"

export const alt = "A resume PDF and the result of the ReadableResume ATS checker: 10 of 10 checks passed"
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image() {
  // Same PDF as the page's "Try it with our sample resume" button, which passes all ten checks
  const resume = getFile("jakes", "resume", "letter")
  return shareImage({
    title: "Free ATS resume checker",
    pages: [resume],
    readout: {
      headline: "10 of 10 checks passed",
      detail: "Read in the browser by the open-source OpenResume parser. Nothing uploaded.",
      checked: true,
    },
  })
}
