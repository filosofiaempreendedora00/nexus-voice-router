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

export async function typeIntoClaudeCode(text: string, autoEnter?: boolean): Promise<void> {
  // 1. Always copy to clipboard (no permission needed).
  clipboard.writeText(text)

  // 2. Focus target app via Apple Events (different permission than keystroke;
  //    usually already granted).
  await focusClaudeHost()

  const settings = loadSettings()
  const shouldAutoEnter = autoEnter ?? settings.claudeAutoEnter

  // 3. Launch the standalone PasteHelper.app via `open` (LaunchServices) so it
  //    runs with its OWN TCC identity (the .app's identifier). A direct
  //    fork+exec from Electron would make NEXUS the "responsible process" and
  //    macOS would silently block the keystroke because NEXUS isn't in
  //    Accessibility — even though PasteHelper.app is.
  if (existsSync(PASTE_HELPER_APP)) {
    try {
      const args = ['-a', PASTE_HELPER_APP, '-W', '--args']
      if (shouldAutoEnter) args.push('--enter')
      await execFileAsync('/usr/bin/open', args, { timeout: 5000 })
      return
    } catch (err) {
      console.warn('[claude-code] PasteHelper via `open` failed:', err)
    }
  }

  // 4. Last resort: clipboard is set, ask user to ⌘V manually.
  new Notification({
    title: 'Prompt copiado',
    body: text.length > 80 ? text.slice(0, 80) + '…' : text,
    subtitle: existsSync(PASTE_HELPER_BIN)
      ? 'Conceda Acessibilidade ao PasteHelper (~/.nexus/PasteHelper.app)'
      : 'PasteHelper não instalado — pressione ⌘V manualmente',
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
