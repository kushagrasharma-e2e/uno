import { describe, it, expect } from 'vitest'
import { newGame, legalActions, reduce, nextRand, type Action } from '../src/engine/engine'
import { botAction } from '../src/bot'

const same = (a: Action, b: Action) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort())

describe('bot', () => {
  it('only plays legal actions and finishes whole games against itself', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const n = 2 + (seed % 9)
      let s = newGame(Array.from({ length: n }, (_, i) => `P${i}`), seed, Array(n).fill(true))
      let a = seed
      const rand = () => { const [v, next] = nextRand(a); a = next; return v }
      for (let steps = 0; s.phase !== 'over'; steps++) {
        if (steps > 30000) throw new Error(`game ${seed} did not end`)
        const choice = botAction(s, rand)
        expect(legalActions(s).some(l => same(l, choice))).toBe(true)
        s = reduce(s, choice)
      }
    }
  })
})
