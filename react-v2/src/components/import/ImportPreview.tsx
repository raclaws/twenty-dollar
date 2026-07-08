import type { ParsedRow } from './ImportPage';

interface ImportPreviewProps {
  rows: ParsedRow[];
  onToggleRow: (id: string) => void;
  onToggleAll: (selected: boolean) => void;
}

export function ImportPreview({ rows, onToggleRow, onToggleAll }: ImportPreviewProps) {
  const allSelected = rows.every((r) => r.selected);
  const noneSelected = rows.every((r) => !r.selected);

  const formatAmount = (cents: number) => {
    const abs = Math.abs(cents) / 100;
    const prefix = cents < 0 ? '-' : '+';
    return `${prefix}$${abs.toFixed(2)}`;
  };

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-zinc-900/80 border-b border-zinc-800">
            <th className="w-10 px-3 py-2">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = !allSelected && !noneSelected;
                }}
                onChange={() => onToggleAll(!allSelected)}
                className="rounded border-zinc-600 text-indigo-600 focus:ring-indigo-500 bg-zinc-800"
              />
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-zinc-400">Date</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-zinc-400">Description</th>
            <th className="px-3 py-2 text-right text-xs font-medium text-zinc-400">Amount</th>
            <th className="w-10 px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={`border-b border-zinc-800/50 transition-colors ${
                row.selected ? 'bg-zinc-900/40' : 'bg-zinc-900/20 opacity-50'
              }`}
            >
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={row.selected}
                  onChange={() => onToggleRow(row.id)}
                  className="rounded border-zinc-600 text-indigo-600 focus:ring-indigo-500 bg-zinc-800"
                />
              </td>
              <td className="px-3 py-2 text-zinc-300 font-mono text-xs">{row.date}</td>
              <td className="px-3 py-2 text-zinc-200 truncate max-w-[300px]">{row.description}</td>
              <td className={`px-3 py-2 text-right font-mono ${row.amount < 0 ? 'text-red-400' : 'text-green-400'}`}>
                {formatAmount(row.amount)}
              </td>
              <td className="px-3 py-2">
                {row.isDuplicate && (
                  <span title="Possible duplicate (same date + amount)" className="text-amber-400">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-2 bg-zinc-900/60 text-xs text-zinc-500 border-t border-zinc-800">
        {rows.filter((r) => r.selected).length} of {rows.length} selected
        {rows.some((r) => r.isDuplicate) && (
          <span className="ml-3 text-amber-500">⚠ Possible duplicates detected</span>
        )}
      </div>
    </div>
  );
}
