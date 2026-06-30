import { createSignal, onMount, Show, For, type Component, type JSX } from 'solid-js'

interface InlineFormField {
  key: string
  label: string
  type: 'text' | 'number' | 'select'
  placeholder?: string
  options?: { value: string; label: string }[]
  required?: boolean
}

interface InlineFormProps {
  fields: InlineFormField[]
  onSubmit: (values: Record<string, string>) => void | Promise<void>
  onCancel: () => void
  submitLabel?: string
}

const InlineForm: Component<InlineFormProps> = (props) => {
  const [values, setValues] = createSignal<Record<string, string>>(
    Object.fromEntries(props.fields.map(f => [f.key, '']))
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

  let formRef: HTMLDivElement | undefined

  onMount(() => {
    const firstInput = formRef?.querySelector<HTMLInputElement | HTMLSelectElement>('input, select')
    firstInput?.focus()
  })

  return (
    <div class="inline-form" ref={formRef} onKeyDown={handleKeyDown}>
      <div class="inline-form__fields">
        <For each={props.fields}>
          {(field) => (
            <Show when={field.type === 'select'} fallback={
              <input
                class="input inline-form__input"
                type={field.type}
                placeholder={field.placeholder ?? field.label}
                value={values()[field.key]}
                onInput={(e) => setValue(field.key, e.currentTarget.value)}
              />
            }>
              <select
                class="input inline-form__input"
                value={values()[field.key]}
                onChange={(e) => setValue(field.key, e.currentTarget.value)}
              >
                <option value="">{field.placeholder ?? `Select ${field.label}...`}</option>
                <For each={field.options ?? []}>
                  {(opt) => <option value={opt.value}>{opt.label}</option>}
                </For>
              </select>
            </Show>
          )}
        </For>
      </div>
      <div class="inline-form__actions">
        <button class="btn btn--sm btn--secondary" onClick={props.onCancel}>Cancel</button>
        <button class="btn btn--sm btn--primary" onClick={handleSubmit}>{props.submitLabel ?? 'Save'}</button>
      </div>
      <Show when={error()}>
        <span class="field-error">{error()}</span>
      </Show>
    </div>
  )
}

export default InlineForm
