import { runOsascript, escapeForApplescript } from './osa'

const POSSIBLE_HOSTS = ['Terminal', 'iTerm2', 'iTerm', 'Warp', 'Ghostty', 'Code', 'Cursor']

async function focusClaudeHost(): Promise<string> {
  const script = `
set targetApps to ${asAppleScriptList(POSSIBLE_HOSTS)}
set runningApps to {}
tell application "System Events"
  set processNames to name of (every process whose background only is false)
end tell
repeat with appName in targetApps
  if processNames contains appName then
    tell application appName to activate
    delay 0.1
    return appName as string
  end if
end repeat
return ""
`
  const result = await runOsascript(script)
  if (!result) {
    throw new Error(
      'Nenhum terminal/IDE compatível está aberto. Abra Terminal, iTerm, Warp, VS Code ou Cursor.'
    )
  }
  return result
}

export async function typeIntoClaudeCode(text: string): Promise<void> {
  await focusClaudeHost()
  const safe = escapeForApplescript(text)
  const script = `
tell application "System Events"
  delay 0.1
  keystroke "${safe}"
end tell
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
