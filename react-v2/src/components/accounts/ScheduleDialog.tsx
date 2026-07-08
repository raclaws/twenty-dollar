import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { Repeat, X } from 'lucide-react';
import type { Schedule } from '@/types';

interface ScheduleDialogProps {
  transaction?: {
    account_id: string;
    category_id: string | null;
    payee_id: string;
    amount: number;
    memo: string | null;
  };
  onClose: () => void;
  onCreated: () => void;
}

export const ScheduleDialog = observer(function ScheduleDialog({ transaction, onClose, onCreated }: ScheduleDialogProps) {
  const { scheduleStore } = useStore();
  const tx = transaction;

  function nextMonth(): string {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  }

  const [frequency, setFrequency] = useState<string>('monthly');
  const [nextDue, setNextDue] = useState(nextMonth());
  const [endDate, setEndDate] = useState('');
  const [autoClear, setAutoClear] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tx) return;
    setSaving(true);
    setError('');

    try {
      const schedule: Schedule = {
        id: crypto.randomUUID(),
        account_id: tx.account_id,
        payee_id: tx.payee_id,
        category_id: tx.category_id,
        amount: tx.amount,
        memo: tx.memo,
        frequency: frequency as Schedule['frequency'],
        start_date: nextDue,
        end_date: endDate || null,
        next_due: nextDue,
        paused: 0,
        created_at: new Date().toISOString(),
      };
      scheduleStore.createSchedule(schedule);
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create schedule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog schedule-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog__header">
          <Repeat size={16} />
          <span className="dialog__title">Make Recurring</span>
          <button className="dialog__close" onClick={onClose}><X size={14} /></button>
        </div>

        <form className="schedule-dialog__form" onSubmit={handleSave}>
          <div className="schedule-dialog__summary">
            {tx?.memo && <span className="schedule-dialog__payee">{tx.memo}</span>}
            <span className="schedule-dialog__amount">${(Math.abs(tx?.amount ?? 0) / 100).toFixed(2)}</span>
          </div>

          <label className="schedule-dialog__field">
            <span>Frequency</span>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 weeks</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </label>

          <label className="schedule-dialog__field">
            <span>Next due</span>
            <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} required />
          </label>

          <label className="schedule-dialog__field">
            <span>End date (optional)</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>

          <label className="schedule-dialog__checkbox">
            <input type="checkbox" checked={autoClear} onChange={(e) => setAutoClear(e.target.checked)} />
            <span>Auto-clear when generated</span>
          </label>

          {error && <div className="schedule-dialog__error">{error}</div>}

          <div className="schedule-dialog__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Saving...' : 'Create Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});
