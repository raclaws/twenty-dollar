import { useState, useRef, useEffect } from 'react';

interface InlineFormField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
}

interface InlineFormProps {
  fields: InlineFormField[];
  onSubmit: (values: Record<string, string>) => void | Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

export function InlineForm({ fields, onSubmit, onCancel, submitLabel = 'Save' }: InlineFormProps) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, '']))
  );
  const [error, setError] = useState('');
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const firstInput = formRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select');
    firstInput?.focus();
  }, []);

  function setValue(key: string, val: string) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  async function handleSubmit() {
    for (const field of fields) {
      if (field.required && !values[field.key]?.trim()) {
        setError(`${field.label} is required`);
        return;
      }
    }
    setError('');
    await onSubmit(values);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') onCancel();
  }

  return (
    <div className="inline-form" ref={formRef} onKeyDown={handleKeyDown}>
      <div className="inline-form__fields">
        {fields.map((field) =>
          field.type === 'select' ? (
            <select
              key={field.key}
              className="input inline-form__input"
              value={values[field.key]}
              onChange={(e) => setValue(field.key, e.target.value)}
            >
              <option value="">{field.placeholder ?? `Select ${field.label}...`}</option>
              {(field.options ?? []).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              key={field.key}
              className="input inline-form__input"
              type={field.type}
              placeholder={field.placeholder ?? field.label}
              value={values[field.key]}
              onChange={(e) => setValue(field.key, e.target.value)}
            />
          )
        )}
      </div>
      <div className="inline-form__actions">
        <button className="btn btn--sm btn--secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn--sm btn--primary" onClick={handleSubmit}>
          {submitLabel}
        </button>
      </div>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
