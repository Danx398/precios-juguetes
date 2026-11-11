import { useEffect, useMemo, useState } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import Quincena from './Quincena.jsx'
import { money } from './money.js'

const KEY = 'juguetes-precios-v1'

// Costo + porcentaje (ej. 100 + 30% = 130)
const withMarkup = (cost, percent) => Math.round(cost * (100 + percent)) / 100

// Redondea hacia arriba al siguiente múltiplo (ej. 135 con paso 50 -> 150)
const roundUp = (n, step) =>
  step > 0 ? Math.ceil(n / step - 1e-9) * step : n

// Calcomanías en hoja carta: ancho x alto en mm, letra en pt
const LABEL_SIZES = {
  s: { label: 'Chica 3 x 1.5 cm (102 por hoja)', w: 30, h: 15, name: 6, price: 12 },
  m: { label: 'Mediana 3.8 x 2 cm (65 por hoja)', w: 38, h: 20, name: 7, price: 15 },
  l: { label: 'Grande 4.8 x 2.5 cm (40 por hoja)', w: 48, h: 25, name: 9, price: 19 },
}
const PAGE = { w: 215.9, h: 279.4, margin: 8 }
const PT = 0.3528 // 1 pt en mm
const LABEL_GAP = 2.6 // espacio entre nombre y precio (mm, ~10 px)

const labelCount = (n) => Math.max(0, Math.floor(Number(n) || 0))

const load = () => {
  try {
    const d = JSON.parse(localStorage.getItem(KEY))
    if (d && Array.isArray(d.items)) return d
  } catch {}
  return { items: [], percent: 30, step: 10 }
}

function Juguetes() {
  const [data, setData] = useState(load)
  const [name, setName] = useState('')
  const [cost, setCost] = useState('')
  const [q, setQ] = useState('')
  const { items, percent, step, labelSize = 'm' } = data

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(data))
    } catch {}
  }, [data])

  const set = (patch) => setData((d) => ({ ...d, ...patch }))
  const patchItem = (id, patch) =>
    set({ items: items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })

  const rows = useMemo(
    () =>
      items
        .filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()))
        .map((i) => {
          const c = Number(i.cost) || 0
          const suggested = roundUp(withMarkup(c, percent), step)
          const final = i.final !== '' ? Number(i.final) : suggested
          return { ...i, c, suggested, final, profit: final - c, labels: i.labels ?? 1 }
        }),
    [items, percent, step, q]
  )

  const totalLabels = rows.reduce((sum, r) => sum + labelCount(r.labels), 0)

  const add = (e) => {
    e.preventDefault()
    if (!name.trim() || cost === '') return
    set({
      items: [
        { id: Date.now() + Math.random(), name: name.trim(), cost, final: '', labels: 1 },
        ...items,
      ],
    })
    setName('')
    setCost('')
  }

  const remove = (id) => {
    if (confirm('¿Borrar este juguete?')) set({ items: items.filter((i) => i.id !== id) })
  }

  const exportPdf = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('Lista de precios de juguetes', 14, 16)
    doc.setFontSize(10)
    doc.text(
      `${new Date().toLocaleDateString('es-MX')} - Ganancia: ${percent}% sobre el costo`,
      14,
      23
    )
    autoTable(doc, {
      startY: 28,
      head: [['Juguete', 'Costo', 'Precio final', 'Ganancia']],
      body: rows.map((r) => [r.name, money(r.c), money(r.final), money(r.profit)]),
      headStyles: { fillColor: [59, 91, 255] },
    })
    doc.save('precios-juguetes.pdf')
  }

  const exportLabels = () => {
    const size = LABEL_SIZES[labelSize] || LABEL_SIZES.m
    const { w, h } = size
    const cols = Math.floor((PAGE.w - PAGE.margin * 2) / w)
    const gridRows = Math.floor((PAGE.h - PAGE.margin * 2) / h)
    const left = (PAGE.w - cols * w) / 2
    const top = (PAGE.h - gridRows * h) / 2
    const pad = 1.5
    const perPage = cols * gridRows
    const labels = rows.flatMap((r) => Array(labelCount(r.labels)).fill(r))

    const doc = new jsPDF({ unit: 'mm', format: 'letter' })
    doc.setLineDashPattern([1.5, 1.5], 0)
    doc.setDrawColor(170)

    labels.forEach((r, n) => {
      if (n > 0 && n % perPage === 0) doc.addPage()
      const slot = n % perPage
      const x = left + (slot % cols) * w
      const y = top + Math.floor(slot / cols) * h
      const cx = x + w / 2

      // Línea punteada para recortar
      doc.rect(x, y, w, h)

      // Nombre: máximo 2 líneas
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(size.name)
      let lines = doc.splitTextToSize(r.name, w - pad * 2)
      if (lines.length > 2) lines = [lines[0], lines[1].replace(/.{0,3}$/, '...')]

      // Precio: se achica si no cabe a lo ancho
      const price = money(r.final)
      let fs = size.price
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(fs)
      while (fs > 6 && doc.getTextWidth(price) > w - pad * 2) doc.setFontSize(--fs)

      // Nombre + espacio + precio, centrados en la calcomanía
      const nameLine = size.name * PT
      const nameBlock = nameLine * (0.72 + (lines.length - 1) * 1.15)
      const priceCap = fs * PT * 0.72
      const startY = y + (h - (nameBlock + LABEL_GAP + priceCap)) / 2

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(size.name)
      lines.forEach((line, k) => {
        doc.text(line, cx, startY + nameLine * (0.72 + k * 1.15), { align: 'center' })
      })
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(fs)
      doc.text(price, cx, startY + nameBlock + LABEL_GAP + priceCap, { align: 'center' })
    })

    doc.save('calcomanias-juguetes.pdf')
  }

  return (
    <>
      <h1>Precios de juguetes</h1>

      <section className="panel settings">
        <label>
          Ganancia (%)
          <input
            type="number"
            min="0"
            value={percent}
            onChange={(e) => set({ percent: Number(e.target.value) || 0 })}
          />
        </label>
        <label>
          Redondear hacia arriba a
          <select value={step} onChange={(e) => set({ step: Number(e.target.value) })}>
            <option value={0}>No redondear</option>
            <option value={5}>Múltiplos de 5</option>
            <option value={10}>Múltiplos de 10</option>
            <option value={50}>Múltiplos de 50</option>
          </select>
        </label>
        <label>
          Tamaño de calcomanía
          <select value={labelSize} onChange={(e) => set({ labelSize: e.target.value })}>
            {Object.entries(LABEL_SIZES).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <form className="panel add" onSubmit={add}>
        <input
          placeholder="Nombre del juguete"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          placeholder="Costo"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
        />
        <button className="primary">Agregar</button>
      </form>

      <div className="bar">
        <input
          type="search"
          placeholder="Buscar juguete"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button onClick={exportPdf} disabled={!rows.length}>
          Descargar PDF
        </button>
        <button onClick={exportLabels} disabled={!totalLabels}>
          Calcomanías ({totalLabels})
        </button>
      </div>

      {items.length === 0 ? (
        <p className="empty">Aún no hay juguetes. Agrega el primero con su costo.</p>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Juguete</th>
                <th>Costo</th>
                <th>Con {percent}%</th>
                <th>Precio final</th>
                <th>Ganancia</th>
                <th>Calcomanías</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="name" data-label="Juguete">
                    <input value={r.name} onChange={(e) => patchItem(r.id, { name: e.target.value })} />
                  </td>
                  <td data-label="Costo">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={r.cost}
                      onChange={(e) => patchItem(r.id, { cost: e.target.value })}
                    />
                  </td>
                  <td className="muted" data-label={`Con ${percent}%`}>
                    {money(withMarkup(r.c, percent))}
                  </td>
                  <td data-label="Precio final">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      className="final"
                      placeholder={String(r.suggested)}
                      value={r.final === r.suggested && items.find((i) => i.id === r.id).final === '' ? '' : r.final}
                      onChange={(e) => patchItem(r.id, { final: e.target.value })}
                    />
                  </td>
                  <td className="profit" data-label="Ganancia">
                    {money(r.profit)}
                  </td>
                  <td data-label="Calcomanías">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      className="qty"
                      value={r.labels}
                      onChange={(e) => patchItem(r.id, { labels: e.target.value })}
                      aria-label={`Calcomanías de ${r.name}`}
                    />
                  </td>
                  <td className="del">
                    <button className="ghost" onClick={() => remove(r.id)} aria-label={`Borrar ${r.name}`}>
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">
        El precio final se llena solo con el redondeo. Si quieres otro precio, escríbelo en esa casilla.
      </p>
      <p className="hint">
        Calcomanías: elige cuántas quieres de cada juguete (0 para ninguna). Imprime el PDF en papel
        adhesivo tamaño carta a <strong>tamaño real (100%)</strong> y recorta por las líneas punteadas.
      </p>
    </>
  )
}

const TABS = { juguetes: 'Juguetes', quincena: 'Quincena' }

export default function App() {
  const [tab, setTab] = useState(() => {
    try {
      return localStorage.getItem('tab') || 'juguetes'
    } catch {
      return 'juguetes'
    }
  })

  const choose = (t) => {
    setTab(t)
    try {
      localStorage.setItem('tab', t)
    } catch {}
  }

  return (
    <main className="wrap">
      <nav className="tabs">
        {Object.entries(TABS).map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => choose(k)}>
            {label}
          </button>
        ))}
      </nav>
      {tab === 'quincena' ? <Quincena /> : <Juguetes />}
    </main>
  )
}
