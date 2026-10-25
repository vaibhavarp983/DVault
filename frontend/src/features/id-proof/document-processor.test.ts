import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getHeuristic } from './heuristics'
import {
  MAX_ID_PROOF_BYTES,
  extractProcessedDocument,
  processIdDocument,
  validateIdProofFile,
} from './document-processor'
import { IdProofFailure } from './errors'
import type { OcrEngine, OcrOutput } from './types'

const NOW = new Date('2026-10-25T00:00:00.000Z')
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
const PDF_BYTES = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF')

const ID_TEXT = [
  'INCOME TAX DEPARTMENT',
  'PAN CARD',
  'Name: Rowan Ellis',
  'Date of Birth: 01/01/1990',
  'Address: 14 Lake Road, Koramangala, Bengaluru 560034',
  'Aadhaar: 1234 5678 9012',
  'PAN: ABCDE1234F',
].join('\n')

function imageFile(bytes = JPEG_BYTES): File {
  return new File([bytes], 'id.jpg', { type: 'image/jpeg' })
}

function pdfFile(bytes = PDF_BYTES): File {
  return new File([bytes], 'id.pdf', { type: 'application/pdf' })
}

function output(
  text: string,
  options: Partial<OcrOutput> = {},
): OcrOutput {
  return {
    text,
    words: [],
    confidence: 0.95,
    method: 'image_ocr',
    ...options,
  }
}

function fakeEngine(result: OcrOutput): OcrEngine {
  return {
    recognizeImage: async () => ({ ...result, words: [...result.words] }),
    recognizePdf: async () => ({ ...result, words: [...result.words] }),
  }
}

beforeEach(() => {
  vi.stubGlobal('createImageBitmap', undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('document processor — validation', () => {
  it('accepts a JPEG and a text PDF', async () => {
    await expect(validateIdProofFile(imageFile())).resolves.toBe('jpeg')
    await expect(validateIdProofFile(pdfFile())).resolves.toBe('pdf')
  })

  it('rejects an unsupported type', async () => {
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' })
    await expect(validateIdProofFile(file)).rejects.toMatchObject({ code: 'INVALID_TYPE' })
  })

  it('rejects an oversized file', async () => {
    const file = imageFile()
    Object.defineProperty(file, 'size', { value: MAX_ID_PROOF_BYTES + 1 })
    await expect(validateIdProofFile(file)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
  })

  it('rejects a declared PDF whose bytes are an image', async () => {
    const file = new File([JPEG_BYTES], 'fake.pdf', { type: 'application/pdf' })
    await expect(validateIdProofFile(file)).rejects.toMatchObject({ code: 'MALFORMED_FILE' })
  })

  it('rejects a PDF with active or embedded content', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4\n/JavaScript\n%%EOF')
    await expect(validateIdProofFile(pdfFile(bytes))).rejects.toMatchObject({ code: 'UNSAFE_PDF' })
  })

  it('rejects an incomplete PDF', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n')
    await expect(validateIdProofFile(pdfFile(bytes))).rejects.toMatchObject({ code: 'MALFORMED_FILE' })
  })
})

describe('document processor — extraction', () => {
  it('derives age eligibility without returning the date of birth', () => {
    const heuristic = getHeuristic('age_verification')!
    const processed = extractProcessedDocument(output(ID_TEXT), heuristic, 'Rowan Ellis', NOW)
    expect(processed.fields.map((field) => field.key)).toEqual(['age_over_18'])
    expect(processed.fields[0]?.value).toBe('Yes')
    expect(processed.excludedFieldLabels).toContain('Date of birth')
    expect(processed.excludedFieldLabels).toContain('Aadhaar number')
    expect(processed.excludedFieldLabels).toContain('PAN number')
    const serialised = JSON.stringify(processed)
    expect(serialised).not.toContain('01/01/1990')
    expect(serialised).not.toContain('1234 5678 9012')
    expect(serialised).not.toContain('ABCDE1234F')
  })

  it('returns a name match without the name or an ID number', () => {
    const heuristic = getHeuristic('name_verification')!
    const processed = extractProcessedDocument(output(ID_TEXT), heuristic, 'Rowan Ellis', NOW)
    expect(processed.fields.map((field) => field.key)).toEqual(['name_match'])
    expect(processed.fields[0]?.value).toBe('Match')
    const serialised = JSON.stringify(processed)
    expect(serialised).not.toContain('Rowan Ellis')
    expect(serialised).not.toContain('1234 5678 9012')
    expect(serialised).not.toContain('ABCDE1234F')
  })

  it('returns only address fields for address verification', () => {
    const heuristic = getHeuristic('address_verification')!
    const processed = extractProcessedDocument(output(ID_TEXT), heuristic, 'Rowan Ellis', NOW)
    const keys = processed.fields.map((field) => field.key)
    expect(keys).toEqual(
      expect.arrayContaining(['address_line', 'city', 'postal_code', 'address_verified']),
    )
    expect(keys).not.toContain('full_name')
    expect(keys).not.toContain('date_of_birth')
    const serialised = JSON.stringify(processed)
    expect(serialised).not.toContain('01/01/1990')
    expect(serialised).not.toContain('ABCDE1234F')
  })

  it('masks PAN immediately and never returns the raw value', () => {
    const heuristic = getHeuristic('bank_account_opening')!
    const processed = extractProcessedDocument(output(ID_TEXT), heuristic, 'Rowan Ellis', NOW)
    const pan = processed.fields.find((field) => field.key === 'pan_masked')
    expect(pan?.value).toBe('XXXXX1234F')
    expect(pan?.masked).toBe(true)
    expect(JSON.stringify(processed)).not.toContain('ABCDE1234F')
  })

  it('flags low per-field confidence instead of inventing a value', () => {
    const heuristic = getHeuristic('age_verification')!
    const processed = extractProcessedDocument(
      output(ID_TEXT, { confidence: 0.3, words: [{ text: '1990', confidence: 0.3 }] }),
      heuristic,
      'Rowan Ellis',
      NOW,
    )
    expect(processed.fields[0]?.confidence).toBeLessThan(0.75)
    expect(processed.warnings).toContain('LOW_FIELD_CONFIDENCE')
  })

  it('reports a missing required field without inventing it', () => {
    const heuristic = getHeuristic('age_verification')!
    const processed = extractProcessedDocument(
      output('Name: Rowan Ellis'),
      heuristic,
      'Rowan Ellis',
      NOW,
    )
    expect(processed.fields).toHaveLength(0)
    expect(processed.warnings).toContain('AGE_NOT_FOUND')
  })
})

describe('document processor — pipeline', () => {
  it('processes an image through the injected OCR engine', async () => {
    const heuristic = getHeuristic('age_verification')!
    const processed = await processIdDocument({
      file: imageFile(),
      heuristic,
      profileName: 'Rowan Ellis',
      engine: fakeEngine(output(ID_TEXT)),
      now: NOW,
    })
    expect(processed.method).toBe('image_ocr')
    expect(processed.assurance).toBe('ocr')
    expect(processed.fields[0]?.key).toBe('age_over_18')
  })

  it('marks PDF text-layer results as text_layer', async () => {
    const heuristic = getHeuristic('age_verification')!
    const processed = await processIdDocument({
      file: pdfFile(),
      heuristic,
      profileName: 'Rowan Ellis',
      engine: fakeEngine(output(ID_TEXT, { method: 'pdf_text', confidence: 0.99 })),
      now: NOW,
    })
    expect(processed.method).toBe('pdf_text')
    expect(processed.assurance).toBe('text_layer')
  })

  it('surfaces an OCR failure without sharing', async () => {
    const heuristic = getHeuristic('age_verification')!
    const engine: OcrEngine = {
      recognizeImage: async () => {
        throw new IdProofFailure('OCR_FAILED', 'The image could not be read on this device.')
      },
      recognizePdf: async () => {
        throw new IdProofFailure('OCR_FAILED', 'The PDF could not be read on this device.')
      },
    }
    await expect(
      processIdDocument({
        file: imageFile(),
        heuristic,
        profileName: 'Rowan Ellis',
        engine,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: 'OCR_FAILED' })
  })
})
