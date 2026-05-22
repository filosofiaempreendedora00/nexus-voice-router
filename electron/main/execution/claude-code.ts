import { runOsascript, escapeForApplescript } from './osa'
import { loadSettings } from '../store/settings'

const FALLBACK_HOSTS = ['Claude', 'Cursor', 'Code', 'iTerm2', 'iTerm', 'Warp', 'Ghostty', 'Terminal']

async function focusClaudeHost(): Promise<string> {
  const settings = loadSettings()
  const preferred = settings.claudeCodeApp.trim()
  const candidates = preferred
    ? [preferred, ...FALLBACK_HOSTS.filter((h) => h !== preferred)]
    : FALLBACK_HOSTS

  const script = `
set targetApps to ${asAppleScriptList(candidates)}
tell application "System Events"
  set processNames to name of (every process whose background only is false)
end tell
repeat with appName in targetApps
  if processNames contains appName then
    tell application appName to activate
    delay 0.18
    return appName as string
  end if
end repeat
return ""
`
  const result = await runOsascript(script)
  if (!result) {
    throw new Error(
      'Nenhum terminal/IDE rodando. Abra Cursor, VS Code, iTerm, Terminal ou similar com Claude Code rodando.'
    )
  }
  return result
}

export async function typeIntoClaudeCode(text: string, autoEnter?: boolean): Promise<void> {
  await focusClaudeHost()
  const settings = loadSettings()
  const shouldAutoEnter = autoEnter ?? settings.claudeAutoEnter

  const safe = escapeForApplescript(text)
  // Use clipboard paste for speed + emoji/accent safety. Save and restore the
  // previous clipboard so we don't trash whatever the user had copied.
  const script = `
set savedClip to ""
try
  set savedClip to the clipboard
end try
set the clipboard to "${safe}"
delay 0.05
tell application "System Events"
  keystroke "v" using command down
end tell
delay 0.18
${shouldAutoEnter ? 'tell application "System Events" to key code 36' : ''}
delay 0.12
try
  set the clipboard to savedClip
end try
`
  await runOsascript(script)
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
