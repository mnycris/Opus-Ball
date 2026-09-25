import { useState } from 'react'
import { ART, type ArtKey } from '../art'
import { isFailed, markFailed } from '../../services/assets'

/** Full-bleed art layer for heroes. Renders nothing if the image can't load (the CSS gradient stays). */
export function Backdrop({ art, opacity = 0.55, position = 'center', fade = 'bottom' }: { art: ArtKey; opacity?: number; position?: string; fade?: 'bottom' | 'left' | 'full' }) {
  const a = ART[art]
  const [src, setSrc] = useState(isFailed(a.src) ? (isFailed(a.min) ? '' : a.min) : a.src)
  const [loaded, setLoaded] = useState(false)
  if (!src) return null
  return (
    <div className={`backdrop fade-${fade}`} aria-hidden>
      <img src={src} alt="" decoding="async" style={{ objectPosition: position, opacity: loaded ? opacity : 0 }}
        onLoad={() => setLoaded(true)}
        onError={() => { markFailed(src); setSrc(src === a.src && !isFailed(a.min) ? a.min : '') }} />
    </div>
  )
}
