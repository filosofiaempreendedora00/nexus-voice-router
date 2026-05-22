import { InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, hint, className, id, ...rest }, ref) => {
    const inputId = id || rest.name
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-ink-muted uppercase tracking-wide">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          {...rest}
          className={cn(
            'h-10 px-3 rounded-lg text-sm',
            'bg-bg-elevated border border-line text-ink',
            'placeholder:text-ink-dim',
            'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40',
            'transition-all',
            className
          )}
        />
        {hint && <p className="text-xs text-ink-dim">{hint}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'
