import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href

export async function extractTextFromPDF(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise

  const allLines: string[] = []

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()

    let lastY: number | null = null
    let currentLine = ''

    for (const item of content.items as any[]) {
      if (!item.str) continue
      const y = Math.round(item.transform[5])

      if (lastY !== null && Math.abs(y - lastY) > 3) {
        if (currentLine.trim()) allLines.push(currentLine.trim())
        currentLine = item.str
      } else {
        currentLine += (currentLine ? '  ' : '') + item.str
      }
      lastY = y
    }
    if (currentLine.trim()) allLines.push(currentLine.trim())
  }

  return allLines.join('\n')
}
