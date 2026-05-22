import { useState, KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  label?: string
  hint?: string
  values: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}

export function TagInput({ label, hint, values, onChange, placeholder }: Props): JSX.Element {
  const [draft, setDraft] = useState('')

  function commit(): void {
    const v = draft.trim()
    if (!v) return
    if (values.includes(v)) {
      setDraft('')
      return
    }
    onChange([...values, v])
    setDraft('')
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Backspace' && !draft && values.length > 0) {
      onChange(values.slice(0, -1))
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">{label}</label>
      )}
      <div
        className={cn(
          'min-h-10 p-1.5 rounded-lg flex flex-wrap gap-1.5',
          'bg-bg-elevated border border-line',
          'focus-within:ring-2 focus-within:ring-accent/40 focus-within:border-accent/40',
          'transition-all'
        )}
      >
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 h-7 px-2 rounded-md bg-bg-hover border border-line text-xs text-ink"
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="text-ink-dim hover:text-danger transition-colors"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={commit}
          placeholder={values.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm placeholder:text-ink-dim px-2"
        />
      </div>
      {hint && <p className="text-xs text-ink-dim">{hint}</p>}
    </div>
  )
}
