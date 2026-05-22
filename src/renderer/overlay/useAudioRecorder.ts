import { useRef, useState, useCallback } from 'react'

interface RecorderState {
  recording: boolean
  level: number
}

const TARGET_SAMPLE_RATE = 16000

export function useAudioRecorder(): {
  state: RecorderState
  start: () => Promise<void>
  stop: () => Promise<string>
  cancel: () => void
} {
  const [state, setState] = useState<RecorderState>({ recording: false, level: 0 })
  const stream = useRef<MediaStream | null>(null)
  const audioCtx = useRef<AudioContext | null>(null)
  const processor = useRef<ScriptProcessorNode | null>(null)
  const source = useRef<MediaStreamAudioSourceNode | null>(null)
  const analyser = useRef<AnalyserNode | null>(null)
  const rafId = useRef<number | null>(null)
  const pcmChunks = useRef<Float32Array[]>([])

  const start = useCallback(async () => {
    pcmChunks.current = []

    stream.current = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })

    audioCtx.current = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
    source.current = audioCtx.current.createMediaStreamSource(stream.current)

    // Level meter
    analyser.current = audioCtx.current.createAnalyser()
    analyser.current.fftSize = 256
    source.current.connect(analyser.current)
    const levelData = new Uint8Array(analyser.current.frequencyBinCount)
    const tick = (): void => {
      if (!analyser.current) return
      analyser.current.getByteFrequencyData(levelData)
      const avg = levelData.reduce((a, b) => a + b, 0) / levelData.length
      setState((s) => ({ ...s, level: avg / 255 }))
      rafId.current = requestAnimationFrame(tick)
    }
    tick()

    // PCM capture (ScriptProcessor is deprecated but reliable in Electron)
    const bufferSize = 4096
    processor.current = audioCtx.current.createScriptProcessor(bufferSize, 1, 1)
    processor.current.onaudioprocess = (e): void => {
      const channel = e.inputBuffer.getChannelData(0)
      pcmChunks.current.push(new Float32Array(channel))
    }
    source.current.connect(processor.current)
    processor.current.connect(audioCtx.current.destination)

    setState({ recording: true, level: 0 })
  }, [])

  const stop = useCallback(async (): Promise<string> => {
    const sampleRate = audioCtx.current?.sampleRate ?? TARGET_SAMPLE_RATE
    const chunks = pcmChunks.current.slice()
    cleanup()

    if (chunks.length === 0) return ''
    const totalLen = chunks.reduce((n, c) => n + c.length, 0)
    const pcm = new Float32Array(totalLen)
    let offset = 0
    for (const c of chunks) {
      pcm.set(c, offset)
      offset += c.length
    }
    const wav = encodeWav(pcm, sampleRate)
    return arrayBufferToBase64(wav)
  }, [])

  const cancel = useCallback(() => {
    cleanup()
  }, [])

  function cleanup(): void {
    if (rafId.current != null) cancelAnimationFrame(rafId.current)
    rafId.current = null

    if (processor.current) {
      try { processor.current.disconnect() } catch { /* ignore */ }
      processor.current.onaudioprocess = null
      processor.current = null
    }
    if (source.current) {
      try { source.current.disconnect() } catch { /* ignore */ }
      source.current = null
    }
    if (analyser.current) {
      try { analyser.current.disconnect() } catch { /* ignore */ }
      analyser.current = null
    }
    if (stream.current) {
      stream.current.getTracks().forEach((t) => t.stop())
      stream.current = null
    }
    if (audioCtx.current) {
      audioCtx.current.close().catch(() => {/* ignore */})
      audioCtx.current = null
    }
    setState({ recording: false, level: 0 })
  }

  return { state, start, stop, cancel }
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

  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)                 // chunk size
  view.setUint16(20, 1, true)                  // audio format = PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  // PCM samples (Float32 -> Int16)
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
