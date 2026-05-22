import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir, homedir } from 'os'
import { randomUUID } from 'crypto'
import { resourcesPath } from '../paths'
import { loadSettings } from '../store/settings'
import { listRoutes, listTemplates } from '../store/routes'
import { getSlotValues } from '../router/slot-discovery'

const execFileAsync = promisify(execFile)

interface WhisperLocation {
  binary: string
  model: string
}

function userWhisperDir(): string {
  return join(homedir(), '.nexus', 'whisper')
}

function findWhisper(): WhisperLocation | null {
  const settings = loadSettings()
  const modelName = `ggml-${settings.whisperModel}.bin`

  const binaryPaths = [
    join(userWhisperDir(), 'whisper-cli'),
    join(resourcesPath(), 'whisper', 'whisper-cli'),
    '/opt/homebrew/bin/whisper-cli',
    '/usr/local/bin/whisper-cli'
  ]
  const modelPaths = [
    join(userWhisperDir(), modelName),
    join(resourcesPath(), 'whisper', modelName)
  ]

  const binary = binaryPaths.find((p) => existsSync(p))
  const model = modelPaths.find((p) => existsSync(p))

  if (binary && model) return { binary, model }
  return null
}

function buildVocabularyPrompt(): string {
  const words = new Set<string>()
  for (const r of listRoutes()) {
    words.add(r.command)
    r.aliases.slice(0, 2).forEach((a) => words.add(a))
  }
  for (const t of listTemplates()) {
    words.add(t.command)
    for (const slot of t.slots) {
      const values = getSlotValues(t, slot.name)
      for (const v of values) {
        words.add(v.value)
        ;(v.aliases ?? []).slice(0, 1).forEach((a) => words.add(a))
      }
    }
  }
  const list = Array.from(words).join(', ')
  return `Comandos e termos comuns deste app: ${list}.`
}

export async function transcribeAudio(wavBase64: string): Promise<string> {
  const location = findWhisper()
  if (!location) {
    throw new Error(
      'Whisper local não instalado. Verifique se há binário e modelo em ~/.nexus/whisper/.'
    )
  }

  const tmp = join(tmpdir(), `nexus-${randomUUID()}.wav`)
  try {
    writeFileSync(tmp, Buffer.from(wavBase64, 'base64'))
    const settings = loadSettings()
    const prompt = buildVocabularyPrompt()
    const { stdout } = await execFileAsync(
      location.binary,
      [
        '-m', location.model,
        '-f', tmp,
        '-l', settings.language,
        '--prompt', prompt,
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
