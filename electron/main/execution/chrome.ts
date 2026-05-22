import { runOsascript, escapeForApplescript } from './osa'
import type { OpAction } from '@shared/types'

export async function openUrlInChrome(url: string): Promise<void> {
  const safe = escapeForApplescript(url)
  const script = `
tell application "Google Chrome"
  activate
  if (count of windows) = 0 then
    make new window
    set URL of active tab of front window to "${safe}"
  else
    set existingTab to missing value
    set targetUrl to "${safe}"
    repeat with w in windows
      repeat with t in tabs of w
        if URL of t starts with targetUrl then
          set existingTab to t
          set index of w to 1
          exit repeat
        end if
      end repeat
      if existingTab is not missing value then exit repeat
    end repeat
    if existingTab is missing value then
      tell front window to make new tab with properties {URL:"${safe}"}
    else
      tell front window to set active tab index to (index of existingTab as integer)
    end if
  end if
end tell
`
  await runOsascript(script)
}

const SHORTCUTS: Partial<Record<OpAction, string>> = {
  back: `
tell application "Google Chrome" to activate
delay 0.05
tell application "System Events" to key code 123 using command down
`,
  forward: `
tell application "Google Chrome" to activate
delay 0.05
tell application "System Events" to key code 124 using command down
`,
  refresh: `
tell application "Google Chrome" to activate
delay 0.05
tell application "System Events" to keystroke "r" using command down
`,
  close_tab: `
tell application "Google Chrome" to activate
delay 0.05
tell application "System Events" to keystroke "w" using command down
`,
  new_tab: `
tell application "Google Chrome" to activate
delay 0.05
tell application "System Events" to keystroke "t" using command down
`,
  next_tab: `
tell application "Google Chrome" to activate
delay 0.05
tell application "System Events" to key code 124 using {control down}
`,
  prev_tab: `
tell application "Google Chrome" to activate
delay 0.05
tell application "System Events" to key code 123 using {control down}
`,
  copy: `tell application "System Events" to keystroke "c" using command down`,
  paste: `tell application "System Events" to keystroke "v" using command down`,
  cancel: `tell application "System Events" to key code 53`
}

export async function runChromeShortcut(action: OpAction): Promise<void> {
  const script = SHORTCUTS[action]
  if (!script) throw new Error(`Unsupported shortcut: ${action}`)
  await runOsascript(script)
}
