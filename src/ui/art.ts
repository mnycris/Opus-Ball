// Opus Ball art direction: cinematic night-time football photography, emerald floodlight haze,
// deep blacks, no text or marks. Generated with Higgsfield for this product and served from its CDN;
// the service worker caches them for offline play, and every use sits on a designed CSS fallback.
const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_37eyvcAE3mZcduNqnk0ufh6R69w/'
const img = (stamp: string, id: string) => ({ src: `${CDN}hf_${stamp}_${id}.png`, min: `${CDN}hf_${stamp}_${id}_min.webp` })

export const ART = {
  menu: img('20260925_214744', '905e0b73-ed40-4580-8102-3b33f35864cc'),
  press: img('20260925_214744', '7fdc23f0-d895-42fa-8a19-840691f7db87'),
  academy: img('20260925_214744', '6bcd12d7-580c-44dd-9499-036443106804'),
  scouting: img('20260925_214744', '679b609d-6946-473d-850a-d8961511f2e8'),
  boardroom: img('20260925_214744', 'd7324815-48b4-44b4-9f83-f543226c38b8'),
  trophy: img('20260925_214744', 'de3bd5a1-de25-4dac-bc40-458cc03685df'),
  tunnel: img('20260925_214803', 'd8b3ec78-598c-4a65-8dd7-b8b021bd0e85'),
  office: img('20260925_214744', 'c7563d2d-7d16-4f44-8906-608c7b457ded'),
} as const
export type ArtKey = keyof typeof ART
