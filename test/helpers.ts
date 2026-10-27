import { reduce, legalActions, type Card, type Color, type Face, type Kind, type Side, type State } from '../src/engine/engine'

let n = 0

// 'red 5' = number card, 'red draw1' = colored action, 'wild' = colorless
export function face(spec: string): Face {
  const [a, b] = spec.split(' ')
  if (!b) return { color: null, kind: a as Kind }
  return /^\d$/.test(b) ? { color: a as Color, kind: 'number', value: +b } : { color: a as Color, kind: b as Kind }
}

export const card = (light: string, dark = 'pink 1'): Card => ({ id: `t${++n}`, deck: 0, light: face(light), dark: face(dark) })
// a card whose Dark face is the interesting one
export const dk = (dark: string, light = 'blue 1'): Card => card(light, dark)
export const fill = (count: number, light = 'blue 1', dark = 'pink 1'): Card[] =>
  Array.from({ length: count }, () => card(light, dark))

export interface Setup {
  hands: Card[][]
  top: Card
  side?: Side
  color?: Color
  draw?: Card[] // last element is the top of the draw pile
  under?: Card[] // discard cards below the top
  current?: number
  direction?: 1 | -1
  chain?: State['chain']
  bots?: boolean[] // default: everyone is a bot (no UNO window)
  finished?: number[] // players already out; their hand must be []
  seed?: number
}

export function mk(o: Setup): State {
  const side = o.side ?? 'light'
  const players = o.hands.map((hand, i) => ({ id: `P${i}`, bot: o.bots ? o.bots[i] : true, hand, place: null as number | null, unoCalled: false }))
  const finishOrder: string[] = []
  for (const i of o.finished ?? []) players[i].place = finishOrder.push(`P${i}`)
  return {
    players,
    drawPile: o.draw ?? fill(40),
    discard: [...(o.under ?? []), o.top],
    side,
    direction: o.direction ?? 1,
    current: o.current ?? 0,
    activeColor: o.color ?? o.top[side].color ?? (side === 'light' ? 'red' : 'pink'),
    chain: o.chain ?? null,
    phase: 'play', drawnCardId: null, reveal: null, unoWindow: null, stuck: 0,
    finishOrder, endVotes: [], result: null, rng: o.seed ?? 1,
  }
}

export const play = (s: State, c: Card, color?: Color) => reduce(s, { type: 'play', player: s.current, cardId: c.id, color })
export const draw = (s: State) => reduce(s, { type: 'draw', player: s.current })
export const take = (s: State) => reduce(s, { type: 'takePenalty', player: s.current })
export const choose = (s: State, color: Color) => reduce(s, { type: 'chooseColor', player: s.reveal!.player, color })

// ids of the cards the current player may play
export const ids = (s: State) => [...new Set(legalActions(s).flatMap(a => (a.type === 'play' ? [a.cardId] : [])))]
export const kinds = (s: State) => [...new Set(legalActions(s).map(a => a.type))]

export const allCards = (s: State) => [...s.players.flatMap(p => p.hand), ...s.drawPile, ...s.discard]
