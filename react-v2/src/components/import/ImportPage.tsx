import { useState, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { ImportInput } from './ImportInput';
import { ImportPreview } from './ImportPreview';
import { toast } from 'sonner';
import type { Transaction } from '@/types';

export interface ParsedRow {
  id: string;
  date: string;
  description: string;
  amount: number; // cents
  selected: boolean;
  isDuplicate: boolean;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function detectColumns(headers: string[]): { dateCol: number; descCol: number; amountCol: number } {
  const lower = headers.map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  let dateCol = lower.findIndex((h) => h.includes('date'));
  let descCol = lower.findIndex((h) => h.includes('desc') || h.includes('memo') || h.includes('payee') || h.includes('narr'));
  let amountCol = lower.findIndex((h) => h.includes('amount') || h.includes('sum') || h.includes('value'));

  if (dateCol === -1) dateCol = 0;
  if (descCol === -1) descCol = dateCol === 0 ? 1 : 0;
  if (amountCol === -1) amountCol = headers.length - 1;

  return { dateCol, descCol, amountCol };
}

function parseDate(raw: string): string {
  // Try ISO format first
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  // Try MM/DD/YYYY
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const [, m, d, y] = slash;
    const year = y.length === 2 ? '20' + y : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Try DD/MM/YYYY (fallback)
  const dot = raw.match(/^(\d{1,2})[.\-](\d{1,2})[.\-](\d{2,4})$/);
  if (dot) {
    const [, d, m, y] = dot;
    const year = y.length === 2 ? '20' + y : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return new Date().toISOString().slice(0, 10);
}

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[$€£,\s]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

export const ImportPage = observer(function ImportPage() {
  const { transactionStore, accountStore } = useStore();
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [accountId, setAccountId] = useState('');
  const [step, setStep] = useState<'input' | 'preview'>('input');

  const checkDuplicate = useCallback(
    (date: string, amount: number): boolean => {
      const all = Array.from(transactionStore.transactions.values());
      return all.some((t) => t.date === date && t.amount === amount);
    },
    [transactionStore],
  );

  const handleParse = useCallback(
    (text: string) => {
      const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        toast.error('Need at least a header row and one data row');
        return;
      }

      const headers = parseCSVLine(lines[0]);
      const { dateCol, descCol, amountCol } = detectColumns(headers);

      const rows: ParsedRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < Math.max(dateCol, descCol, amountCol) + 1) continue;

        const date = parseDate(cols[dateCol]);
        const description = cols[descCol];
        const amount = parseAmount(cols[amountCol]);

        if (!description && amount === 0) continue;

        rows.push({
          id: crypto.randomUUID(),
          date,
          description,
          amount,
          selected: true,
          isDuplicate: checkDuplicate(date, amount),
        });
      }

      if (rows.length === 0) {
        toast.error('No valid rows found');
        return;
      }

      setParsedRows(rows);
      setStep('preview');
      toast.success(`Parsed ${rows.length} transactions`);
    },
    [checkDuplicate],
  );

  const handleToggleRow = (id: string) => {
    setParsedRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r)),
    );
  };

  const handleToggleAll = (selected: boolean) => {
    setParsedRows((prev) => prev.map((r) => ({ ...r, selected })));
  };

  const handleCommit = () => {
    if (!accountId) {
      toast.error('Select an account first');
      return;
    }

    const selected = parsedRows.filter((r) => r.selected);
    if (selected.length === 0) {
      toast.error('No rows selected');
      return;
    }

    for (const row of selected) {
      const txn: Transaction = {
        id: crypto.randomUUID(),
        account_id: accountId,
        payee_id: '', // Will need to be matched or created
        category_id: null,
        date: row.date,
        amount: row.amount,
        memo: row.description,
        cleared: 0,
        reconciled_at: null,
        linked_id: null,
        source: 'import',
        created_at: new Date().toISOString(),
      };
      transactionStore.createTransaction(txn);
    }

    toast.success(`Imported ${selected.length} transactions`);
    setParsedRows([]);
    setStep('input');
  };

  const handleBack = () => {
    setStep('input');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h1 className="text-xl font-medium text-zinc-100">Import Transactions</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {step === 'input' && <ImportInput onParse={handleParse} />}
        {step === 'preview' && (
          <div className="space-y-4">
            {/* Account selector */}
            <div className="flex items-center gap-4">
              <label className="text-sm text-zinc-400">Import into:</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="">Select account</option>
                {accountStore.sortedAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            <ImportPreview
              rows={parsedRows}
              onToggleRow={handleToggleRow}
              onToggleAll={handleToggleAll}
            />

            <div className="flex items-center gap-3">
              <button
                onClick={handleBack}
                className="px-4 py-2 text-sm rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleCommit}
                className="px-4 py-2 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
              >
                Import {parsedRows.filter((r) => r.selected).length} transactions
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
