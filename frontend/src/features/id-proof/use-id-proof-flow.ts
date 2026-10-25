import { useEffect, useMemo, useRef, useState } from 'react'
import type { BizBusiness } from '@/data/business-directory'
import type { Conversation } from '@/domain/messaging'
import { taskClassifier, type TaskClassifier } from './classifier'
import { getHeuristic, recipientAuthorizedForTask, type IdProofHeuristic } from './heuristics'
import { processIdDocument } from './document-processor'
import { createOcrEngine } from './ocr-engine'
import { evaluateIdProofPolicy } from './policy-engine'
import { createSharePreview, shareApprovedPreview } from './share-adapter'
import { IdProofFailure, safeErrorMessage } from './errors'
import { TemporaryDataManager } from './temporary-data-manager'
import type {
  IdProofFileKind,
  IdProofFlowState,
  TaskClassification,
} from './types'

const SESSION_TIMEOUT_MS = 10 * 60 * 1000

const EMPTY_STATE: IdProofFlowState = {
  open: false,
  step: 'closed',
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
}

function emptyClassification(): TaskClassification {
  return {
    taskId: null,
    confidence: 0,
    matchedTriggers: [],
    candidates: [],
    missingInformation: [],
    requiresClarification: true,
    noIdProofRequired: false,
    rationale: 'No task has been selected yet.',
  }
}

export interface UseIdProofFlowOptions {
  conversation: Conversation | null
  business: BizBusiness | null
  profileName: string
  subjectRef: string
  draft: string
  send: (body: string) => Promise<boolean>
  engine?: import('./types').OcrEngine
  classifier?: TaskClassifier
  now?: () => Date
}

export interface IdProofFlow {
  state: IdProofFlowState
  heuristic: IdProofHeuristic | null
  begin: () => void
  chooseFile: (file: File, kind: IdProofFileKind) => void
  confirmProcessing: () => Promise<void>
  selectTask: (taskId: IdProofHeuristic['taskId']) => Promise<void>
  changeTask: () => void
  retry: () => void
  approve: () => Promise<void>
  cancel: () => void
  close: () => void
}

export function useIdProofFlow(options: UseIdProofFlowOptions): IdProofFlow {
  const [state, setState] = useState<IdProofFlowState>(EMPTY_STATE)
  const stateRef = useRef(state)
  stateRef.current = state

  const latest = useRef(options)
  latest.current = options

  const engine = useMemo(() => options.engine ?? createOcrEngine(), [options.engine])
  const classifier = options.classifier ?? taskClassifier
  const managerRef = useRef<TemporaryDataManager | null>(null)
  const fileRef = useRef<{ file: File; kind: IdProofFileKind } | null>(null)
  const busyRef = useRef(false)

  const update = (patch: Partial<IdProofFlowState>) => {
    setState((previous) => ({ ...previous, ...patch }))
  }

  const recipient = () => {
    const business = latest.current.business
    return business ? { code: business.code, name: business.name } : null
  }

  const classifierInput = () => {
    const conversation = latest.current.conversation
    if (!conversation) return null
    return {
      messages: conversation.messages.map((message) => ({
        sender: message.sender,
        body: message.body,
        sentAt: message.sentAt,
      })),
      subject: conversation.subject,
      draft: latest.current.draft,
      messageType: conversation.messageType,
      business: latest.current.business
        ? {
            code: latest.current.business.code,
            name: latest.current.business.name,
            category: latest.current.business.category,
          }
        : null,
      profileName: latest.current.profileName,
    }
  }

  const disposeManager = () => {
    managerRef.current?.dispose()
    managerRef.current = null
  }

  const startManager = (): TemporaryDataManager => {
    disposeManager()
    const manager = new TemporaryDataManager()
    manager.schedule(() => {
      if (managerRef.current === manager) {
        disposeManager()
        fileRef.current = null
        setState(EMPTY_STATE)
      }
    }, SESSION_TIMEOUT_MS)
    managerRef.current = manager
    return manager
  }

  const ensureManager = (): TemporaryDataManager => {
    if (!managerRef.current || managerRef.current.isDisposed) return startManager()
    return managerRef.current
  }

  const evaluateWithoutDocument = (
    heuristic: IdProofHeuristic,
    classification: TaskClassification,
  ) => {
    const target = recipient()
    const evaluation = evaluateIdProofPolicy({
      classification,
      heuristic,
      document: null,
      recipient: target,
      subjectRef: latest.current.subjectRef,
      now: latest.current.now?.(),
    })
    if (evaluation.outcome === 'ASK_USER' || !target) {
      update({
        step: 'issue',
        document: null,
        evaluation,
        issue: evaluation.userMessage,
        preview: null,
        progress: 1,
      })
      return
    }
    const preview = createSharePreview({ classification, heuristic, evaluation, recipient: target })
    update({
      step: 'preview',
      document: null,
      evaluation,
      preview,
      issue: null,
      progress: 1,
    })
  }

  const runDocument = async (
    file: File,
    heuristic: IdProofHeuristic,
    classification: TaskClassification,
  ) => {
    if (busyRef.current) return
    busyRef.current = true
    const manager = ensureManager()
    const controller = new AbortController()
    manager.registerCleanup(() => controller.abort())
    update({
      step: 'processing',
      progress: 0,
      document: null,
      evaluation: null,
      preview: null,
      issue: null,
      error: null,
    })
    try {
      const document = await processIdDocument({
        file,
        heuristic,
        profileName: latest.current.profileName,
        engine,
        now: latest.current.now?.(),
        signal: controller.signal,
        onProgress: (progress) => {
          if (!manager.isDisposed) update({ progress })
        },
      })
      if (manager.isDisposed) return
      const target = recipient()
      const evaluation = evaluateIdProofPolicy({
        classification,
        heuristic,
        document,
        recipient: target,
        subjectRef: latest.current.subjectRef,
        now: latest.current.now?.(),
      })
      if (evaluation.outcome === 'ASK_USER' || !target) {
        update({
          step: 'issue',
          document,
          evaluation,
          issue: evaluation.userMessage,
          preview: null,
          progress: 1,
        })
        return
      }
      const preview = createSharePreview({ classification, heuristic, evaluation, recipient: target })
      update({
        step: 'preview',
        document,
        evaluation,
        preview,
        issue: null,
        progress: 1,
      })
    } catch (error) {
      if (manager.isDisposed) return
      if (error instanceof IdProofFailure && error.code === 'CANCELLED') return
      update({
        step: 'error',
        error: safeErrorMessage(error),
        document: null,
        evaluation: null,
        preview: null,
        issue: null,
        progress: 0,
      })
    } finally {
      fileRef.current = null
      busyRef.current = false
    }
  }

  const begin = () => {
    if (!latest.current.conversation) return
    startManager()
    fileRef.current = null
    busyRef.current = false
    setState({ ...EMPTY_STATE, open: true, step: 'menu' })
  }

  const chooseFile = (file: File, kind: IdProofFileKind) => {
    ensureManager()
    fileRef.current = { file, kind }
    update({
      open: true,
      step: 'notice',
      fileKind: kind,
      fileName: null,
      error: null,
      issue: null,
      progress: 0,
      document: null,
      evaluation: null,
      preview: null,
    })
  }

  const confirmProcessing = async () => {
    const staged = fileRef.current
    if (!staged) {
      update({ step: 'menu' })
      return
    }
    const current = stateRef.current
    let heuristic = getHeuristic(current.heuristicId)
    let classification = current.classification

    if (!heuristic) {
      const input = classifierInput()
      if (!input) {
        update({ step: 'error', error: { code: 'SHARE_FAILED', message: 'This conversation is unavailable.' } })
        return
      }
      update({ step: 'analyzing', progress: 0, error: null, issue: null })
      classification = classifier.classify(input)
      update({ classification })
      if (!classification.taskId || classification.requiresClarification) {
        update({ step: 'clarify' })
        return
      }
      heuristic = getHeuristic(classification.taskId)
      if (!heuristic) {
        update({ step: 'clarify' })
        return
      }
      update({ heuristicId: heuristic.taskId })
    }

    if (!classification) {
      classification = { ...emptyClassification(), taskId: heuristic.taskId, confidence: 1 }
    }

    if (heuristic.taskId === 're_verification' || heuristic.taskId === 'identity_verification') {
      fileRef.current = null
      evaluateWithoutDocument(heuristic, classification)
      return
    }

    const target = recipient()
    if (
      !target ||
      !recipientAuthorizedForTask(target.code, heuristic.taskId) ||
      heuristic.verificationMethod === 'authoritative'
    ) {
      fileRef.current = null
      evaluateWithoutDocument(heuristic, classification)
      return
    }

    await runDocument(staged.file, heuristic, classification)
  }

  const selectTask = async (taskId: IdProofHeuristic['taskId']) => {
    const heuristic = getHeuristic(taskId)
    if (!heuristic) return
    const current = stateRef.current
    const classification: TaskClassification = {
      ...(current.classification ?? emptyClassification()),
      taskId,
      confidence: 1,
      requiresClarification: false,
      noIdProofRequired: false,
      missingInformation: [],
      matchedTriggers: [],
      rationale: 'Task confirmed by the user in the privacy flow.',
    }
    update({ classification, heuristicId: taskId, issue: null, error: null })

    if (heuristic.taskId === 're_verification' || heuristic.taskId === 'identity_verification') {
      fileRef.current = null
      evaluateWithoutDocument(heuristic, classification)
      return
    }

    const staged = fileRef.current
    if (staged) {
      const target = recipient()
      if (
        !target ||
        !recipientAuthorizedForTask(target.code, heuristic.taskId) ||
        heuristic.verificationMethod === 'authoritative'
      ) {
        fileRef.current = null
        evaluateWithoutDocument(heuristic, classification)
        return
      }
      await runDocument(staged.file, heuristic, classification)
      return
    }
    update({ step: 'menu', issue: 'Choose an ID document to continue.' })
  }

  const changeTask = () => {
    update({
      step: 'clarify',
      heuristicId: null,
      issue: null,
      error: null,
      document: null,
      evaluation: null,
      preview: null,
      progress: 0,
    })
  }

  const retry = () => {
    startManager()
    fileRef.current = null
    busyRef.current = false
    update({
      open: true,
      step: 'menu',
      document: null,
      evaluation: null,
      preview: null,
      error: null,
      issue: null,
      progress: 0,
      fileKind: null,
      fileName: null,
    })
  }

  const approve = async () => {
    const current = stateRef.current
    const preview = current.preview
    if (!preview || preview.outcome === 'ASK_USER' || busyRef.current) return
    busyRef.current = true
    update({ step: 'sharing', error: null, issue: null })
    try {
      await shareApprovedPreview({
        preview,
        send: latest.current.send,
      })
      if (!managerRef.current?.isDisposed) {
        update({
          step: 'done',
          sharedReference: preview.reference,
          document: null,
          evaluation: null,
          preview: null,
          progress: 0,
        })
      }
      disposeManager()
      fileRef.current = null
    } catch (error) {
      const info = safeErrorMessage(error)
      update({
        step: 'error',
        error: info,
        document: null,
        evaluation: null,
        preview: null,
        issue: null,
        progress: 0,
      })
      disposeManager()
      fileRef.current = null
    } finally {
      busyRef.current = false
    }
  }

  const cancel = () => {
    disposeManager()
    fileRef.current = null
    busyRef.current = false
    setState(EMPTY_STATE)
  }

  const close = cancel

  const conversationId = options.conversation?.id ?? null
  const previousConversation = useRef(conversationId)
  const cancelRef = useRef(cancel)
  cancelRef.current = cancel
  useEffect(() => {
    if (previousConversation.current === conversationId) return
    previousConversation.current = conversationId
    cancelRef.current()
  }, [conversationId])

  useEffect(() => {
    return () => {
      managerRef.current?.dispose()
      managerRef.current = null
    }
  }, [])

  const heuristic = useMemo(() => getHeuristic(state.heuristicId), [state.heuristicId])

  return {
    state,
    heuristic,
    begin,
    chooseFile,
    confirmProcessing,
    selectTask,
    changeTask,
    retry,
    approve,
    cancel,
    close,
  }
}
