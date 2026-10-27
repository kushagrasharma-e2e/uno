import { describe, it, expect } from 'vitest'
import { COLORS, faces, makeCards, newGame, nextRand, reduce, legalActions, startCard, topFace, type Face, type State } from '../src/engine/engine'
import { card, dk, fill, mk, play, draw, take, choose, ids, kinds, allCards, type Setup } from './helpers'

const rander = (seed: number) => {
  let a = seed
  return () => { const [v, n] = nextRand(a); a = n; return v }
}
const count = (fs: Face[]) => {
  const m = new Map<string, number>()
  for (const f of fs) m.set(JSON.stringify(f), (m.get(JSON.stringify(f)) ?? 0) + 1)
  return m
}
const noCards = (s: State) => allCards(s).length

describe('deck and pairing', () => {
  it('each side has the 112 faces of the standard sheet', () => {
    for (const side of ['light', 'dark'] as const) {
      const fs = faces(side)
      expect(fs).toHaveLength(112)
      expect(fs.filter(f => f.kind === 'flip')).toHaveLength(8)
      expect(fs.filter(f => f.kind === 'wild')).toHaveLength(4)
      expect(fs.filter(f => f.kind === 'number')).toHaveLength(72)
    }
    expect(faces('light').filter(f => f.kind === 'wildDraw2')).toHaveLength(4)
    expect(faces('light').filter(f => f.kind === 'draw1')).toHaveLength(8)
    expect(faces('dark').filter(f => f.kind === 'wildDrawColor')).toHaveLength(4)
    expect(faces('dark').filter(f => f.kind === 'draw5')).toHaveLength(8)
    expect(faces('dark').filter(f => f.kind === 'skipAll')).toHaveLength(8)
  })

  it('pairs two decks one-to-one, keeps every face, and never joins Flip to Flip', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const cards = makeCards(rander(seed))
      expect(cards).toHaveLength(224)
      expect(new Set(cards.map(c => c.id)).size).toBe(224)
      expect(count(cards.map(c => c.light))).toEqual(count([...faces('light'), ...faces('light')]))
      expect(count(cards.map(c => c.dark))).toEqual(count([...faces('dark'), ...faces('dark')]))
      expect(cards.some(c => c.light.kind === 'flip' && c.dark.kind === 'flip')).toBe(false)
    }
  })

  it('is deterministic per seed and differs between seeds', () => {
    expect(makeCards(rander(7))).toEqual(makeCards(rander(7)))
    expect(makeCards(rander(7)).map(c => JSON.stringify(c.dark))).not.toEqual(makeCards(rander(8)).map(c => JSON.stringify(c.dark)))
  })

  it('duplicate faces are still distinct cards', () => {
    const cards = makeCards(rander(3))
    const twins = cards.filter(c => JSON.stringify(c.light) === JSON.stringify(cards[0].light))
    expect(twins.length).toBeGreaterThan(1)
    expect(new Set(twins.map(c => c.id)).size).toBe(twins.length)
  })
})

describe('newGame', () => {
  it('supports 2 to 10 players only', () => {
    for (let n = 2; n <= 10; n++) expect(() => newGame(Array.from({ length: n }, (_, i) => `P${i}`), n)).not.toThrow()
    expect(() => newGame(['a'], 1)).toThrow()
    expect(() => newGame(Array.from({ length: 11 }, (_, i) => `P${i}`), 1)).toThrow()
  })

  it('deals 7 each, keeps all 224 cards, and starts on a Light-side top card', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = newGame(['a', 'b', 'c', 'd'], seed)
      expect(noCards(s)).toBe(224)
      expect(new Set(allCards(s).map(c => c.id)).size).toBe(224)
      for (const p of s.players) expect(p.hand.length).toBeGreaterThanOrEqual(7)
    }
  })

  it('replays from a seed, and the first player is random', () => {
    expect(newGame(['a', 'b', 'c'], 5)).toEqual(newGame(['a', 'b', 'c'], 5))
    const firsts = new Set(Array.from({ length: 40 }, (_, i) => newGame(['a', 'b', 'c', 'd'], i).current))
    expect(firsts.size).toBeGreaterThan(1)
  })
})

describe('a normal turn', () => {
  it('plays by color, number or symbol', () => {
    const byColor = card('red 9'), byNumber = card('blue 5'), none = card('blue 9')
    expect(ids(mk({ hands: [[byColor, byNumber, none], fill(2), fill(2)], top: card('red 5') }))).toEqual([byColor.id, byNumber.id])
    const sym = card('blue skip')
    expect(ids(mk({ hands: [[sym], fill(2), fill(2)], top: card('red skip') }))).toEqual([sym.id])
  })

  it('a Draw card has no number, so +1 never matches a plain 1 and a 1 never matches +1', () => {
    expect(kinds(mk({ hands: [[card('blue 1')], fill(2), fill(2)], top: card('red draw1') }))).toEqual(['draw'])
    expect(kinds(mk({ hands: [[card('blue draw1')], fill(2), fill(2)], top: card('red 1') }))).toEqual(['draw'])
  })

  it('offers Draw only when nothing is playable', () => {
    expect(kinds(mk({ hands: [[card('blue 9')], fill(2), fill(2)], top: card('red 5') }))).toEqual(['draw'])
    expect(kinds(mk({ hands: [[card('blue 9'), card('red 1')], fill(2), fill(2)], top: card('red 5') }))).toEqual(['play'])
    expect(() => draw(mk({ hands: [[card('blue 9'), card('red 1')], fill(2), fill(2)], top: card('red 5') }))).toThrow()
  })

  it('a plain Wild is always playable and names the color', () => {
    const w = card('wild')
    const s0 = mk({ hands: [[w, card('red 1')], fill(2), fill(2)], top: card('red 5') })
    expect(ids(s0)).toContain(w.id)
    const s = play(s0, w, 'green')
    expect(s.activeColor).toBe('green')
    expect(s.current).toBe(1)
  })

  it('a playable drawn card must be played', () => {
    const r3 = card('red 3')
    let s = mk({ hands: [[card('blue 9')], fill(2), fill(2)], top: card('red 5'), draw: [r3] })
    s = draw(s)
    expect(s.phase).toBe('afterDraw')
    expect(s.current).toBe(0)
    expect(ids(s)).toEqual([r3.id])
    expect(kinds(s)).toEqual(['play'])
    s = play(s, r3)
    expect(s.current).toBe(1)
    expect(s.phase).toBe('play')
  })

  it('an unplayable drawn card ends the turn, with no second draw', () => {
    const s = draw(mk({ hands: [[card('green 2')], fill(2), fill(2)], top: card('red 5'), draw: [card('blue 9')] }))
    expect(s.current).toBe(1)
    expect(s.phase).toBe('play')
    expect(() => reduce(s, { type: 'draw', player: 0 })).toThrow()
  })
})

describe('Wild Draw Two and Wild Draw Color need a hand with no matching color', () => {
  const top = () => card('red 5')
  it('Light: a card of the active color blocks it', () => {
    const wd = card('wildDraw2'), r3 = card('red 3')
    expect(ids(mk({ hands: [[wd, r3], fill(2), fill(2)], top: top() }))).toEqual([r3.id])
  })
  it('Light: other colors do not block it', () => {
    const wd = card('wildDraw2')
    expect(ids(mk({ hands: [[wd, card('blue 3')], fill(2), fill(2)], top: top() }))).toEqual([wd.id])
  })
  it('Light: any Wild-type card in hand counts as a match, so two Wild Draw Twos block each other', () => {
    const wd = card('wildDraw2'), w = card('wild')
    expect(ids(mk({ hands: [[wd, w], fill(2), fill(2)], top: top() }))).toEqual([w.id])
    expect(kinds(mk({ hands: [[card('wildDraw2'), card('wildDraw2')], fill(2), fill(2)], top: top() }))).toEqual(['draw'])
  })
  it('Dark: same rule for Wild Draw Color', () => {
    const wdc = dk('wildDrawColor')
    expect(ids(mk({ side: 'dark', hands: [[wdc, dk('orange 7')], fill(2), fill(2)], top: dk('orange 4') }))).not.toContain(wdc.id)
    expect(ids(mk({ side: 'dark', hands: [[wdc, dk('pink 7')], fill(2), fill(2)], top: dk('orange 4') }))).toContain(wdc.id)
  })
})

describe('penalty chains', () => {
  it('+1 chain: stacking is forced, any color, and the last player takes the total and loses the turn', () => {
    const a = card('red draw1'), b = card('blue draw1')
    let s = mk({ hands: [[a, card('green 1')], [b, card('green 2')], [card('green 4'), card('green 3')]], top: card('red 5') })
    s = play(s, a)
    expect(s.chain).toEqual({ kind: 'draw1', amount: 1 })
    expect(s.current).toBe(1)
    expect(ids(s)).toEqual([b.id]) // must stack
    expect(kinds(s)).toEqual(['play'])
    expect(() => take(s)).toThrow() // may not decline while holding a stack card
    s = play(s, b)
    expect(s.chain).toEqual({ kind: 'draw1', amount: 2 })
    expect(s.current).toBe(2)
    expect(legalActions(s)).toEqual([{ type: 'takePenalty', player: 2 }])
    s = take(s)
    expect(s.players[2].hand).toHaveLength(4)
    expect(s.chain).toBeNull()
    expect(s.current).toBe(0) // the taker lost their turn
  })

  it('+1 chains of 3 and 4', () => {
    const cs = [card('red draw1'), card('blue draw1'), card('green draw1'), card('yellow draw1')]
    let s = mk({ hands: [[cs[0], cs[3], card('green 1')], [cs[1], card('green 2')], [cs[2], card('green 3')]], top: card('red 5') })
    s = play(s, cs[0]); s = play(s, cs[1]); s = play(s, cs[2])
    expect(s.chain).toEqual({ kind: 'draw1', amount: 3 })
    s = play(s, cs[3]) // back to P0 who stacks again
    expect(s.chain).toEqual({ kind: 'draw1', amount: 4 })
    expect(s.current).toBe(1)
  })

  it('only the matching stack card is legal in a chain: no Flip, no other card, no mixing', () => {
    const b = card('blue draw1')
    const s = mk({
      hands: [[], [b, card('red flip'), card('red 5'), card('wildDraw2'), card('wild')], fill(2)],
      top: card('red draw1'), chain: { kind: 'draw1', amount: 1 }, current: 1,
    })
    expect(ids(s)).toEqual([b.id])
    expect(legalActions(mk({ hands: [[], [card('wildDraw2')], fill(2)], top: card('red draw1'), chain: { kind: 'draw1', amount: 1 }, current: 1 })))
      .toEqual([{ type: 'takePenalty', player: 1 }])
    expect(legalActions(mk({ hands: [[], [card('blue draw1')], fill(2)], top: card('red wildDraw2'), color: 'red', chain: { kind: 'draw2', amount: 2 }, current: 1 })))
      .toEqual([{ type: 'takePenalty', player: 1 }])
  })

  it('+2 chain: each Wild Draw Two names a color, the hand restriction does not apply, the last color stays', () => {
    const w1 = card('wildDraw2'), w2 = card('wildDraw2')
    let s = mk({ hands: [[w1, card('green 1')], [w2, card('blue 7')], [card('red 1'), card('red 2')]], top: card('red 5') })
    s = play(s, w1, 'blue')
    expect(s.chain).toEqual({ kind: 'draw2', amount: 2 })
    s = play(s, w2, 'green') // P1 holds a blue card but may still stack
    expect(s.chain).toEqual({ kind: 'draw2', amount: 4 })
    expect(s.activeColor).toBe('green')
    s = take(s)
    expect(s.players[2].hand).toHaveLength(6)
  })

  it('+5 chain on the Dark side: 5, 10, 15', () => {
    const a = dk('pink draw5'), b = dk('teal draw5'), c = dk('orange draw5')
    let s = mk({ side: 'dark', hands: [[a, dk('purple 1')], [b, dk('purple 2')], [c, dk('purple 3')]], top: dk('pink 2') })
    s = play(s, a); expect(s.chain!.amount).toBe(5)
    s = play(s, b); expect(s.chain!.amount).toBe(10)
    s = play(s, c); expect(s.chain!.amount).toBe(15)
    expect(s.current).toBe(0)
    expect(legalActions(s)).toEqual([{ type: 'takePenalty', player: 0 }])
    s = take(s)
    expect(s.players[0].hand).toHaveLength(16)
    expect(s.current).toBe(1)
  })

  it('after a chain there is no repeat penalty, and a new chain can start', () => {
    const a = card('red draw1'), again = card('red draw1')
    let s = mk({ hands: [[a, card('green 1')], [card('green 4'), card('green 5')], [again, card('green 2')]], top: card('red 5') })
    s = play(s, a)
    s = take(s) // P1 takes 1 and loses their turn
    expect(s.chain).toBeNull()
    expect(s.current).toBe(2)
    expect(ids(s)).toEqual([again.id]) // top is still a red +1: matches by color and symbol
    s = play(s, again)
    expect(s.chain).toEqual({ kind: 'draw1', amount: 1 })
  })

  it('Wild Draw Color never opens a chain', () => {
    const wdc = dk('wildDrawColor')
    const s = play(mk({ side: 'dark', hands: [[wdc, dk('pink 3')], [dk('purple 5')], fill(2)], top: dk('orange 4'), draw: [dk('teal 2')] }), wdc, 'teal')
    expect(s.chain).toBeNull()
  })

  it('a chain skips finished players', () => {
    const a = card('red draw1')
    const s = play(mk({ hands: [[a, card('green 1')], [], fill(2)], top: card('red 5'), finished: [1] }), a)
    expect(s.current).toBe(2)
    expect(s.chain).toEqual({ kind: 'draw1', amount: 1 })
  })
})

describe('penalties and an empty draw pile', () => {
  const chain5 = (draw: Setup['draw'], under: Setup['under']) =>
    mk({ side: 'dark', hands: [[], [dk('purple 1')], fill(2)], top: dk('pink draw5'), chain: { kind: 'draw5', amount: 5 }, current: 1, draw, under })

  it('reshuffles the discard pile, keeping the top card, when a penalty needs more cards', () => {
    const s0 = chain5([dk('purple 2'), dk('purple 3')], [dk('purple 4'), dk('purple 5'), dk('purple 6'), dk('purple 7'), dk('purple 8')])
    const total = noCards(s0)
    const s = take(s0)
    expect(s.players[1].hand).toHaveLength(6)
    expect(s.discard).toHaveLength(1)
    expect(s.discard[0].id).toBe(s0.discard.at(-1)!.id)
    expect(s.drawPile).toHaveLength(2)
    expect(noCards(s)).toBe(total)
  })

  it('draws what exists when the whole deck is exhausted', () => {
    const s = take(chain5([dk('purple 2')], []))
    expect(s.players[1].hand).toHaveLength(2)
    expect(s.drawPile).toHaveLength(0)
    expect(s.discard).toHaveLength(1)
    expect(s.chain).toBeNull()
  })
})

describe('Wild Draw Color', () => {
  const setup = (draw: Setup['draw'], under?: Setup['under']) => {
    const wdc = dk('wildDrawColor')
    return { wdc, s: mk({ side: 'dark', hands: [[wdc, dk('pink 3')], [dk('purple 5')], fill(2)], top: dk('orange 4'), draw, under }) }
  }

  it('the next player draws until the named color, keeps everything, and loses their turn', () => {
    const t = dk('teal 2')
    const { wdc, s: s0 } = setup([t, dk('pink 1'), dk('pink 2')])
    const s = play(s0, wdc, 'teal')
    expect(s.players[1].hand).toHaveLength(4)
    expect(s.players[1].hand.at(-1)!.id).toBe(t.id)
    expect(s.current).toBe(2)
    expect(s.activeColor).toBe('teal')
  })

  it('also stops at a plain Dark Wild and at a Wild Draw Color', () => {
    for (const stop of ['wild', 'wildDrawColor']) {
      const { wdc, s: s0 } = setup([card('blue 1', stop), dk('pink 1')])
      const s = play(s0, wdc, 'teal')
      expect(s.players[1].hand).toHaveLength(3)
    }
  })

  it('keeps drawing across a reshuffle', () => {
    const teal = dk('teal 8')
    const { wdc, s: s0 } = setup([dk('pink 1')], [teal, dk('pink 9'), dk('pink 8')])
    const total = noCards(s0)
    const s = play(s0, wdc, 'teal')
    expect(s.players[1].hand.at(-1)!.id).toBe(teal.id)
    expect(noCards(s)).toBe(total)
  })

  it('ends when the deck is exhausted', () => {
    const { wdc, s: s0 } = setup([dk('pink 1'), dk('pink 2')])
    const s = play(s0, wdc, 'teal')
    // the draw pile's 2 cards, then the old top card reshuffled in from under the played Wild Draw Color
    expect(s.players[1].hand).toHaveLength(4)
    expect(s.drawPile).toHaveLength(0)
    expect(s.discard).toHaveLength(1)
    expect(s.current).toBe(2)
  })
})

describe('Reverse, Skip and Skip Everyone', () => {
  it('Reverse with two players hands the turn to the other player, not back to you', () => {
    const r = card('red reverse')
    const s = play(mk({ hands: [[r, card('green 1')], fill(2)], top: card('red 5') }), r)
    expect(s.current).toBe(1)
    expect(s.direction).toBe(-1)
  })
  it('Reverse with three players', () => {
    const r = card('red reverse')
    expect(play(mk({ hands: [[r, card('green 1')], fill(2), fill(2)], top: card('red 5') }), r).current).toBe(2)
  })
  it('Skip skips the next player (with two players you go again)', () => {
    const k = card('red skip'), k2 = card('red skip')
    expect(play(mk({ hands: [[k, card('green 1')], fill(2), fill(2)], top: card('red 5') }), k).current).toBe(2)
    expect(play(mk({ hands: [[k2, card('green 1')], fill(2)], top: card('red 5') }), k2).current).toBe(0)
  })
  it('Skip Everyone gives the turn back to the player', () => {
    const k = dk('pink skipAll')
    expect(play(mk({ side: 'dark', hands: [[k, dk('purple 1')], fill(2), fill(2)], top: dk('pink 5') }), k).current).toBe(0)
  })
  it('Skip and Reverse step over finished players', () => {
    const k = card('red skip')
    expect(play(mk({ hands: [[k, card('green 1')], [], fill(2), fill(2)], top: card('red 5'), finished: [1] }), k).current).toBe(3)
    const r = card('red reverse')
    const s = play(mk({ hands: [[r, card('green 1')], fill(2), fill(2), []], top: card('red 5'), finished: [3] }), r)
    expect(s.current).toBe(2)
  })
})

describe('Flip', () => {
  const lightFlip = (darkFace: string, extra: Partial<Setup> = {}) => {
    const f = card('red flip', darkFace)
    return { f, s: mk({ hands: [[f, card('green 1')], fill(2), fill(2)], top: card('red 5'), ...extra }) }
  }
  const darkFlip = (lightFace: string) => {
    const f = card(lightFace, 'pink flip')
    return { f, s: mk({ side: 'dark', hands: [[f, dk('purple 1')], fill(2), fill(2)], top: dk('pink 5') }) }
  }

  it('is playable only on a matching color or another Flip, and never inside a chain', () => {
    expect(kinds(mk({ hands: [[card('blue flip')], fill(2), fill(2)], top: card('red 5') }))).toEqual(['draw'])
    expect(kinds(mk({ hands: [[card('blue flip')], fill(2), fill(2)], top: card('red flip') }))).toEqual(['play'])
    expect(kinds(mk({ hands: [[], [card('red flip')], fill(2)], top: card('red draw1'), chain: { kind: 'draw1', amount: 1 }, current: 1 }))).toEqual(['takePenalty'])
  })

  it('the played Flip stays on top and shows its new face', () => {
    const { f, s: s0 } = lightFlip('pink 7')
    const s = play(s0, f)
    expect(s.side).toBe('dark')
    expect(s.discard.at(-1)!.id).toBe(f.id)
    expect(topFace(s)).toEqual({ color: 'pink', kind: 'number', value: 7 })
    expect(s.activeColor).toBe('pink')
    expect(s.current).toBe(1)
    expect(s.chain).toBeNull()
  })

  it('new face Draw Five opens a +5 chain against the next player', () => {
    const { f, s: s0 } = lightFlip('pink draw5')
    const s = play(s0, f)
    expect(s.chain).toEqual({ kind: 'draw5', amount: 5 })
    expect(s.current).toBe(1)
  })

  it('new face Reverse reverses, Skip Everyone plays again', () => {
    const a = lightFlip('teal reverse'), b = lightFlip('orange skipAll')
    const sa = play(a.s, a.f)
    expect(sa.direction).toBe(-1)
    expect(sa.current).toBe(2)
    expect(play(b.s, b.f).current).toBe(0)
  })

  it('new face Wild: the flipper names the color', () => {
    const { f, s: s0 } = lightFlip('wild')
    let s = play(s0, f)
    expect(s.phase).toBe('chooseColor')
    expect(legalActions(s)).toEqual(COLORS.dark.map(color => ({ type: 'chooseColor', player: 0, color })))
    s = choose(s, 'teal')
    expect(s.activeColor).toBe('teal')
    expect(s.phase).toBe('play')
    expect(s.current).toBe(1)
  })

  it('new face Wild Draw Color: named color, then the next player draws until it', () => {
    const { f, s: s0 } = lightFlip('wildDrawColor', { draw: [dk('purple 3'), dk('pink 1')] })
    let s = choose(play(s0, f), 'purple')
    expect(s.players[1].hand).toHaveLength(4)
    expect(s.current).toBe(2)
  })

  it('Dark to Light: Wild Draw Two names a color then opens a +2 chain; Skip; Draw One', () => {
    const w = darkFlip('wildDraw2')
    const s = choose(play(w.s, w.f), 'green')
    expect(s.side).toBe('light')
    expect(s.chain).toEqual({ kind: 'draw2', amount: 2 })
    expect(s.activeColor).toBe('green')
    expect(s.current).toBe(1)
    const k = darkFlip('blue skip')
    expect(play(k.s, k.f).current).toBe(2)
    const d = darkFlip('blue draw1')
    const sd = play(d.s, d.f)
    expect(sd.chain).toEqual({ kind: 'draw1', amount: 1 })
    expect(sd.activeColor).toBe('blue')
  })

  it('a Flip never shows a Flip on its other face, for any seed', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const c of makeCards(rander(seed))) if (c.light.kind === 'flip') expect(c.dark.kind).not.toBe('flip')
    }
  })

  it('as the last card: the flipper finishes and the new face acts on the next active player', () => {
    const num = card('red flip', 'pink 7'), all = card('red flip', 'orange skipAll'), rev = card('red flip', 'teal reverse')
    const hands = () => [fill(2), fill(2)]
    const s1 = play(mk({ hands: [[num], ...hands()], top: card('red 5') }), num)
    expect(s1.players[0].place).toBe(1)
    expect(s1.side).toBe('dark')
    expect(s1.current).toBe(1)
    expect(s1.phase).toBe('play')
    expect(play(mk({ hands: [[all], ...hands()], top: card('red 5') }), all).current).toBe(1) // extra turn is void
    expect(play(mk({ hands: [[rev], ...hands()], top: card('red 5') }), rev).current).toBe(2)
  })

  it('as the last card with only one player left, the game ends at once', () => {
    const f = card('red flip', 'pink 7')
    const s = play(mk({ hands: [[f], fill(3)], top: card('red 5') }), f)
    expect(s.phase).toBe('over')
    expect(s.result!.ranking.map(r => [r.id, r.rank])).toEqual([['P0', 1], ['P1', 2]])
  })

  it('a finished flipper still names the color for a revealed Wild', () => {
    const f = card('red flip', 'wild')
    let s = play(mk({ hands: [[f], fill(2), fill(2)], top: card('red 5') }), f)
    expect(s.phase).toBe('chooseColor')
    s = choose(s, 'pink')
    expect(s.current).toBe(1)
    expect(s.players[0].place).toBe(1)
  })
})

describe('finish order', () => {
  it('assigns places in order, never turns to a finished player, and ends when one player is left', () => {
    const a = card('red 6'), b = card('red 7')
    let s = mk({ hands: [[a], [b, card('green 1')], [card('green 2'), card('green 3')]], top: card('red 5') })
    s = play(s, a)
    expect(s.players[0].place).toBe(1)
    expect(s.finishOrder).toEqual(['P0'])
    expect(s.current).toBe(1)
    s = play(s, b) // P1 plays but has one card left
    s = draw(s) // P2 cannot play red 7
    expect(s.current).not.toBe(0)
    expect(s.current).toBe(1)
  })

  it('second finisher ends the game with a full ranking', () => {
    const a = card('red 6'), b = card('red 7')
    let s = mk({ hands: [[a], [b], [card('green 2'), card('green 3')]], top: card('red 5') })
    s = play(play(s, a), b)
    expect(s.phase).toBe('over')
    expect(s.result!.reason).toBe('last')
    expect(s.result!.ranking).toEqual([
      { player: 0, id: 'P0', rank: 1, finished: true, cards: 0 },
      { player: 1, id: 'P1', rank: 2, finished: true, cards: 0 },
      { player: 2, id: 'P2', rank: 3, finished: false, cards: 2 },
    ])
    expect(() => draw(s)).toThrow()
  })

  it('last card is +1: the chain goes on with 3 players, but is not applied when only one player is left', () => {
    const a = card('red draw1'), b = card('red draw1')
    const s3 = play(mk({ hands: [[a], fill(2), fill(2)], top: card('red 5') }), a)
    expect(s3.players[0].place).toBe(1)
    expect(s3.chain).toEqual({ kind: 'draw1', amount: 1 })
    expect(s3.current).toBe(1)
    const s2 = play(mk({ hands: [[b], fill(3)], top: card('red 5') }), b)
    expect(s2.phase).toBe('over')
    expect(s2.players[1].hand).toHaveLength(3)
  })

  it('last card is Skip Everyone (void), Reverse, or Wild Draw Color', () => {
    const all = dk('pink skipAll')
    expect(play(mk({ side: 'dark', hands: [[all], fill(2), fill(2)], top: dk('pink 2') }), all).current).toBe(1)
    const rev = card('red reverse')
    expect(play(mk({ hands: [[rev], fill(2), fill(2)], top: card('red 5') }), rev).current).toBe(2)
    const wdc = dk('wildDrawColor')
    const s = play(mk({ side: 'dark', hands: [[wdc], fill(2), fill(2)], top: dk('orange 4'), draw: [dk('teal 1')] }), wdc, 'teal')
    expect(s.players[1].hand).toHaveLength(3)
    expect(s.current).toBe(2)
  })

  it('a stalemate ends the game when nobody can play or draw', () => {
    let s = mk({ hands: [[card('blue 9')], [card('green 9')]], top: card('red 5'), draw: [] })
    s = draw(s)
    expect(s.phase).toBe('play')
    expect(s.stuck).toBe(1)
    s = draw(s)
    expect(s.phase).toBe('over')
    expect(s.result!.reason).toBe('stalemate')
    expect(s.result!.ranking.map(r => r.rank)).toEqual([1, 1]) // same cards, same value: shared rank
  })
})

describe('End game vote', () => {
  const hand = (...v: number[]) => v.map(x => card(`blue ${x}`))
  it('ends when the only human votes; unfinished players rank by fewest cards', () => {
    const s0 = mk({ hands: [hand(2, 3), hand(4), hand(1, 1, 1)], top: card('red 5'), bots: [false, true, true] })
    const s = reduce(s0, { type: 'voteEndGame', player: 0 })
    expect(s.phase).toBe('over')
    expect(s.result!.reason).toBe('vote')
    expect(s.result!.ranking.map(r => r.id)).toEqual(['P1', 'P0', 'P2'])
  })
  it('ties on cards and value share a rank', () => {
    const s = reduce(mk({ hands: [hand(2), hand(2), hand(1, 1, 1)], top: card('red 5'), bots: [false, true, true] }), { type: 'voteEndGame', player: 0 })
    expect(s.result!.ranking.map(r => r.rank)).toEqual([1, 1, 3])
  })
  it('with two humans, both must vote', () => {
    let s = mk({ hands: [hand(2, 3), hand(4, 5), hand(1, 1)], top: card('red 5'), bots: [false, false, true] })
    s = reduce(s, { type: 'voteEndGame', player: 0 })
    expect(s.phase).toBe('play')
    s = reduce(s, { type: 'voteEndGame', player: 1 })
    expect(s.phase).toBe('over')
  })
  it('bots cannot vote, and a finished human can end the game once no humans are left playing', () => {
    const s0 = mk({ hands: [[], hand(2, 3), hand(4, 5, 6)], top: card('red 5'), bots: [false, true, true], finished: [0] })
    expect(() => reduce(s0, { type: 'voteEndGame', player: 1 })).toThrow()
    const s = reduce(s0, { type: 'voteEndGame', player: 0 })
    expect(s.phase).toBe('over')
    expect(s.result!.ranking.map(r => [r.id, r.rank])).toEqual([['P0', 1], ['P1', 2], ['P2', 3]])
  })
})

describe('UNO call', () => {
  const setup = () => {
    const a = card('red 6'), b = card('red 7')
    return { a, b, s: mk({ hands: [[a, b], fill(3), fill(3)], top: card('red 5'), bots: [false, false, false] }) }
  }
  it('opens a catch window when a human plays to one card without calling', () => {
    const { a, s: s0 } = setup()
    expect(play(s0, a).unoWindow).toBe(0)
  })
  it('a catch makes them draw 2 and closes the window', () => {
    const { a, s: s0 } = setup()
    const s = reduce(play(s0, a), { type: 'catchUno', player: 1 })
    expect(s.players[0].hand).toHaveLength(3)
    expect(s.unoWindow).toBeNull()
  })
  it('calling after the play, before the next player begins, is in time', () => {
    const { a, s: s0 } = setup()
    const s = reduce(play(s0, a), { type: 'callUno', player: 0 })
    expect(s.unoWindow).toBeNull()
    expect(() => reduce(s, { type: 'catchUno', player: 1 })).toThrow()
  })
  it('calling during your own turn before the play counts', () => {
    const { a, s: s0 } = setup()
    expect(play(reduce(s0, { type: 'callUno', player: 0 }), a).unoWindow).toBeNull()
  })
  it('the window closes when the next player begins their turn', () => {
    const { a, s: s0 } = setup()
    const s = draw(play(s0, a))
    expect(s.unoWindow).toBeNull()
    expect(() => reduce(s, { type: 'catchUno', player: 2 })).toThrow()
  })
  it('only the current player or the one in the window may call; nobody catches themselves', () => {
    const { a, s: s0 } = setup()
    expect(() => reduce(s0, { type: 'callUno', player: 1 })).toThrow()
    expect(() => reduce(play(s0, a), { type: 'catchUno', player: 0 })).toThrow()
  })
  it('bots always call, and going out never needs a call', () => {
    const a = card('red 6')
    expect(play(mk({ hands: [[a, card('red 7')], fill(3), fill(3)], top: card('red 5') }), a).unoWindow).toBeNull()
    expect(play(mk({ hands: [[a], fill(3), fill(3)], top: card('red 5'), bots: [false, false, false] }), a).unoWindow).toBeNull()
  })
})

describe('starting card', () => {
  const start = (top: ReturnType<typeof card>, first = 0, seed = 1) => {
    const s = mk({ hands: [fill(7), fill(7), fill(7)], top, seed })
    startCard(s, first)
    return s
  }
  it('number: the first player plays against it', () => {
    const s = start(card('red 5'), 1)
    expect(s.current).toBe(1)
    expect(s.activeColor).toBe('red')
  })
  it('Draw One: a +1 chain against the first player', () => {
    const s = start(card('red draw1'))
    expect(s.chain).toEqual({ kind: 'draw1', amount: 1 })
    expect(s.current).toBe(0)
  })
  it('Skip skips the first player', () => {
    expect(start(card('red skip'), 0).current).toBe(1)
    expect(start(card('red skip'), 2).current).toBe(0)
  })
  it('Reverse: the first player starts and the direction is reversed', () => {
    const s = start(card('red reverse'), 1)
    expect(s.direction).toBe(-1)
    expect(s.current).toBe(1)
  })
  it('Wild: the first player names the color', () => {
    let s = start(card('wild'), 2)
    expect(s.phase).toBe('chooseColor')
    expect(legalActions(s)).toEqual(COLORS.light.map(color => ({ type: 'chooseColor', player: 2, color })))
    s = choose(s, 'green')
    expect(s.current).toBe(2)
    expect(s.activeColor).toBe('green')
  })
  it('Wild Draw Two is kept: a +2 chain with a random color, the same for the same seed', () => {
    const s = start(card('wildDraw2'), 0, 9)
    expect(s.chain).toEqual({ kind: 'draw2', amount: 2 })
    expect(s.current).toBe(0)
    expect(COLORS.light).toContain(s.activeColor)
    expect(start(card('wildDraw2'), 0, 9).activeColor).toBe(s.activeColor)
  })
  it('Flip: starts on the Dark side and the card acts through its other face', () => {
    const num = start(card('red flip', 'pink 3'))
    expect(num.side).toBe('dark')
    expect(num.current).toBe(0)
    expect(num.activeColor).toBe('pink')
    expect(start(card('red flip', 'pink draw5')).chain).toEqual({ kind: 'draw5', amount: 5 })
    const rev = start(card('red flip', 'teal reverse'))
    expect(rev.direction).toBe(-1)
    expect(rev.current).toBe(0)
    const all = start(card('red flip', 'orange skipAll'))
    expect(all.direction).toBe(1)
    expect(all.current).toBe(0) // the first player plays against it
    const w = start(card('red flip', 'wild'))
    expect(COLORS.dark).toContain(w.activeColor)
    expect(w.phase).toBe('play')
  })
  it('Flip showing Wild Draw Color: the first player draws until the random color or a Dark Wild, and loses the turn', () => {
    const s = mk({ hands: [fill(7), fill(7), fill(7)], top: card('red flip', 'wildDrawColor'), draw: [...fill(5), card('blue 1', 'wild')] })
    startCard(s, 0)
    expect(s.players[0].hand).toHaveLength(8)
    expect(s.current).toBe(1)
  })
})
