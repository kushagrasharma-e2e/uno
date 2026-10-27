// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import App from '../src/App'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let box: HTMLElement
const q = (sel: string) => [...box.querySelectorAll<HTMLButtonElement>(sel)]
const button = (text: RegExp) => q('button').find(b => text.test(b.textContent ?? ''))
const click = (b: HTMLElement) => act(() => { b.click() })
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

beforeEach(() => {
  vi.useFakeTimers({ now: 1_000_000 })
  let x = 12345 // seeded Math.random for the bots' choices
  vi.spyOn(Math, 'random').mockImplementation(() => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32))
  box = document.body.appendChild(document.createElement('div'))
  root = createRoot(box)
})
afterEach(() => { act(() => root.unmount()); box.remove(); vi.useRealTimers(); vi.restoreAllMocks() })

// Plays as the human: first playable card, first color, draws and takes penalties when forced.
async function playOut(seen: Set<string>) {
  const uno = q('button.uno')[0].outerHTML
  for (let i = 0; i < 4000 && !box.querySelector('[aria-label="Results"]'); i++) {
    expect(q('button.uno')[0].outerHTML).toBe(uno) // the UNO! button never changes
    for (const l of box.querySelectorAll('.log div')) seen.add(l.textContent!)
    const swatch = q('.picker .swatch')[0]
    const card = q('.hand button.card').find(b => !b.disabled)
    const take = button(/^Take \d+ cards?/)
    const pile = q('button.pile').find(b => !b.disabled)
    const target = swatch ?? card ?? take ?? pile
    if (target) await click(target)
    else await wait(1000)
  }
  expect(box.querySelector('[aria-label="Results"]')).not.toBeNull()
}

describe('whole game through the page', () => {
  for (const n of [2, 3, 4]) {
    it(`a human plays ${n} players to the results screen`, async () => {
      await act(async () => { root.render(<App />) })
      expect(box.textContent).toContain('Rules')
      await click(button(new RegExp(`^${n} players`))!)
      expect(q('.opponent')).toHaveLength(n - 1)
      expect(q('.hand button.card')).toHaveLength(7)
      const seen = new Set<string>()
      await playOut(seen)
      const items = [...box.querySelectorAll('.panel li')].map(l => l.textContent!)
      expect(items).toHaveLength(n)
      expect(items.some(t => t.includes('You'))).toBe(true)
      await click(button(/^Play again/)!)
      expect(box.querySelector('[aria-label="Results"]')).toBeNull()
      expect(q('.hand button.card')).toHaveLength(7)
    })
  }

  it('missing UNO gets the human caught by a bot and draws 2', async () => {
    const caught: string[] = []
    for (let g = 0; g < 8 && !caught.length; g++) {
      await act(async () => { root.render(<App />) })
      await click(button(/^2 players/)!)
      const seen = new Set<string>()
      await playOut(seen)
      caught.push(...[...seen].filter(l => l.includes('caught You')))
      await click(button(/^Home/)!)
    }
    expect(caught[0]).toContain('draws 2')
  })

  it('End game asks first, then ends the game with a ranking', async () => {
    await act(async () => { root.render(<App />) })
    await click(button(/^3 players/)!)
    await click(button(/^End game/)!)
    expect(box.querySelector('[aria-label="Results"]')).toBeNull() // still asking
    await click(button(/^No/)!)
    await click(button(/^End game/)!)
    await click(button(/^Yes, end it/)!)
    expect(box.querySelector('[aria-label="Results"]')?.textContent).toContain('Ended by vote')
    expect(box.querySelectorAll('.panel li')).toHaveLength(3)
  })

  it('shows the rules', async () => {
    await act(async () => { root.render(<App />) })
    await click(button(/^Rules/)!)
    expect(box.querySelector('[aria-label="Rules"]')?.textContent).toContain('you must play')
    await click(button(/^Close/)!)
    expect(box.querySelector('[aria-label="Rules"]')).toBeNull()
  })
})
