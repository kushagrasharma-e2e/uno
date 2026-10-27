import { useEffect, useState } from 'react'
import { COLORS, legalActions, newGame, reduce, topFace, type Action, type Card, type Color, type State } from './engine/engine'
import { botAction } from './bot'
import { CardBack, CardView, HEX, Shape, isWildFace, label } from './CardView'

const ME = 0
const BOT_DELAY = 900
const CATCH_DELAY = 2000 // how long a missed UNO call stays catchable
const cards = (n: number) => `${n} card${n === 1 ? '' : 's'}`
const freshGame = (n: number) =>
  newGame(['You', ...Array.from({ length: n - 1 }, (_, i) => `Bot ${i + 1}`)], Date.now() & 0x7fffffff, Array.from({ length: n }, (_, i) => i > 0))

function describe(prev: State, a: Action, next: State): string[] {
  const who = prev.players[a.player].id
  switch (a.type) {
    case 'play': {
      const c = prev.players[a.player].hand.find(h => h.id === a.cardId)!
      let t = `${who} played ${label(c[prev.side])}${a.color ? ` and named ${a.color}` : ''}`
      if (next.side !== prev.side) t += `. Flipped to the ${next.side} side: ${label(topFace(next))}`
      return [t]
    }
    case 'draw': return [`${who} drew a card`]
    case 'takePenalty': return [`${who} took ${cards(prev.chain!.amount)}`]
    case 'chooseColor': return [`${who} named ${a.color}`]
    case 'catchUno': return [`${who} caught ${prev.players[prev.unoWindow!].id} without UNO: draws 2`]
    default: return []
  }
}

const RULES = [
  'Match the top card by color, number or symbol. Light colors: blue, green, red, yellow. Dark colors: pink, teal, orange, purple.',
  'If you can play, you must play. You may draw only when nothing is playable, and only one card; a playable drawn card must be played.',
  'Wild plays on anything. Wild Draw Two and Wild Draw Color can be played only if you hold no card of the active color and no other Wild.',
  'Draw One (+1), Wild Draw Two (+2) and Draw Five (+5) start a penalty chain. Only the same kind stacks. If you hold one you must stack it; otherwise you take the whole penalty and lose your turn.',
  'Wild Draw Color: the next player draws until the named color or any Dark Wild card, then loses their turn.',
  'Skip skips the next player. Skip Everyone skips all others and you play again. Reverse changes direction (with two players it is a normal Reverse).',
  'Flip turns every card over to the other side. The Flip card stays on top showing its new face, and that face acts as if you had just played it. A Flip cannot be played during a penalty chain.',
  'Press UNO! when you play your next-to-last card: before playing, or after playing until the next player begins. If you miss it, another player catches you and you draw 2.',
  'You are ranked by finish order. The game ends when one player is left, when every human chooses End game, or when nobody can move. Unfinished players rank by fewest cards, then lowest card value.',
]

function Rules({ onClose }: { onClose: () => void }) {
  return (
    <div className="over" role="dialog" aria-label="Rules">
      <div className="panel wide">
        <h2>Rules</h2>
        <ul>{RULES.map(r => <li key={r}>{r}</li>)}</ul>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

function Game({ n, onHome }: { n: number; onHome: () => void }) {
  const [s, setS] = useState(() => freshGame(n))
  const [log, setLog] = useState<string[]>([])
  const [picking, setPicking] = useState<Card | null>(null) // a Wild-type card waiting for its color
  const [rules, setRules] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [shake, setShake] = useState(false)

  const act = (a: Action) => {
    const next = reduce(s, a)
    const took = (a.type === 'takePenalty' || a.type === 'catchUno') && next.players[ME].hand.length > s.players[ME].hand.length
    if (took) { setShake(true); setTimeout(() => setShake(false), 500) }
    setS(next)
    setLog(l => [...l, ...describe(s, a, next)].slice(-5))
    setPicking(null)
    setConfirmEnd(false)
  }
  // The UNO! button looks and acts the same in every state; a press that does not count is ignored.
  const callUno = () => { try { setS(reduce(s, { type: 'callUno', player: ME })) } catch { /* not a moment where it counts */ } }

  const over = s.phase === 'over'
  const actor = s.phase === 'chooseColor' ? s.reveal!.player : s.current
  const myTurn = !over && actor === ME
  const acts = myTurn ? legalActions(s) : []
  const playable = new Set(acts.flatMap(a => (a.type === 'play' ? [a.cardId] : [])))
  const canDraw = acts.some(a => a.type === 'draw')
  const canTake = acts.some(a => a.type === 'takePenalty')
  const naming = myTurn && s.phase === 'chooseColor'

  useEffect(() => {
    if (over) return
    if (s.unoWindow !== null) { // someone left one card without calling UNO: a bot catches it after a short delay
      if (s.phase === 'chooseColor') return
      const catcher = s.players.findIndex((p, i) => p.bot && p.place === null && i !== s.unoWindow)
      if (catcher < 0) return
      const t = setTimeout(() => act({ type: 'catchUno', player: catcher }), CATCH_DELAY)
      return () => clearTimeout(t)
    }
    if (myTurn) return
    const t = setTimeout(() => act(botAction(s)), BOT_DELAY)
    return () => clearTimeout(t)
  }, [s])

  const t0 = topFace(s)
  const match = `${s.activeColor}${t0.kind === 'number' ? `, or the number ${t0.value}` : `, or another ${label({ ...t0, color: null })}`}`
  const [status, hint] = over ? ['Game over', '']
    : !myTurn ? [`${s.players[actor].id}'s turn`, 'Waiting for them to move...']
    : naming ? ['Name the color', 'Pick the color the next card must match.']
    : s.chain ? (canTake
      ? [`Penalty: take ${cards(s.chain.amount)}`, 'You have nothing that stacks, so you draw them and lose your turn.']
      : [`Penalty ${s.chain.amount} cards: stack or lose`, 'Play a matching penalty card to pass it on. You cannot play anything else.'])
    : s.phase === 'afterDraw' ? ['Play the card you drew', 'It is playable, so you must play it.']
    : canDraw ? ['Nothing to play: draw a card', 'Click the draw pile.']
    : ['Your turn', `Play a card that matches ${match}, or a Wild. Raised cards are playable.`]

  const clickCard = (c: Card) => {
    if (isWildFace(c[s.side])) setPicking(c)
    else act({ type: 'play', player: ME, cardId: c.id })
  }
  const pickColor = (color: Color) =>
    picking ? act({ type: 'play', player: ME, cardId: picking.id, color }) : act({ type: 'chooseColor', player: ME, color })

  const me = s.players[ME]
  const top = s.discard[s.discard.length - 1]
  return (
    <div className="table" data-side={s.side} key={s.side}>
      <header>
        <span className="side">{s.side === 'light' ? 'Light side' : 'Dark side'}</span>
        <span className="menu">
          <button onClick={() => setRules(true)}>Rules</button>
          {!over && (confirmEnd
            ? <><button onClick={() => act({ type: 'voteEndGame', player: ME })}>Yes, end it</button><button onClick={() => setConfirmEnd(false)}>No</button></>
            : <button onClick={() => setConfirmEnd(true)}>End game</button>)}
        </span>
      </header>

      <section className={`banner${myTurn ? ' mine' : ''}`}>
        <div className="status" role="status">{status}</div>
        <div className="hint">{hint}</div>
      </section>

      <section className="opponents">
        {s.players.slice(1).map((p, i) => (
          <div key={p.id} className={`opponent${s.current === i + 1 && !over ? ' turn' : ''}`}>
            <div className="name">{s.current === i + 1 && !over ? '▶ ' : ''}{p.id}</div>
            <div className="fan">{p.hand.slice(0, 10).map(c => <CardBack key={c.id} />)}</div>
            <div className="count">{p.place ? `Finished in place ${p.place}` : cards(p.hand.length)}</div>
          </div>
        ))}
      </section>

      <section className="center">
        <button className="pile" disabled={!canDraw} onClick={() => act({ type: 'draw', player: ME })} aria-label="Draw a card">
          <CardBack />
          <span>Draw pile ({s.drawPile.length})</span>
        </button>
        <div className="discard">
          <div className="pop" key={top.id}><CardView face={topFace(s)} side={s.side} /></div>
          <span className="chip" style={{ background: HEX[s.activeColor] }}><Shape color={s.activeColor} /> Color: {s.activeColor}</span>
        </div>
        <div className="dir"><span>{s.direction === 1 ? '↻' : '↺'}</span>{s.direction === 1 ? 'clockwise' : 'counter-clockwise'}</div>
        {s.chain && <div className="chain">+{s.chain.amount}</div>}
      </section>

      <section className="actions">
        {canTake && <button onClick={() => act({ type: 'takePenalty', player: ME })}>Take {cards(s.chain!.amount)}</button>}
        {(picking || naming) && (
          <div className="picker" role="group" aria-label="Choose a color">
            {COLORS[s.side].map(c => (
              <button key={c} className="swatch" style={{ background: HEX[c] }} onClick={() => pickColor(c)} aria-label={c}><Shape color={c} size={22} /></button>
            ))}
            {picking && <button className="plain" onClick={() => setPicking(null)}>Cancel</button>}
          </div>
        )}
      </section>

      <section className="log">
        <h3>Recent moves</h3>
        {!log.length && <div>Game started. {s.players[s.current].id} goes first.</div>}
        {log.map((l, i) => <div key={i}>{l}</div>).reverse()}
      </section>

      <div className="uno-row"><button className="uno" onClick={callUno}>UNO!</button></div>

      <div className="handlabel">Your hand ({me.hand.length})</div>
      <section className={`hand${shake ? ' shake' : ''}`}>
        {me.hand.map((c, i) => (
          <div className="deal" key={c.id} style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
            <CardView
              face={c[s.side]}
              side={s.side}
              dim={myTurn && !playable.has(c.id)}
              onClick={playable.has(c.id) && !picking ? () => clickCard(c) : undefined}
            />
          </div>
        ))}
      </section>

      {rules && <Rules onClose={() => setRules(false)} />}
      {over && (
        <div className="over" role="dialog" aria-label="Results">
          <div className="panel">
            <h2>Results</h2>
            <p className="why">{s.result!.reason === 'last' ? 'Everyone else finished.' : s.result!.reason === 'vote' ? 'Ended by vote.' : 'Nobody could move.'}</p>
            <ol>
              {s.result!.ranking.map(r => (
                <li key={r.id}>{r.rank}. {r.id} {r.finished ? '' : `(${r.cards} cards left)`}</li>
              ))}
            </ol>
            <button onClick={() => { setS(freshGame(n)); setLog([]) }}>Play again</button>
            <button onClick={onHome}>Home</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [n, setN] = useState<number | null>(null) // players at the table, or null on the home screen
  const [rules, setRules] = useState(false)
  if (n) return <Game n={n} onHome={() => setN(null)} />
  return (
    <div className="table home" data-side="light">
      <h1>Flip Cards</h1>
      <p>A card game of two sides. Play against bots.</p>
      <div className="picker">
        {[2, 3, 4].map(k => <button key={k} className="start" onClick={() => setN(k)}>{k} players</button>)}
      </div>
      <button onClick={() => setRules(true)}>Rules</button>
      {rules && <Rules onClose={() => setRules(false)} />}
    </div>
  )
}
