import { useEffect, useState } from 'react'
import { listCases } from '../api'
import type { CaseSummary } from '../types'
import { DecisionBadge } from './DecisionBadge'
import './CaseList.css'

export function CaseList({
  title,
  description,
  fixedHumanReviewStatus,
  onSelect,
  refreshKey,
}: {
  title: string
  description: string
  fixedHumanReviewStatus?: string
  onSelect: (caseId: string) => void
  refreshKey: number
}) {
  const [cases, setCases] = useState<CaseSummary[]>([])
  const [query, setQuery] = useState('')
  const [decisionFilter, setDecisionFilter] = useState('')
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const results = await listCases({
        q: query || undefined,
        decision: decisionFilter || undefined,
        human_review_status: fixedHumanReviewStatus,
      })
      setCases(results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load cases.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  return (
    <div className="card case-list">
      <h2>{title}</h2>
      <p className="muted">{description}</p>

      <div className="case-list-controls">
        <input
          placeholder="Search by name, description, or case id…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
        {!fixedHumanReviewStatus && (
          <select value={decisionFilter} onChange={(e) => setDecisionFilter(e.target.value)}>
            <option value="">All decisions</option>
            <option value="ALLOW">Allow</option>
            <option value="REJECT">Reject</option>
            <option value="HUMAN_REVIEW">Human review</option>
          </select>
        )}
        <button type="button" className="btn btn-secondary" onClick={load}>
          Search
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading && <p className="muted small">Loading…</p>}

      {!loading && cases.length === 0 && <p className="muted small">No cases found.</p>}

      <ul className="case-rows">
        {cases.map((c) => (
          <li key={c.case_id} className="case-row" onClick={() => onSelect(c.case_id)}>
            <div>
              <strong>{c.image_name}</strong>
              <p className="muted small">{new Date(c.created_at).toLocaleString()} · {c.appeal_count} appeal message(s)</p>
            </div>
            <DecisionBadge decision={c.decision} />
          </li>
        ))}
      </ul>
    </div>
  )
}
