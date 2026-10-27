import { COLORS, type Color, type Face, type Side } from './engine/engine'

// Classic card-game colors: Light red/yellow/green/blue, Dark pink/teal/orange/purple.
export const HEX: Record<Color, string> = {
  blue: '#0a5ebd', green: '#3fa535', red: '#ec2a2a', yellow: '#ffd300',
  pink: '#e9559f', teal: '#14a9a3', orange: '#f58220', purple: '#6c3fa3',
}
// One shape per color so the cards can be told apart without hue (10x10 boxes).
const SHAPE: Record<Color, string> = {
  blue: 'M1 5a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z', green: 'M5 1L9 9H1Z', red: 'M1.5 1.5H8.5V8.5H1.5Z', yellow: 'M5 .5L9.5 5L5 9.5L.5 5Z',
  pink: 'M5 .5L6.3 3.7L9.7 3.9L7.1 6.1L7.9 9.4L5 7.6L2.1 9.4L2.9 6.1L.3 3.9L3.7 3.7Z', teal: 'M3.5 .5H6.5V3.5H9.5V6.5H6.5V9.5H3.5V6.5H.5V3.5H3.5Z',
  orange: 'M2.8 1H7.2L9.5 5L7.2 9H2.8L.5 5Z', purple: 'M5 .5L9.5 3.8L7.8 9.2H2.2L.5 3.8Z',
}
export const Shape = ({ color, size = 14 }: { color: Color; size?: number }) => (
  <svg viewBox="0 0 10 10" width={size} height={size} aria-hidden="true"><path d={SHAPE[color]} fill="#fff" stroke="#1d1d24" strokeWidth=".8" /></svg>
)
const mark = (c: Color, x: number, y: number) => <path key={`${x}${y}`} d={SHAPE[c]} transform={`translate(${x} ${y}) scale(1)`} fill="#fff" />

const GLYPH: Record<string, string> = {
  draw1: '+1', draw5: '+5', reverse: '⇄', skip: '⊘', skipAll: '⊘⊘', flip: '⇅',
  wild: '★', wildDraw2: '+2', wildDrawColor: '+C',
}
const NAME: Record<string, string> = {
  draw1: 'Draw One', draw5: 'Draw Five', reverse: 'Reverse', skip: 'Skip', skipAll: 'Skip Everyone',
  flip: 'Flip', wild: 'Wild', wildDraw2: 'Wild Draw Two', wildDrawColor: 'Wild Draw Color',
}

export const glyph = (f: Face) => (f.kind === 'number' ? String(f.value) : GLYPH[f.kind])
export const label = (f: Face) => (f.color ? `${f.color} ` : '') + (f.kind === 'number' ? f.value : NAME[f.kind])
export const isWildFace = (f: Face) => f.color === null

// Symbols drawn around (0,0), roughly 34 units wide.
const ARROW = 'M-15 -3H3V-7L15 0L3 7V3H-15Z'
const RING = 'M-14 0a14 14 0 1 0 28 0a14 14 0 1 0 -28 0Z'
function Symbol({ kind, fill }: { kind: string; fill: string }) {
  const ink = { fill, stroke: 'none' }
  switch (kind) {
    case 'skip': case 'skipAll':
    { // Skip Everyone: two skip signs overlapping
      const sign = <g fill="none" stroke={fill} strokeLinecap="round"><path d={RING} /><path d="M-10 -10L10 10" /></g>
      return kind === 'skip'
        ? <g strokeWidth="5">{sign}</g>
        : <g strokeWidth="6"><g transform="translate(-7 -9) scale(.65)">{sign}</g><g transform="translate(7 9) scale(.65)">{sign}</g></g>
    }
    case 'reverse':
      return <g {...ink} transform="rotate(-45)"><path d={ARROW} transform="translate(0 -8)" /><path d={ARROW} transform="translate(0 8) rotate(180)" /></g>
    case 'flip':
      return <g {...ink}><path d={ARROW} transform="translate(-8 0) rotate(-90)" /><path d={ARROW} transform="translate(8 0) rotate(90)" /></g>
    default: // draw cards: two tilted cards behind the amount
      return (
        <g>
          <rect x="-12" y="-12" width="12" height="17" rx="2.5" fill={fill} transform="rotate(-15)" />
          <rect x="0" y="-12" width="12" height="17" rx="2.5" fill={fill} opacity=".6" transform="rotate(15)" />
        </g>
      )
  }
}
const AMOUNT: Record<string, string> = { draw1: '+1', draw5: '+5', wildDraw2: '+2', wildDrawColor: '+C' }
const FONT = 'Arial Black, Helvetica, Arial, sans-serif'

// Oval quarters of a Wild card, one per color of the side in play.
const QUARTERS = ['M0 0V-38A25 38 0 0 1 25 0Z', 'M0 0H25A25 38 0 0 1 0 38Z', 'M0 0V38A25 38 0 0 1 -25 0Z', 'M0 0H-25A25 38 0 0 1 0 -38Z']
const QUARTER_AT = [[7, -24], [7, 14], [-17, 14], [-17, -24]]

export function CardView({ face, side, dim, onClick }: { face: Face; side: Side; dim?: boolean; onClick?: () => void }) {
  const bg = face.color ? HEX[face.color] : '#16161d'
  const g = glyph(face)
  const num = face.kind === 'number'
  const amount = AMOUNT[face.kind]
  const outline = { stroke: 'rgba(0,0,0,.55)', strokeWidth: 2.2, paintOrder: 'stroke' } as const
  return (
    <button className={`card${dim ? ' dim' : ''}`} disabled={!onClick} onClick={onClick} aria-label={label(face)}>
      <svg viewBox="0 0 72 108">
        <rect x="1" y="1" width="70" height="106" rx="9" fill={side === 'dark' ? '#16161d' : '#fff'} />
        <rect x="5" y="5" width="62" height="98" rx="6" fill={bg} />
        <g transform="translate(36 54) rotate(-25)">
          {face.color ? <ellipse rx="25" ry="38" fill="#fff" /> : (
            <>
              {QUARTERS.map((d, i) => <path key={i} d={d} fill={HEX[COLORS[side][i]]} />)}
              {QUARTER_AT.map(([x, y], i) => mark(COLORS[side][i], x, y))}
            </>
          )}
        </g>
        <g transform="translate(36 54)">
          {face.color && (num
            ? <text y="14" textAnchor="middle" fontSize="40" fontWeight="900" fontFamily={FONT} fill={bg} stroke="rgba(0,0,0,.35)" strokeWidth="1">{g}</text>
            : amount
              ? <><g transform="translate(0 -12)"><Symbol kind={face.kind} fill={bg} /></g>
                  <text y="22" textAnchor="middle" fontSize="20" fontWeight="900" fontFamily={FONT} fill={bg} stroke="rgba(0,0,0,.35)" strokeWidth=".8">{amount}</text></>
              : <Symbol kind={face.kind} fill={bg} />)}
          {!face.color && amount && (
            <><circle r="12" fill="#16161d" /><text y="6" textAnchor="middle" fontSize="15" fontWeight="900" fontFamily={FONT} fill="#fff">{amount}</text></>
          )}
        </g>
        {face.color && <>{mark(face.color, 53, 6)}{mark(face.color, 9, 92)}</>}
        <text x="10" y="21" fontSize="13" fontWeight="900" fontFamily={FONT} fill="#fff" {...outline}>{g}</text>
        <text x="62" y="97" textAnchor="end" fontSize="13" fontWeight="900" fontFamily={FONT} fill="#fff" {...outline}>{g}</text>
      </svg>
    </button>
  )
}

export const CardBack = () => <div className="card back" aria-hidden="true" />
