/* eslint-disable */
/**
 * NEXUS Mobile companion — captures audio on the phone, ships it to the Mac
 * over WebSocket, then renders the same wake-state HUD that the Mac shows
 * in the corner of the screen.
 *
 * The VAD / chunking logic is a faithful port of capture/Capture.tsx so the
 * audio chunks arriving at wake-service look identical to those from the
 * Mac's local mic. That keeps the rest of the pipeline (whisper, classifier,
 * agents) untouched and identical regardless of which input is active.
 */

// ============== Constants — KEEP IN SYNC with capture/Capture.tsx ==============
const TARGET_SAMPLE_RATE = 16000
const FRAME_SIZE = 1024
const SPEECH_THRESHOLD = 0.04
const SPEECH_START_FRAMES = 3
const SPEECH_END_FRAMES = 20
const PRE_ROLL_FRAMES = 6
const MAX_CHUNK_FRAMES = 470

// ============== DOM ==============
const orb = document.getElementById('orb')
const stateLabel = document.getElementById('state-label')
const connStatus = document.getElementById('conn-status')
const buffer = document.getElementById('buffer')
const replyCard = document.getElementById('reply-card')
const replyAgent = document.getElementById('reply-agent')
const replyContent = document.getElementById('reply-content')
const replyCost = document.getElementById('reply-cost')
const toggleBtn = document.getElementById('toggle')
const toggleText = toggleBtn.querySelector('.toggle-text')
const cancelBtn = document.getElementById('cancel-btn')

// ============== State ==============
let ws = null
let audioCtx = null
let micStream = null
let processor = null
let source = null
let micActive = false
let reconnectTimer = null
let lastWakeState = 'idle'

// ============== UI helpers ==============
function setOrbState(state) {
  if (state === lastWakeState) return
  lastWakeState = state
  orb.className = 'orb ' + (micActive ? state : 'muted')
  const label =
    !micActive ? 'mic desligado'
    : state === 'idle' ? 'Aguardando wake word'
    : state === 'hearing' ? 'ouvindo…'
    : state === 'listening' ? 'gravando comando'
    : state === 'thinking' ? 'processando…'
    : state === 'executed' ? 'pronto ✓'
    : state === 'error' ? 'erro'
    : 'Aguardando…'
  stateLabel.textContent = label

  // Cancel button: visible whenever the mic is ON, regardless of state.
  // Roberto wants the THIRD option always present alongside "Pausar mic"
  // and the "ok" voice commit. The cancel discards whatever buffer is
  // being captured AND aborts any in-flight Anthropic call — mic stays on
  // so he can immediately try again without re-tapping "Ativar mic".
  //
  // Label and urgency vary by state so he can read at a glance what's
  // about to be tossed:
  //   - idle / hearing: just "Cancelar áudio" (nothing committed yet,
  //     button is insurance against accidental wake)
  //   - listening: "Cancelar prompt" (red, gentle pulse — saves API call)
  //   - thinking: "Cancelar processamento" (red URGENT — every second
  //     costs tokens, button glows solid)
  if (micActive) {
    cancelBtn.classList.remove('hidden')
    cancelBtn.classList.toggle('urgent', state === 'thinking')
    const text =
      state === 'thinking'  ? 'Cancelar processamento'
      : state === 'listening' ? 'Cancelar prompt'
      : 'Cancelar áudio'
    cancelBtn.querySelector('.cancel-text').textContent = text
  } else {
    cancelBtn.classList.add('hidden')
    cancelBtn.classList.remove('urgent')
  }
}

function setBuffer(text) {
  if (!text) {
    buffer.classList.add('hidden')
    buffer.textContent = ''
  } else {
    buffer.classList.remove('hidden')
    buffer.textContent = text
  }
}

function setConn(status) {
  connStatus.className = 'conn-status ' + status
  connStatus.textContent =
    status === 'connected' ? 'conectado'
    : status === 'connecting' ? 'conectando…'
    : 'desconectado'
}

function showReply(payload) {
  replyAgent.textContent = payload.agentDisplayName || payload.agentId || '✨'
  replyContent.textContent = payload.content || ''
  if (payload.usage && typeof payload.usage.usd === 'number') {
    replyCost.textContent = formatUsd(payload.usage.usd)
    replyCost.style.display = ''
  } else {
    replyCost.style.display = 'none'
  }
  replyCard.classList.remove('hidden')
}

function formatUsd(usd) {
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  if (usd < 1) return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

function showError(msg) {
  const banner = document.createElement('div')
  banner.className = 'error-banner'
  banner.textContent = msg
  document.querySelector('main').prepend(banner)
}

// ============== WebSocket ==============
function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  setConn('connecting')

  // Same origin, ws:// for http, wss:// for https.
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${proto}//${location.host}/ws`
  try {
    ws = new WebSocket(url)
  } catch (err) {
    setConn('disconnected')
    scheduleReconnect()
    return
  }

  ws.binaryType = 'arraybuffer'

  ws.addEventListener('open', () => {
    setConn('connected')
    // Tell the Mac this is a mobile companion (not the Mac's own capture).
    ws.send(JSON.stringify({ type: 'hello', client: 'mobile-pwa' }))
  })

  ws.addEventListener('close', () => {
    setConn('disconnected')
    scheduleReconnect()
  })

  ws.addEventListener('error', () => {
    setConn('disconnected')
  })

  ws.addEventListener('message', (evt) => {
    if (typeof evt.data !== 'string') return
    try {
      const msg = JSON.parse(evt.data)
      handleServerMessage(msg)
    } catch (err) {
      console.warn('bad WS message', err)
    }
  })
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, 1500)
}

function handleServerMessage(msg) {
  if (msg.type === 'wakeStatus') {
    setOrbState(msg.state || 'idle')
    setBuffer(msg.buffer || '')
  } else if (msg.type === 'agentReply' && msg.role === 'assistant') {
    showReply(msg)
  } else if (msg.type === 'error') {
    showError(msg.message || 'Erro desconhecido')
  }
}

function send(obj) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify(obj))
}

function sendBinary(arrayBuffer) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(arrayBuffer)
}

// ============== Audio capture (VAD + chunking, mirrors Mac capture) ==============
async function startMic() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })
  } catch (err) {
    showError('Permissão de microfone negada. Habilite nas configurações do site.')
    return false
  }

  audioCtx = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: TARGET_SAMPLE_RATE
  })
  // iOS Safari sometimes locks AudioContext until user gesture — we already
  // are in a click handler, so resume() succeeds.
  await audioCtx.resume()

  source = audioCtx.createMediaStreamSource(micStream)
  processor = audioCtx.createScriptProcessor(FRAME_SIZE, 1, 1)

  const recent = []
  let speechBuffer = null
  let voicedFrames = 0
  let silentFrames = 0

  processor.onaudioprocess = (e) => {
    const frame = new Float32Array(e.inputBuffer.getChannelData(0))
    const rms = computeRms(frame)
    const isVoiced = rms > SPEECH_THRESHOLD

    recent.push(frame)
    if (recent.length > PRE_ROLL_FRAMES) recent.shift()

    if (speechBuffer == null) {
      if (isVoiced) {
        voicedFrames += 1
        if (voicedFrames >= SPEECH_START_FRAMES) {
          speechBuffer = recent.slice()
          silentFrames = 0
          send({ type: 'voiceStart' })
        }
      } else {
        voicedFrames = 0
      }
    } else {
      speechBuffer.push(frame)
      if (isVoiced) {
        silentFrames = 0
        if (speechBuffer.length >= MAX_CHUNK_FRAMES) {
          flush(speechBuffer, audioCtx.sampleRate)
          speechBuffer = recent.slice(-2)
          silentFrames = 0
        }
      } else {
        silentFrames += 1
        if (silentFrames >= SPEECH_END_FRAMES) {
          flush(speechBuffer, audioCtx.sampleRate)
          send({ type: 'voiceEnd' })
          speechBuffer = null
          voicedFrames = 0
          silentFrames = 0
        } else if (speechBuffer.length >= MAX_CHUNK_FRAMES) {
          flush(speechBuffer, audioCtx.sampleRate)
          speechBuffer = recent.slice(-2)
        }
      }
    }
  }

  source.connect(processor)
  processor.connect(audioCtx.destination)
  return true
}

function stopMic() {
  if (processor) { try { processor.disconnect() } catch {} processor = null }
  if (source) { try { source.disconnect() } catch {} source = null }
  if (audioCtx) { try { audioCtx.close() } catch {} audioCtx = null }
  if (micStream) {
    for (const track of micStream.getTracks()) track.stop()
    micStream = null
  }
}

function flush(frames, sampleRate) {
  const total = frames.reduce((n, f) => n + f.length, 0)
  if (total < sampleRate * 0.3) return
  const pcm = new Float32Array(total)
  let offset = 0
  for (const f of frames) {
    pcm.set(f, offset)
    offset += f.length
  }
  const wav = encodeWav(pcm, sampleRate)
  // Send as binary — server identifies any binary frame as audio chunk.
  sendBinary(wav)
}

function computeRms(samples) {
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / samples.length)
}

function encodeWav(samples, sampleRate) {
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

function writeString(view, offset, s) {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
}

// ============== Toggle mic button ==============
async function toggleMic() {
  if (micActive) {
    stopMic()
    micActive = false
    toggleBtn.classList.replace('on', 'off')
    toggleText.textContent = 'Ativar mic'
    setOrbState(lastWakeState)  // re-renders w/ muted because micActive=false
    return
  }
  const ok = await startMic()
  if (!ok) return
  micActive = true
  toggleBtn.classList.replace('off', 'on')
  toggleText.textContent = 'Pausar mic'
  setOrbState(lastWakeState)
}

toggleBtn.addEventListener('click', toggleMic)

cancelBtn.addEventListener('click', () => {
  // Tell the Mac to stop NOW. The wake-service.cancel() over there will
  // discard any captured buffer AND abort the in-flight Anthropic API call.
  send({ type: 'cancel' })
  // Optimistic UI: hide the button immediately. The real state update will
  // arrive over WS in a few ms via wakeStatus and confirm the transition.
  cancelBtn.classList.add('hidden')
  cancelBtn.classList.remove('urgent')
  // Light haptic feedback on supported devices (iOS Safari ≥17).
  if (navigator.vibrate) {
    try { navigator.vibrate(30) } catch { /* */ }
  }
})

// ============== Boot ==============
setOrbState('idle')
setConn('connecting')
connect()

// Keep audio alive on iOS — Safari pauses AudioContext when tab goes background.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
})
