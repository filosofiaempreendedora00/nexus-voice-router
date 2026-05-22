import { useState, FormEvent } from 'react'
import { ArrowLeft, Save, Sparkles } from 'lucide-react'
import type { Route } from '@shared/types'
import { api } from '@/lib/api'
import { Input } from '@/components/Input'
import { Button } from '@/components/Button'
import { TagInput } from '@/components/TagInput'
import { useToast } from '@/components/Toast'

interface Props {
  route: Route | null
  onCancel: () => void
  onSaved: () => void
}

const SUGGESTED_ICONS = ['💰', '📊', '🚀', '🎯', '💎', '🔥', '⚡', '🌟', '📈', '🎨', '🛠️', '📦', '👥', '🔗', '🌐', '📱', '💻', '🧠']
const SUGGESTED_CATEGORIES = ['Clientes', 'Apps', 'Ferramentas', 'Pessoal', 'Dashboards']

export function RouteForm({ route, onCancel, onSaved }: Props): JSX.Element {
  const toast = useToast()
  const [command, setCommand] = useState(route?.command ?? '')
  const [url, setUrl] = useState(route?.url ?? '')
  const [aliases, setAliases] = useState<string[]>(route?.aliases ?? [])
  const [keywords, setKeywords] = useState<string[]>(route?.keywords ?? [])
  const [category, setCategory] = useState(route?.category ?? 'Clientes')
  const [icon, setIcon] = useState(route?.icon ?? '🔗')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!command.trim() || !url.trim()) {
      toast.show('error', 'Comando e URL são obrigatórios')
      return
    }
    setSaving(true)
    try {
      await api.saveRoute({
        id: route?.id,
        command: command.trim(),
        url: url.trim(),
        aliases: aliases.map((a) => a.trim()).filter(Boolean),
        keywords: keywords.map((k) => k.trim()).filter(Boolean),
        category,
        icon
      })
      toast.show('success', route ? 'Rota atualizada' : 'Rota criada')
      onSaved()
    } catch (err) {
      toast.show('error', String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <header className="flex items-center justify-between gap-4 p-6 border-b border-line">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onCancel} className="text-ink-muted hover:text-ink transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-ink">
              {route ? 'Editar rota' : 'Nova rota'}
            </h1>
            <p className="text-xs text-ink-muted">
              {route ? 'Atualize comando, aliases e URL' : 'Cadastre uma nova rota de navegação'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            <Save size={14} /> {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scroll-area">
        <div className="max-w-2xl mx-auto p-8 flex flex-col gap-6">
          <Input
            label="Comando principal"
            placeholder="Organiker Investimento"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            hint="Como o comando aparece na UI. Não precisa ser igual ao que você fala."
            autoFocus
          />

          <Input
            label="URL"
            placeholder="https://app.com/clientes/organiker/investimento"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            type="url"
            hint="Endereço completo. Use http://localhost:3000 para dev."
          />

          <TagInput
            label="Aliases (frases alternativas)"
            placeholder="ex: preço organiker, proposta organiker"
            values={aliases}
            onChange={setAliases}
            hint="Frases inteiras que você pode falar. Enter para adicionar."
          />

          <TagInput
            label="Palavras-chave"
            placeholder="ex: organiker, investimento, preço"
            values={keywords}
            onChange={setKeywords}
            hint="Tokens individuais que ajudam no matching. Geradas automaticamente se vazio."
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Categoria</label>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={
                    'h-8 px-3 rounded-md text-xs font-medium transition-all ' +
                    (c === category
                      ? 'bg-accent-subtle text-accent border border-accent/40'
                      : 'bg-bg-elevated text-ink-muted border border-line hover:border-line-strong')
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-ink-muted uppercase tracking-wide">Ícone</label>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_ICONS.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIcon(i)}
                  className={
                    'w-9 h-9 rounded-lg text-base transition-all ' +
                    (i === icon
                      ? 'bg-accent-subtle border border-accent/40 scale-110'
                      : 'bg-bg-elevated border border-line hover:border-line-strong')
                  }
                >
                  {i}
                </button>
              ))}
            </div>
          </div>

          <div className="card p-4 flex items-start gap-3 mt-4">
            <Sparkles size={16} className="text-accent flex-shrink-0 mt-0.5" />
            <div className="text-xs text-ink-muted leading-relaxed">
              <strong className="text-ink">Dica:</strong> aliases são frases inteiras como "preço organiker".
              Keywords são palavras soltas como "organiker" ou "preço". Ambos aumentam a precisão do matching por voz.
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}
