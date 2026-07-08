import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import type { Schedule, ScheduleFrequency } from '@/types';
import { toast } from 'sonner';

interface ScheduleDialogProps {
  open: boolean;
  schedule: Schedule | null; // null = create mode
  onClose: () => void;
}

export const ScheduleDialog = observer(function ScheduleDialog({
  open,
  schedule,
  onClose,
}: ScheduleDialogProps) {
  const { accountStore, payeeStore, categoryStore, scheduleStore } = useStore();

  const [accountId, setAccountId] = useState('');
  const [payeeId, setPayeeId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<ScheduleFrequency>('monthly');
  const [startDate, setStartDate] = useState('');
  const [memo, setMemo] = useState('');
  const [isOutflow, setIsOutflow] = useState(true);

  useEffect(() => {
    if (schedule) {
      setAccountId(schedule.account_id);
      setPayeeId(schedule.payee_id);
      setCategoryId(schedule.category_id || '');
      setAmount((Math.abs(schedule.amount) / 100).toFixed(2));
      setFrequency(schedule.frequency);
      setStartDate(schedule.start_date);
      setMemo(schedule.memo || '');
      setIsOutflow(schedule.amount < 0);
    } else {
      setAccountId('');
      setPayeeId('');
      setCategoryId('');
      setAmount('');
      setFrequency('monthly');
      setStartDate(new Date().toISOString().slice(0, 10));
      setMemo('');
      setIsOutflow(true);
    }
  }, [schedule, open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!accountId || !payeeId || !amount || !startDate) {
      toast.error('Please fill in required fields');
      return;
    }

    const cents = Math.round(parseFloat(amount) * 100);
    if (isNaN(cents) || cents <= 0) {
      toast.error('Invalid amount');
      return;
    }

    const finalAmount = isOutflow ? -cents : cents;

    if (schedule) {
      scheduleStore.updateSchedule(schedule.id, {
        account_id: accountId,
        payee_id: payeeId,
        category_id: categoryId || null,
        amount: finalAmount,
        frequency,
        start_date: startDate,
        memo: memo || null,
      });
      toast.success('Schedule updated');
    } else {
      const newSchedule: Schedule = {
        id: crypto.randomUUID(),
        account_id: accountId,
        payee_id: payeeId,
        category_id: categoryId || null,
        amount: finalAmount,
        memo: memo || null,
        frequency,
        start_date: startDate,
        end_date: null,
        next_due: startDate,
        paused: 0,
        created_at: new Date().toISOString(),
      };
      scheduleStore.createSchedule(newSchedule);
      toast.success('Schedule created');
    }
    onClose();
  };

  const handleDelete = () => {
    if (schedule) {
      scheduleStore.deleteSchedule(schedule.id);
      toast.success('Schedule deleted');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl w-full max-w-md mx-4">
        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4 border-b border-zinc-800">
            <h2 className="text-lg font-medium text-zinc-100">
              {schedule ? 'Edit Schedule' : 'New Schedule'}
            </h2>
          </div>

          <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Account */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Account *</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="">Select account</option>
                {accountStore.sortedAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            {/* Payee */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Payee *</label>
              <select
                value={payeeId}
                onChange={(e) => setPayeeId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="">Select payee</option>
                {payeeStore.sortedPayees.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="">None (income)</option>
                {categoryStore.sortedGroups.map((g) => (
                  <optgroup key={g.id} label={g.name}>
                    {categoryStore.categoriesForGroup(g.id).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Amount + direction */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-zinc-400 mb-1">Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Type</label>
                <select
                  value={isOutflow ? 'outflow' : 'inflow'}
                  onChange={(e) => setIsOutflow(e.target.value === 'outflow')}
                  className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                  <option value="outflow">Outflow</option>
                  <option value="inflow">Inflow</option>
                </select>
              </div>
            </div>

            {/* Frequency */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Frequency *</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Start Date *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>

            {/* Memo */}
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Memo</label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Optional note"
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
          </div>

          <div className="px-5 py-3 border-t border-zinc-800 flex items-center justify-between">
            <div>
              {schedule && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="text-sm text-red-400 hover:text-red-300 transition-colors"
                >
                  Delete
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
              >
                {schedule ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
});
