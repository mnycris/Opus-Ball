export function Emblem({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="emb-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5CFFB6" />
          <stop offset="1" stopColor="#10B868" />
        </linearGradient>
      </defs>
      <path d="M32 3 57 12v19c0 15-10.5 25-25 30C17.5 56 7 46 7 31V12Z" fill="#07130D" stroke="url(#emb-g)" strokeWidth="3" />
      <circle cx="32" cy="31" r="13" fill="none" stroke="url(#emb-g)" strokeWidth="3" />
      <path d="m32 22.5 6 4.4-2.3 7h-7.4l-2.3-7Z" fill="url(#emb-g)" />
      <path d="M32 18v4.5M44.5 27l-6.5-.1M40 42l-4.3-8.1M24 42l4.3-8.1M19.5 27l6.5-.1" stroke="url(#emb-g)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

export function Wordmark({ size = 1 }: { size?: number }) {
  return (
    <div className="row" style={{ gap: 12 * size }}>
      <Emblem size={58 * size} />
      <div>
        <div className="wordmark" style={{ fontSize: 46 * size }}>TOUCH<span>LINE</span></div>
      </div>
    </div>
  )
}
