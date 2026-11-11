import { useEffect, useState } from 'react'
import { money } from './money.js'

const KEY = 'quincena-v1'

const CASH = 'Efectivo'
const PLACES = [CASH, 'NU', 'BBVA', 'MPB', 'MPD']

// Lista base de la familia; se puede cargar cuando no hay movimientos
const BASE = [
  ['Tanda', 2000, CASH],
  ['Nu', 2300, 'NU'],
  ['Miri', 300, 'MPB'],
  ['Paquete', 105, 'MPD'],
  ['Coppel', 210, 'MPD'],
  ['Suburbia', 674, 'MPB'],
  ['Pasajes', 700, CASH],
  ['Gasto', 800, CASH],
  ['Bbva', 373, 'BBVA'],
]

const newId = () => Date.now() + Math.random()

// Versión anterior guardaba { kind, to } en lugar de { name, dest }
const upgrade = (m) =>
  'dest' in m
    ? m
    : { id: m.id, name: '', amount: m.amount, dest: m.kind === 'efectivo' ? CASH : m.to, done: false }

const load = () => {
  try {
    const d = JSON.parse(localStorage.getItem(KEY))
    if (d && Array.isArray(d.moves)) return { ...d, moves: d.moves.map(upgrade) }
  } catch {}
  return { amount: '', savePercent: 10, moves: [] }
}

const num = (n) => Number(n) || 0
const isCash = (dest) => dest.trim().toLowerCase().startsWith('efec')

export default function Quincena() {
  const [data, setData] = useState(load)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [dest, setDest] = useState('')
  const [copied, setCopied] = useState(false)
  const { moves, savePercent } = data

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data))
    } catch {}
  }, [data])

  const set = (patch) => setData((d) => ({ ...d, ...patch }))
  const patchMove = (id, patch) =>
    set({ moves: moves.map((m) => (m.id === id ? { ...m, ...patch } : m)) })

  const add = (e) => {
    e.preventDefault()
    if (amount === '' || !dest.trim()) return
    set({
      moves: [...moves, { id: newId(), name: name.trim(), amount, dest: dest.trim(), done: false }],
    })
    setName('')
    setAmount('')
    setDest('')
  }

  const remove = (id) => set({ moves: moves.filter((m) => m.id !== id) })

  const loadBase = () =>
    set({
      moves: BASE.map(([name, amount, dest]) => ({ id: newId(), name, amount, dest, done: false })),
    })

  const uncheckAll = () => set({ moves: moves.map((m) => ({ ...m, done: false })) })

  // Totales por cuenta (sin importar mayúsculas)
  const pay = num(data.amount)
  const total = moves.reduce((s, m) => s + num(m.amount), 0)
  const cash = moves.filter((m) => isCash(m.dest)).reduce((s, m) => s + num(m.amount), 0)
  const byAccount = new Map()
  moves
    .filter((m) => !isCash(m.dest) && num(m.amount) > 0)
    .forEach((m) => {
      const k = m.dest.trim().toLowerCase() || '(sin cuenta)'
      const prev = byAccount.get(k)
      byAccount.set(k, { label: prev?.label || m.dest.trim() || '(sin cuenta)', sum: (prev?.sum || 0) + num(m.amount) })
    })
  const left = pay - total
  const saving = left > 0 ? Math.min(left, Math.round((pay * savePercent) / 100)) : 0

  const lines = [
    ...(pay ? [`Quincena: ${money(pay)}`, ''] : []),
    ...moves
      .filter((m) => num(m.amount) > 0)
      .map((m) => `${m.name || m.dest}: ${money(m.amount)} (${m.dest})${m.done ? ' ✅' : ' falta'}`),
    '',
    `Total: ${money(total)}`,
  ]
  if (pay) lines.push(left < 0 ? `Te faltan: ${money(-left)}` : `Sobran: ${money(left)}`)
  lines.push('', `Retirar en efectivo: ${money(cash)}`)
  if (byAccount.size) {
    lines.push('Mandar a:')
    byAccount.forEach(({ label, sum }) => lines.push(`${label}: ${money(sum)}`))
  }
  if (pay && left >= 0) {
    lines.push('')
    if (saving > 0) {
      lines.push(`Ahorro: ${money(saving)}`, `Libre para gastar: ${money(left - saving)}`)
    } else {
      lines.push('No queda para ahorrar esta quincena.')
    }
  }
  const message = lines.join('\n')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  // Cuentas sugeridas: las fijas más las que ya se usaron
  const places = [...new Set([...PLACES, ...moves.map((m) => m.dest.trim()).filter(Boolean)])]

  return (
    <>
      <h1>Quincena</h1>

      <section className="panel settings">
        <label>
          ¿Cuánto te pagaron?
          <input
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            placeholder="Ej. 10500"
            value={data.amount}
            onChange={(e) => set({ amount: e.target.value })}
          />
        </label>
        <label>
          Ahorro (% de la quincena)
          <input
            type="number"
            min="0"
            max="100"
            inputMode="numeric"
            value={savePercent}
            onChange={(e) => set({ savePercent: Number(e.target.value) || 0 })}
          />
        </label>
      </section>

      <form className="panel add move-add" onSubmit={add}>
        <input placeholder="Concepto (Tanda, Coppel...)" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          placeholder="Monto"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          list="places"
          placeholder="Cuenta (Efectivo, NU, MPB...)"
          value={dest}
          onChange={(e) => setDest(e.target.value)}
        />
        <button className="primary">Agregar</button>
        <datalist id="places">
          {places.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </form>

      {moves.length === 0 ? (
        <div className="empty">
          <p>Agrega a dónde va cada parte de tu quincena.</p>
          <button onClick={loadBase}>Cargar lista base</button>
        </div>
      ) : (
        <>
          <ul className="moves">
            {moves.map((m) => (
              <li key={m.id} className={m.done ? 'done' : ''}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={m.done}
                    onChange={(e) => patchMove(m.id, { done: e.target.checked })}
                    aria-label={`Ya quedó ${m.name || m.dest}`}
                  />
                </label>
                <input
                  placeholder="Concepto"
                  value={m.name}
                  onChange={(e) => patchMove(m.id, { name: e.target.value })}
                  aria-label="Concepto"
                />
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={m.amount}
                  onChange={(e) => patchMove(m.id, { amount: e.target.value })}
                  aria-label="Monto"
                />
                <input
                  list="places"
                  placeholder="Cuenta"
                  value={m.dest}
                  onChange={(e) => patchMove(m.id, { dest: e.target.value })}
                  aria-label="Cuenta"
                />
                <button className="ghost" onClick={() => remove(m.id)} aria-label={`Borrar ${m.name || m.dest}`}>
                  Borrar
                </button>
              </li>
            ))}
          </ul>
          <div className="bar">
            <button onClick={uncheckAll} disabled={!moves.some((m) => m.done)}>
              Nueva quincena (quitar palomitas)
            </button>
          </div>
        </>
      )}

      <section className="panel summary">
        <pre>{message}</pre>
        <button className="primary" onClick={copy}>
          {copied ? '¡Copiado!' : 'Copiar mensaje'}
        </button>
      </section>
      <p className="hint">
        Tus movimientos se quedan guardados para la siguiente quincena; solo cambia los montos y quita las palomitas.
      </p>
    </>
  )
}
