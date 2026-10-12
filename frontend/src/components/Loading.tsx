export function Spinner({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  return <span className={`spinner ${size === 'lg' ? 'spinner-lg' : ''}`} aria-hidden="true" />
}

export function AnalyzingBanner({ text }: { text: string }) {
  return (
    <div className="analyzing-banner">
      <Spinner />
      <span>{text}</span>
    </div>
  )
}

export function TypingDots() {
  return (
    <span className="typing-dots" aria-label="Moderation AI is thinking">
      <span />
      <span />
      <span />
    </span>
  )
}
