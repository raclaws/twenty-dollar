import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import type { Schedule } from '@/types';

const frequencyLabel: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

interface ScheduleCardProps {
  schedule: Schedule;
  onEdit: (schedule: Schedule) => void;
}

export const ScheduleCard = observer(function ScheduleCard({
  schedule,
  onEdit,
}: ScheduleCardProps) {
  const { accountStore, payeeStore, categoryStore, scheduleStore } = useStore();

  const account = accountStore.getById(schedule.account_id);
  const payee = payeeStore.getById(schedule.payee_id);
  const category = schedule.category_id
    ? categoryStore.getCategory(schedule.category_id)
    : null;

  const isOverdue =
    !schedule.paused &&
    schedule.next_due < new Date().toISOString().slice(0, 10);

  const formatAmount = (cents: number) => {
    const abs = Math.abs(cents) / 100;
    const prefix = cents < 0 ? '-' : '+';
    return `${prefix}$${abs.toFixed(2)}`;
  };

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        schedule.paused
          ? 'border-zinc-800 bg-zinc-900/50 opacity-60'
          : isOverdue
            ? 'border-red-800/50 bg-red-950/20'
            : 'border-zinc-800 bg-zinc-900'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-100 truncate">
              {payee?.name || 'Unknown Payee'}
            </span>
            {isOverdue && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/50 text-red-300">
                Overdue
              </span>
            )}
            {schedule.paused ? (
              <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                Paused
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-zinc-400">
            <span>{frequencyLabel[schedule.frequency]}</span>
            <span>·</span>
            <span>Next: {schedule.next_due}</span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
            <span>{account?.name || '—'}</span>
            {category && (
              <>
                <span>·</span>
                <span>{category.name}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 ml-4">
          <span
            className={`text-sm font-mono ${
              schedule.amount < 0 ? 'text-red-400' : 'text-green-400'
            }`}
          >
            {formatAmount(schedule.amount)}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => scheduleStore.togglePause(schedule.id)}
              className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              title={schedule.paused ? 'Resume' : 'Pause'}
            >
              {schedule.paused ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.84A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.27l9.344-5.891a1.5 1.5 0 000-2.538L6.3 2.841z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => onEdit(schedule)}
              className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              title="Edit"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
