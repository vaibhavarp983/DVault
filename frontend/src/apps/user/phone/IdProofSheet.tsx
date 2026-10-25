import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  LockKeyhole,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react'
import { useRef, type ChangeEvent } from 'react'
import { ocrMode as configuredOcrMode, ocrProviderLabel } from '@/data/config'
import type { IdProofHeuristic } from '@/features/id-proof/heuristics'
import {
  ID_PROOF_HEURISTICS,
  TASK_CATEGORIES,
  getHeuristic,
} from '@/features/id-proof/heuristics'
import { assuranceLabel } from '@/features/id-proof/policy-engine'
import type {
  IdProofFileKind,
  IdProofFlow,
  IdProofStep,
  SharePreview,
  SharePreviewField,
} from '@/features/id-proof'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { SectionLabel } from '@/components/ui/panel'
import { cn } from '@/lib/cn'

const stepTitles: Partial<Record<IdProofStep, string>> = {
  menu: 'Share an ID proof',
  notice: 'Before DVault reads it',
  analyzing: 'Understanding the request',
  clarify: 'Confirm the task',
  processing: 'Reading the document',
  issue: 'Cannot share yet',
  preview: 'Privacy preview',
  sharing: 'Sharing',
  done: 'Shared',
  error: 'Something went wrong',
}

export function IdProofSheet({
  flow,
  ocrMode = configuredOcrMode,
  ocrProvider = ocrProviderLabel,
}: {
  flow: IdProofFlow
  ocrMode?: 'external' | 'local'
  ocrProvider?: string
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLInputElement>(null)
  const { state, heuristic } = flow

  if (!state.open) return null

  const onFile = (kind: IdProofFileKind) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) flow.chooseFile(file, kind)
  }

  const openPicker = (kind: IdProofFileKind) => {
    if (kind === 'camera') cameraRef.current?.click()
    if (kind === 'image') imageRef.current?.click()
    if (kind === 'pdf') pdfRef.current?.click()
  }

  const closeDisabled = state.step === 'sharing' || state.step === 'processing'

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="ID proof sharing">
      <button
        type="button"
        aria-label="Close ID proof sharing"
        className="absolute inset-0 bg-charcoal/40 backdrop-blur-[1px]"
        onClick={() => {
          if (!closeDisabled) flow.cancel()
        }}
      />
      <div className="scroll-thin relative max-h-[92%] overflow-y-auto rounded-t-[28px] border-t border-line bg-panel px-4 pb-7 pt-3 shadow-flyout">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink">
              {stepTitles[state.step] ?? 'ID proof'}
            </p>
            <p className="mt-0.5 text-[8.5px] text-ink-faint">
              {ocrMode === 'external'
                ? `${ocrProvider} OCR · sent via the DVault API`
                : 'On-device processing · nothing is uploaded'}
            </p>
          </div>
          <button
            type="button"
            onClick={flow.close}
            disabled={closeDisabled}
            aria-label="Close"
            className="flex size-7 items-center justify-center rounded-full text-ink-faint hover:bg-panel-muted disabled:opacity-40"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {state.step === 'menu' && (
          <MenuStep
            flow={flow}
            heuristic={heuristic}
            onOpen={openPicker}
            ocrMode={ocrMode}
            ocrProvider={ocrProvider}
          />
        )}
        {state.step === 'notice' && (
          <NoticeStep
            flow={flow}
            heuristic={heuristic}
            ocrMode={ocrMode}
            ocrProvider={ocrProvider}
          />
        )}
        {state.step === 'analyzing' && <AnalyzingStep />}
        {state.step === 'clarify' && <ClarifyStep flow={flow} />}
        {state.step === 'processing' && (
          <ProcessingStep flow={flow} ocrMode={ocrMode} ocrProvider={ocrProvider} />
        )}
        {state.step === 'issue' && <IssueStep flow={flow} />}
        {state.step === 'preview' && state.preview && (
          <PreviewStep
            flow={flow}
            preview={state.preview}
            ocrMode={ocrMode}
            ocrProvider={ocrProvider}
          />
        )}
        {state.step === 'sharing' && <SharingStep />}
        {state.step === 'done' && (
          <DoneStep flow={flow} ocrMode={ocrMode} ocrProvider={ocrProvider} />
        )}
        {state.step === 'error' && <ErrorStep flow={flow} />}

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={onFile('camera')}
        />
        <input
          ref={imageRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={onFile('image')}
        />
        <input
          ref={pdfRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={onFile('pdf')}
        />
      </div>
    </div>
  )
}

function MenuStep({
  flow,
  heuristic,
  onOpen,
  ocrMode,
  ocrProvider,
}: {
  flow: IdProofFlow
  heuristic: IdProofHeuristic | null
  onOpen: (kind: IdProofFileKind) => void
  ocrMode: 'external' | 'local'
  ocrProvider: string
}) {
  return (
    <div className="mt-3 space-y-2">
      {heuristic && (
        <div className="flex items-center gap-1.5">
          <Badge tone="gold">{heuristic.label}</Badge>
          <span className="text-[8px] text-ink-faint">selected task</span>
        </div>
      )}
      {flow.state.issue && (
        <p className="rounded-lg border border-gold/20 bg-gold-soft/40 px-2.5 py-1.5 text-[9px] text-gold-ink">
          {flow.state.issue}
        </p>
      )}
      <Option
        icon={Camera}
        title="Take a photo"
        description="Use the camera on this device"
        onClick={() => onOpen('camera')}
      />
      <Option
        icon={ImageIcon}
        title="Upload an image"
        description="JPEG, PNG or WebP · up to 10 MB"
        onClick={() => onOpen('image')}
      />
      <Option
        icon={FileText}
        title="Upload a PDF"
        description="Text-based or scanned PDF · up to 10 MB"
        onClick={() => onOpen('pdf')}
      />
      <p className="flex items-start gap-1.5 pt-1 text-[8px] leading-3.5 text-ink-faint">
        <LockKeyhole className="mt-0.5 size-2.5 shrink-0 text-gold-ink" />
        {ocrMode === 'external'
          ? `OCR is processed by ${ocrProvider} through the DVault API. DVault does not store the document.`
          : 'OCR runs in a local worker. DVault never uploads the original document.'}
      </p>
      <Button variant="ghost" size="sm" className="w-full" onClick={flow.cancel}>
        Cancel
      </Button>
    </div>
  )
}

function Option({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: typeof Camera
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition-colors active:bg-panel-muted"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-panel text-gold-ink">
        <Icon className="size-3.5" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-[8.5px] text-ink-faint">{description}</span>
      </span>
    </button>
  )
}

function NoticeStep({
  flow,
  heuristic,
  ocrMode,
  ocrProvider,
}: {
  flow: IdProofFlow
  heuristic: IdProofHeuristic | null
  ocrMode: 'external' | 'local'
  ocrProvider: string
}) {
  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-2xl border border-gold/20 bg-gold-soft/35 p-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-gold-ink" />
          <p className="text-[10.5px] font-semibold text-ink">Your privacy choices</p>
        </div>
        <ul className="mt-2 space-y-1.5 text-[9px] leading-4 text-ink-soft">
          {ocrMode === 'external' ? (
            <>
              <li>
                • The document will be sent to {ocrProvider} for OCR through the DVault API.
              </li>
              <li>
                • DVault does not store the document; the provider’s data-retention terms apply.
              </li>
              <li>• DVault extracts only the fields this task permits.</li>
              <li>• You review every field before anything is shared.</li>
            </>
          ) : (
            <>
              <li>• The document is read on this device. The original is never uploaded.</li>
              <li>• DVault extracts only the fields this task permits.</li>
              <li>• You review every field before anything is shared.</li>
              <li>• Temporary data is cleared after this session.</li>
            </>
          )}
        </ul>
      </div>
      <div className="rounded-xl border border-line bg-surface p-2.5">
        <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
          Selected input
        </p>
        <p className="mt-1 text-[10px] font-medium text-ink">
          {flow.state.fileKind === 'camera'
            ? 'Camera photo'
            : flow.state.fileKind === 'pdf'
              ? 'PDF document'
              : 'Image file'}
        </p>
        <p className="mt-1 text-[8.5px] leading-4 text-ink-faint">
          {heuristic
            ? `Task: ${heuristic.label}`
            : 'DVault will identify the task from this conversation.'}
        </p>
      </div>
      <p className="rounded-lg border border-warning/20 bg-warning-soft px-2.5 py-1.5 text-[8.5px] leading-4 text-warning">
        OCR is not identity verification. A reading from a document is labelled as unverified unless
        an authorised verification service is used.
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" className="flex-1" onClick={flow.cancel}>
          Cancel
        </Button>
        <Button
          variant="gold"
          size="sm"
          className="flex-1"
          onClick={() => void flow.confirmProcessing()}
        >
          Process on this device
        </Button>
      </div>
    </div>
  )
}

function AnalyzingStep() {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 pb-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-full border border-gold/25 bg-gold-soft">
        <ScanLine className="size-5 text-gold-ink" />
      </span>
      <p className="text-[11px] font-semibold text-ink">Identifying the task</p>
      <p className="max-w-[240px] text-[9px] leading-4 text-ink-faint">
        DVault is reading the conversation context only. No document fields are shared at this stage.
      </p>
    </div>
  )
}

function ClarifyStep({ flow }: { flow: IdProofFlow }) {
  const classification = flow.state.classification
  const suggestions = (classification?.candidates ?? [])
    .map((candidate) => ({
      heuristic: getHeuristic(candidate.taskId),
      confidence: candidate.confidence,
    }))
    .filter((entry): entry is { heuristic: IdProofHeuristic; confidence: number } =>
      Boolean(entry.heuristic),
    )
    .slice(0, 3)

  return (
    <div className="mt-3 space-y-3">
      <p className="text-[9px] leading-4 text-ink-soft">
        {classification?.rationale ??
          'DVault could not identify a task from this conversation. Choose what the business needs.'}
      </p>
      {classification?.noIdProofRequired && (
        <p className="rounded-lg border border-warning/20 bg-warning-soft px-2.5 py-1.5 text-[8.5px] leading-4 text-warning">
          No ID proof appears necessary for this conversation. Only choose a task if the business has
          specifically asked for an identity check.
        </p>
      )}
      {flow.state.issue && (
        <p className="rounded-lg border border-gold/20 bg-gold-soft/40 px-2.5 py-1.5 text-[9px] text-gold-ink">
          {flow.state.issue}
        </p>
      )}
      {suggestions.length > 0 && !classification?.noIdProofRequired && (
        <div>
          <SectionLabel>Suggested task</SectionLabel>
          <div className="mt-1.5 space-y-1.5">
            {suggestions.map(({ heuristic, confidence }) => (
              <button
                key={heuristic.taskId}
                type="button"
                onClick={() => void flow.selectTask(heuristic.taskId)}
                className="flex w-full items-start gap-2 rounded-xl border border-gold/30 bg-gold-soft/35 px-2.5 py-2 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-semibold text-ink">{heuristic.label}</span>
                  <span className="mt-0.5 block text-[8px] leading-3.5 text-ink-faint">
                    {heuristic.description}
                  </span>
                </span>
                <Badge tone="gold">{Math.round(confidence * 100)}%</Badge>
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <SectionLabel>All identity tasks</SectionLabel>
        <div className="mt-1.5 max-h-[280px] space-y-2 overflow-y-auto pr-1">
          {TASK_CATEGORIES.map((category) => {
            const tasks = ID_PROOF_HEURISTICS.filter(
              (heuristic) => heuristic.category === category.key,
            )
            if (!tasks.length) return null
            return (
              <div key={category.key}>
                <p className="text-[7.5px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  {category.label}
                </p>
                <div className="mt-1 space-y-1">
                  {tasks.map((heuristic) => (
                    <button
                      key={heuristic.taskId}
                      type="button"
                      onClick={() => void flow.selectTask(heuristic.taskId)}
                      className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-2 py-1.5 text-left"
                    >
                      <span className="min-w-0 flex-1 text-[9.5px] font-medium text-ink">
                        {heuristic.label}
                      </span>
                      <span className="shrink-0 text-[7.5px] text-ink-faint">
                        {heuristic.requiredOutput === 'document'
                          ? 'document'
                          : heuristic.requiredOutput === 'verification_result'
                            ? 'result'
                            : 'fields'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <Button variant="ghost" size="sm" className="w-full" onClick={flow.cancel}>
        Cancel
      </Button>
    </div>
  )
}

function ProcessingStep({
  flow,
  ocrMode,
  ocrProvider,
}: {
  flow: IdProofFlow
  ocrMode: 'external' | 'local'
  ocrProvider: string
}) {
  return (
    <div className="mt-5 space-y-3 pb-2">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-full border border-gold/25 bg-gold-soft">
          <ScanLine className="size-5 animate-pulse text-gold-ink" />
        </span>
        <p className="text-[11px] font-semibold text-ink">
          {ocrMode === 'external' ? `Reading via ${ocrProvider}` : 'Reading on this device'}
        </p>
        <p className="max-w-[250px] text-[9px] leading-4 text-ink-faint">
          {ocrMode === 'external'
            ? `The document is sent to ${ocrProvider} for OCR. DVault extracts only what the selected task allows.`
            : 'Extracting candidate fields, then discarding everything the selected task does not allow.'}
        </p>
      </div>
      <Progress
        value={Math.round(flow.state.progress * 100)}
        tone="gold"
        className="h-1.5"
        label="Document processing progress"
      />
      <p className="text-center text-[8px] text-ink-faint">
        The full OCR text is never shown or stored; only the approved fields are shared.
      </p>
      <Button variant="ghost" size="sm" className="w-full" onClick={flow.cancel}>
        Cancel processing
      </Button>
    </div>
  )
}

function IssueStep({ flow }: { flow: IdProofFlow }) {
  const evaluation = flow.state.evaluation
  const reasons = evaluation?.reasons ?? []
  const canRetryDocument =
    !reasons.includes('authoritative_verification_unavailable') &&
    !reasons.includes('recipient_not_authorized') &&
    !reasons.includes('recipient_missing')
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-11 items-center justify-center rounded-full border border-warning/25 bg-warning-soft">
          <ShieldAlert className="size-5 text-warning" />
        </span>
        <p className="text-[10.5px] font-semibold text-ink">DVault is not sharing anything yet</p>
      </div>
      <p className="rounded-xl border border-line bg-surface px-3 py-2.5 text-[9.5px] leading-4 text-ink-soft">
        {flow.state.issue ?? evaluation?.userMessage ?? 'The request needs clarification.'}
      </p>
      {evaluation && evaluation.excludedFieldLabels.length > 0 && (
        <ExcludedList labels={evaluation.excludedFieldLabels} />
      )}
      <div className="space-y-1.5">
        {canRetryDocument && (
          <Button variant="gold" size="sm" className="w-full" onClick={flow.retry}>
            Try another document
          </Button>
        )}
        <Button variant="outline" size="sm" className="w-full" onClick={flow.changeTask}>
          Choose a different task
        </Button>
        <Button variant="ghost" size="sm" className="w-full" onClick={flow.close}>
          Close
        </Button>
      </div>
    </div>
  )
}

function PreviewStep({
  flow,
  preview,
  ocrMode,
  ocrProvider,
}: {
  flow: IdProofFlow
  preview: SharePreview
  ocrMode: 'external' | 'local'
  ocrProvider: string
}) {
  const isDocument = preview.outcome === 'REQUEST_ID_DOCUMENT'
  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-2xl border border-gold/20 bg-gold-soft/30 p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gold-ink" />
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold text-ink">{preview.taskLabel}</p>
            <p className="mt-0.5 text-[8.5px] text-ink-soft">
              {preview.recipientName} · {preview.recipientCode}
            </p>
            <p className="mt-0.5 text-[8.5px] text-ink-faint">{preview.purpose}</p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <Badge tone={preview.assurance === 'authoritative' ? 'success' : 'warning'}>
            {assuranceLabel(preview.assurance)}
          </Badge>
          <Badge tone="outline">{preview.outcome.replaceAll('_', ' ').toLowerCase()}</Badge>
          {ocrMode === 'external' && (
            <Badge tone="outline">OCR: {ocrProvider}</Badge>
          )}
        </div>
      </div>

      <div>
        <SectionLabel>Will be shared</SectionLabel>
        <div className="mt-1.5 space-y-1">
          {preview.fields.length === 0 ? (
            <p className="rounded-lg border border-line bg-surface px-2.5 py-2 text-[9px] text-ink-soft">
              No document fields. DVault will share a verification result only.
            </p>
          ) : (
            preview.fields.map((field) => <FieldRow key={field.key} field={field} />)
          )}
        </div>
      </div>

      <ExcludedList labels={preview.excluded} />

      {isDocument && (
        <p className="rounded-lg border border-warning/20 bg-warning-soft px-2.5 py-2 text-[8.5px] leading-4 text-warning">
          This task needs an original document. DVault will not transmit the raw document in this
          build; it will share the reference below for the recipient’s authorised verification step.
        </p>
      )}

      <p className="rounded-lg border border-line bg-panel-muted px-2.5 py-2 text-[8px] leading-3.5 text-ink-faint">
        {preview.retentionNote}
      </p>
      <p className="text-center font-mono text-[8px] text-ink-faint">Reference {preview.reference}</p>

      <div className="flex gap-2">
        <Button variant="ghost" size="sm" className="flex-1" onClick={flow.cancel}>
          Cancel
        </Button>
        <Button
          variant="gold"
          size="sm"
          className="flex-1"
          disabled={preview.outcome === 'ASK_USER'}
          onClick={() => void flow.approve()}
        >
          {isDocument ? 'Approve and share reference' : 'Approve and share'}
        </Button>
      </div>
      <p className="text-center text-[8px] text-ink-faint">
        Nothing is sent until you press Approve.
      </p>
    </div>
  )
}

function FieldRow({ field }: { field: SharePreviewField }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5">
      <span className="min-w-0 text-[8.5px] text-ink-faint">{field.label}</span>
      <span className="min-w-0 break-words text-right text-[9px] font-medium text-ink-soft">
        {field.value}
      </span>
    </div>
  )
}

function ExcludedList({ labels }: { labels: string[] }) {
  return (
    <div>
      <SectionLabel>Excluded or masked</SectionLabel>
      {labels.length === 0 ? (
        <p className="mt-1.5 text-[8.5px] text-ink-faint">Nothing else from the document.</p>
      ) : (
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {labels.map((label) => (
            <li
              key={label}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-panel-muted px-2 py-0.5 text-[8px] text-ink-faint"
            >
              <LockKeyhole className="size-2.5" />
              {label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SharingStep() {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 pb-4 text-center">
      <span className="flex size-12 items-center justify-center rounded-full border border-gold/25 bg-gold-soft">
        <ShieldCheck className="size-5 animate-pulse text-gold-ink" />
      </span>
      <p className="text-[11px] font-semibold text-ink">Sharing the approved payload</p>
      <p className="max-w-[250px] text-[9px] leading-4 text-ink-faint">
        Only the fields and result shown in the preview are being sent through this conversation.
      </p>
    </div>
  )
}

function DoneStep({
  flow,
  ocrMode,
  ocrProvider,
}: {
  flow: IdProofFlow
  ocrMode: 'external' | 'local'
  ocrProvider: string
}) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 pb-2 text-center">
      <span className="flex size-12 items-center justify-center rounded-full border border-success/25 bg-success-soft">
        <CheckCircle2 className="size-5 text-success" />
      </span>
      <p className="text-[11px] font-semibold text-ink">Shared with the business</p>
      <p className="max-w-[250px] text-[9px] leading-4 text-ink-faint">
        {ocrMode === 'external'
          ? `The document was sent to ${ocrProvider} for OCR. DVault did not store it, and temporary processing data has been cleared.`
          : 'The original document was not uploaded. Temporary processing data has been cleared.'}
      </p>
      {flow.state.sharedReference && (
        <p className="font-mono text-[8px] text-ink-faint">
          Reference {flow.state.sharedReference}
        </p>
      )}
      <Button variant="gold" size="sm" className="w-full" onClick={flow.close}>
        Close
      </Button>
    </div>
  )
}

function ErrorStep({ flow }: { flow: IdProofFlow }) {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-11 items-center justify-center rounded-full border border-danger/20 bg-danger-soft">
          <AlertTriangle className="size-5 text-danger" />
        </span>
        <p className="text-[10.5px] font-semibold text-ink">Could not complete</p>
      </div>
      <p className="rounded-xl border border-line bg-surface px-3 py-2.5 text-[9.5px] leading-4 text-ink-soft">
        {flow.state.error?.message ?? 'The operation could not be completed. Nothing was shared.'}
      </p>
      <div className="space-y-1.5">
        <Button variant="gold" size="sm" className="w-full" onClick={flow.retry}>
          Start again
        </Button>
        <Button variant="ghost" size="sm" className="w-full" onClick={flow.close}>
          Close
        </Button>
      </div>
      <p className={cn('text-center text-[8px] text-ink-faint')}>
        Temporary data and previews were cleared.
      </p>
    </div>
  )
}
