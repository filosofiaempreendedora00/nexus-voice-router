import { useRef, useState, useCallback } from 'react'

interface RecorderState {
  recording: boolean
  level: number
}

export function useAudioRecorder(): {
  state: RecorderState
  start: () => Promise<void>
  stop: () => Promise<string>
  cancel: () => void
} {
  const [state, setState] = useState<RecorderState>({ recording: false, level: 0 })
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const audioCtx = useRef<AudioContext | null>(null)
  const rafId = useRef<number | null>(null)

  const start = useCallback(async () => {
    chunks.current = []
    stream.current = await navigator.mediaDevices.getUserMedia({ audio: true })

    audioCtx.current = new AudioContext()
    const source = audioCtx.current.createMediaStreamSource(stream.current)
    const analyser = audioCtx.current.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    const tick = (): void => {
      analyser.getByteFrequencyData(data)
      const avg = data.reduce((a, b) => a + b, 0) / data.length
      setState((s) => ({ ...s, level: avg / 255 }))
      rafId.current = requestAnimationFrame(tick)
    }
    tick()

    mediaRecorder.current = new MediaRecorder(stream.current, { mimeType: 'audio/webm' })
    mediaRecorder.current.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data)
    }
    mediaRecorder.current.start(100)
    setState({ recording: true, level: 0 })
  }, [])

  const stop = useCallback(async (): Promise<string> => {
    return new Promise((resolve) => {
      const rec = mediaRecorder.current
      if (!rec) {
        resolve('')
        return
      }
      rec.onstop = async () => {
        const blob = new Blob(chunks.current, { type: 'audio/webm' })
        cleanup()
        const buffer = await blob.arrayBuffer()
        const base64 = arrayBufferToBase64(buffer)
        resolve(base64)
      }
      rec.stop()
    })
  }, [])

  const cancel = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
      mediaRecorder.current.stop()
    }
    cleanup()
  }, [])

  function cleanup(): void {
    if (rafId.current != null) cancelAnimationFrame(rafId.current)
    rafId.current = null
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    audioCtx.current?.close()
    audioCtx.current = null
    mediaRecorder.current = null
    setState({ recording: false, level: 0 })
  }

  return { state, start, stop, cancel }
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
