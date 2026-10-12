import type { Confidence, Decision } from '../types'
import './DecisionBadge.css'

const LABELS: Record<Decision, string> = {
  ALLOW: 'Allowed',
  REJECT: 'Rejected',
  HUMAN_REVIEW: 'Human Review',
}

export function DecisionBadge({ decision }: { decision: Decision }) {
  return <span className={`badge badge-${decision.toLowerCase()}`}>{LABELS[decision]}</span>
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return <span className={`confidence confidence-${confidence}`}>{confidence} confidence</span>
}
