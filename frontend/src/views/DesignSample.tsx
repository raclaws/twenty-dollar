import { createSignal, For, type Component } from 'solid-js'

const SAMPLE_DATA = [
  { name: 'Rent', assigned: 2500000, activity: -2500000, available: 0, target: 2500000, targetType: 'monthly', funded: 1.0 },
  { name: 'Groceries', assigned: 500000, activity: -180000, available: 320000, target: 500000, targetType: 'monthly', funded: 1.0 },
  { name: 'Transport', assigned: 300000, activity: -260000, available: 40000, target: 300000, targetType: 'monthly', funded: 1.0 },
  { name: 'Dining Out', assigned: 200000, activity: -250000, available: -50000, target: 200000, targetType: 'monthly', funded: 1.0 },
  { name: 'Entertainment', assigned: 100000, activity: -25000, available: 75000, target: null, targetType: null, funded: null },
  { name: 'Vacation Fund', assigned: 500000, activity: 0, available: 500000, target: 5000000, targetType: 'savings', funded: 0.6 },
  { name: 'Utilities', assigned: 300000, activity: -285000, available: 15000, target: 300000, targetType: 'monthly', funded: 1.0 },
  { name: 'Insurance', assigned: 400000, activity: -400000, available: 0, target: 400000, targetType: 'monthly', funded: 1.0 },
]

function formatMoney(amount: number) {
  const abs = Math.abs(amount)
  const formatted = new Intl.NumberFormat('id-ID').format(abs)
  return amount < 0 ? `-${formatted}` : formatted
}

function availabilityColor(available: number, assigned: number) {
  if (available <= 0) return 'var(--c-negative)'
  if (assigned === 0) return 'var(--c-surface1)'
  const ratio = available / assigned
  if (ratio >= 0.3) return 'var(--c-positive)'
  return 'var(--c-warning)'
}

function targetColor(funded: number | null) {
  if (funded === null) return 'var(--c-overlay0)'
  if (funded >= 1) return 'var(--c-overlay0)'
  if (funded > 0) return 'var(--c-warning)'
  return 'var(--c-negative)'
}

function fundedPct(funded: number | null): string {
  if (funded === null) return '—'
  return `${Math.round(funded * 100)}%`
}

function availPct(available: number, assigned: number): string {
  if (assigned === 0) return '—'
  return `${Math.round((available / assigned) * 100)}%`
}

function statusText(row: typeof SAMPLE_DATA[0]): string {
  if (row.available <= 0 && row.activity < 0) return 'Overspent'
  if (row.funded !== null && row.funded < 1) return 'Underfunded'
  if (row.assigned === 0) return 'No budget'
  if (row.available <= 0) return 'Spent'
  const ratio = row.available / row.assigned
  if (ratio < 0.3) return 'Running low'
  return 'On track'
}

const DesignSample: Component = () => {
  const [mode, setMode] = createSignal<'dense' | 'default' | 'text'>('default')

  const cellRight = { 'text-align': 'right' as const, 'font-family': 'var(--font-mono)', 'font-size': 'var(--fs-sm)', 'font-weight': '500' }

  return (
    <div style={{ padding: '32px', background: 'var(--c-base)', 'min-height': '100vh', 'font-family': 'var(--font)' }}>
      <h1 style={{ color: 'var(--c-text)', 'font-size': 'var(--fs-xl)', 'margin-bottom': '8px' }}>Density Comparison</h1>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '24px' }}>
        <button
          style={{ padding: '6px 12px', background: mode() === 'dense' ? 'var(--c-interactive)' : 'var(--c-surface0)', color: mode() === 'dense' ? '#fff' : 'var(--c-text)', border: 'none', 'border-radius': '2px', cursor: 'pointer', 'font-size': 'var(--fs-sm)' }}
          onClick={() => setMode('dense')}
        >Dense (numbers only)</button>
        <button
          style={{ padding: '6px 12px', background: mode() === 'default' ? 'var(--c-interactive)' : 'var(--c-surface0)', color: mode() === 'default' ? '#fff' : 'var(--c-text)', border: 'none', 'border-radius': '2px', cursor: 'pointer', 'font-size': 'var(--fs-sm)' }}
          onClick={() => setMode('default')}
        >Default (icons + numbers)</button>
        <button
          style={{ padding: '6px 12px', background: mode() === 'text' ? 'var(--c-interactive)' : 'var(--c-surface0)', color: mode() === 'text' ? '#fff' : 'var(--c-text)', border: 'none', 'border-radius': '2px', cursor: 'pointer', 'font-size': 'var(--fs-sm)' }}
          onClick={() => setMode('text')}
        >Text (all words)</button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--c-base)', overflow: 'hidden', 'max-width': '960px' }}>

        {/* ═══ DENSE MODE ═══ numbers only, color = status */}
        {mode() === 'dense' && (
          <div>
            <div style={{
              display: 'grid',
              'grid-template-columns': '1fr 100px 100px 100px 80px 50px',
              height: '32px',
              'align-items': 'center',
              padding: '0 12px',
              background: 'var(--c-mantle)',
              'font-size': '11px',
              'font-weight': '600',
              color: 'var(--c-overlay0)',
              'letter-spacing': '0.5px',
              'text-transform': 'uppercase',
            }}>
              <div>Category</div>
              <div style={{ 'text-align': 'right' }}>Assigned</div>
              <div style={{ 'text-align': 'right' }}>Activity</div>
              <div style={{ 'text-align': 'right' }}>Available</div>
              <div style={{ 'text-align': 'right' }}>Target</div>
              <div style={{ 'text-align': 'right' }}>%</div>
            </div>
            <For each={SAMPLE_DATA}>
              {(row) => {
                const avlColor = availabilityColor(row.available, row.assigned)
                const tgtColor = targetColor(row.funded)
                return (
                  <div style={{
                    display: 'grid',
                    'grid-template-columns': '1fr 100px 100px 100px 80px 50px',
                    height: '36px',
                    'align-items': 'center',
                    padding: '0 12px',
                    transition: 'background 100ms ease',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--c-surface0)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = ''}
                  >
                    <div style={{ color: 'var(--c-text)', 'font-size': 'var(--fs-sm)', 'white-space': 'nowrap', overflow: 'hidden' }}>{row.name}</div>
                    <div style={{ ...cellRight, color: 'var(--c-text)' }}>{formatMoney(row.assigned)}</div>
                    <div style={{ ...cellRight, color: 'var(--c-subtext0)' }}>{formatMoney(row.activity)}</div>
                    <div style={{ ...cellRight, color: avlColor }}>{formatMoney(row.available)}</div>
                    <div style={{ ...cellRight, color: tgtColor }}>{row.target ? formatMoney(row.target) : '—'}</div>
                    <div style={{ ...cellRight, color: tgtColor, 'font-size': '11px' }}>{fundedPct(row.funded)}</div>
                  </div>
                )
              }}
            </For>
          </div>
        )}

        {/* ═══ DEFAULT MODE ═══ icons + numbers (current design) */}
        {mode() === 'default' && (
          <div>
            <div style={{
              display: 'grid',
              'grid-template-columns': '1fr 110px 110px 110px 70px 60px',
              height: '32px',
              'align-items': 'center',
              padding: '0 12px',
              background: 'var(--c-mantle)',
              'font-size': '11px',
              'font-weight': '600',
              color: 'var(--c-overlay0)',
              'letter-spacing': '0.5px',
              'text-transform': 'uppercase',
            }}>
              <div>Category</div>
              <div style={{ 'text-align': 'right' }}>Assigned</div>
              <div style={{ 'text-align': 'right' }}>Activity</div>
              <div style={{ 'text-align': 'right' }}>Available</div>
              <div style={{ 'text-align': 'right' }}>Target</div>
              <div style={{ 'text-align': 'center' }}>Health</div>
            </div>
            <For each={SAMPLE_DATA}>
              {(row) => {
                const avlColor = availabilityColor(row.available, row.assigned)
                const tgtColor = targetColor(row.funded)
                const sunsetLevel = row.assigned === 0 ? 0 : row.available < 0 ? 0 : Math.min(row.available / row.assigned, 1)
                return (
                  <div style={{
                    display: 'grid',
                    'grid-template-columns': '1fr 110px 110px 110px 70px 60px',
                    height: '44px',
                    'align-items': 'center',
                    padding: '0 12px',
                    transition: 'background 100ms ease',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--c-surface0)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = ''}
                  >
                    <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', overflow: 'hidden' }}>
                      <TargetDot funded={row.funded} />
                      <span style={{ color: 'var(--c-text)', 'font-size': 'var(--fs-md)', 'white-space': 'nowrap' }}>{row.name}</span>
                    </div>
                    <div style={{ ...cellRight, color: 'var(--c-text)' }}>{formatMoney(row.assigned)}</div>
                    <div style={{ ...cellRight, color: 'var(--c-subtext0)' }}>{formatMoney(row.activity)}</div>
                    <div style={{ ...cellRight, color: avlColor }}>{formatMoney(row.available)}</div>
                    <div style={{ ...cellRight, color: tgtColor, 'font-size': '11px' }}>{fundedPct(row.funded)}</div>
                    <div style={{ display: 'flex', 'justify-content': 'center' }}>
                      <SunsetCircle level={sunsetLevel} color={avlColor} size={18} />
                    </div>
                  </div>
                )
              }}
            </For>
          </div>
        )}

        {/* ═══ TEXT MODE ═══ all words, no numbers */}
        {mode() === 'text' && (
          <div>
            <div style={{
              display: 'grid',
              'grid-template-columns': '1fr 120px 120px',
              height: '32px',
              'align-items': 'center',
              padding: '0 12px',
              background: 'var(--c-mantle)',
              'font-size': '11px',
              'font-weight': '600',
              color: 'var(--c-overlay0)',
              'letter-spacing': '0.5px',
              'text-transform': 'uppercase',
            }}>
              <div>Category</div>
              <div>Target</div>
              <div>Status</div>
            </div>
            <For each={SAMPLE_DATA}>
              {(row) => {
                const avlColor = availabilityColor(row.available, row.assigned)
                const tgtColor = targetColor(row.funded)
                const status = statusText(row)
                const targetLabel = row.target
                  ? row.funded !== null && row.funded >= 1 ? 'Funded' : `${fundedPct(row.funded)} funded`
                  : 'No target'
                return (
                  <div style={{
                    display: 'grid',
                    'grid-template-columns': '1fr 120px 120px',
                    height: '44px',
                    'align-items': 'center',
                    padding: '0 12px',
                    transition: 'background 100ms ease',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--c-surface0)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = ''}
                  >
                    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '1px' }}>
                      <span style={{ color: 'var(--c-text)', 'font-size': 'var(--fs-md)' }}>{row.name}</span>
                      <span style={{ color: 'var(--c-overlay0)', 'font-size': '12px' }}>
                        {formatMoney(row.assigned)} budgeted
                      </span>
                    </div>
                    <div style={{ color: tgtColor, 'font-size': 'var(--fs-sm)' }}>{targetLabel}</div>
                    <div style={{ color: avlColor, 'font-size': 'var(--fs-sm)', 'font-weight': '500' }}>{status}</div>
                  </div>
                )
              }}
            </For>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ 'max-width': '960px', 'margin-top': '24px', padding: '16px', background: 'var(--c-surface0)', 'border-radius': '2px' }}>
        <div style={{ display: 'flex', gap: '32px', 'font-size': 'var(--fs-sm)', color: 'var(--c-subtext0)' }}>
          <div style={{ flex: '1' }}>
            <div style={{ 'font-weight': '600', color: 'var(--c-text)', 'margin-bottom': '4px' }}>Dense</div>
            <div>36px rows. Pure numbers. Color = status.</div>
            <div>6 columns. No icons. Maximum data density.</div>
            <div style={{ color: 'var(--c-overlay0)', 'margin-top': '4px' }}>Best for: power users, 20+ categories visible</div>
          </div>
          <div style={{ flex: '1' }}>
            <div style={{ 'font-weight': '600', color: 'var(--c-text)', 'margin-bottom': '4px' }}>Default</div>
            <div>44px rows. Target dot + sunset circle.</div>
            <div>Numbers + visual indicators. Balanced.</div>
            <div style={{ color: 'var(--c-overlay0)', 'margin-top': '4px' }}>Best for: daily use, quick scan + edit</div>
          </div>
          <div style={{ flex: '1' }}>
            <div style={{ 'font-weight': '600', color: 'var(--c-text)', 'margin-bottom': '4px' }}>Text</div>
            <div>44px rows. Natural language status.</div>
            <div>No mental math. "On track" / "Running low".</div>
            <div style={{ color: 'var(--c-overlay0)', 'margin-top': '4px' }}>Best for: casual glance, mobile, new users</div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Minimal target dot — 8px circle, inline with name
function TargetDot(props: { funded: number | null }) {
  const color = targetColor(props.funded)
  const filled = props.funded !== null && props.funded > 0
  return (
    <svg width={8} height={8} viewBox="0 0 8 8" style={{ 'flex-shrink': '0' }}>
      {filled
        ? <circle cx={4} cy={4} r={3.5} fill={color} />
        : <circle cx={4} cy={4} r={3} fill="none" stroke={color} stroke-width={1.5} stroke-dasharray={props.funded === null ? '2 2' : '0'} />
      }
    </svg>
  )
}

let sunsetCounter = 0
function SunsetCircle(props: { level: number; color: string; size?: number }) {
  const id = `clip-sunset-${sunsetCounter++}`
  const s = props.size ?? 22
  const fillH = Math.max(0, Math.min(1, props.level)) * s
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <defs>
        <clipPath id={id}>
          <circle cx={s/2} cy={s/2} r={s/2} />
        </clipPath>
      </defs>
      <circle cx={s/2} cy={s/2} r={s/2} fill="var(--c-surface0)" />
      <rect x={0} y={s - fillH} width={s} height={fillH} fill={props.color} clip-path={`url(#${id})`} />
    </svg>
  )
}

export default DesignSample
