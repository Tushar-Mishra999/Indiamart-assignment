import { useState } from 'react'
import { getCase } from './api'
import { AnalyticsView } from './components/AnalyticsView'
import { CaseList } from './components/CaseList'
import { CaseView } from './components/CaseView'
import { UploadPanel } from './components/UploadPanel'
import type { CaseDetail } from './types'
import './App.css'

type Tab = 'upload' | 'review-queue' | 'history' | 'analytics'
const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'upload', label: 'Moderation', glyph: '▦' },
  { id: 'review-queue', label: 'Review queue', glyph: '⛨' },
  { id: 'history', label: 'Case history', glyph: '◷' },
  { id: 'analytics', label: 'Analytics', glyph: '▥' },
]

function App() {
  const [tab, setTab] = useState<Tab>('upload')
  const [activeCase, setActiveCase] = useState<CaseDetail | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)

  function bumpRefresh() { setRefreshKey((key) => key + 1) }
  async function openCase(caseId: string) {
    setLoadError(null)
    try { setActiveCase(await getCase(caseId)) }
    catch (err) { setLoadError(err instanceof Error ? err.message : 'Could not load case.') }
  }
  function handleCaseUpdated(updated: CaseDetail) { setActiveCase(updated); bumpRefresh() }
  function handleNewResult(result: CaseDetail) { setActiveCase(result); bumpRefresh() }

  return (
    <div className="app-shell">
      <aside className="workspace-sidebar" aria-label="Workspace navigation">
        <a className="brand-mark" href="#workspace" onClick={() => { setTab('upload'); setActiveCase(null) }}>
          <span className="brand-icon" aria-hidden="true">◈</span>
          <span className="brand-type"><strong>IndiaMART</strong><span>Trust &amp; safety</span></span>
        </a>
        <div className="workspace-switcher"><span className="workspace-avatar">M</span><span className="workspace-name"><strong>Marketplace</strong><span>Moderation team</span></span></div>
        <p className="nav-section-label">WORKSPACE</p>
        <nav className="side-navigation" aria-label="Workspace">
          {TABS.map((item) => (
            <button key={item.id} type="button" aria-current={tab === item.id && !activeCase ? 'page' : undefined} className={`side-nav-button${tab === item.id && !activeCase ? ' is-current' : ''}`} onClick={() => { setTab(item.id); setActiveCase(null); setLoadError(null) }}>
              <span className="nav-glyph" aria-hidden="true">{item.glyph}</span><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom"><span className="sidebar-health"><span className="live-dot"/>Workspace connected</span><div className="profile-row"><span className="profile-avatar">T</span><span className="profile-details"><strong>Moderation team</strong><span>Image review workspace</span></span></div></div>
      </aside>
      <div className="workspace-main">
        <header className="topbar"><div className="breadcrumb"><span>Workspace</span><span aria-hidden="true">›</span><strong>{activeCase ? 'Case review' : TABS.find((item) => item.id === tab)?.label}</strong></div><div className="preview-label"><span className="live-dot"/>CONNECTED</div></header>
        <main className="workspace-content" id="workspace">
          <div className="connection-banner"><span aria-hidden="true">●</span><span>Live moderation workspace · changes are handled by your connected service.</span></div>
          {loadError && <div className="error-banner" role="alert">{loadError}</div>}
          {tab === 'upload' && <div className="stack"><UploadPanel onResult={handleNewResult}/>{activeCase && <CaseView caseDetail={activeCase} onUpdated={handleCaseUpdated}/>}</div>}
          {tab === 'review-queue' && <div className="stack"><CaseList title="Human review queue" description="Cases that Claude could not confidently resolve on its own, or where an appeal was escalated." fixedHumanReviewStatus="pending" onSelect={openCase} refreshKey={refreshKey}/>{activeCase && <CaseView caseDetail={activeCase} onUpdated={handleCaseUpdated} allowHumanReviewAction/>}</div>}
          {tab === 'history' && <div className="stack"><CaseList title="Case history" description="Search every moderated image by name, description, case id, or decision." onSelect={openCase} refreshKey={refreshKey}/>{activeCase && <CaseView caseDetail={activeCase} onUpdated={handleCaseUpdated} allowHumanReviewAction/>}</div>}
          {tab === 'analytics' && <AnalyticsView refreshKey={refreshKey}/>}
        </main>
      </div>
    </div>
  )
}
export default App
