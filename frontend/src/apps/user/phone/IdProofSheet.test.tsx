import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IdProofSheet } from '@/apps/user/phone/IdProofSheet'
import type {
  IdProofFlow,
  IdProofFlowState,
  PolicyEvaluation,
  SharePreview,
} from '@/features/id-proof'
import { getHeuristic } from '@/features/id-proof/heuristics'

const evaluation: PolicyEvaluation = {
  outcome: 'RETURN_VERIFICATION_RESULT',
  allowedFields: [
    { key: 'age_over_18', value: 'Yes', confidence: 0.95, masked: false },
  ],
  excludedFieldLabels: ['Aadhaar number', 'Date of birth'],
  assurance: 'ocr',
  recipientAuthorized: true,
  reasons: ['recipient_authorized'],
  userMessage: 'Only a verification result will be shared.',
  requiresApproval: true,
}

const preview: SharePreview = {
  taskId: 'age_verification',
  taskLabel: 'Age verification',
  recipientName: 'Aranya Coaching Centre',
  recipientCode: 'BIZ-ARANYA',
  purpose: 'Age-restricted service eligibility',
  fields: [
    {
      key: 'age_over_18',
      label: 'Age eligibility',
      value: '18 or older',
      masked: false,
    },
  ],
  excluded: ['Aadhaar number', 'Date of birth'],
  assurance: 'ocr',
  outcome: 'RETURN_VERIFICATION_RESULT',
  documentRequired: false,
  documentTransmitted: false,
  retentionNote: 'Processed in this session only.',
  reference: 'IDP-ABC123',
}

function makeFlow(overrides: Partial<IdProofFlowState> = {}): IdProofFlow {
  const state: IdProofFlowState = {
    open: true,
    step: 'menu',
    classification: null,
    heuristicId: null,
    document: null,
    evaluation: null,
    preview: null,
    error: null,
    issue: null,
    progress: 0,
    fileName: null,
    fileKind: null,
    sharedReference: null,
    ...overrides,
  }
  return {
    state,
    heuristic: getHeuristic(state.heuristicId),
    begin: vi.fn(),
    chooseFile: vi.fn(),
    confirmProcessing: vi.fn().mockResolvedValue(undefined),
    selectTask: vi.fn().mockResolvedValue(undefined),
    changeTask: vi.fn(),
    retry: vi.fn(),
    approve: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
    close: vi.fn(),
  }
}

describe('IdProofSheet', () => {
  it('offers camera, image and PDF input in the menu', () => {
    const flow = makeFlow()
    render(<IdProofSheet flow={flow} />)
    expect(screen.getByText('Share an ID proof')).toBeInTheDocument()
    expect(screen.getByText('Take a photo')).toBeInTheDocument()
    expect(screen.getByText('Upload an image')).toBeInTheDocument()
    expect(screen.getByText('Upload a PDF')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(flow.cancel).toHaveBeenCalledTimes(1)
  })

  it('discloses the external OCR provider before processing', () => {
    const flow = makeFlow({ step: 'notice', fileKind: 'image' })
    render(
      <IdProofSheet
        flow={flow}
        ocrMode="external"
        ocrProvider="Google Cloud Vision"
      />,
    )
    expect(
      screen.getByText(/sent to Google Cloud Vision for OCR through the DVault API/),
    ).toBeInTheDocument()
    expect(screen.getByText(/DVault does not store the document/)).toBeInTheDocument()
    expect(screen.queryByText(/read on this device/i)).not.toBeInTheDocument()
  })

  it('shows the external provider in the privacy preview', () => {
    const flow = makeFlow({
      step: 'preview',
      heuristicId: 'age_verification',
      evaluation,
      preview,
    })
    render(
      <IdProofSheet
        flow={flow}
        ocrMode="external"
        ocrProvider="Google Cloud Vision"
      />,
    )
    expect(screen.getByText('OCR: Google Cloud Vision')).toBeInTheDocument()
  })

  it('shows only the approved payload in the privacy preview', () => {
    const flow = makeFlow({
      step: 'preview',
      heuristicId: 'age_verification',
      evaluation,
      preview,
    })
    render(<IdProofSheet flow={flow} />)
    expect(screen.getByText('Privacy preview')).toBeInTheDocument()
    expect(screen.getByText('Age verification')).toBeInTheDocument()
    expect(screen.getByText('Aranya Coaching Centre · BIZ-ARANYA')).toBeInTheDocument()
    expect(screen.getByText('Age-restricted service eligibility')).toBeInTheDocument()
    expect(screen.getByText('18 or older')).toBeInTheDocument()
    expect(screen.getByText('Excluded or masked')).toBeInTheDocument()
    expect(screen.getByText('Aadhaar number')).toBeInTheDocument()
    expect(screen.getByText('Date of birth')).toBeInTheDocument()
    expect(screen.getByText('OCR-derived — not independently verified')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Approve and share' }))
    expect(flow.approve).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(flow.cancel).toHaveBeenCalledTimes(1)
  })

  it('shows a safe issue state with retry and task-change actions', () => {
    const flow = makeFlow({
      step: 'issue',
      issue: 'The required information could not be read reliably. Try a clearer image.',
      evaluation: { ...evaluation, outcome: 'ASK_USER', reasons: ['low_field_confidence'] },
    })
    render(<IdProofSheet flow={flow} />)
    expect(screen.getByText('Cannot share yet')).toBeInTheDocument()
    expect(
      screen.getByText('The required information could not be read reliably. Try a clearer image.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try another document' }))
    expect(flow.retry).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Choose a different task' }))
    expect(flow.changeTask).toHaveBeenCalledTimes(1)
  })

  it('does not offer another document when authoritative verification is unavailable', () => {
    const flow = makeFlow({
      step: 'issue',
      issue: 'This task requires an authorised identity-verification service.',
      evaluation: {
        ...evaluation,
        outcome: 'ASK_USER',
        reasons: ['authoritative_verification_unavailable'],
      },
    })
    render(<IdProofSheet flow={flow} />)
    expect(screen.queryByRole('button', { name: 'Try another document' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose a different task' })).toBeInTheDocument()
  })

  it('renders the success state without the original document', () => {
    const flow = makeFlow({ step: 'done', sharedReference: 'IDP-ABC123' })
    render(<IdProofSheet flow={flow} />)
    expect(screen.getByText('Shared with the business')).toBeInTheDocument()
    expect(screen.getByText('The original document was not uploaded. Temporary processing data has been cleared.')).toBeInTheDocument()
    expect(screen.getByText('Reference IDP-ABC123')).toBeInTheDocument()
  })

  it('renders a safe error without raw values', () => {
    const flow = makeFlow({
      step: 'error',
      error: { code: 'OCR_FAILED', message: 'The image could not be read on this device.' },
    })
    render(<IdProofSheet flow={flow} />)
    expect(screen.getByText('Could not complete')).toBeInTheDocument()
    expect(screen.getByText('The image could not be read on this device.')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\b\d{4}\s?\d{4}\s?\d{4}\b/)
    expect(document.body.textContent).not.toMatch(/\b[A-Z]{5}\d{4}[A-Z]\b/)
  })
})
