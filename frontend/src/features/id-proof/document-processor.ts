import type {
  Assurance,
  ExtractedField,
  IdProofDocumentType,
  IdProofFieldKey,
  OcrEngine,
  OcrOutput,
  ProcessedDocument,
} from './types'
import type { IdProofHeuristic } from './heuristics'
import { FIELD_LABELS } from './heuristics'
import { IdProofFailure } from './errors'

export const MAX_ID_PROOF_BYTES = 10 * 1024 * 1024
export const MIN_FIELD_CONFIDENCE = 0.75
export const MAX_IMAGE_SIDE = 5000
export const MAX_IMAGE_PIXELS = 25_000_000

export type FileMagic = 'jpeg' | 'png' | 'webp' | 'pdf'

interface Candidate {
  key: IdProofFieldKey
  value: string
  confidence: number
  masked: boolean
}

interface ProcessInput {
  file: File
  heuristic: IdProofHeuristic
  profileName: string
  engine: OcrEngine
  now?: Date
  signal?: AbortSignal
  onProgress?: (progress: number) => void
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const PDF_TYPE = 'application/pdf'
const KNOWN_CITIES =
  /(Bengaluru|Bangalore|Mumbai|Pune|Delhi|New Delhi|Chennai|Kolkata|Hyderabad|Kochi|Jaipur|Lucknow|Patna|Noida|Ahmedabad|Guwahati|Indore)/i

function ascii(bytes: Uint8Array): string {
  let value = ''
  for (const byte of bytes) value += String.fromCharCode(byte)
  return value
}

function hasMagic(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false
  return signature.every((byte, index) => bytes[index] === byte)
}

async function readHead(file: File, length = 1024): Promise<Uint8Array> {
  const buffer = await file.slice(0, length).arrayBuffer()
  return new Uint8Array(buffer)
}

function magicFromBytes(bytes: Uint8Array): FileMagic | null {
  if (hasMagic(bytes, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (hasMagic(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (ascii(bytes.slice(0, 4)) === 'RIFF' && ascii(bytes.slice(8, 12)) === 'WEBP') return 'webp'
  if (ascii(bytes).includes('%PDF-')) return 'pdf'
  return null
}

export async function validateIdProofFile(file: File): Promise<FileMagic> {
  if (file.size === 0) {
    throw new IdProofFailure('MALFORMED_FILE', 'The selected file is empty.')
  }
  if (file.size > MAX_ID_PROOF_BYTES) {
    throw new IdProofFailure('FILE_TOO_LARGE', 'The selected file is larger than 10 MB.')
  }
  const declared = (file.type || '').toLowerCase()
  if (declared && declared !== PDF_TYPE && !IMAGE_TYPES.has(declared)) {
    throw new IdProofFailure(
      'INVALID_TYPE',
      'Only JPEG, PNG, WebP and PDF files can be read. Nothing was shared.',
    )
  }
  const head = await readHead(file)
  const magic = magicFromBytes(head)
  if (!magic) {
    throw new IdProofFailure(
      'INVALID_TYPE',
      'The file contents do not match a supported image or PDF. Nothing was shared.',
    )
  }
  if (declared === PDF_TYPE && magic !== 'pdf') {
    throw new IdProofFailure('MALFORMED_FILE', 'The PDF file is malformed.')
  }
  if (IMAGE_TYPES.has(declared) && magic === 'pdf') {
    throw new IdProofFailure('MALFORMED_FILE', 'The image file is malformed.')
  }

  if (magic === 'pdf') {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const text = ascii(bytes)
    if (/\/(JavaScript|JS)\b|\/EmbeddedFile|\/Launch|\/OpenAction/.test(text)) {
      throw new IdProofFailure(
        'UNSAFE_PDF',
        'This PDF contains active or embedded content and cannot be processed.',
      )
    }
    if (!text.includes('%%EOF')) {
      throw new IdProofFailure('MALFORMED_FILE', 'The PDF file is incomplete or malformed.')
    }
    return 'pdf'
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      const area = bitmap.width * bitmap.height
      const tooLarge =
        bitmap.width > MAX_IMAGE_SIDE ||
        bitmap.height > MAX_IMAGE_SIDE ||
        area > MAX_IMAGE_PIXELS
      bitmap.close()
      if (tooLarge) {
        throw new IdProofFailure(
          'MALFORMED_FILE',
          'The image dimensions are too large to process safely.',
        )
      }
    } catch (error) {
      if (error instanceof IdProofFailure) throw error
      throw new IdProofFailure('MALFORMED_FILE', 'The image could not be decoded.')
    }
  }
  return magic
}

function normalizeWord(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function confidenceFor(output: OcrOutput, needle: string): number {
  const normalized = normalizeWord(needle)
  if (!normalized) return output.confidence
  const matches = output.words
    .map((word) => ({ text: normalizeWord(word.text), confidence: word.confidence }))
    .filter(
      (word) =>
        word.text.length >= 2 &&
        (word.text.includes(normalized) || normalized.includes(word.text)),
    )
  if (!matches.length) return output.confidence
  const average = matches.reduce((sum, word) => sum + word.confidence, 0) / matches.length
  return Math.max(0, Math.min(0.99, average))
}

function addCandidate(
  candidates: Candidate[],
  key: IdProofFieldKey,
  value: string,
  confidence: number,
  masked = false,
): void {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (!cleaned || cleaned.length > 200) return
  candidates.push({
    key,
    value: cleaned,
    confidence: Math.max(0, Math.min(0.99, confidence)),
    masked,
  })
}

function maskAadhaar(value: string): string {
  const digits = value.replace(/\D/g, '')
  return `XXXX XXXX ${digits.slice(-4)}`
}

function maskPan(value: string): string {
  return `XXXXX${value.slice(5, 9)}${value.slice(9)}`
}

function maskNumber(value: string): string {
  const compact = value.replace(/[\s-]/g, '')
  if (compact.length <= 4) return 'XXXX'
  return `XXXX${compact.slice(-4)}`
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.length > 4 ? `******${digits.slice(-4)}` : '******'
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1)
}

function nameMatch(
  profileName: string,
  documentName: string,
  ocrConfidence: number,
): { value: string; confidence: number } {
  const profile = tokenize(profileName)
  const documentTokens = tokenize(documentName)
  if (!profile.length || !documentTokens.length) {
    return { value: 'Not enough information', confidence: 0.2 }
  }
  const overlap = profile.filter((token) => documentTokens.includes(token)).length
  const similarity = overlap / Math.max(profile.length, documentTokens.length)
  const value = similarity >= 0.75 ? 'Match' : similarity >= 0.4 ? 'Partial match' : 'No match'
  return {
    value,
    confidence: Math.min(ocrConfidence, 0.55 + 0.44 * similarity),
  }
}

function ageFromDate(year: number, month: number, day: number, now: Date): number {
  let age = now.getFullYear() - year
  const currentMonth = now.getMonth() + 1
  if (currentMonth < month || (currentMonth === month && now.getDate() < day)) {
    age -= 1
  }
  return age
}

function detectDocumentType(text: string): IdProofDocumentType {
  if (/aadhaar|uidai|unique identification/i.test(text)) return 'aadhaar'
  if (/income tax department|permanent account number|pan card/i.test(text)) return 'pan'
  if (/passport/i.test(text)) return 'passport'
  if (/driving licen[cs]e|transport department|dl no/i.test(text)) return 'driving_licence'
  if (/electricity bill|water bill|gas bill|address proof|utility bill/i.test(text)) {
    return 'address_proof'
  }
  if (/employee id|offer letter|employer|staff id/i.test(text)) return 'employee_letter'
  return 'unknown'
}

const DOCUMENT_TYPE_LABELS: Record<IdProofDocumentType, string> = {
  aadhaar: 'Aadhaar',
  pan: 'PAN card',
  passport: 'Passport',
  driving_licence: 'Driving licence',
  address_proof: 'Address proof',
  employee_letter: 'Employee letter',
  unknown: 'Unknown document',
}

function extractName(text: string): string | null {
  const labelled = text.match(
    /(?:^|\n)\s*(?:name|full name|applicant name|customer name)\s*[:\-]\s*([^\n]{2,80})/i,
  )
  if (labelled?.[1]) return labelled[1].trim()
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  return (
    lines.find(
      (line) =>
        /^[A-Za-z][A-Za-z .'-]{2,60}$/.test(line) &&
        !/government|india|aadhaar|pan|income tax|passport|licen[cs]e|address|department|republic|card|gender|male|female|dob|date of birth/i.test(
          line,
        ),
    ) ?? null
  )
}

function extractAddress(text: string): {
  line: string | null
  city: string | null
  postalCode: string | null
  confidence: number
} {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
  const index = lines.findIndex((line) => /address/i.test(line))
  const block: string[] = []
  if (index >= 0) {
    const inline = lines[index].replace(/^.*?address[^:]*[:\-]?\s*/i, '').trim()
    if (inline) block.push(inline)
    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 5); cursor += 1) {
      if (/^(?:phone|mobile|email|dob|date of birth|aadhaar|pan|gender|name)\b/i.test(lines[cursor])) {
        break
      }
      block.push(lines[cursor])
    }
  }
  const joined = block.join(', ')
  const pinMatch = (joined.match(/\b\d{6}\b/) ?? text.match(/\b\d{6}\b/))?.[0] ?? null
  const cityMatch = (joined.match(KNOWN_CITIES) ?? text.match(KNOWN_CITIES))?.[1] ?? null
  const labelledLine =
    block[0]?.replace(/\b\d{6}\b/g, '').replace(/,+\s*$/, '').trim() || null
  const pinLine = pinMatch
    ? lines
        .find((line) => line.includes(pinMatch))
        ?.replace(/\b\d{6}\b/g, '')
        .replace(/,+\s*$/, '')
        .trim() ?? null
    : null
  const firstLine = labelledLine ?? pinLine
  return {
    line: firstLine,
    city: cityMatch,
    postalCode: pinMatch,
    confidence: pinMatch || cityMatch ? 0.85 : 0.6,
  }
}

function appendSensitiveLabels(text: string, labels: Set<string>): void {
  if (/\b\d{4}\s?\d{4}\s?\d{4}\b/.test(text)) labels.add(FIELD_LABELS.aadhaar_number)
  if (/\b[A-Z]{5}\d{4}[A-Z]\b/.test(text)) labels.add(FIELD_LABELS.pan_number)
  if (/\b(?:date of birth|dob|year of birth|born)\b/i.test(text)) {
    labels.add(FIELD_LABELS.date_of_birth)
  }
  if (/\b(?:photo|photograph|signature|male|female|gender)\b/i.test(text)) {
    labels.add(FIELD_LABELS.photo)
    labels.add(FIELD_LABELS.signature)
    labels.add(FIELD_LABELS.gender)
  }
}

function sanitizeValue(value: string): string {
  return value
    .replace(/\b(\d{4})\s?(\d{4})\s?(\d{4})\b/g, (_, __, ___, last) => `XXXX XXXX ${last}`)
    .replace(/\b([A-Z]{5})(\d{4})([A-Z])\b/g, (_, __, digits, last) => `XXXXX${digits}${last}`)
}

function applyAllowlist(
  candidates: Candidate[],
  heuristic: IdProofHeuristic,
  sensitiveLabels: Set<string>,
): { fields: ExtractedField[]; excluded: string[] } {
  const allowed = new Set<IdProofFieldKey>([
    ...heuristic.allowedSourceFields,
    ...heuristic.derivedOutputs,
  ])
  const blocked = new Set<IdProofFieldKey>(heuristic.blockedByDefault)
  const excluded = new Set<string>(sensitiveLabels)
  const fields: ExtractedField[] = []

  for (const candidate of candidates) {
    if (!allowed.has(candidate.key) || blocked.has(candidate.key)) {
      excluded.add(FIELD_LABELS[candidate.key])
      continue
    }
    fields.push({
      key: candidate.key,
      value: sanitizeValue(candidate.value),
      confidence: candidate.confidence,
      masked: candidate.masked,
    })
  }

  return { fields, excluded: [...excluded].sort() }
}

export function extractProcessedDocument(
  output: OcrOutput,
  heuristic: IdProofHeuristic,
  profileName: string,
  now: Date = new Date(),
): ProcessedDocument {
  if (!output.text.trim()) {
    throw new IdProofFailure(
      'OCR_FAILED',
      'No readable text was found. Try a clearer image or a different document.',
    )
  }

  const text = output.text
  const documentType = detectDocumentType(text)
  const candidates: Candidate[] = []
  const sensitiveLabels = new Set<string>()
  const warnings: string[] = []

  const name = extractName(text)
  if (name) {
    addCandidate(candidates, 'full_name', name, confidenceFor(output, name))
    const match = nameMatch(profileName, name, confidenceFor(output, name))
    addCandidate(candidates, 'name_match', match.value, match.confidence)
  } else {
    warnings.push('NAME_NOT_FOUND')
  }

  const dateMatch =
    text.match(
      /(?:date of birth|dob|birth|born)[^\d]{0,15}(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/i,
    ) ??
    text.match(
      /(?:date of birth|dob|birth|born)[^\d]{0,15}(\d{4})-(\d{2})-(\d{2})/i,
    )
  const yearMatch = text.match(/(?:year of birth|yob|born)[^\d]{0,15}(\d{4})/i)
  if (dateMatch) {
    const year = Number(dateMatch[3])
    const month = Number(dateMatch[2])
    const day = Number(dateMatch[1])
    const confidence = confidenceFor(output, dateMatch[0])
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      const age = ageFromDate(year, month, day, now)
      addCandidate(candidates, 'age_over_18', age >= 18 ? 'Yes' : 'No', confidence)
      sensitiveLabels.add(FIELD_LABELS.date_of_birth)
    }
  } else if (yearMatch) {
    const year = Number(yearMatch[1])
    const confidence = confidenceFor(output, yearMatch[0])
    const maxAge = now.getFullYear() - year
    const minAge = maxAge - 1
    if (minAge >= 18) {
      addCandidate(candidates, 'age_over_18', 'Yes', confidence)
    } else if (maxAge < 18) {
      addCandidate(candidates, 'age_over_18', 'No', confidence)
    } else {
      warnings.push('AGE_BOUNDARY_AMBIGUOUS')
    }
    sensitiveLabels.add(FIELD_LABELS.date_of_birth)
  } else {
    warnings.push('AGE_NOT_FOUND')
  }

  const address = extractAddress(text)
  const addressConfidence = Math.min(address.confidence, output.confidence)
  if (address.line) {
    addCandidate(candidates, 'address_line', address.line, addressConfidence)
  }
  if (address.city) addCandidate(candidates, 'city', address.city, addressConfidence)
  if (address.postalCode) {
    addCandidate(candidates, 'postal_code', address.postalCode, addressConfidence)
  }
  if (address.line && address.postalCode) {
    addCandidate(
      candidates,
      'address_verified',
      documentType === 'address_proof'
        ? 'Verified from address proof'
        : 'Address details extracted from document',
      addressConfidence,
    )
  }

  const aadhaar = text.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/)
  if (aadhaar) {
    addCandidate(candidates, 'aadhaar_masked', maskAadhaar(aadhaar[0]), confidenceFor(output, aadhaar[0]), true)
    sensitiveLabels.add(FIELD_LABELS.aadhaar_number)
  }

  const pan = text.match(/\b[A-Z]{5}\d{4}[A-Z]\b/)
  if (pan) {
    addCandidate(candidates, 'pan_masked', maskPan(pan[0]), confidenceFor(output, pan[0]), true)
    sensitiveLabels.add(FIELD_LABELS.pan_number)
  }

  const documentNumber = text.match(
    /(?:dl no|dl number|licen[cs]e no|driving licen[cs]e no|passport no|passport number)[^\w]{0,10}([A-Z0-9-]{6,20})/i,
  )
  if (documentNumber?.[1]) {
    addCandidate(
      candidates,
      'document_number_masked',
      maskNumber(documentNumber[1]),
      confidenceFor(output, documentNumber[1]),
      true,
    )
  }

  if (documentType !== 'unknown') {
    addCandidate(candidates, 'document_type', DOCUMENT_TYPE_LABELS[documentType], 0.9)
  }

  const examRoll = text.match(/(?:roll no|roll number|exam roll)[^\w]{0,10}([A-Z0-9-]{3,20})/i)
  if (examRoll?.[1]) {
    addCandidate(candidates, 'exam_roll_number', examRoll[1], confidenceFor(output, examRoll[1]))
  }

  const employeeId = text.match(/(?:employee id|emp id|staff id)[^\w]{0,10}([A-Z0-9-]{3,20})/i)
  if (employeeId?.[1]) {
    addCandidate(candidates, 'employee_id', employeeId[1], confidenceFor(output, employeeId[1]))
  }

  const employer = text.match(/(?:employer|company)\s*[:\-]\s*([^\n]{2,80})/i)
  if (employer?.[1]) {
    addCandidate(candidates, 'employer_name', employer[1], confidenceFor(output, employer[1]))
  }

  const visitorRef = text.match(
    /(?:visitor|pass)\s*(?:id|no|number|ref)\s*[:\-]?\s*([A-Z0-9-]{3,20})/i,
  )
  if (visitorRef?.[1]) {
    addCandidate(candidates, 'visitor_reference', visitorRef[1], confidenceFor(output, visitorRef[1]))
  }

  const policyNumber = text.match(/(?:policy no|policy number)\s*[:\-]?\s*([A-Z0-9-]{4,30})/i)
  if (policyNumber?.[1]) {
    addCandidate(candidates, 'policy_number', policyNumber[1], confidenceFor(output, policyNumber[1]))
  }

  const applicationRef = text.match(
    /(?:application|reference|ref)\s*(?:no|number|id)?\s*[:\-]?\s*([A-Z0-9-]{4,30})/i,
  )
  if (applicationRef?.[1]) {
    addCandidate(
      candidates,
      'application_reference',
      applicationRef[1],
      confidenceFor(output, applicationRef[1]),
    )
  }

  const institution = text.match(/(?:university|college|institute|school)\s*[:\-]?\s*([^\n]{2,80})/i)
  if (institution?.[1]) {
    addCandidate(candidates, 'institution_name', institution[1], confidenceFor(output, institution[1]))
  }

  const phone = text.match(/(?:mobile|phone|contact)\s*(?:no|number)?\s*[:\-]?\s*(\+?\d[\d\s-]{7,15})/i)
  if (phone?.[1]) {
    addCandidate(candidates, 'phone_number', maskPhone(phone[1]), confidenceFor(output, phone[1]), true)
  }

  const guardian = text.match(/(?:father|guardian|mother)\s*(?:name)?\s*[:\-]\s*([^\n]{2,80})/i)
  if (guardian?.[1]) {
    addCandidate(candidates, 'guardian_name', guardian[1], confidenceFor(output, guardian[1]))
  }

  appendSensitiveLabels(text, sensitiveLabels)
  const { fields, excluded } = applyAllowlist(candidates, heuristic, sensitiveLabels)

  for (const field of fields) {
    if (field.confidence < MIN_FIELD_CONFIDENCE) {
      warnings.push('LOW_FIELD_CONFIDENCE')
      break
    }
  }

  const assurance: Assurance = output.method === 'pdf_text' ? 'text_layer' : 'ocr'
  const documentConfidence = fields.length
    ? fields.reduce((minimum, field) => Math.min(minimum, field.confidence), 1)
    : 0

  return {
    documentType,
    method: output.method,
    assurance,
    fields,
    excludedFieldLabels: excluded,
    documentConfidence,
    warnings: [...new Set(warnings)],
  }
}

export async function processIdDocument(input: ProcessInput): Promise<ProcessedDocument> {
  const magic = await validateIdProofFile(input.file)
  if (input.signal?.aborted) {
    throw new IdProofFailure('CANCELLED', 'Document processing was cancelled.')
  }
  let output: OcrOutput | null = null
  try {
    output =
      magic === 'pdf'
        ? await input.engine.recognizePdf(input.file, {
            onProgress: input.onProgress,
            signal: input.signal,
          })
        : await input.engine.recognizeImage(input.file, {
            onProgress: input.onProgress,
            signal: input.signal,
          })
    return extractProcessedDocument(
      output,
      input.heuristic,
      input.profileName,
      input.now ?? new Date(),
    )
  } finally {
    if (output) {
      output.text = ''
      output.words.length = 0
    }
  }
}
