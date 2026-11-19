import "@fontsource/cairo/700.css";
import "@fontsource/cairo/900.css";
import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  OffthreadVideo,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CTA_START, DURATION, FPS, GROUPS, SHOTS, SPEECH, TRANSITIONS, type Shot, type Word } from "./data";

const f = (s: number) => Math.round(s * FPS);
const FONT = "Cairo, sans-serif";
const YELLOW = "#FFD400";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// ---------------------------------------------------------------- footage
const TIN = 6; // frames of zoom-blur after a colour change
const TOUT = 4; // frames before it

const ShotClip: React.FC<{ shot: Shot }> = ({ shot }) => {
  const frame = useCurrentFrame();
  const len = f(shot.end) - f(shot.start);
  const p = frame / len;
  let scale = shot.zoom[0] + (shot.zoom[1] - shot.zoom[0]) * p;
  let blur = 0;
  let bright = 1;
  const enters = TRANSITIONS.some((t) => Math.abs(t - shot.start) < 1e-3);
  const exits = TRANSITIONS.some((t) => Math.abs(t - shot.end) < 1e-3);
  if (enters) {
    const k = interpolate(frame, [0, TIN], [1, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
    scale *= 1 + 0.14 * k;
    blur += 14 * k;
    bright += 0.25 * k;
  } else {
    // in-colour cut: tiny punch so the cut lands on the beat
    scale *= interpolate(frame, [0, 4], [1.035, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  }
  if (exits) {
    const k = interpolate(frame, [len - TOUT, len], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
    scale *= 1 + 0.1 * k;
    blur += 10 * k;
  }
  return (
    <AbsoluteFill
      style={{
        transform: `scale(${scale})`,
        transformOrigin: `${shot.ox ?? 50}% ${shot.oy ?? 50}%`,
        filter: blur > 0.05 || bright !== 1 ? `blur(${blur}px) brightness(${bright})` : undefined,
      }}
    >
      <OffthreadVideo
        src={staticFile(`v3/${shot.clip}.mp4`)}
        trimBefore={f(shot.from)}
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- captions
const capYAt = (t: number) => (SHOTS.find((s) => t >= s.start && t < s.end) ?? SHOTS[SHOTS.length - 1]).capY;

const CaptionGroup: React.FC<{ words: Word[]; start: number; ctaOn: boolean }> = ({ words, start, ctaOn }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = start + frame / fps;
  // the group sits where its first word's shot wants it; above the CTA region when the CTA is up
  const y = ctaOn ? 1455 : capYAt(start + 0.01);
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        dir="rtl"
        style={{
          position: "absolute",
          top: y,
          transform: "translateY(-50%)",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: "0 22px",
          maxWidth: 920,
        }}
      >
        {words.map((w, i) => {
          const local = frame - f(w.start - start);
          const inP = spring({ frame: local, fps, config: { damping: 13, stiffness: 320, mass: 0.6 } });
          const shown = local >= 0;
          const active = t >= w.start && t < w.end;
          return (
            <span
              key={i}
              style={{
                fontFamily: FONT,
                fontWeight: 900,
                fontSize: 94,
                lineHeight: 1.3,
                display: "inline-block",
                color: active ? YELLOW : "#FFFFFF",
                opacity: shown ? Math.min(1, inP * 1.4) : 0,
                transform: `translateY(${shown ? (1 - inP) * 26 : 26}px) scale(${shown ? 0.72 + 0.28 * inP : 0.72})`,
                textShadow:
                  "0 0 2px rgba(0,0,0,.95), 2px 2px 0 rgba(0,0,0,.85), -2px 2px 0 rgba(0,0,0,.85), 2px -2px 0 rgba(0,0,0,.85), -2px -2px 0 rgba(0,0,0,.85), 0 6px 18px rgba(0,0,0,.45)",
              }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- CTA
const Cta: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = spring({ frame, fps, config: { damping: 15, stiffness: 170 } });
  const arrowIn = spring({ frame: frame - 6, fps, config: { damping: 10, stiffness: 220 } });
  const bob = Math.abs(Math.sin((frame / fps) * Math.PI * 1.8)) * 16;
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      {/* glass card, like an iPhone notification */}
      <div
        dir="rtl"
        style={{
          position: "absolute",
          top: 1000,
          width: 800,
          padding: "26px 36px 30px",
          borderRadius: 44,
          background: "rgba(255,255,255,0.20)",
          border: "2px solid rgba(255,255,255,0.65)",
          boxShadow: "0 18px 50px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.6)",
          backdropFilter: "blur(22px) saturate(160%)",
          WebkitBackdropFilter: "blur(22px) saturate(160%)",
          textAlign: "center",
          fontFamily: FONT,
          color: "#fff",
          opacity: inP,
          transform: `translateY(${(1 - inP) * 60}px) scale(${0.9 + 0.1 * inP})`,
          textShadow: "0 2px 10px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 96, lineHeight: 1.25 }}>اطلبيها الآن</div>
        <div style={{ fontWeight: 700, fontSize: 52, lineHeight: 1.3, marginTop: 2 }}>عبايات شمس 2027</div>
      </div>
      {/* small red arrow pointing down */}
      <svg
        width="70"
        height="86"
        viewBox="0 0 70 86"
        style={{
          position: "absolute",
          top: 1272,
          transform: `translateY(${bob}px) scale(${arrowIn})`,
          filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.45))",
        }}
      >
        <path d="M27 4 h16 v44 h20 L35 82 L7 48 h20 z" fill="#E5202E" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
      </svg>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- audio
const MUSIC_BASE = 0.3;
const MUSIC_DUCK = 0.16;
function musicVolume(frame: number) {
  const t = frame / FPS;
  let duck = 0;
  for (const [s, e] of SPEECH) {
    duck = Math.max(duck, interpolate(t, [s - 0.15, s, e, e + 0.2], [0, 1, 1, 0], clamp));
  }
  const v = MUSIC_BASE + (MUSIC_DUCK - MUSIC_BASE) * duck;
  const fade = Math.min(interpolate(t, [0, 0.5], [0, 1], clamp), interpolate(t, [DURATION - 0.9, DURATION], [1, 0], clamp));
  return v * fade;
}
const WHOOSH_PEAK = 0.26; // seconds into whoosh.wav where it peaks
const WHOOSH_VOL = 0.32;

// ---------------------------------------------------------------- main
export const ChamsReel: React.FC = () => {
  const [handle] = useState(() => delayRender("Loading Cairo"));
  useEffect(() => {
    Promise.all([document.fonts.load(`900 94px Cairo`, "عبايات شمس 2027"), document.fonts.load(`700 52px Cairo`, "عبايات 2027")]).then(() =>
      continueRender(handle),
    );
  }, [handle]);
  const total = f(DURATION);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {SHOTS.map((s, i) => (
        <Sequence key={i} from={f(s.start)} durationInFrames={Math.min(total, f(s.end)) - f(s.start)} premountFor={30}>
          <ShotClip shot={s} />
        </Sequence>
      ))}

      {/* soft bottom gradient so white captions read on bright stone */}
      <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0) 55%, rgba(0,0,0,0.28) 82%, rgba(0,0,0,0.15) 100%)" }} />

      <Sequence from={f(CTA_START)}>
        <Cta />
      </Sequence>

      {GROUPS.map((g, i) => {
        const start = g[0].start;
        const next = GROUPS[i + 1]?.[0].start ?? DURATION;
        return (
          <Sequence key={i} from={f(start)} durationInFrames={f(next) - f(start)}>
            <CaptionGroup words={g} start={start} ctaOn={start >= CTA_START - 1e-3} />
          </Sequence>
        );
      })}

      <Audio src={staticFile("music.m4a")} volume={musicVolume} />
      <Audio src={staticFile("v3/voice.wav")} volume={1} />
      {TRANSITIONS.map((t, i) => (
        <Sequence key={i} from={f(t - WHOOSH_PEAK)} durationInFrames={f(0.6)}>
          <Audio src={staticFile("v3/whoosh.wav")} volume={WHOOSH_VOL} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
