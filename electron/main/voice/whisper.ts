import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { resourcesPath } from '../paths'
import { loadSettings } from '../store/settings'

const execFileAsync = promisify(execFile)

interface WhisperLocation {
  binary: string
  model: string
}

function findWhisper(): WhisperLocation | null {
  const settings = loadSettings()
  const candidates = [
    {
      binary: join(resourcesPath(), 'whisper', 'whisper-cli'),
      model: join(resourcesPath(), 'whisper', `ggml-${settings.whisperModel}.bin`)
    },
    {
      binary: '/opt/homebrew/bin/whisper-cli',
      model: join(resourcesPath(), 'whisper', `ggml-${settings.whisperModel}.bin`)
    },
    {
      binary: '/usr/local/bin/whisper-cli',
      model: join(resourcesPath(), 'whisper', `ggml-${settings.whisperModel}.bin`)
    }
  ]

  for (const c of candidates) {
    if (existsSync(c.binary) && existsSync(c.model)) return c
  }
  return null
}

export async function transcribeAudio(wavBase64: string): Promise<string> {
  const location = findWhisper()
  if (!location) {
    throw new Error(
      'Whisper local não instalado. Use o campo de texto, ou instale o whisper.cpp via Settings.'
    )
  }

  const tmp = join(tmpdir(), `nexus-${randomUUID()}.wav`)
  try {
    writeFileSync(tmp, Buffer.from(wavBase64, 'base64'))
    const settings = loadSettings()
    const { stdout } = await execFileAsync(
      location.binary,
      [
        '-m', location.model,
        '-f', tmp,
        '-l', settings.language,
        '-otxt',
        '-nt',
        '-np'
      ],
      { maxBuffer: 4 * 1024 * 1024, timeout: 30000 }
    )
    return stdout.trim()
  } finally {
    try { unlinkSync(tmp) } catch { /* ignore */ }
  }
}

export function isWhisperAvailable(): boolean {
  return findWhisper() !== null
}
