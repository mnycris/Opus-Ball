import { Component, type ReactNode } from 'react'

/** Last line of defence: show what went wrong and a way out instead of a blank screen. Saves are never touched. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error('Touchline crashed:', error) }
  private async repair() {
    // drop cached app files (not saves) and reload the latest version
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.()
      await Promise.all((regs || []).map((r) => r.unregister()))
      const keys = await caches?.keys?.()
      await Promise.all((keys || []).filter((k) => !/wiki|football-images/.test(k)).map((k) => caches.delete(k)))
    } catch { /* unsupported */ }
    location.reload()
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ minHeight: '100vh', background: '#0b0d11', color: '#f4f6f8', padding: '48px 24px', fontFamily: 'system-ui, sans-serif' }}>
        <h2 style={{ margin: 0, fontSize: 22 }}>Something went wrong</h2>
        <p style={{ color: '#a3a9b3', lineHeight: 1.5 }}>Touchline hit an unexpected error. Your saved careers are safe.</p>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#ff8a8a', background: '#16191f', padding: 12, borderRadius: 10, maxHeight: 200, overflow: 'auto' }}>{String(this.state.error?.message || this.state.error)}</pre>
        <button onClick={() => location.reload()} style={{ marginTop: 12, width: '100%', height: 48, borderRadius: 12, border: 0, background: '#1fd67a', color: '#04170c', fontWeight: 800, fontSize: 16 }}>Reload</button>
        <button onClick={() => this.repair()} style={{ marginTop: 10, width: '100%', height: 48, borderRadius: 12, border: 0, background: '#22272f', color: '#f4f6f8', fontWeight: 700, fontSize: 15 }}>Repair (clear cached app files)</button>
      </div>
    )
  }
}
