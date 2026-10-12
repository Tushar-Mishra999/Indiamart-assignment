import { useEffect, useState } from 'react'
import { getAnalytics } from '../api'
import type { AnalyticsResponse } from '../types'
import './AnalyticsView.css'

const CATEGORY_LABELS: Record<string, string> = {
  SEXUAL_OBSCENE: 'Sexual / obscene',
  VIOLENCE_WEAPONS: 'Violence / weapons',
  GRAPHIC_CONTENT_ANIMAL_CRUELTY: 'Graphic / animal cruelty',
  DRUGS_ALCOHOL_TOBACCO_GAMBLING: 'Drugs / alcohol / tobacco / gambling',
  HATE_SYMBOLS: 'Hate symbols',
  OFF_PLATFORM_REDIRECTION: 'Off-platform redirection',
  NONE: 'None flagged',
}

export function AnalyticsView({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getAnalytics()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load analytics.'))
  }, [refreshKey])

  if (error) return <div className="error-banner">{error}</div>
  if (!data) return <p className="muted small">Loading analytics…</p>

  const maxDecision = Math.max(1, ...Object.values(data.decisions))
  const maxCategory = Math.max(1, ...Object.values(data.categories))

  return (
    <div className="analytics-view">
      <div className="stat-grid">
        <StatTile label="Total cases" value={data.total_cases} />
        <StatTile label="Escalated to human review" value={data.escalations_to_human_review} />
        <StatTile label="Pending human review" value={data.pending_human_review} />
        <StatTile label="Appeal messages" value={data.appeals_total} />
        <StatTile label="Appeals → reversal" value={data.appeals_leading_to_reversal} />
        <StatTile label="Reversal rate" value={`${Math.round(data.reversal_rate * 100)}%`} />
      </div>

      <div className="card">
        <h4>Decisions</h4>
        <BarChart entries={data.decisions} max={maxDecision} labels={{ ALLOW: 'Allow', REJECT: 'Reject', HUMAN_REVIEW: 'Human review' }} />
      </div>

      <div className="card">
        <h4>Flagged categories</h4>
        <BarChart entries={data.categories} max={maxCategory} labels={CATEGORY_LABELS} />
      </div>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-tile">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

function BarChart({
  entries,
  max,
  labels,
}: {
  entries: Record<string, number>
  max: number
  labels: Record<string, string>
}) {
  const keys = Object.keys(entries)
  if (keys.length === 0) return <p className="muted small">No data yet.</p>
  return (
    <div className="bar-chart">
      {keys.map((key) => (
        <div className="bar-row" key={key}>
          <span className="bar-label">{labels[key] ?? key}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(entries[key] / max) * 100}%` }} />
          </div>
          <span className="bar-value">{entries[key]}</span>
        </div>
      ))}
    </div>
  )
}
