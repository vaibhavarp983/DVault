export type IdProofTaskId =
  | 'age_verification'
  | 'name_verification'
  | 'identity_verification'
  | 'address_verification'
  | 'customer_onboarding'
  | 'employee_onboarding'
  | 'tenant_verification'
  | 'hotel_check_in'
  | 'visitor_entry'
  | 'sim_registration'
  | 'bank_account_opening'
  | 'loan_application'
  | 'insurance_onboarding'
  | 'government_service_application'
  | 'exam_registration'
  | 'university_admission'
  | 'exam_hall_entry'
  | 'driving_or_vehicle_service'
  | 'identity_mismatch_resolution'
  | 're_verification'

export type IdProofFieldKey =
  | 'full_name'
  | 'name_match'
  | 'date_of_birth'
  | 'age_over_18'
  | 'address_line'
  | 'city'
  | 'postal_code'
  | 'address_verified'
  | 'aadhaar_number'
  | 'aadhaar_masked'
  | 'pan_number'
  | 'pan_masked'
  | 'document_number_masked'
  | 'document_type'
  | 'document_copy'
  | 'employee_id'
  | 'employer_name'
  | 'visitor_reference'
  | 'phone_number'
  | 'guardian_name'
  | 'policy_number'
  | 'application_reference'
  | 'institution_name'
  | 'exam_roll_number'
  | 'verification_receipt'
  | 'photo'
  | 'signature'
  | 'gender'

export type IdProofTaskCategory =
  | 'verification'
  | 'onboarding'
  | 'tenancy'
  | 'travel'
  | 'regulated'
  | 'education'
  | 'vehicle'
  | 'support'

export type IdProofOutcome =
  | 'RETURN_VERIFICATION_RESULT'
  | 'SHARE_SELECTED_FIELDS'
  | 'REQUEST_ID_DOCUMENT'
  | 'ASK_USER'

export type Assurance = 'ocr' | 'text_layer' | 'authoritative' | 'none'

export type IdProofDocumentType =
  | 'aadhaar'
  | 'pan'
  | 'passport'
  | 'driving_licence'
  | 'address_proof'
  | 'employee_letter'
  | 'unknown'

export type OcrMethod = 'image_ocr' | 'pdf_text' | 'pdf_ocr' | 'external_ocr'

export type IdProofErrorCode =
  | 'INVALID_TYPE'
  | 'FILE_TOO_LARGE'
  | 'MALFORMED_FILE'
  | 'UNSAFE_PDF'
  | 'ENCRYPTED_PDF'
  | 'OCR_UNAVAILABLE'
  | 'OCR_FAILED'
  | 'LOW_CONFIDENCE'
  | 'MISSING_FIELD'
  | 'CONFLICTING_FIELDS'
  | 'SHARE_FAILED'
  | 'CANCELLED'

export interface IdProofError {
  code: IdProofErrorCode
  message: string
}

export interface IdProofConversationMessage {
  sender: string
  body: string | null
  sentAt: string
}

export interface TaskClassification {
  taskId: IdProofTaskId | null
  confidence: number
  matchedTriggers: string[]
  candidates: Array<{ taskId: IdProofTaskId; confidence: number }>
  missingInformation: string[]
  requiresClarification: boolean
  noIdProofRequired: boolean
  rationale: string
}

export interface OcrWord {
  text: string
  confidence: number
}

export interface OcrOutput {
  text: string
  words: OcrWord[]
  confidence: number
  method: OcrMethod
}

export interface OcrEngine {
  recognizeImage(
    file: File,
    options?: { onProgress?: (progress: number) => void; signal?: AbortSignal },
  ): Promise<OcrOutput>
  recognizePdf(
    file: File,
    options?: { onProgress?: (progress: number) => void; signal?: AbortSignal },
  ): Promise<OcrOutput>
}

export interface ExtractedField {
  key: IdProofFieldKey
  value: string
  confidence: number
  masked: boolean
}

export interface ProcessedDocument {
  documentType: IdProofDocumentType
  method: OcrMethod
  assurance: Assurance
  fields: ExtractedField[]
  excludedFieldLabels: string[]
  documentConfidence: number
  warnings: string[]
}

export interface PolicyEvaluation {
  outcome: IdProofOutcome
  allowedFields: ExtractedField[]
  excludedFieldLabels: string[]
  assurance: Assurance
  recipientAuthorized: boolean
  reasons: string[]
  userMessage: string
  requiresApproval: true
}

export interface SharePreviewField {
  key: IdProofFieldKey
  label: string
  value: string
  masked: boolean
}

export interface SharePreview {
  taskId: IdProofTaskId
  taskLabel: string
  recipientName: string
  recipientCode: string
  purpose: string
  fields: SharePreviewField[]
  excluded: string[]
  assurance: Assurance
  outcome: IdProofOutcome
  documentRequired: boolean
  documentTransmitted: false
  retentionNote: string
  reference: string
}

export type IdProofStep =
  | 'closed'
  | 'menu'
  | 'notice'
  | 'analyzing'
  | 'clarify'
  | 'processing'
  | 'issue'
  | 'preview'
  | 'sharing'
  | 'done'
  | 'error'

export type IdProofFileKind = 'camera' | 'image' | 'pdf'

export interface IdProofFlowState {
  open: boolean
  step: IdProofStep
  classification: TaskClassification | null
  heuristicId: IdProofTaskId | null
  document: ProcessedDocument | null
  evaluation: PolicyEvaluation | null
  preview: SharePreview | null
  error: IdProofError | null
  issue: string | null
  progress: number
  fileName: string | null
  fileKind: IdProofFileKind | null
  sharedReference: string | null
}
