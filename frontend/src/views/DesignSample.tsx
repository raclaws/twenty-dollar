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

function targetColor(funded: number | null) {
  if (funded === null) return 'var(--c-surface1)'
  if (funded >= 1) return 'var(--c-positive)'
  if (funded > 0) return 'var(--c-warning)'
  return 'var(--c-negative)'
}

function availabilityColor(available: number, assigned: number) {
  if (available <= 0) return 'var(--c-negative)'
  if (assigned === 0) return 'var(--c-surface1)'
  const ratio = available / assigned
  if (ratio >= 0.3) return 'var(--c-positive)'
  return 'var(--c-warning)'
}

function SunsetCircle(props: { level: number; color: string; size?: number }) {
  const s = props.size ?? 22
  const fillH = Math.max(0, Math.min(1, props.level)) * s
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <defs>
        <clipPath id={`clip-sunset-${Math.round(props.level * 1000)}-${s}`}>
          <circle cx={s/2} cy={s/2} r={s/2} />
        </clipPath>
      </defs>
      <circle cx={s/2} cy={s/2} r={s/2} fill="var(--c-surface0)" />
      <rect
        x={0} y={s - fillH} width={s} height={fillH}
        fill={props.color}
        clip-path={`url(#clip-sunset-${Math.round(props.level * 1000)}-${s})`}
        opacity={0.85}
      />
    </svg>
  )
}

function TargetRing(props: { progress: number; color: string; size?: number }) {
  const s = props.size ?? 22
  const r = (s - 4) / 2
  const circumference = 2 * Math.PI * r
  const filled = Math.max(0, Math.min(1, props.progress)) * circumference
  const gap = circumference - filled
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={s/2} cy={s/2} r={r} fill="none" stroke="var(--c-surface0)" stroke-width={3} />
      <circle cx={s/2} cy={s/2} r={r} fill="none" stroke={props.color} stroke-width={3}
        stroke-dasharray={`${filled} ${gap}`}
        stroke-linecap="butt"
      />
    </svg>
  )
}

const DesignSample: Component = () => {
  const [showAmounts, setShowAmounts] = createSignal(true)

  return (
    <div style={{ padding: '32px', background: 'var(--c-base)', 'min-height': '100vh', 'font-family': 'var(--font)' }}>
      <h1 style={{ color: 'var(--c-text)', 'font-size': 'var(--fs-xl)', 'margin-bottom': '8px' }}>Design Sample — Budget Table</h1>
      <p style={{ color: 'var(--c-overlay0)', 'font-size': 'var(--fs-sm)', 'margin-bottom': '24px' }}>
        Click ◂/▸ to toggle amounts. Ring = target funded %. Sunset = availability remaining.
        <br />Colors independent: ring = planning health, sunset = spending health. No overlap.
      </p>

      {/* Table */}
      <div style={{ background: 'var(--c-base)', 'border-radius': '2px', overflow: 'hidden', 'max-width': '900px' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          'align-items': 'center',
          height: '32px',
          padding: '0 12px',
          background: 'var(--c-mantle)',
          'font-size': 'var(--fs-xs)',
          'font-weight': '600',
          color: 'var(--c-overlay0)',
          'letter-spacing': '0.5px',
          'text-transform': 'uppercase',
        }}>
          <div style={{ flex: '1', 'min-width': '180px' }}>Category</div>
          {showAmounts() && (
            <div style={{ display: 'flex' }}>
              <div style={{ width: '120px', 'text-align': 'right' }}>Assigned</div>
              <div style={{ width: '120px', 'text-align': 'right' }}>Activity</div>
              <div style={{ width: '120px', 'text-align': 'right' }}>Available</div>
            </div>
          )}
          <div style={{ display: 'flex', 'align-items': 'center', gap: '12px', width: '80px', 'justify-content': 'center' }}>
            <span style={{ 'font-size': '9px', color: 'var(--c-overlay0)' }}>TGT</span>
            <span style={{ 'font-size': '9px', color: 'var(--c-overlay0)' }}>AVL</span>
          </div>
          <div
            style={{
              width: '24px',
              'text-align': 'center',
              cursor: 'pointer',
              color: 'var(--c-positive)',
              'user-select': 'none',
              'font-size': 'var(--fs-sm)',
            }}
            onClick={() => setShowAmounts(!showAmounts())}
            title={showAmounts() ? 'Hide amounts' : 'Show amounts'}
          >
            {showAmounts() ? '◂' : '▸'}
          </div>
        </div>

        {/* Group Header — bg fill bar as progress indicator */}
        {(() => {
          const groupAssigned = SAMPLE_DATA.reduce((s, r) => s + r.assigned, 0)
          const groupActivity = SAMPLE_DATA.reduce((s, r) => s + r.activity, 0)
          const groupAvailable = SAMPLE_DATA.reduce((s, r) => s + r.available, 0)
          const groupFillPct = groupAssigned > 0 ? Math.max(0, Math.min(1, groupAvailable / groupAssigned)) : 0
          const groupColor = availabilityColor(groupAvailable, groupAssigned)
          return (
            <div style={{
              position: 'relative',
              display: 'flex',
              'align-items': 'center',
              height: '40px',
              padding: '0 12px',
              overflow: 'hidden',
              'font-weight': '700',
              color: 'var(--c-text)',
              'font-size': 'var(--fs-sm)',
            }}>
              {/* Background fill bar */}
              <div style={{
                position: 'absolute',
                left: '0',
                top: '0',
                height: '100%',
                width: `${groupFillPct * 100}%`,
                background: groupColor,
                opacity: '0.15',
                transition: 'width 300ms ease',
              }} />
              {/* Content on top */}
              <div style={{ flex: '1', 'min-width': '180px', 'z-index': '1' }}>Needs</div>
              {showAmounts() && (
                <div style={{ display: 'flex', 'font-family': 'var(--font-mono)', 'z-index': '1' }}>
                  <div style={{ width: '120px', 'text-align': 'right' }}>{formatMoney(groupAssigned)}</div>
                  <div style={{ width: '120px', 'text-align': 'right' }}>{formatMoney(groupActivity)}</div>
                  <div style={{ width: '120px', 'text-align': 'right', color: groupColor }}>{formatMoney(groupAvailable)}</div>
                </div>
              )}
              <div style={{ width: '80px', 'z-index': '1' }} />
              <div style={{ width: '24px', 'z-index': '1' }} />
            </div>
          )
        })()}

        {/* Rows */}
        <For each={SAMPLE_DATA}>
          {(row) => {
            const tgtColor = () => targetColor(row.funded)
            const avlColor = () => availabilityColor(row.available, row.assigned)
            const targetFill = () => row.funded ?? 0
            const sunsetLevel = () => {
              if (row.available < 0) return 0
              if (row.assigned === 0) return 0
              return Math.min(row.available / row.assigned, 1)
            }

            return (
              <div style={{
                display: 'flex',
                'align-items': 'center',
                height: '44px',
                padding: '0 12px',
                background: 'var(--c-base)',
                transition: 'background 100ms ease',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--c-surface0)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--c-base)'}
              >
                {/* Category — left */}
                <div style={{ flex: '1', 'min-width': '180px', overflow: 'hidden' }}>
                  <div style={{ color: 'var(--c-text)', 'font-size': 'var(--fs-md)' }}>{row.name}</div>
                  {row.target && (
                    <div style={{ 'font-size': 'var(--fs-xs)', color: 'var(--c-overlay0)', 'margin-top': '1px' }}>
                      {row.funded !== null && row.funded >= 1
                        ? `${formatMoney(row.target)} — ${row.targetType}`
                        : `${formatMoney(row.target - (row.funded ?? 0) * row.target)} more — ${row.targetType}`
                      }
                    </div>
                  )}
                </div>

                {/* Amounts — middle (only when shown) */}
                {showAmounts() && (
                  <div style={{ display: 'flex', 'font-family': 'var(--font-mono)', 'font-size': 'var(--fs-md)' }}>
                    <div style={{ width: '120px', 'text-align': 'right', color: 'var(--c-text)' }}>
                      {formatMoney(row.assigned)}
                    </div>
                    <div style={{ width: '120px', 'text-align': 'right', color: 'var(--c-subtext0)' }}>
                      {formatMoney(row.activity)}
                    </div>
                    <div style={{ width: '120px', 'text-align': 'right', 'font-weight': '500', color: avlColor() }}>
                      {formatMoney(row.available)}
                    </div>
                  </div>
                )}

                {/* Circles — own column, always visible, aligned */}
                <div style={{ display: 'flex', gap: '8px', width: '80px', 'flex-shrink': '0', 'justify-content': 'center', 'align-items': 'center' }}>
                  <TargetRing progress={targetFill()} color={tgtColor()} size={22} />
                  <SunsetCircle level={sunsetLevel()} color={avlColor()} size={22} />
                </div>

                {/* Toggle spacer */}
                <div style={{ width: '24px' }} />
              </div>
            )
          }}
        </For>
      </div>

      {/* Legend */}
      <div style={{ 'max-width': '900px', 'margin-top': '24px', padding: '16px', background: 'var(--c-surface0)', 'border-radius': '2px' }}>
        <div style={{ display: 'flex', gap: '32px', 'font-size': 'var(--fs-sm)', color: 'var(--c-subtext0)' }}>
          <div style={{ flex: '1' }}>
            <div style={{ 'font-weight': '600', color: 'var(--c-text)', 'margin-bottom': '8px' }}>◔ Target Ring (planning)</div>
            <div>Fill = assigned / target (how much of goal is funded)</div>
            <div style={{ 'margin-top': '4px' }}>Color:</div>
            <div style={{ color: 'var(--c-positive)', 'margin-top': '2px' }}>● Green — fully funded (assigned ≥ target)</div>
            <div style={{ color: 'var(--c-warning)', 'margin-top': '2px' }}>● Yellow — partially funded (0 &lt; assigned &lt; target)</div>
            <div style={{ color: 'var(--c-negative)', 'margin-top': '2px' }}>● Red — unfunded (assigned = 0, target exists)</div>
            <div style={{ color: 'var(--c-overlay0)', 'margin-top': '2px' }}>● Grey — no target set</div>
          </div>
          <div style={{ flex: '1' }}>
            <div style={{ 'font-weight': '600', color: 'var(--c-text)', 'margin-bottom': '8px' }}>◕ Sunset Circle (execution)</div>
            <div>Fill = available / assigned (what's left to spend)</div>
            <div style={{ 'margin-top': '4px' }}>Color:</div>
            <div style={{ color: 'var(--c-positive)', 'margin-top': '2px' }}>● Green — comfortable (≥30% remaining)</div>
            <div style={{ color: 'var(--c-warning)', 'margin-top': '2px' }}>● Yellow — running low (&lt;30% remaining)</div>
            <div style={{ color: 'var(--c-negative)', 'margin-top': '2px' }}>● Red — overspent (available ≤ 0)</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DesignSample
