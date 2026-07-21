import { createSignal, onMount, Show, For, type Component } from 'solid-js'

interface FormDialogField {
  key: string
  label: string
  type: 'text' | 'number' | 'select'
  placeholder?: string
  options?: { value: string; label: string }[]
  required?: boolean
  defaultValue?: string
}

interface FormDialogProps {
  title: string
  fields: FormDialogField[]
  onSubmit: (values: Record<string, string>) => void | Promise<void>
  onCancel: () => void
  submitLabel?: string
}

const FormDialog: Component<FormDialogProps> = (props) => {
  const [values, setValues] = createSignal<Record<string, string>>(
    Object.fromEntries(props.fields.map(f => [f.key, f.defaultValue ?? '']))
  )
  const [error, setError] = createSignal('')

  function setValue(key: string, val: string) {
    setValues(v => ({ ...v, [key]: val }))
  }

  async function handleSubmit() {
    const v = values()
    for (const field of props.fields) {
      if (field.required && !v[field.key]?.trim()) {
        setError(`${field.label} is required`)
        return
      }
    }
    setError('')
    await props.onSubmit(v)
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleSubmit() }
    if (e.key === 'Escape') props.onCancel()
  }

  let dialogRef: HTMLDivElement | undefined

  onMount(() => {
    const firstInput = dialogRef?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')
    firstInput?.focus()
  })

  return (
    <div class="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) props.onCancel() }}>
      <div class="dialog form-dialog" ref={dialogRef} onKeyDown={handleKeyDown}>
        <div class="dialog__header">
          <h3 class="dialog__title">{props.title}</h3>
        </div>
        <div class="form-dialog__fields">
          <For each={props.fields}>
            {(field) => (
              <div class="form-dialog__field">
                <label class="form-dialog__label">{field.label}</label>
                <Show when={field.type === 'select'} fallback={
                  <input
                    class="input"
                    type={field.type}
                    placeholder={field.placeholder ?? field.label}
                    value={values()[field.key]}
                    onInput={(e) => setValue(field.key, e.currentTarget.value)}
                  />
                }>
                  <select
                    class="input"
                    value={values()[field.key]}
                    onChange={(e) => setValue(field.key, e.currentTarget.value)}
                  >
                    <option value="">{field.placeholder ?? `Select ${field.label}...`}</option>
                    <For each={field.options ?? []}>
                      {(opt) => <option value={opt.value}>{opt.label}</option>}
                    </For>
                  </select>
                </Show>
              </div>
            )}
          </For>
        </div>
        <Show when={error()}>
          <span class="field-error">{error()}</span>
        </Show>
        <div class="dialog__actions">
          <button class="btn btn--secondary" onClick={props.onCancel}>Cancel</button>
          <button class="btn btn--primary" onClick={handleSubmit}>{props.submitLabel ?? 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

export default FormDialog
