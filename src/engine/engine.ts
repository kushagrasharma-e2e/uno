// Rules engine for the two-sided card game. Pure from the outside:
// reduce(state, action) returns a new state. All rules live in docs: "Flip Card Game: Rules, Decisions and Plan".

export type Side = 'light' | 'dark'
export type Color = 'blue' | 'green' | 'red' | 'yellow' | 'pink' | 'teal' | 'orange' | 'purple'
export type Kind =
  | 'number' | 'draw1' | 'draw5' | 'reverse' | 'skip' | 'skipAll' | 'flip'
  | 'wild' | 'wildDraw2' | 'wildDrawColor'
export type ChainKind = 'draw1' | 'draw2' | 'draw5'

export interface Face { color: Color | null; kind: Kind; value?: number }
export interface Card { id: string; deck: 0 | 1; light: Face; dark: Face }
export interface Player { id: string; bot: boolean; hand: Card[]; place: number | null; unoCalled: boolean }
export interface Rank { player: number; id: string; rank: number; finished: boolean; cards: number }

export interface State {
  players: Player[]
  drawPile: Card[] // top = last element
  discard: Card[] // top = last element
  side: Side // one global side decides which face every card shows
  direction: 1 | -1
  current: number
  activeColor: Color
  chain: { kind: ChainKind; amount: number } | null
  phase: 'play' | 'afterDraw' | 'chooseColor' | 'over'
  drawnCardId: string | null
  reveal: { player: number; kind: Kind; start: boolean } | null
  unoWindow: number | null
  stuck: number // consecutive turns where a player had to draw and nothing could be drawn
  finishOrder: string[]
  endVotes: string[]
  result: { reason: 'last' | 'vote' | 'stalemate'; ranking: Rank[] } | null
  rng: number
}

export type Action =
  | { type: 'play'; player: number; cardId: string; color?: Color }
  | { type: 'draw'; player: number }
  | { type: 'takePenalty'; player: number }
  | { type: 'chooseColor'; player: number; color: Color }
  | { type: 'callUno'; player: number }
  | { type: 'catchUno'; player: number }
  | { type: 'voteEndGame'; player: number }

export const COLORS: Record<Side, Color[]> = {
  light: ['blue', 'green', 'red', 'yellow'],
  dark: ['pink', 'teal', 'orange', 'purple'],
}
const AMOUNT: Record<ChainKind, number> = { draw1: 1, draw2: 2, draw5: 5 }

// ---- randomness (mulberry32, state lives in State.rng so games replay from a seed)

export function nextRand(a: number): [number, number] {
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), a | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a]
}
function rnd(s: State): number {
  const [v, a] = nextRand(s.rng)
  s.rng = a
  return v
}
function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---- deck and pairing

export function faces(side: Side): Face[] {
  const draw: Kind = side === 'light' ? 'draw1' : 'draw5'
  const skip: Kind = side === 'light' ? 'skip' : 'skipAll'
  const wildDraw: Kind = side === 'light' ? 'wildDraw2' : 'wildDrawColor'
  const out: Face[] = []
  for (const color of COLORS[side]) {
    for (let value = 1; value <= 9; value++) out.push({ color, kind: 'number', value }, { color, kind: 'number', value })
    for (const kind of [draw, 'reverse', skip, 'flip'] as Kind[]) out.push({ color, kind }, { color, kind })
  }
  for (let i = 0; i < 4; i++) out.push({ color: null, kind: 'wild' }, { color: null, kind: wildDraw })
  return out // 112 faces
}

// Two decks, Dark faces shuffled onto Light faces; no card has a Flip on both sides.
export function makeCards(rand: () => number): Card[] {
  const light = [...faces('light'), ...faces('light')]
  const dark = shuffle([...faces('dark'), ...faces('dark')], rand)
  for (let i = 0; i < light.length; i++) {
    if (light[i].kind !== 'flip' || dark[i].kind !== 'flip') continue
    let j: number
    do j = Math.floor(rand() * light.length)
    while (light[j].kind === 'flip' || dark[j].kind === 'flip')
    ;[dark[i], dark[j]] = [dark[j], dark[i]]
  }
  return light.map((l, i) => ({ id: `c${i}`, deck: i < 112 ? 0 : 1, light: l, dark: dark[i] }))
}

// ---- helpers

const isWild = (f: Face) => f.kind === 'wild' || f.kind === 'wildDraw2' || f.kind === 'wildDrawColor'
const chainKindOf = (f: Face): ChainKind | null =>
  f.kind === 'draw1' ? 'draw1' : f.kind === 'draw5' ? 'draw5' : f.kind === 'wildDraw2' ? 'draw2' : null
const topCard = (s: State) => s.discard[s.discard.length - 1]
export const topFace = (s: State) => topCard(s)[s.side]
export const activeCount = (s: State) => s.players.filter(p => p.place === null).length

export function cardValue(f: Face): number {
  switch (f.kind) {
    case 'number': return f.value!
    case 'draw1': return 10
    case 'draw5': case 'reverse': case 'skip': case 'flip': return 20
    case 'skipAll': return 30
    case 'wild': return 40
    case 'wildDraw2': return 50
    case 'wildDrawColor': return 60
  }
}

const clone = (s: State): State => ({
  ...s,
  players: s.players.map(p => ({ ...p, hand: [...p.hand] })),
  drawPile: [...s.drawPile],
  discard: [...s.discard],
  chain: s.chain && { ...s.chain },
  reveal: s.reveal && { ...s.reveal },
  finishOrder: [...s.finishOrder],
  endVotes: [...s.endVotes],
})

// k-th next unfinished player in the current direction, starting after `from` (which may itself be finished).
function step(s: State, from: number, k: number): number {
  const n = s.players.length
  let i = from
  for (; k > 0; k--) {
    for (let t = 0; t < n; t++) {
      i = (i + s.direction + n) % n
      if (s.players[i].place === null) break
    }
  }
  return i
}

// Draw up to n cards (or until stop says a drawn card ends it). Reshuffles the discard pile
// (keeping its top card) when the draw pile runs dry; if the whole deck is exhausted it draws what exists.
function drawN(s: State, pi: number, n: number, stop?: (c: Card) => boolean): number {
  const hand = s.players[pi].hand
  let got = 0
  while (got < n) {
    if (!s.drawPile.length) {
      const top = s.discard.pop()!
      s.drawPile = shuffle(s.discard, () => rnd(s))
      s.discard = [top]
      if (!s.drawPile.length) break
    }
    const c = s.drawPile.pop()!
    hand.push(c)
    got++
    if (stop?.(c)) break
  }
  return got
}

// Wild Draw Color: draw until the named color or any Dark Wild card.
const drawUntil = (s: State, pi: number, color: Color) =>
  drawN(s, pi, Infinity, c => c[s.side].color === color || c[s.side].kind === 'wild' || c[s.side].kind === 'wildDrawColor')

function canPlay(s: State, hand: Card[], card: Card): boolean {
  const f = card[s.side]
  if (s.chain) return chainKindOf(f) === s.chain.kind // chain open: only a card that stacks
  if (f.kind === 'wild') return true
  if (f.kind === 'wildDraw2' || f.kind === 'wildDrawColor') {
    // only with no card of the active color; any Wild-type card in hand counts as a match
    return !hand.some(c => c.id !== card.id && (isWild(c[s.side]) || c[s.side].color === s.activeColor))
  }
  const t = topFace(s)
  return f.color === s.activeColor || (f.kind === t.kind && (f.kind !== 'number' || f.value === t.value))
}

export function legalActions(s: State): Action[] {
  if (s.phase === 'over') return []
  if (s.phase === 'chooseColor') return COLORS[s.side].map(color => ({ type: 'chooseColor', player: s.reveal!.player, color }))
  const player = s.current
  const hand = s.players[player].hand
  const pool = s.phase === 'afterDraw' ? hand.filter(c => c.id === s.drawnCardId) : hand
  const plays = pool.filter(c => canPlay(s, hand, c)).flatMap((c): Action[] =>
    isWild(c[s.side])
      ? COLORS[s.side].map(color => ({ type: 'play', player, cardId: c.id, color }))
      : [{ type: 'play', player, cardId: c.id }])
  if (plays.length) return plays // a playable card (or a stacking card in a chain) must be played
  return [s.chain ? { type: 'takePenalty', player } : { type: 'draw', player }]
}

// ---- game start

export function newGame(names: string[], seed: number, bots: boolean[] = names.map(() => false)): State {
  if (names.length < 2 || names.length > 10) throw new Error('2 to 10 players')
  const s: State = {
    players: names.map((id, i) => ({ id, bot: bots[i], hand: [], place: null, unoCalled: false })),
    drawPile: [], discard: [], side: 'light', direction: 1, current: 0, activeColor: 'red',
    chain: null, phase: 'play', drawnCardId: null, reveal: null, unoWindow: null, stuck: 0,
    finishOrder: [], endVotes: [], result: null, rng: seed | 0,
  }
  const deck = shuffle(makeCards(() => rnd(s)), () => rnd(s))
  for (let r = 0; r < 7; r++) for (const p of s.players) p.hand.push(deck.pop()!)
  s.discard = [deck.pop()!]
  s.drawPile = deck
  startCard(s, Math.floor(rnd(s) * names.length))
  return s
}

const randomColor = (s: State) => COLORS[s.side][Math.floor(rnd(s) * 4)]

// Apply the turned-up starting card (Light side) to the randomly chosen first player. Mutates s.
export function startCard(s: State, first: number): void {
  s.side = 'light'
  s.current = first
  const f = s.discard[0].light
  s.activeColor = f.color ?? 'red'
  switch (f.kind) {
    case 'draw1': s.chain = { kind: 'draw1', amount: 1 }; break
    case 'skip': s.current = step(s, first, 1); break
    case 'reverse': s.direction = -1; break
    case 'wild': s.phase = 'chooseColor'; s.reveal = { player: first, kind: 'wild', start: true }; break
    case 'wildDraw2': s.activeColor = randomColor(s); s.chain = { kind: 'draw2', amount: 2 }; break
    case 'flip': { // game starts on the Dark side; the card's other face is what acts
      s.side = 'dark'
      const d = s.discard[0].dark
      s.activeColor = d.color ?? randomColor(s)
      if (d.kind === 'draw5') s.chain = { kind: 'draw5', amount: 5 }
      else if (d.kind === 'reverse') s.direction = -1
      else if (d.kind === 'wildDrawColor') { drawUntil(s, first, s.activeColor); s.current = step(s, first, 1) }
      break // number, Skip Everyone and Wild: the first player simply plays
    }
  }
}

// ---- turn effects

function flip(s: State, p: number): void {
  s.side = s.side === 'light' ? 'dark' : 'light'
  const f = topFace(s) // the played Flip stays on top and shows its other face
  if (f.kind === 'flip') throw new Error('a card has Flip on both sides')
  if (f.color) s.activeColor = f.color
  if (isWild(f)) { s.phase = 'chooseColor'; s.reveal = { player: p, kind: f.kind, start: false } }
  else effect(s, p, f.kind)
}

// What a card of this kind does after `p` played it (or after its face was revealed by `p`'s Flip).
function effect(s: State, p: number, kind: Kind, color?: Color): void {
  switch (kind) {
    case 'draw1': case 'draw5': case 'wildDraw2': {
      const k: ChainKind = kind === 'wildDraw2' ? 'draw2' : kind
      s.chain = { kind: k, amount: (s.chain?.amount ?? 0) + AMOUNT[k] }
      s.current = step(s, p, 1)
      break
    }
    case 'reverse': s.direction = s.direction === 1 ? -1 : 1; s.current = step(s, p, 1); break
    case 'skip': s.current = step(s, p, 2); break
    case 'skipAll': s.current = s.players[p].place === null ? p : step(s, p, 1); break // finisher's extra turn is void
    case 'wildDrawColor': { const v = step(s, p, 1); drawUntil(s, v, color ?? s.activeColor); s.current = step(s, v, 1); break }
    case 'flip': flip(s, p); break
    default: s.current = step(s, p, 1) // number, wild
  }
}

function end(s: State, reason: 'last' | 'vote' | 'stalemate'): State {
  const done = s.players.filter(p => p.place !== null).length
  const ranking: Rank[] = s.players.flatMap((p, i) => p.place === null ? [] :
    [{ player: i, id: p.id, rank: p.place, finished: true, cards: 0 }])
  const pts = (i: number) => s.players[i].hand.reduce((n, c) => n + cardValue(c[s.side]), 0)
  const left = s.players.map((_, i) => i).filter(i => s.players[i].place === null)
    .sort((a, b) => s.players[a].hand.length - s.players[b].hand.length || pts(a) - pts(b))
  left.forEach((i, k) => {
    const tied = k > 0 && s.players[i].hand.length === s.players[left[k - 1]].hand.length && pts(i) === pts(left[k - 1])
    const rank = tied ? ranking[ranking.length - 1].rank : done + k + 1
    ranking.push({ player: i, id: s.players[i].id, rank, finished: false, cards: s.players[i].hand.length })
  })
  s.phase = 'over'
  s.result = { reason, ranking: ranking.sort((a, b) => a.rank - b.rank || a.player - b.player) }
  return s
}

// ---- reducer

const key = (a: Action) => [a.type, a.player, (a as { cardId?: string }).cardId, (a as { color?: string }).color].join('|')
const illegal = (a: Action) => new Error(`illegal action: ${key(a)}`)

export function reduce(prev: State, a: Action): State {
  const s = clone(prev)
  const me = s.players[a.player]
  if (s.phase === 'over' || !me) throw illegal(a)

  switch (a.type) {
    case 'callUno': // counts during your own turn, or after you play until the next player begins
      if (me.place !== null || (a.player !== s.current && a.player !== s.unoWindow)) throw illegal(a)
      if (s.unoWindow === a.player) s.unoWindow = null
      else me.unoCalled = true
      return s
    case 'catchUno':
      if (s.unoWindow === null || me.place !== null || a.player === s.unoWindow) throw illegal(a)
      drawN(s, s.unoWindow, 2)
      s.unoWindow = null
      return s
    case 'voteEndGame': { // bots agree automatically; the game ends when every unfinished human has voted
      if (me.bot) throw illegal(a)
      if (!s.endVotes.includes(me.id)) s.endVotes.push(me.id)
      const humans = s.players.filter(p => !p.bot && p.place === null)
      return humans.every(p => s.endVotes.includes(p.id)) ? end(s, 'vote') : s
    }
  }

  // ponytail: validated by scanning legalActions; fine for hands this size, index it if hands ever get huge
  if (!legalActions(prev).some(l => key(l) === key(a))) throw illegal(a)

  if (a.type === 'chooseColor') {
    const r = s.reveal!
    s.activeColor = a.color
    s.phase = 'play'
    s.reveal = null
    if (r.start) s.current = r.player
    else effect(s, r.player, r.kind, a.color)
    return s
  }

  s.unoWindow = null // the next player has begun their turn
  s.phase = 'play'
  s.drawnCardId = null
  s.stuck = 0

  if (a.type === 'takePenalty') {
    drawN(s, a.player, s.chain!.amount)
    s.chain = null
    me.unoCalled = false
    s.current = step(s, a.player, 1)
    return s
  }

  if (a.type === 'draw') {
    const got = drawN(s, a.player, 1)
    s.stuck = got ? 0 : prev.stuck + 1
    me.unoCalled = false
    const c = me.hand[me.hand.length - 1]
    if (got && canPlay(s, me.hand, c)) { s.phase = 'afterDraw'; s.drawnCardId = c.id } // a playable drawn card must be played
    else s.current = step(s, a.player, 1)
    return s.stuck >= activeCount(s) ? end(s, 'stalemate') : s
  }

  const card = me.hand.splice(me.hand.findIndex(c => c.id === a.cardId), 1)[0]
  s.discard.push(card)
  const f = card[s.side]
  s.activeColor = f.color ?? a.color!
  if (!me.hand.length) {
    me.place = s.finishOrder.push(me.id)
    if (activeCount(s) <= 1) return end(s, 'last') // nobody left to penalise or rank
  } else if (me.hand.length === 1 && !me.bot && !me.unoCalled) s.unoWindow = a.player
  me.unoCalled = false
  effect(s, a.player, f.kind, a.color)
  return s
}
