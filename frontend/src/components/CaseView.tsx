import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { appealCase, resolveHumanReview } from '../api'
import type { CaseDetail, Decision } from '../types'
import { ConfidenceBadge, DecisionBadge } from './DecisionBadge'
import { Spinner, TypingDots } from './Loading'
import './CaseView.css'

const CATEGORY_LABELS: Record<string, string> = {
  SEXUAL_OBSCENE: 'Sexual or obscene content',
  VIOLENCE_WEAPONS: 'Violence and weapons',
  GRAPHIC_CONTENT_ANIMAL_CRUELTY: 'Graphic content / animal cruelty',
  DRUGS_ALCOHOL_TOBACCO_GAMBLING: 'Drugs, alcohol, tobacco or gambling',
  HATE_SYMBOLS: 'Hate symbols',
  OFF_PLATFORM_REDIRECTION: 'Off-platform redirection',
  NONE: 'No category flagged',
}

export function CaseView({
  caseDetail,
  onUpdated,
  allowHumanReviewAction = false,
}: {
  caseDetail: CaseDetail
  onUpdated: (updated: CaseDetail) => void
  allowHumanReviewAction?: boolean
}) {
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reviewerName, setReviewerName] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewDecision, setReviewDecision] = useState<Decision>('ALLOW')
  const [resolving, setResolving] = useState(false)
  const chatLogRef = useRef<HTMLDivElement>(null)

  const isClosed = caseDetail.human_review_status === 'resolved'
  const showChat = caseDetail.decision !== 'ALLOW' || caseDetail.appeal_messages.length > 0

  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight
    }
  }, [caseDetail.appeal_messages.length, sending])

  async function handleAppealSubmit(e: FormEvent, requestHumanReview = false) {
    e.preventDefault()
    if (!chatInput.trim() && !requestHumanReview) return
    setSending(true)
    setError(null)
    try {
      const message = chatInput.trim() || 'I would like a human reviewer to look at this case.'
      const response = await appealCase(caseDetail.case_id, message, requestHumanReview)
      onUpdated(response.case)
      setChatInput('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your message.')
    } finally {
      setSending(false)
    }
  }

  function handleChatKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAppealSubmit(e as unknown as FormEvent)
    }
  }

  async function handleResolve(e: FormEvent) {
    e.preventDefault()
    setResolving(true)
    setError(null)
    try {
      const updated = await resolveHumanReview(caseDetail.case_id, reviewDecision, reviewNotes, reviewerName)
      onUpdated(updated)
      setReviewNotes('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the human review decision.')
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="case-view">
      <div className="card result-card">
        <div className="result-header">
          <img src={caseDetail.image_url} alt={caseDetail.image_name} className="result-image" />
          <div className="result-summary">
            <h3>{caseDetail.image_name}</h3>
            <div className="badge-row">
              <DecisionBadge decision={caseDetail.decision} />
              <ConfidenceBadge confidence={caseDetail.confidence} />
            </div>
            <p className="category-label">{CATEGORY_LABELS[caseDetail.category] ?? caseDetail.category}</p>
            {caseDetail.human_review_status && (
              <p className={`review-status review-status-${caseDetail.human_review_status}`}>
                Human review: {caseDetail.human_review_status}
                {caseDetail.human_reviewer_decision ? ` — final decision ${caseDetail.human_reviewer_decision}` : ''}
              </p>
            )}
          </div>
        </div>

        <div className="result-detail">
          <p>
            <strong>Explanation:</strong> {caseDetail.explanation}
          </p>
          {caseDetail.evidence.length > 0 && (
            <div>
              <strong>Observed evidence:</strong>
              <ul>
                {caseDetail.evidence.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <p>
            <strong>Uncertainty:</strong> {caseDetail.uncertainty}
          </p>
          <p className="muted small">Case ID: {caseDetail.case_id}</p>
        </div>
      </div>

      {caseDetail.history.length > 1 && (
        <div className="card">
          <h4>Decision history</h4>
          <ul className="history-list">
            {caseDetail.history.map((h, i) => (
              <li key={i}>
                <DecisionBadge decision={h.decision} /> <span className="history-source">({h.source})</span>
                <p>{h.explanation}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showChat && (
        <div className="card chat-card">
          <h4>Appeal this decision</h4>
          <p className="muted">
            Explain the context Claude may have missed. It will re-examine the image and your explanation — it
            won't automatically agree, and it won't just defend the original call.
          </p>
          <div className="chat-log" ref={chatLogRef}>
            {caseDetail.appeal_messages.length === 0 && (
              <p className="muted small">No messages yet. Start the conversation below.</p>
            )}
            {caseDetail.appeal_messages.map((m, i) => (
              <div key={i} className={`chat-row chat-row-${m.role}`}>
                <span className={`chat-avatar chat-avatar-${m.role}`}>{m.role === 'user' ? 'You' : 'AI'}</span>
                <div className={`chat-message chat-${m.role}`}>
                  <p>{m.content}</p>
                  <span className="chat-time">
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
            {sending && (
              <div className="chat-row chat-row-assistant">
                <span className="chat-avatar chat-avatar-assistant">AI</span>
                <div className="chat-message chat-assistant chat-typing">
                  <TypingDots />
                </div>
              </div>
            )}
          </div>

          {isClosed ? (
            <p className="muted small">This case was resolved by a human reviewer and is closed to further appeals.</p>
          ) : (
            <form onSubmit={(e) => handleAppealSubmit(e)} className="chat-form">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Explain why you believe this image complies with policy… (Enter to send, Shift+Enter for a new line)"
                rows={3}
                disabled={sending}
              />
              <div className="chat-actions">
                <button type="submit" className="btn btn-primary" disabled={sending}>
                  {sending && <Spinner />}
                  {sending ? 'Claude is reassessing…' : 'Send'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={sending}
                  onClick={(e) => handleAppealSubmit(e, true)}
                >
                  Request human reviewer
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {allowHumanReviewAction && caseDetail.human_review_status === 'pending' && (
        <div className="card">
          <h4>Human reviewer decision</h4>
          <form onSubmit={handleResolve} className="review-form">
            <label>
              Reviewer name
              <input value={reviewerName} onChange={(e) => setReviewerName(e.target.value)} required />
            </label>
            <label>
              Final decision
              <select value={reviewDecision} onChange={(e) => setReviewDecision(e.target.value as Decision)}>
                <option value="ALLOW">Allow</option>
                <option value="REJECT">Reject</option>
              </select>
            </label>
            <label>
              Notes
              <textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={3} required />
            </label>
            <button type="submit" className="btn btn-primary" disabled={resolving}>
              {resolving && <Spinner />}
              {resolving ? 'Submitting…' : 'Finalize decision'}
            </button>
          </form>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
    </div>
  )
}
