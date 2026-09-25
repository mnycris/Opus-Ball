export interface RawLeague {
  id: number; name: string; short: string; abbr: string; country: string; flag: string; level: number; teams: number
  promo?: number; playoff?: [number, number]; rele?: number; releplayoff?: number; promoplayoff?: number; uefa?: string[]
  prestige: number; wealth: number; rounds?: number; conferences?: boolean; fixtures?: string; clubs: number[]
}
export interface RawClub {
  id: number; name: string; dbName: string; short: string; abbr: string; leagueId: number; country: string; stadium: string
  capacity: number; city: string; founded: number; kit: [string, string]; theme: string; badge: boolean; sofifaTeamId: number
  rivals: [number, string, number][]; squadAvg: number; squadValue: number; wageBill: number
  manager?: { name: string; nationality: string; age: number; formation: string; vision: string } | null
  colorSource?: string
}
export interface RawDb {
  version: number
  dataset: string
  season: string
  startDate: string
  leagues: RawLeague[]
  clubs: RawClub[]
  nations: { name: string; flag: string; code: string; confed: string }[]
  playerFields: string[]
  players: any[][]
  attrOrder: string[]
  fixtures: Record<string, [string, string, number, number, number][]>
  history: Record<string, { clubId: number; name: string; p: number; w: number; d: number; l: number; gf: number; ga: number; pts: number }[]>
  uefa: Record<string, { pots: number[][]; unlicensed: string[] }>
  holders: Record<string, number>
  namePools: Record<string, [string[], string[]]>
}
