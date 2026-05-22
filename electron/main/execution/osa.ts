import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export async function runOsascript(script: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync('osascript', ['-e', script], {
    maxBuffer: 1024 * 1024
  })
  if (stderr && stderr.trim()) {
    console.warn('[osa] stderr:', stderr)
  }
  return stdout.trim()
}

export function escapeForApplescript(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
