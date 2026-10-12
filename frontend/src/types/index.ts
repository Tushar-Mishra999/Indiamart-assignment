export type Decision = 'ALLOW' | 'REJECT' | 'HUMAN_REVIEW'

export type Category =
  | 'SEXUAL_OBSCENE'
  | 'VIOLENCE_WEAPONS'
  | 'GRAPHIC_CONTENT_ANIMAL_CRUELTY'
  | 'DRUGS_ALCOHOL_TOBACCO_GAMBLING'
  | 'HATE_SYMBOLS'
  | 'OFF_PLATFORM_REDIRECTION'
  | 'NONE'

export type Confidence = 'high' | 'medium' | 'low'

export type UploadPurpose =
  | 'product_listing'
  | 'supplier_profile'
  | 'buyer_enquiry'
  | 'review'
  | 'chat'
  | 'other'

export interface DecisionHistoryEntry {
  decision: Decision
  category: Category
  explanation: string
  confidence: Confidence
  source: 'initial' | 'appeal' | 'human_review'
  created_at: string
}

export interface AppealMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

export interface CaseSummary {
  case_id: string
  image_name: string
  created_at: string
  decision: Decision
  category: Category
  confidence: Confidence
  appeal_count: number
  human_review_status: string | null
}

export interface CaseDetail extends CaseSummary {
  description: string | null
  intended_use: string | null
  upload_purpose: UploadPurpose | null
  explanation: string
  evidence: string[]
  uncertainty: string
  image_url: string
  history: DecisionHistoryEntry[]
  appeal_messages: AppealMessage[]
  human_review_notes: string | null
  human_reviewer_decision: Decision | null
}

export interface AppealResponse {
  action: 'REPLY' | 'REVISE_DECISION' | 'ESCALATE'
  message: string
  case: CaseDetail
}

export interface AnalyticsResponse {
  total_cases: number
  decisions: Record<string, number>
  categories: Record<string, number>
  appeals_total: number
  appeals_leading_to_reversal: number
  escalations_to_human_review: number
  pending_human_review: number
  reversal_rate: number
}
