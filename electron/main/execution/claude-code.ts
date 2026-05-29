import { clipboard, Notification } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { runOsascript, escapeForApplescript } from './osa'
import { loadSettings } from '../store/settings'

const execFileAsync = promisify(execFile)

const FALLBACK_HOSTS = ['Claude', 'Cursor', 'Code', 'iTerm2', 'iTerm', 'Warp', 'Ghostty', 'Terminal']
const PASTE_HELPER_APP = join(homedir(), '.nexus', 'PasteHelper.app')
const PASTE_HELPER_BIN = join(PASTE_HELPER_APP, 'Contents', 'MacOS', 'PasteHelper')

async function focusClaudeHost(): Promise<string> {
  const settings = loadSettings()
  const preferred = settings.claudeCodeApp.trim()
  const candidates = preferred
    ? [preferred, ...FALLBACK_HOSTS.filter((h) => h !== preferred)]
    : FALLBACK_HOSTS

  // 1) Find which candidate is running.
  const script = `
set targetApps to ${asAppleScriptList(candidates)}
tell application "System Events"
  set processNames to name of (every process whose background only is false)
end tell
repeat with appName in targetApps
  if processNames contains appName then
    return appName as string
  end if
end repeat
return ""
`
  const appName = await runOsascript(script)
  if (!appName) {
    throw new Error('Nenhum app receptor rodando. Abra Claude desktop, Cursor, etc.')
  }

  // 2) Bring it forward via LaunchServices (more reliable than tell-activate).
  try {
    await execFileAsync('open', ['-a', appName], { timeout: 4000 })
  } catch {
    /* fall through — already running, just unfocused */
  }

  // 3) Verify it became frontmost; small loop with timeout.
  const verifyScript = `
tell application "System Events"
  set frontApp to name of first application process whose frontmost is true
end tell
return frontApp
`
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 80))
    try {
      const front = await runOsascript(verifyScript)
      if (front === appName) break
    } catch { /* */ }
  }
  // Extra settle time so Claude focuses its chat input.
  await new Promise((r) => setTimeout(r, 250))

  return appName
}

async function runPasteHelper(actions: string[]): Promise<void> {
  if (!existsSync(PASTE_HELPER_APP)) {
    throw new Error('PasteHelper.app not installed at ' + PASTE_HELPER_APP)
  }
  const args = ['-a', PASTE_HELPER_APP, '-W', '--args', ...actions]
  await execFileAsync('/usr/bin/open', args, { timeout: 8000 })
}

export async function typeIntoClaudeCode(
  text: string,
  autoEnter?: boolean,
  targetChat?: string
): Promise<void> {
  // 1. Focus the target Claude app (Apple Events).
  await focusClaudeHost()

  const settings = loadSettings()
  const shouldAutoEnter = autoEnter ?? settings.claudeAutoEnter

  // 2. If a specific chat was requested, switch to it using Claude's chat search.
  //    Flow: ⌘K opens the recents/search popover → paste chat name → Enter → chat opens.
  if (targetChat && existsSync(PASTE_HELPER_APP)) {
    try {
      clipboard.writeText(targetChat)
      // cmdk + paste name + enter + wait for chat to load
      await runPasteHelper(['cmdk', 'sleep', '250', 'paste', 'sleep', '350', 'enter', 'sleep', '700'])
    } catch (err) {
      console.warn('[claude-code] chat switch failed:', err)
      // Continue anyway — at worst, prompt goes to current chat.
    }
  }

  // 3. Put the actual prompt on the clipboard and paste.
  clipboard.writeText(text)

  if (existsSync(PASTE_HELPER_APP)) {
    try {
      const actions = ['paste']
      if (shouldAutoEnter) actions.push('sleep', '120', 'enter')
      await runPasteHelper(actions)
      return
    } catch (err) {
      console.warn('[claude-code] paste failed:', err)
    }
  }

  // 4. Fallback: clipboard is set, ask user to ⌘V manually.
  new Notification({
    title: 'Prompt copiado',
    body: text.length > 80 ? text.slice(0, 80) + '…' : text,
    subtitle: 'PasteHelper falhou — pressione ⌘V manualmente',
    silent: false
  }).show()
}

export async function sendEnterInClaudeCode(): Promise<void> {
  await focusClaudeHost()
  const script = `
tell application "System Events"
  delay 0.1
  key code 36
end tell
`
  await runOsascript(script)
}

function asAppleScriptList(items: string[]): string {
  return '{' + items.map((i) => `"${escapeForApplescript(i)}"`).join(', ') + '}'
}
