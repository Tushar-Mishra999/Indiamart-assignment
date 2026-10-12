import type {
  AnalyticsResponse,
  AppealResponse,
  CaseDetail,
  CaseSummary,
  Decision,
  UploadPurpose,
} from './types'

// In dev, Vite proxies /api to the backend (see vite.config.ts), so an empty base works.
// In production the frontend and backend are separate deployments, so this must point at
// the backend's own URL (set VITE_API_BASE_URL at build time).
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export function resolveApiUrl(path: string): string {
  return `${API_BASE_URL}${path}`
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(body.detail || `Request failed with status ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function moderateImage(params: {
  file: File
  name: string
  description: string
  intendedUse: string
  uploadPurpose: UploadPurpose
}): Promise<CaseDetail> {
  const form = new FormData()
  form.append('image', params.file)
  if (params.name) form.append('name', params.name)
  if (params.description) form.append('description', params.description)
  if (params.intendedUse) form.append('intended_use', params.intendedUse)
  form.append('upload_purpose', params.uploadPurpose)

  const res = await fetch(resolveApiUrl('/api/moderate'), { method: 'POST', body: form })
  return handle<CaseDetail>(res)
}

export async function listCases(query: {
  q?: string
  decision?: string
  human_review_status?: string
}): Promise<CaseSummary[]> {
  const search = new URLSearchParams()
  if (query.q) search.set('q', query.q)
  if (query.decision) search.set('decision', query.decision)
  if (query.human_review_status) search.set('human_review_status', query.human_review_status)
  const res = await fetch(resolveApiUrl(`/api/cases?${search.toString()}`))
  return handle<CaseSummary[]>(res)
}

export async function getCase(caseId: string): Promise<CaseDetail> {
  const res = await fetch(resolveApiUrl(`/api/cases/${caseId}`))
  return handle<CaseDetail>(res)
}

export async function appealCase(
  caseId: string,
  message: string,
  requestHumanReview: boolean,
): Promise<AppealResponse> {
  const res = await fetch(resolveApiUrl(`/api/cases/${caseId}/appeal`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, request_human_review: requestHumanReview }),
  })
  return handle<AppealResponse>(res)
}

export async function resolveHumanReview(
  caseId: string,
  decision: Decision,
  notes: string,
  reviewerName: string,
): Promise<CaseDetail> {
  const res = await fetch(resolveApiUrl(`/api/cases/${caseId}/human-review`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, notes, reviewer_name: reviewerName }),
  })
  return handle<CaseDetail>(res)
}

export async function getAnalytics(): Promise<AnalyticsResponse> {
  const res = await fetch(resolveApiUrl('/api/analytics'))
  return handle<AnalyticsResponse>(res)
}
