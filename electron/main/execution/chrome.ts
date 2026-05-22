import { runOsascript, escapeForApplescript } from './osa'
import type { OpAction } from '@shared/types'

export async function openUrlInChrome(url: string): Promise<void> {
  const safe = escapeForApplescript(url)
  let origin = ''
  try {
    origin = new URL(url).origin
  } catch {
    /* keep empty */
  }
  const safeOrigin = escapeForApplescript(origin)

  const script = `
tell application "Google Chrome"
  activate
  set theURL to "${safe}"
  set targetOrigin to "${safeOrigin}"
  set foundWindow to missing value
  set foundTabIdx to 0

  if (count of windows) = 0 then
    make new window
    set URL of active tab of front window to theURL
    return
  end if

  if targetOrigin is not "" then
    repeat with w in windows
      set i to 0
      repeat with t in tabs of w
        set i to i + 1
        if (URL of t) starts with targetOrigin then
          set foundWindow to w
          set foundTabIdx to i
          exit repeat
        end if
      end repeat
      if foundWindow is not missing value then exit repeat
    end repeat
  end if

  if foundWindow is missing value then
    tell front window to make new tab with properties {URL:theURL}
  else
    set active tab index of foundWindow to foundTabIdx
    set URL of tab foundTabIdx of foundWindow to theURL
    set index of foundWindow to 1
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
