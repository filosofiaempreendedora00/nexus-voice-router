import { useEffect, useRef } from 'react'
import { api } from '@/lib/api'

const TARGET_SAMPLE_RATE = 16000
const FRAME_SIZE = 1024              // ~64ms at 16kHz
const SPEECH_THRESHOLD = 0.04        // RMS threshold for speech detection
const SPEECH_START_FRAMES = 3        // ~200ms of energy before triggering
const SPEECH_END_FRAMES = 20         // ~1.28s of silence to end utterance
const PRE_ROLL_FRAMES = 6            // ~380ms of audio kept before speech onset
const MAX_CHUNK_FRAMES = 250         // ~16s safety cap

export function Capture(): JSX.Element {
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void start()
  }, [])
  return <div style={{ width: 0, height: 0 }} />
}

async function start(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  })
  const ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
  const source = ctx.createMediaStreamSource(stream)
  const processor = ctx.createScriptProcessor(FRAME_SIZE, 1, 1)

  const recent: Float32Array[] = []          // rolling pre-roll
  let speechBuffer: Float32Array[] | null = null
  let voicedFrames = 0
  let silentFrames = 0

  processor.onaudioprocess = (e): void => {
    const frame = new Float32Array(e.inputBuffer.getChannelData(0))
    const rms = computeRms(frame)
    const isVoiced = rms > SPEECH_THRESHOLD

    // Always keep pre-roll
    recent.push(frame)
    if (recent.length > PRE_ROLL_FRAMES) recent.shift()

    if (speechBuffer == null) {
      // Idle: look for speech start
      if (isVoiced) {
        voicedFrames += 1
        if (voicedFrames >= SPEECH_START_FRAMES) {
          // Speech started — prepend pre-roll
          speechBuffer = [...recent]
          silentFrames = 0
          api.wakeVoiceStart()
        }
      } else {
        voicedFrames = 0
      }
    } else {
      // Active: capture until end-of-speech
      speechBuffer.push(frame)
      if (isVoiced) {
        silentFrames = 0
      } else {
        silentFrames += 1
        if (silentFrames >= SPEECH_END_FRAMES || speechBuffer.length >= MAX_CHUNK_FRAMES) {
          flush(speechBuffer, ctx.sampleRate)
          api.wakeVoiceEnd()
          speechBuffer = null
          voicedFrames = 0
          silentFrames = 0
        }
      }
    }
  }

  source.connect(processor)
  processor.connect(ctx.destination)
}

function flush(frames: Float32Array[], sampleRate: number): void {
  const total = frames.reduce((n, f) => n + f.length, 0)
  if (total < sampleRate * 0.3) return  // shorter than 300ms? Probably noise.
  const pcm = new Float32Array(total)
  let offset = 0
  for (const f of frames) {
    pcm.set(f, offset)
    offset += f.length
  }
  const wav = encodeWav(pcm, sampleRate)
  void api.wakeChunk(arrayBufferToBase64(wav))
}

function computeRms(samples: Float32Array): number {
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)
  let offset = 44
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buffer
}

function writeString(view: DataView, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(binary)
}
