import type { InboxMessage, NewsItem, World } from '../../domain/types'

export function sendInbox(w: World, m: Omit<InboxMessage, 'id' | 'date' | 'read'> & { date?: string }): InboxMessage {
  const msg: InboxMessage = { id: `m${w.nextIds.msg++}`, date: m.date || w.date, read: false, ...m }
  w.inbox.unshift(msg)
  if (w.inbox.length > 400) w.inbox.length = 400
  if (msg.urgent) w.flags.stopForInbox = true
  return msg
}

export function postNews(w: World, n: Omit<NewsItem, 'id' | 'date'> & { date?: string }): NewsItem {
  const item: NewsItem = { id: `n${w.nextIds.news++}`, date: n.date || w.date, ...n }
  w.news.unshift(item)
  if (w.news.length > 500) w.news.length = 500
  return item
}

export function unreadCount(w: World) {
  return w.inbox.filter((m) => !m.read).length
}

export function staffNames(w: World) {
  if (!w.flags.staff) {
    const club = w.clubs[w.userClubId]
    const seed = club.id
    const pick = <T,>(arr: T[], k: number) => arr[(seed * 31 + k * 17) % arr.length]
    const first = ['James', 'Carlos', 'Thomas', 'Luca', 'Martin', 'Pablo', 'Jonas', 'Sam', 'Nico', 'David', 'Oliver', 'Marc']
    const last = ['Hughes', 'Fernández', 'Keller', 'Bianchi', 'Dubois', 'Costa', 'Lund', 'Mitchell', 'Varga', 'Moreno', 'Hart', 'Kowalski']
    w.flags.staff = {
      assistant: `${pick(first, 1)} ${pick(last, 2)}`,
      medical: `Dr. ${pick(first, 3)} ${pick(last, 4)}`,
      chairman: `${pick(first, 5)} ${pick(last, 6)}`,
      director: `${pick(first, 7)} ${pick(last, 8)}`,
      youth: `${pick(first, 9)} ${pick(last, 10)}`,
    }
  }
  return w.flags.staff as Record<'assistant' | 'medical' | 'chairman' | 'director' | 'youth', string>
}
