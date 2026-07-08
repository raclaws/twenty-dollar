import { useState, useRef, useEffect, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { ArrowRight, Wallet } from 'lucide-react';
import { useStore } from '@/lib/store-context';
import { formatCurrency, parseCurrencyToCents } from '@/lib/format';
import { computeBudget } from '@/engine/budget';
import type { CategoryBudget } from '@/engine/types';
import { EntityPicker } from '@/components/shared/EntityPicker';
import type { PickerSection } from '@/components/shared/EntityPicker';

const RTA_ID = '__rta__';

export interface TransferTarget {
  catId: string;
  catName: string;
  side: 'from' | 'to';
}

interface CoverDialogProps {
  open: boolean;
  target?: TransferTarget | null;
  onClose: () => void;
}

export const CoverDialog = observer(function CoverDialog({ open, target, onClose }: CoverDialogProps) {
  const { budgetStore, categoryStore, transactionStore, undoStore } = useStore();
  const month = budgetStore.currentMonth;

  const [fromId, setFromId] = useState('');
  const [fromLabel, setFromLabel] = useState('');
  const [toId, setToId] = useState('');
  const [toLabel, setToLabel] = useState('');
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [amountInput, setAmountInput] = useState('');
  const [error, setError] = useState('');
  const fromPickerJustClosed = useRef(false);
  const toPickerJustClosed = useRef(false);
  const dlgRef = useRef<HTMLDivElement>(null);
  const fromTriggerRef = useRef<HTMLDivElement>(null);
  const toTriggerRef = useRef<HTMLDivElement>(null);

  // Compute budget
  const groups = categoryStore.sortedGroups;
  const allCategories = categoryStore.flatCategories;
  const transactions = Array.from(transactionStore.transactions.values());
  const splitEntries: import('@/types').SplitEntry[] = [];
  for (const tx of transactions) {
    const splits = transactionStore.splitsForTransaction(tx.id);
    splitEntries.push(...splits);
  }
  const assignments = Array.from(budgetStore.assignments.values());
  const budgetMonth = computeBudget(groups, allCategories, transactions, splitEntries, assignments, month);

  const categories = budgetMonth.groups.flatMap((g) => g.categories);
  const rta = budgetMonth.rta;

  function availableFor(id: string): number {
    if (id === RTA_ID) return rta;
    const cat = categories.find((c) => c.categoryId === id);
    return cat?.available ?? 0;
  }

  function labelFor(id: string): string {
    if (id === RTA_ID) return 'Ready to Assign';
    const cat = categories.find((c) => c.categoryId === id);
    if (cat) {
      const catData = categoryStore.getCategory(cat.categoryId);
      return catData?.name ?? '';
    }
    return '';
  }

  const fromSections: PickerSection[] = [
    { key: 'budget', label: 'Budget', items: [{ id: RTA_ID, label: 'Ready to Assign', meta: formatCurrency(rta) }] },
    { key: 'categories', label: 'Category', items: categories
      .filter((c) => c.categoryId !== toId)
      .filter((c) => c.available > 0)
      .map((c) => {
        const catData = categoryStore.getCategory(c.categoryId);
        return { id: c.categoryId, label: catData?.name ?? '', meta: formatCurrency(c.available) };
      })
    },
  ];

  const toSections: PickerSection[] = [
    { key: 'budget', label: 'Budget', items: [{ id: RTA_ID, label: 'Ready to Assign', meta: formatCurrency(rta) }] },
    { key: 'categories', label: 'Category', items: categories
      .filter((c) => c.categoryId !== fromId)
      .map((c) => {
        const catData = categoryStore.getCategory(c.categoryId);
        return { id: c.categoryId, label: catData?.name ?? '', meta: formatCurrency(c.available) };
      })
    },
  ];

  const fromAvailable = availableFor(fromId);
  const toAvailable = availableFor(toId);
  const maxAmount = Math.max(0, fromAvailable);
  const parsedAmount = parseCurrencyToCents(amountInput) ?? 0;
  const isValid = fromId !== '' && toId !== '' && parsedAmount > 0;

  const smartAllAmount = (() => {
    const src = Math.max(0, fromAvailable);
    const destDeficit = toAvailable < 0 ? Math.abs(toAvailable) : 0;
    if (destDeficit > 0) return Math.min(destDeficit, src);
    const destCat = categories.find((c) => c.categoryId === toId);
    const targetGap = destCat?.target && destCat.target.needed > 0 ? destCat.target.needed : 0;
    if (targetGap > 0) return Math.min(targetGap, src);
    return src;
  })();

  function fillMax() {
    if (smartAllAmount > 0) setAmountInput((smartAllAmount / 100).toFixed(2));
  }

  function prefill() {
    if (!target) return;
    if (target.side === 'from') {
      setFromId(target.catId || RTA_ID);
      setFromLabel(target.catName || 'Ready to Assign');
      setToId('');
      setToLabel('');
    } else {
      setToId(target.catId);
      setToLabel(target.catName);
      setFromId('');
      setFromLabel('');
    }
    setAmountInput('');
    setError('');
  }

  function reset() {
    setFromId('');
    setFromLabel('');
    setToId('');
    setToLabel('');
    setAmountInput('');
    setError('');
    setShowFromPicker(false);
    setShowToPicker(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  // Prefill when dialog opens
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      prefill();
      requestAnimationFrame(() => dlgRef.current?.focus());
    }
    prevOpenRef.current = open;
  }, [open, target]);

  function handleFromPick(id: string | null, _section: string) {
    if (!id) return;
    setFromId(id);
    setFromLabel(labelFor(id));
    setShowFromPicker(false);
    setError('');
    requestAnimationFrame(() => dlgRef.current?.focus());
  }

  function handleToPick(id: string | null, _section: string) {
    if (!id) return;
    setToId(id);
    setToLabel(labelFor(id));
    setShowToPicker(false);
    setError('');
    requestAnimationFrame(() => dlgRef.current?.focus());
  }

  function cancelFromPicker() {
    fromPickerJustClosed.current = true;
    setShowFromPicker(false);
    setTimeout(() => { fromPickerJustClosed.current = false; }, 50);
    requestAnimationFrame(() => dlgRef.current?.focus());
  }

  function cancelToPicker() {
    toPickerJustClosed.current = true;
    setShowToPicker(false);
    setTimeout(() => { toPickerJustClosed.current = false; }, 50);
    requestAnimationFrame(() => dlgRef.current?.focus());
  }

  function handleSubmit() {
    if (!isValid) return;
    setError('');

    const amount = parsedAmount;
    const sourceAvail = fromAvailable;

    if (amount <= 0) {
      setError('Amount must be greater than zero');
      return;
    }

    if (fromId !== RTA_ID && amount > sourceAvail) {
      setError(`Exceeds available (${formatCurrency(sourceAvail)})`);
      return;
    }

    const from = fromId;
    const to = toId;

    // Execute the move
    if (from !== RTA_ID && to !== RTA_ID) {
      budgetStore.moveMoney(from, to, month, amount);
    } else if (from === RTA_ID && to !== RTA_ID) {
      // Assign from RTA to category
      const current = budgetStore.assignedForCategory(to, month);
      budgetStore.assign(to, month, current + amount);
    } else if (from !== RTA_ID && to === RTA_ID) {
      // Remove from category back to RTA
      const current = budgetStore.assignedForCategory(from, month);
      budgetStore.assign(from, month, current - amount);
    }

    const fromName = labelFor(from);
    const toName = labelFor(to);

    undoStore.push(
      `Moved ${(amount / 100).toFixed(2)} from ${fromName} to ${toName}`,
      () => {
        if (from !== RTA_ID && to !== RTA_ID) {
          budgetStore.moveMoney(from, to, month, amount);
        } else if (from === RTA_ID && to !== RTA_ID) {
          const cur = budgetStore.assignedForCategory(to, month);
          budgetStore.assign(to, month, cur + amount);
        } else if (from !== RTA_ID && to === RTA_ID) {
          const cur = budgetStore.assignedForCategory(from, month);
          budgetStore.assign(from, month, cur - amount);
        }
      },
      () => {
        if (from !== RTA_ID && to !== RTA_ID) {
          budgetStore.moveMoney(to, from, month, amount);
        } else if (from === RTA_ID && to !== RTA_ID) {
          const cur = budgetStore.assignedForCategory(to, month);
          budgetStore.assign(to, month, cur - amount);
        } else if (from !== RTA_ID && to === RTA_ID) {
          const cur = budgetStore.assignedForCategory(from, month);
          budgetStore.assign(from, month, cur + amount);
        }
      },
    );

    handleClose();
  }

  function handleDialogKeydown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      if (fromPickerJustClosed.current || toPickerJustClosed.current || showFromPicker || showToPicker) return;
      handleClose();
    }
  }

  if (!open) return null;

  // Context card
  const anchorId = target?.catId || '';
  const anchorCat = categories.find((c) => c.categoryId === anchorId);
  const anchorTarget = anchorCat?.target;
  const summary = (() => {
    if (!anchorCat) return '';
    if (anchorCat.available < 0) return `Need ${formatCurrency(Math.abs(anchorCat.available))} to cover overspending`;
    if (anchorTarget && anchorTarget.needed > 0) return `Need ${formatCurrency(anchorTarget.needed)} more to reach target`;
    if (anchorTarget && anchorTarget.needed <= 0) return 'Target met — budget is healthy';
    if (anchorCat.assigned === 0) return 'No budget assigned yet';
    return 'Budget is on track';
  })();

  return (
    <div className="add-txn-overlay" onClick={handleClose}>
      <div
        className="add-txn-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleDialogKeydown}
        tabIndex={-1}
        ref={dlgRef}
      >
        <div className="add-txn-dialog__header">
          <div className="add-txn-dialog__title">
            <span className="add-txn-dialog__icon"><Wallet size={16} /></span>
            <span>Move Budget</span>
          </div>
          <button className="add-txn-dialog__close" onClick={handleClose}>Esc</button>
        </div>

        <div className="add-txn-dialog__body">
          {/* Context card */}
          {anchorCat && (
            <div className="cover-dialog__dest-card">
              <div className="cover-dialog__dest-stats">
                {anchorTarget && (
                  <span>Target: <strong className="cover-dialog__val">{formatCurrency(anchorTarget.amount)}</strong></span>
                )}
                <span>Assigned: <strong className="cover-dialog__val">{formatCurrency(anchorCat.assigned)}</strong></span>
                <span>Spent: <strong className={anchorCat.activity < 0 ? 'cover-dialog__val--negative' : 'cover-dialog__val'}>{formatCurrency(anchorCat.activity)}</strong></span>
                <span>Available: <strong className={anchorCat.available < 0 ? 'cover-dialog__val--negative' : anchorCat.available > 0 ? 'cover-dialog__val--positive' : 'cover-dialog__val'}>{formatCurrency(anchorCat.available)}</strong></span>
              </div>
              <span className={`cover-dialog__dest-summary ${anchorCat.available < 0 ? 'cover-dialog__dest-summary--negative' : anchorTarget && anchorTarget.needed > 0 ? 'cover-dialog__dest-summary--warning' : 'cover-dialog__dest-summary--positive'}`}>
                {summary}
              </span>
            </div>
          )}

          {/* From */}
          <div className="add-txn-dialog__field">
            <label className="add-txn-dialog__label">From</label>
            <div className="add-txn-dialog__input-wrap" style={{ position: 'relative' }}>
              <div
                ref={fromTriggerRef}
                className={`add-txn-dialog__input add-txn-dialog__input--select ${target?.side === 'from' ? 'add-txn-dialog__input--locked' : ''}`}
                onClick={() => { if (target?.side !== 'from') setShowFromPicker(true); }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: '0' }}>
                  {fromLabel || 'Select source...'}
                </span>
                {target?.side !== 'from' ? ' ▾' : ''}
              </div>
              {showFromPicker && (
                <EntityPicker
                  sections={fromSections}
                  value={fromId}
                  placeholder="Search..."
                  onPick={handleFromPick}
                  onCancel={cancelFromPicker}
                  triggerRef={fromTriggerRef}
                />
              )}
            </div>
            {fromId && (
              <span className="cover-dialog__source-hint">
                {formatCurrency(fromAvailable)} available
              </span>
            )}
          </div>

          {/* Arrow */}
          <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--c-overlay0)' }}>
            <ArrowRight size={16} />
          </div>

          {/* To */}
          <div className="add-txn-dialog__field">
            <label className="add-txn-dialog__label">To</label>
            <div className="add-txn-dialog__input-wrap" style={{ position: 'relative' }}>
              <div
                ref={toTriggerRef}
                className={`add-txn-dialog__input add-txn-dialog__input--select ${target?.side === 'to' ? 'add-txn-dialog__input--locked' : ''}`}
                onClick={() => { if (target?.side !== 'to') setShowToPicker(true); }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: '0' }}>
                  {toLabel || 'Select destination...'}
                </span>
                {target?.side !== 'to' ? ' ▾' : ''}
              </div>
              {showToPicker && (
                <EntityPicker
                  sections={toSections}
                  value={toId}
                  placeholder="Search..."
                  onPick={handleToPick}
                  onCancel={cancelToPicker}
                  triggerRef={toTriggerRef}
                />
              )}
            </div>
            {toId && (
              <span className="cover-dialog__source-hint">
                {formatCurrency(toAvailable)} available
              </span>
            )}
          </div>

          {/* Amount */}
          <div className="add-txn-dialog__field">
            <label className="add-txn-dialog__label">Amount</label>
            <div className="cover-dialog__amount-row">
              <input
                className={`add-txn-dialog__input cover-dialog__amount-input ${error ? 'input--error' : ''}`}
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amountInput}
                onChange={(e) => { setAmountInput(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(); } }}
              />
              {fromId && toId && smartAllAmount > 0 && (
                <button className="btn btn--sm btn--ghost cover-dialog__all-btn" onClick={fillMax}>All</button>
              )}
            </div>
            {fromId && toId && smartAllAmount > 0 && (
              <input
                className="cover-dialog__slider"
                type="range"
                min="0"
                max={maxAmount / 100}
                step="0.01"
                value={parsedAmount / 100}
                onChange={(e) => { setAmountInput(e.target.value); setError(''); }}
              />
            )}
            {fromId !== RTA_ID && parsedAmount > 0 && parsedAmount > fromAvailable && (
              <span className="cover-dialog__warning">Exceeds available ({formatCurrency(fromAvailable)})</span>
            )}
          </div>

          {error && (
            <div className="add-txn-dialog__errors"><span className="field-error">{error}</span></div>
          )}
        </div>

        <div className="add-txn-dialog__footer">
          <div className="add-txn-dialog__footer-left" />
          <div className="add-txn-dialog__footer-right">
            <button className="btn btn--sm btn--secondary" onClick={handleClose}>Cancel</button>
            <button className="btn btn--sm btn--primary" disabled={!isValid} onClick={handleSubmit}>
              Move {parsedAmount > 0 ? formatCurrency(parsedAmount) : ''} ⌘Enter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
