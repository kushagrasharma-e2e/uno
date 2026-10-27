import { describe, it, expect } from 'vitest'
import { newGame, legalActions, reduce, topFace, nextRand, type State } from '../src/engine/engine'
import { allCards } from './helpers'

const stackKind = (k: string) => (k === 'draw1' ? 'draw1' : k === 'draw5' ? 'draw5' : k === 'wildDraw2' ? 'draw2' : null)

function check(prev: State, s: State) {
  const ids = allCards(s).map(c => c.id)
  expect(ids).toHaveLength(224)
  expect(new Set(ids).size).toBe(224) // cards are conserved through every draw, discard, flip and reshuffle
  expect(s.finishOrder.length - prev.finishOrder.length).toBeLessThanOrEqual(1) // nobody finishes simultaneously
  s.finishOrder.forEach((id, i) => {
    const p = s.players.find(q => q.id === id)!
    expect(p.place).toBe(i + 1)
    expect(p.hand).toHaveLength(0)
  })
  expect(Math.abs(s.direction)).toBe(1)
  if (s.phase === 'play' || s.phase === 'afterDraw') expect(s.players[s.current].place).toBeNull()
  if (s.chain && s.phase !== 'over' && s.phase !== 'chooseColor') {
    expect(s.chain.amount).toBeGreaterThan(0)
    expect(stackKind(topFace(s).kind)).toBe(s.chain.kind)
  }
  const acts = legalActions(s)
  if (acts.some(a => a.type === 'draw')) expect(acts.every(a => a.type === 'draw')).toBe(true) // no draw when a play exists
}

describe('random games', () => {
  it('every game ends, keeps every invariant, and only ever uses legal actions', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const n = 2 + (seed % 9) // 2 to 10 players
      let s = newGame(Array.from({ length: n }, (_, i) => `P${i}`), seed, Array(n).fill(true))
      let a = seed * 7919
      const rand = () => { const [v, next] = nextRand(a); a = next; return v }
      check(s, s)
      let steps = 0
      while (s.phase !== 'over') {
        const acts = legalActions(s)
        expect(acts.length).toBeGreaterThan(0)
        const prev = s
        s = reduce(s, acts[Math.floor(rand() * acts.length)])
        check(prev, s)
        if (++steps > 30000) throw new Error(`game ${seed} did not end`)
      }
      expect(s.result!.ranking.map(r => r.player).sort((x, y) => x - y)).toEqual(Array.from({ length: n }, (_, i) => i))
      expect(Math.min(...s.result!.ranking.map(r => r.rank))).toBe(1)
    }
  })
})
