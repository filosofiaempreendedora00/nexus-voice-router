import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { CheckCircle2, XCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface Ctx {
  show: (kind: ToastKind, message: string) => void
}

const ToastContext = createContext<Ctx | null>(null)

export function useToast(): Ctx {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast outside provider')
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const show = useCallback((kind: ToastKind, message: string) => {
    const id = ++seq.current
    setItems((prev) => [...prev, { id, kind, message }])
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 3200)
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {items.map((i) => (
          <ToastView key={i.id} item={i} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastView({ item }: { item: ToastItem }): JSX.Element {
  const Icon = item.kind === 'success' ? CheckCircle2 : item.kind === 'error' ? XCircle : Info
  const color =
    item.kind === 'success' ? 'text-success' : item.kind === 'error' ? 'text-danger' : 'text-accent'
  return (
    <div
      className={cn(
        'glass rounded-lg border border-line px-4 py-3 flex items-center gap-3',
        'shadow-2xl animate-slide-up pointer-events-auto min-w-[260px] max-w-[420px]'
      )}
    >
      <Icon size={16} className={color} />
      <span className="text-sm text-ink">{item.message}</span>
    </div>
  )
}
