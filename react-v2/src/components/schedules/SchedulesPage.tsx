import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import type { Schedule } from '@/types';
import { ScheduleCard } from './ScheduleCard';
import { ScheduleDialog } from './ScheduleDialog';

export const SchedulesPage = observer(function SchedulesPage() {
  const { scheduleStore } = useStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  const schedules = scheduleStore.sortedSchedules;

  const handleCreate = () => {
    setEditingSchedule(null);
    setDialogOpen(true);
  };

  const handleEdit = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditingSchedule(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h1 className="text-xl font-medium text-zinc-100">Schedules</h1>
        <button
          onClick={handleCreate}
          className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
        >
          + New Schedule
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {schedules.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-zinc-400 text-sm">No scheduled transactions yet.</p>
            <button
              onClick={handleCreate}
              className="mt-3 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Create your first schedule
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {schedules.map((s) => (
              <ScheduleCard key={s.id} schedule={s} onEdit={handleEdit} />
            ))}
          </div>
        )}
      </div>

      <ScheduleDialog
        open={dialogOpen}
        schedule={editingSchedule}
        onClose={handleClose}
      />
    </div>
  );
});
