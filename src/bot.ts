import { legalActions, type Action, type Color, type State } from './engine/engine'

type PlayAction = Extract<Action, { type: 'play' }>

// Picks one of the engine's legal actions, like any player. Prefers plain cards over Wild-type
// cards, and names the color it holds most of.
// ponytail: random among plain cards, no look-ahead; add smarter play only if it feels too easy.
export function botAction(s: State, rand: () => number = Math.random): Action {
  const acts = legalActions(s)
  const who = s.phase === 'chooseColor' ? s.reveal!.player : s.current
  const hand = s.players[who].hand
  const held = (color: Color) => hand.filter(c => c[s.side].color === color).length
  const bestColor = (colors: Color[]) => colors.reduce((a, b) => (held(b) > held(a) ? b : a))

  const colors = acts.flatMap(a => (a.type === 'chooseColor' ? [a.color] : []))
  if (colors.length) return { type: 'chooseColor', player: who, color: bestColor(colors) }

  const plays = acts.filter((a): a is PlayAction => a.type === 'play')
  if (!plays.length) return acts[0] // draw, or take the penalty
  const plain = plays.filter(a => !a.color)
  if (plain.length) return plain[Math.floor(rand() * plain.length)]

  // a Wild-type card comes as one action per color: take the color we hold most of
  const options = plays.filter(a => a.cardId === plays[0].cardId)
  const color = bestColor(options.map(a => a.color!))
  return options.find(a => a.color === color)!
}
