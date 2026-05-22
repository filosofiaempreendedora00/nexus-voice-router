import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover shadow-[0_0_0_1px_rgba(99,102,241,0.4),0_8px_24px_-12px_rgba(99,102,241,0.6)]',
  secondary:
    'bg-bg-elevated text-ink border border-line hover:bg-bg-hover hover:border-line-strong',
  ghost: 'text-ink-muted hover:text-ink hover:bg-bg-hover',
  danger: 'bg-danger/15 text-danger hover:bg-danger/25 border border-danger/30'
}

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-sm gap-2 rounded-lg font-medium'
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = 'secondary', size = 'md', className, children, ...rest }, ref) => (
    <button
      ref={ref}
      {...rest}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        'active:scale-[0.98]',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </button>
  )
)
Button.displayName = 'Button'
