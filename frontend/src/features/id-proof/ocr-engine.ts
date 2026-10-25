import { apiBaseUrl, demoApiPrefix, ocrMode } from '@/data/config'
import type { OcrEngine, OcrOutput, OcrWord } from './types'
import { IdProofFailure } from './errors'

export interface OcrRunOptions {
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}

const MAX_PDF_PAGES = 3

function aborted(signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted)
}

function assertNotAborted(signal?: AbortSignal): void {
  if (aborted(signal)) {
    throw new IdProofFailure('CANCELLED', 'Document processing was cancelled.')
  }
}

function wordsFromTesseract(blocks: TesseractBlock[] | null | undefined): OcrWord[] {
  if (!blocks) return []
  return blocks.flatMap((block) =>
    (block.paragraphs ?? []).flatMap((paragraph) =>
      (paragraph.lines ?? []).flatMap((line) =>
        (line.words ?? [])
          .filter((word) => Boolean(word.text))
          .map((word) => ({
            text: word.text ?? '',
            confidence: Math.max(0, Math.min(1, (word.confidence ?? 0) / 100)),
          })),
      ),
    ),
  )
}

interface TesseractWord {
  text?: string
  confidence?: number
}

interface TesseractLine {
  words?: TesseractWord[]
}

interface TesseractParagraph {
  lines?: TesseractLine[]
}

interface TesseractBlock {
  paragraphs?: TesseractParagraph[]
}

interface TesseractData {
  text?: string
  confidence?: number
  blocks?: TesseractBlock[] | null
}

export class BrowserOcrEngine implements OcrEngine {
  async recognizeImage(file: File, options: OcrRunOptions = {}): Promise<OcrOutput> {
    assertNotAborted(options.signal)
    let worker: {
      recognize: (input: File, options?: object, output?: object) => Promise<{ data: unknown }>
      terminate: () => Promise<unknown>
    } | null = null
    try {
      const tesseract = await import('tesseract.js')
      worker = await tesseract.createWorker('eng', 1, {
        logger: (message: { status: string; progress: number }) => {
          if (message.status === 'recognizing text') {
            options.onProgress?.(Math.max(0, Math.min(1, message.progress)))
          }
        },
      })
      const terminate = () => {
        void worker?.terminate().catch(() => undefined)
      }
      options.signal?.addEventListener('abort', terminate, { once: true })
      try {
        const result = await worker.recognize(file, {}, { text: true, blocks: true })
        const data = result.data as TesseractData
        return {
          text: data.text ?? '',
          words: wordsFromTesseract(data.blocks),
          confidence: Math.max(0, Math.min(1, (data.confidence ?? 0) / 100)),
          method: 'image_ocr',
        }
      } finally {
        options.signal?.removeEventListener('abort', terminate)
      }
    } catch (error) {
      if (error instanceof IdProofFailure) throw error
      throw new IdProofFailure(
        'OCR_FAILED',
        'The image could not be read on this device. Try a clearer photo or a different file.',
      )
    } finally {
      await worker?.terminate().catch(() => undefined)
    }
  }

  async recognizePdf(file: File, options: OcrRunOptions = {}): Promise<OcrOutput> {
    assertNotAborted(options.signal)
    let destroyPdf: (() => Promise<void>) | null = null
    try {
      const pdfjs = await import('pdfjs-dist')
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString()
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
      })
      const pdfDocument = await loadingTask.promise
      destroyPdf = () => loadingTask.destroy()
      const pageCount = Math.min(pdfDocument.numPages, MAX_PDF_PAGES)
      let text = ''
      let method: OcrOutput['method'] = 'pdf_text'
      const words: OcrWord[] = []
      let ocrConfidence = 0
      let ocrPages = 0

      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        assertNotAborted(options.signal)
        const page = await pdfDocument.getPage(pageNumber)
        const content = await page.getTextContent()
        const pageText = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()

        if (pageText.length >= 20) {
          text += `${pageText}\n`
          continue
        }

        method = 'pdf_ocr'
        const viewport = page.getViewport({ scale: 2 })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const context = canvas.getContext('2d')
        if (!context) {
          canvas.width = 0
          canvas.height = 0
          throw new IdProofFailure('OCR_FAILED', 'The PDF page could not be rendered on this device.')
        }
        await page.render({ canvas, canvasContext: context, viewport }).promise
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
        canvas.width = 0
        canvas.height = 0
        if (!blob) {
          throw new IdProofFailure('OCR_FAILED', 'The PDF page could not be read on this device.')
        }
        const pageResult = await this.recognizeImage(
          new File([blob], `page-${pageNumber}.png`, { type: 'image/png' }),
          options,
        )
        text += `${pageResult.text}\n`
        words.push(...pageResult.words)
        ocrConfidence += pageResult.confidence
        ocrPages += 1
      }

      if (!text.trim()) {
        throw new IdProofFailure(
          'OCR_FAILED',
          'This PDF has no readable text. Upload a clearer PDF or an image of the document.',
        )
      }

      return {
        text: text.trim(),
        words,
        confidence: ocrPages ? ocrConfidence / ocrPages : 0.99,
        method,
      }
    } catch (error) {
      if (error instanceof IdProofFailure) throw error
      if (error instanceof Error && error.name === 'PasswordException') {
        throw new IdProofFailure('ENCRYPTED_PDF', 'Password-protected PDFs are not supported.')
      }
      throw new IdProofFailure(
        'OCR_FAILED',
        'The PDF could not be read on this device. Try a different PDF or an image.',
      )
    } finally {
      await destroyPdf?.().catch(() => undefined)
    }
  }
}

export function createOcrEngine(): OcrEngine {
  if (ocrMode === 'external') {
    return apiBaseUrl ? new RemoteOcrEngine(apiBaseUrl) : new UnavailableOcrEngine()
  }
  return new BrowserOcrEngine()
}

interface RemoteOcrResponse {
  text?: string
  confidence?: number
  words?: Array<{ text?: string; confidence?: number }>
  provider?: string
  pages?: number
}

function clamp01(value: number | undefined): number {
  return Math.max(0, Math.min(1, value ?? 0))
}

function remoteFailure(
  status: number,
  code: string | undefined,
  message: string | undefined,
): IdProofFailure {
  if (status === 413) {
    return new IdProofFailure(
      'FILE_TOO_LARGE',
      message ?? 'The selected file is larger than the allowed limit.',
    )
  }
  if (status === 422) {
    if (code === 'UNSAFE_PDF') {
      return new IdProofFailure(
        'UNSAFE_PDF',
        message ?? 'This PDF contains active or embedded content and cannot be processed.',
      )
    }
    if (code === 'MALFORMED_FILE') {
      return new IdProofFailure('MALFORMED_FILE', message ?? 'The file is malformed.')
    }
    if (code === 'OCR_NO_TEXT') {
      return new IdProofFailure(
        'OCR_FAILED',
        message ?? 'No readable text was found. Try a clearer image or a different document.',
      )
    }
    return new IdProofFailure(
      'INVALID_TYPE',
      message ?? 'Only JPEG, PNG, WebP and PDF files can be read.',
    )
  }
  if (status === 503) {
    return new IdProofFailure(
      'OCR_UNAVAILABLE',
      message ?? 'External OCR is unavailable right now. Nothing was shared.',
    )
  }
  return new IdProofFailure(
    'OCR_FAILED',
    message ?? 'The OCR provider could not process this document. Nothing was shared.',
  )
}

/** Calls the DVault backend, which performs the external provider request server-side. */
export class RemoteOcrEngine implements OcrEngine {
  constructor(private readonly baseUrl: string) {}

  private async recognizeFile(file: File, options: OcrRunOptions): Promise<OcrOutput> {
    assertNotAborted(options.signal)
    options.onProgress?.(0.15)
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${demoApiPrefix}/id-proof/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
        cache: 'no-store',
        signal: options.signal,
      })
    } catch {
      if (options.signal?.aborted) {
        throw new IdProofFailure('CANCELLED', 'Document processing was cancelled.')
      }
      throw new IdProofFailure(
        'OCR_UNAVAILABLE',
        'The OCR service could not be reached. Nothing was shared.',
      )
    }
    options.onProgress?.(0.8)
    if (!response.ok) {
      let code: string | undefined
      let message: string | undefined
      try {
        const error = (await response.json()) as {
          error?: { code?: string; message?: string }
        }
        code = error.error?.code
        message = error.error?.message
      } catch {
        // Do not surface an unparseable provider/proxy error body.
      }
      throw remoteFailure(response.status, code, message)
    }
    let data: RemoteOcrResponse
    try {
      data = (await response.json()) as RemoteOcrResponse
    } catch {
      throw new IdProofFailure(
        'OCR_FAILED',
        'The OCR service returned an invalid response. Nothing was shared.',
      )
    }
    options.onProgress?.(1)
    return {
      text: data.text ?? '',
      words: (data.words ?? [])
        .filter((word) => Boolean(word.text))
        .map((word) => ({
          text: word.text ?? '',
          confidence: clamp01(word.confidence),
        })),
      confidence: clamp01(data.confidence),
      method: 'external_ocr',
    }
  }

  recognizeImage(file: File, options: OcrRunOptions = {}): Promise<OcrOutput> {
    return this.recognizeFile(file, options)
  }

  recognizePdf(file: File, options: OcrRunOptions = {}): Promise<OcrOutput> {
    return this.recognizeFile(file, options)
  }
}

export class UnavailableOcrEngine implements OcrEngine {
  private unavailable(): Promise<OcrOutput> {
    return Promise.reject(
      new IdProofFailure(
        'OCR_UNAVAILABLE',
        'External OCR requires the DVault API. Set VITE_API_BASE_URL to the running backend, or set VITE_OCR_MODE=local.',
      ),
    )
  }

  recognizeImage(_file: File, _options?: OcrRunOptions): Promise<OcrOutput> {
    return this.unavailable()
  }

  recognizePdf(_file: File, _options?: OcrRunOptions): Promise<OcrOutput> {
    return this.unavailable()
  }
}
