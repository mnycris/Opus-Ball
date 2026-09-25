import { useEffect, useState } from 'react'
import { Icon } from '../icons/Icon'
import { managerWikiQuery, wikiPhoto } from '../../services/assets'

const PROBES: { label: string; url?: string; wiki?: boolean }[] = [
  { label: 'EA SPORTS FC headshots', url: 'https://ratings-images-prod.pulse.ea.com/FC25/full/player-portraits/p239085.png?width=64' },
  { label: 'SoFIFA headshots', url: 'https://cdn.sofifa.net/players/239/085/26_120.png' },
  { label: 'Club crests (football-logos.cc)', url: 'https://assets.football-logos.cc/logos/england/512x512/arsenal.02d595b0.png' },
  { label: 'EA PlayStyle icons', url: 'https://drop-assets.ea.com/images/3ohVoKWSsvT44qgjabWqfV/e536ef26ad854c3c4cbf63ed7954b9cd/Power_Shot.png' },
  { label: 'Manager photos (Wikipedia)', wiki: true },
]

function Probe({ p }: { p: (typeof PROBES)[number] }) {
  const [state, setState] = useState<'wait' | 'ok' | 'fail'>('wait')
  useEffect(() => {
    let alive = true
    if (p.wiki) { wikiPhoto(managerWikiQuery('Pep Guardiola')).then((u) => alive && setState(u ? 'ok' : 'fail')); return () => { alive = false } }
    const img = new Image()
    img.referrerPolicy = 'no-referrer'
    img.onload = () => alive && setState('ok')
    img.onerror = () => alive && setState('fail')
    img.src = `${p.url}${p.url!.includes('?') ? '&' : '?'}probe=${Date.now()}`
    return () => { alive = false }
  }, [])
  return (
    <div className="li" style={{ minHeight: 44 }}>
      <div className="meta small">{p.label}</div>
      {state === 'wait' ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <Icon name={state === 'ok' ? 'check' : 'close'} size={18} color={state === 'ok' ? 'var(--pos)' : 'var(--neg)'} />}
    </div>
  )
}

/** Live check of each remote image source on this device/network. */
export function ImageCheck() {
  const [run, setRun] = useState(0)
  return (
    <div className="card">
      <div className="card-h"><span className="label">Image sources</span><button className="link" onClick={() => setRun(run + 1)}>Re-test</button></div>
      <div className="list" key={run}>{PROBES.map((p) => <Probe key={p.label} p={p} />)}</div>
    </div>
  )
}
