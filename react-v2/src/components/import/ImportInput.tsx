import { useState, useCallback, useRef } from 'react';

interface ImportInputProps {
  onParse: (text: string) => void;
}

export function ImportInput({ onParse }: ImportInputProps) {
  const [tab, setTab] = useState<'paste' | 'csv' | 'pdf'>('paste');
  const [pasteText, setPasteText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handlePaste = () => {
    if (!pasteText.trim()) return;
    onParse(pasteText);
  };

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        onParse(text);
      };
      reader.readAsText(file);
    },
    [onParse],
  );

  return (
    <div className="max-w-2xl">
      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {(['paste', 'csv', 'pdf'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm rounded-t transition-colors ${
              tab === t
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 border-b-transparent'
                : 'text-zinc-400 hover:text-zinc-300'
            }`}
          >
            {t === 'paste' ? 'Paste' : t === 'csv' ? 'Upload CSV' : 'Upload PDF'}
          </button>
        ))}
      </div>

      {/* Paste tab */}
      {tab === 'paste' && (
        <div className="space-y-3">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"Date,Description,Amount\n2024-01-15,Grocery Store,-45.67\n2024-01-16,Paycheck,2500.00"}
            rows={12}
            className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 font-mono placeholder:text-zinc-600 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-y"
          />
          <button
            onClick={handlePaste}
            disabled={!pasteText.trim()}
            className="px-4 py-2 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Parse
          </button>
        </div>
      )}

      {/* CSV upload tab */}
      {tab === 'csv' && (
        <div className="space-y-3">
          <div
            className="border-2 border-dashed border-zinc-700 rounded-lg p-8 text-center cursor-pointer hover:border-zinc-500 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <svg className="w-8 h-8 mx-auto text-zinc-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm text-zinc-400">Click to upload a CSV file</p>
            <p className="text-xs text-zinc-600 mt-1">or drag and drop</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,text/csv"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      )}

      {/* PDF tab (placeholder) */}
      {tab === 'pdf' && (
        <div className="border border-zinc-700 rounded-lg p-8 text-center">
          <svg className="w-8 h-8 mx-auto text-zinc-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-zinc-400">PDF Import</p>
          <p className="text-xs text-zinc-500 mt-1">Coming soon — statement PDF parsing is not yet implemented</p>
        </div>
      )}
    </div>
  );
}
