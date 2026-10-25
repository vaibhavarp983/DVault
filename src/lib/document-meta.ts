import type { ImportState, Sensitivity } from '@/domain/types'
import type { BadgeTone } from '@/components/ui/badge'

export const sensitivityTone: Record<Sensitivity, BadgeTone> = {
  public: 'info',
  internal: 'neutral',
  confidential: 'warning',
  restricted: 'danger',
}

export const importTone: Record<ImportState, BadgeTone> = {
  indexed: 'success',
  importing: 'info',
  queued: 'neutral',
  failed: 'danger',
  missing: 'warning',
}

export const importLabels: Record<ImportState, string> = {
  indexed: 'Indexed',
  importing: 'Importing',
  queued: 'Queued',
  failed: 'Failed',
  missing: 'Missing',
}

export const reviewTone: Record<'auto' | 'needs-review' | 'reviewed', BadgeTone> = {
  auto: 'info',
  'needs-review': 'warning',
  reviewed: 'success',
}

export const reviewLabels: Record<'auto' | 'needs-review' | 'reviewed', string> = {
  auto: 'Auto-classified',
  'needs-review': 'Needs review',
  reviewed: 'Reviewed',
}

export const fieldCategoryTone: Record<string, BadgeTone> = {
  identity: 'gold',
  contact: 'info',
  financial: 'success',
  health: 'danger',
  consent: 'warning',
  operational: 'neutral',
}
