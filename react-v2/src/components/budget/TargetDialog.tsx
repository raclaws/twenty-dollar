import { useState, useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { Target, Calendar, Repeat, X } from 'lucide-react';
import { useStore } from '@/lib/store-context';
import { parseCurrencyToCents, formatCurrency } from '@/lib/format';

interface TargetDialogProps {
  open: boolean;
  categoryId: string | null;
  categoryName: string;
  currentTarget: { type: string | null; amount: number | null; date: string | null };
  onClose: () => void;
}

export const TargetDialog = observer(function TargetDialog({
  open,
  categoryId,
  categoryName,
  currentTarget,
  onClose,
}: TargetDialogProps) {
  const { categoryStore } = useStore();
  const [targetType, setTargetType] = useState<'monthly' | 'by_date' | 'savings' | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const dlgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setTargetType(currentTarget.type as 'monthly' | 'by_date' | 'savings' | null);
      setAmount(currentTarget.amount ? (currentTarget.amount / 100).toFixed(2) : '');
      setDate(currentTarget.date ?? '');
      setError('');
      requestAnimationFrame(() => dlgRef.current?.focus());
    }
  }, [open, currentTarget.type, currentTarget.amount, currentTarget.date]);

  function handleKeydown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      const active = document.activeElement as HTMLElement;
      if (active && active !== dlgRef.current && dlgRef.current?.contains(active)) {
        active.blur();
        dlgRef.current?.focus();
        return;
      }
      onClose();
    }
  }

  function handleSave() {
    const type = targetType;

    if (type === null) {
      saveTarget(null, null, null);
      onClose();
      return;
    }

    const cents = parseCurrencyToCents(amount);
    if (cents === null || cents <= 0) {
      setError('Amount must be greater than zero');
      return;
    }

    if (type === 'by_date' && !date) {
      setError('Please select a target date');
      return;
    }

    saveTarget(type, cents, type === 'by_date' ? date : null);
    onClose();
  }

  function saveTarget(type: string | null, amount: number | null, targetDate: string | null) {
    if (!categoryId) return;
    categoryStore.updateCategory(categoryId, {
      target_type: type as any,
      target_amount: amount,
      target_date: targetDate,
    });
  }

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        ref={dlgRef}
        className="dialog dialog--sm"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeydown}
      >
        <div className="dialog__header">
          <Target size={16} />
          <span className="dialog__title">Set Target — {categoryName}</span>
          <button className="dialog__close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="dialog__body">
          <div className="target-type-picker">
            <button
              className={`target-type-btn ${targetType === 'monthly' ? 'target-type-btn--active' : ''}`}
              onClick={() => setTargetType('monthly')}
            >
              <Repeat size={14} />
              Need each month
            </button>
            <button
              className={`target-type-btn ${targetType === 'by_date' ? 'target-type-btn--active' : ''}`}
              onClick={() => setTargetType('by_date')}
            >
              <Calendar size={14} />
              Save by date
            </button>
            <button
              className={`target-type-btn ${targetType === 'savings' ? 'target-type-btn--active' : ''}`}
              onClick={() => setTargetType('savings')}
            >
              <Target size={14} />
              Save total
            </button>
            <button
              className={`target-type-btn ${targetType === null ? 'target-type-btn--active' : ''}`}
              onClick={() => setTargetType(null)}
            >
              <X size={14} />
              No target
            </button>
          </div>

          {targetType !== null && (
            <div className="target-fields">
              <span className="target-field__hint">
                {targetType === 'monthly' && 'Progress measured by assigned amount each month'}
                {targetType === 'by_date' && 'Progress measured by available balance toward date'}
                {targetType === 'savings' && 'Progress measured by available balance (no deadline)'}
              </span>
              <label className="target-field">
                <span className="target-field__label">Target amount</span>
                <input
                  type="text"
                  className="input input--sm"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </label>

              {targetType === 'by_date' && (
                <label className="target-field">
                  <span className="target-field__label">Target date</span>
                  <input
                    type="month"
                    className="input input--sm"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
              )}
            </div>
          )}

          {error && <div className="dialog__error">{error}</div>}
        </div>

        <div className="dialog__footer">
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
});
