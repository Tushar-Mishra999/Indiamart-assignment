import { useState } from 'react'
import { getCase } from './api'
import { AnalyticsView } from './components/AnalyticsView'
import { CaseList } from './components/CaseList'
import { CaseView } from './components/CaseView'
import { UploadPanel } from './components/UploadPanel'
import type { CaseDetail } from './types'
import './App.css'

type Tab = 'upload' | 'review-queue' | 'history' | 'analytics'

const TABS: { id: Tab; label: string }[] = [
  { id: 'upload', label: 'Upload & Moderate' },
  { id: 'review-queue', label: 'Human Review Queue' },
  { id: 'history', label: 'Case History' },
  { id: 'analytics', label: 'Analytics' },
]

function App() {
  const [tab, setTab] = useState<Tab>('upload')
  const [activeCase, setActiveCase] = useState<CaseDetail | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)

  function bumpRefresh() {
    setRefreshKey((k) => k + 1)
  }

  async function openCase(caseId: string) {
    setLoadError(null)
    try {
      const detail = await getCase(caseId)
      setActiveCase(detail)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load case.')
    }
  }

  function handleCaseUpdated(updated: CaseDetail) {
    setActiveCase(updated)
    bumpRefresh()
  }

  function handleNewResult(result: CaseDetail) {
    setActiveCase(result)
    bumpRefresh()
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>IndiaMART Image Moderation</h1>
          <p className="muted">AI-assisted moderation prototype powered by Claude</p>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab-btn ${tab === t.id ? 'active' : ''}`}
              onClick={() => {
                setTab(t.id)
                setActiveCase(null)
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {loadError && <div className="error-banner">{loadError}</div>}

        {tab === 'upload' && (
          <div className="stack">
            <UploadPanel onResult={handleNewResult} />
            {activeCase && <CaseView caseDetail={activeCase} onUpdated={handleCaseUpdated} />}
          </div>
        )}

        {tab === 'review-queue' && (
          <div className="stack">
            <CaseList
              title="Human review queue"
              description="Cases that Claude could not confidently resolve on its own, or where an appeal was escalated."
              fixedHumanReviewStatus="pending"
              onSelect={openCase}
              refreshKey={refreshKey}
            />
            {activeCase && <CaseView caseDetail={activeCase} onUpdated={handleCaseUpdated} allowHumanReviewAction />}
          </div>
        )}

        {tab === 'history' && (
          <div className="stack">
            <CaseList
              title="Case history"
              description="Search every moderated image by name, description, case id, or decision."
              onSelect={openCase}
              refreshKey={refreshKey}
            />
            {activeCase && <CaseView caseDetail={activeCase} onUpdated={handleCaseUpdated} allowHumanReviewAction />}
          </div>
        )}

        {tab === 'analytics' && <AnalyticsView refreshKey={refreshKey} />}
      </main>
    </div>
  )
}

export default App
