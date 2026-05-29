import { useEffect, useState, useRef } from 'react'
import type { WakeStatus, WakeState } from '@shared/types'
import { api } from '@/lib/api'

export function Hud(): JSX.Element {
  const [status, setStatus] = useState<WakeStatus>({ state: 'idle' })
  const [wakeKey, setWakeKey] = useState(0)
  const prevState = useRef<WakeState>('idle')

  useEffect(() => {
    void api.getWakeStatus().then(setStatus)
    return api.onWakeStatus((s) => {
      setStatus(s)
      // Dramatic bounce animation only on commit (thinking), not on listening start.
      if (s.state === 'thinking' && prevState.current !== 'thinking') {
        setWakeKey((k) => k + 1)
      }
      prevState.current = s.state
    })
  }, [])

  return (
    <div
      className="h-screen w-screen flex items-center justify-center select-none overflow-visible"
      style={{ ['WebkitAppRegion' as never]: 'drag' }}
    >
      <Orb state={status.state} wakeKey={wakeKey} />
      <style>{styles}</style>
    </div>
  )
}

function Orb({ state, wakeKey }: { state: WakeState; wakeKey: number }): JSX.Element {
  const isListening = state === 'listening'
  const isThinking = state === 'thinking'
  const isExecuted = state === 'executed'
  const isError = state === 'error'
  const isHearing = state === 'hearing'

  return (
    <div
      key={isThinking ? `wake-${wakeKey}` : `s-${state}`}
      className={`orb orb-${state}`}
    >
      {/* Hearing: barely-there pulse so the user sees "I'm awake & sensing audio". */}
      {isHearing && <div className="ring ring-hearing" />}
      {/* Listening: a visible breathing halo + ring — NEXUS confirmed the wake
          word and is capturing the command. Clearly distinct from hearing. */}
      {isListening && <div className="halo halo-wake" />}
      {isListening && <div className="ring ring-wake" />}
      {/* Thinking gets the dramatic rotating comet ring (commit moment) */}
      {isThinking && <div className="ring ring-listening" />}
      {/* Outer glow halo — only on commit (thinking) and result states */}
      {(isThinking || isExecuted || isError) && <div className={`halo halo-${isThinking ? 'listening' : state}`} />}
      {/* Core orb with gradient */}
      <div className="core" />
      {/* Specular highlight */}
      <div className="shine" />
    </div>
  )
}

const styles = `
:root {
  --orb-bg: rgba(20, 20, 28, 0.92);
  --orb-border: rgba(255, 255, 255, 0.06);
  --purple-bright: rgb(180, 184, 255);
  --purple: rgb(124, 127, 246);
  --purple-deep: rgb(80, 82, 200);
  --purple-trans: rgba(124, 127, 246, 0.4);
  --green-bright: rgb(120, 230, 165);
  --green: rgb(34, 197, 94);
  --warning: rgb(245, 158, 11);
}

body { background: transparent; margin: 0; }

.orb {
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: width 280ms cubic-bezier(0.34, 1.4, 0.64, 1),
              height 280ms cubic-bezier(0.34, 1.4, 0.64, 1);
}

.core {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle at 32% 24%,
    rgba(255, 255, 255, 0.12) 0%,
    var(--orb-bg) 65%,
    rgba(8, 8, 14, 0.95) 100%);
  border: 1px solid var(--orb-border);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  transition: background 320ms ease, border-color 320ms ease, box-shadow 320ms ease;
}

.shine {
  position: absolute;
  top: 12%;
  left: 22%;
  width: 32%;
  height: 22%;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 70%);
  pointer-events: none;
}

/* IDLE */
.orb-idle {
  width: 22px;
  height: 22px;
  animation: idleBreathe 4.5s ease-in-out infinite;
}
.orb-idle .core {
  background: radial-gradient(circle at 32% 24%,
    rgba(255, 255, 255, 0.05) 0%,
    rgba(28, 28, 38, 0.92) 100%);
}

@keyframes idleBreathe {
  0%, 100% { opacity: 0.55; transform: scale(0.96); }
  50%      { opacity: 0.85; transform: scale(1); }
}

/* HEARING — subtle waking up */
.orb-hearing {
  width: 28px;
  height: 28px;
}
.orb-hearing .core {
  background: radial-gradient(circle at 32% 24%,
    rgba(180, 184, 255, 0.18) 0%,
    rgba(40, 40, 56, 0.96) 75%);
  border-color: rgba(124, 127, 246, 0.25);
}

.ring-hearing {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1px solid rgba(124, 127, 246, 0.35);
  animation: ringFadeIn 240ms ease-out;
}

@keyframes ringFadeIn {
  from { opacity: 0; transform: scale(0.9); }
  to   { opacity: 1; transform: scale(1); }
}

/* LISTENING — wake-word confirmed. Clearly different from HEARING so Roberto
   knows the magic happened (NEXUS recognized "Nexus"/"Octopus claude"/etc.
   and is now capturing the command). Slightly bigger, visibly purple-tinted
   core, and a soft breathing halo + outer ring. NOT as dramatic as THINKING:
   the commit moment should still feel like an escalation, not a downgrade. */
.orb-listening {
  width: 32px;
  height: 32px;
  animation: listenBreatheGentle 2.2s ease-in-out infinite;
}
.orb-listening .core {
  background: radial-gradient(circle at 32% 24%,
    rgba(180, 184, 255, 0.55) 0%,
    rgba(124, 127, 246, 0.65) 40%,
    rgba(50, 52, 130, 0.95) 100%);
  border-color: rgba(180, 184, 255, 0.45);
  box-shadow:
    0 0 0 1px rgba(180, 184, 255, 0.3),
    0 6px 20px -4px rgba(124, 127, 246, 0.55),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
.orb-listening .shine {
  background: radial-gradient(ellipse at center, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 70%);
}

@keyframes listenBreatheGentle {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.05); }
}

/* The "wake confirmed" halo — calm pulsing glow around the listening orb. */
.halo-wake {
  position: absolute;
  inset: -10px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(124, 127, 246, 0.32) 0%, rgba(124, 127, 246, 0) 65%);
  animation: haloBreatheSlow 2.4s ease-in-out infinite;
  pointer-events: none;
}

.ring-wake {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  border: 1.5px solid rgba(180, 184, 255, 0.55);
  animation: ringPulse 2.4s ease-in-out infinite;
  pointer-events: none;
}

@keyframes haloBreatheSlow {
  0%, 100% { opacity: 0.6; transform: scale(0.96); }
  50%      { opacity: 1;   transform: scale(1.04); }
}

@keyframes ringPulse {
  0%, 100% { opacity: 0.4; transform: scale(0.95); }
  50%      { opacity: 0.85; transform: scale(1.08); }
}

.halo-listening {
  position: absolute;
  inset: -14px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(124, 127, 246, 0.45) 0%, rgba(124, 127, 246, 0) 60%);
  filter: blur(1px);
  animation: haloBreathe 2.6s ease-in-out infinite;
}

.ring-listening {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    rgba(180, 184, 255, 0) 0deg,
    rgba(180, 184, 255, 0.85) 70deg,
    rgba(180, 184, 255, 0) 130deg,
    rgba(180, 184, 255, 0) 360deg
  );
  -webkit-mask: radial-gradient(circle, transparent 60%, black 64%, black 70%, transparent 74%);
          mask: radial-gradient(circle, transparent 60%, black 64%, black 70%, transparent 74%);
  animation: ringSpin 2.6s linear infinite;
}

@keyframes wakeBounce {
  0%   { transform: scale(0.6); }
  40%  { transform: scale(1.18); }
  72%  { transform: scale(0.96); }
  100% { transform: scale(1); }
}

@keyframes listenBreathe {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.04); }
}

@keyframes haloBreathe {
  0%, 100% { opacity: 0.75; transform: scale(1); }
  50%      { opacity: 1;    transform: scale(1.06); }
}

@keyframes ringSpin {
  to { transform: rotate(360deg); }
}

/* THINKING — the showcase / commit moment.
   Inherits the dramatic look the previous "listening" had: full purple gradient,
   wake bounce animation on entry, rotating comet ring, breathing halo. */
.orb-thinking {
  width: 38px;
  height: 38px;
  animation: wakeBounce 540ms cubic-bezier(0.34, 1.5, 0.64, 1) 1,
             listenBreathe 2.6s ease-in-out 540ms infinite;
}
.orb-thinking .core {
  background: radial-gradient(circle at 32% 24%,
    var(--purple-bright) 0%,
    var(--purple) 45%,
    var(--purple-deep) 100%);
  border-color: rgba(180, 184, 255, 0.5);
  box-shadow:
    0 0 0 1px rgba(180, 184, 255, 0.35),
    inset 0 -2px 6px rgba(0, 0, 0, 0.25),
    inset 0 2px 4px rgba(255, 255, 255, 0.18);
}
.orb-thinking .shine {
  background: radial-gradient(ellipse at center, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 70%);
}

/* EXECUTED */
.orb-executed {
  width: 36px;
  height: 36px;
}
.orb-executed .core {
  background: radial-gradient(circle at 32% 24%,
    var(--green-bright) 0%,
    var(--green) 60%,
    rgb(20, 130, 60) 100%);
  border-color: rgba(120, 230, 165, 0.5);
  box-shadow:
    0 0 0 1px rgba(120, 230, 165, 0.4),
    inset 0 -2px 6px rgba(0, 0, 0, 0.25),
    inset 0 2px 4px rgba(255, 255, 255, 0.2);
}

.halo-executed {
  position: absolute;
  inset: -16px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(34, 197, 94, 0.42) 0%, rgba(34, 197, 94, 0) 60%);
  animation: haloBurst 900ms ease-out;
}

@keyframes haloBurst {
  0%   { opacity: 1; transform: scale(0.7); }
  100% { opacity: 0; transform: scale(1.4); }
}

/* ERROR */
.orb-error {
  width: 32px;
  height: 32px;
}
.orb-error .core {
  background: radial-gradient(circle at 32% 24%,
    rgba(255, 220, 130, 0.7) 0%,
    var(--warning) 60%,
    rgb(180, 110, 8) 100%);
  border-color: rgba(245, 158, 11, 0.5);
}
.halo-error {
  position: absolute;
  inset: -12px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(245, 158, 11, 0.35) 0%, rgba(245, 158, 11, 0) 60%);
}
`
