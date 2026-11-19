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
import type { Word } from "../chams/data";
import { CTA_START, CUTS, DURATION, FPS, GROUPS, SFX_GAIN, SHOTS, SPEECH, type Shot } from "./data";

const f = (s: number) => Math.round(s * FPS);
const FONT = "Cairo, sans-serif";
const YELLOW = "#FFD400";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const isCut = (t: number) => CUTS.some((c) => Math.abs(c - t) < 1e-3);

// ---------------------------------------------------------------- footage
const ShotClip: React.FC<{ shot: Shot }> = ({ shot }) => {
  const frame = useCurrentFrame();
  const len = f(shot.end) - f(shot.start);
  let scale = shot.zoom[0] + (shot.zoom[1] - shot.zoom[0]) * (frame / len);
  let blur = 0;
  if (isCut(shot.start)) {
    // short zoom-blur in on colour changes
    const k = interpolate(frame, [0, 6], [1, 0], { ...clamp, easing: Easing.out(Easing.cubic) });
    scale *= 1 + 0.12 * k;
    blur += 12 * k;
  } else {
    scale *= interpolate(frame, [0, 4], [1.035, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  }
  if (isCut(shot.end)) {
    const k = interpolate(frame, [len - 4, len], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
    scale *= 1 + 0.08 * k;
    blur += 8 * k;
  }
  return (
    <AbsoluteFill
      style={{
        transform: `scale(${scale})`,
        transformOrigin: `${shot.ox ?? 50}% ${shot.oy ?? 50}%`,
        filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
      }}
    >
      <OffthreadVideo
        src={staticFile(`v4/${shot.clip}.mp4`)}
        trimBefore={f(shot.from)}
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- captions
// The whole group appears at once and stays put; only the colour moves from word to word.
const capYAt = (t: number) => (SHOTS.find((s) => t >= s.start && t < s.end) ?? SHOTS[SHOTS.length - 1]).capY;

const CaptionGroup: React.FC<{ words: Word[]; start: number }> = ({ words, start }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = start + frame / fps;
  const inP = spring({ frame, fps, config: { damping: 16, stiffness: 300, mass: 0.6 } });
  const y = capYAt(start + 0.01);
  return (
    <AbsoluteFill style={{ alignItems: "center" }}>
      <div
        dir="rtl"
        style={{
          position: "absolute",
          top: y,
          transform: `translateY(-50%) translateY(${(1 - inP) * 18}px) scale(${0.9 + 0.1 * inP})`,
          opacity: Math.min(1, inP * 1.5),
          display: "flex",
          flexWrap: "nowrap",
          justifyContent: "center",
          alignItems: "center",
          gap: "0 22px",
          whiteSpace: "nowrap",
        }}
      >
        {words.map((w, i) => {
          const active = t >= w.start && t < w.end;
          return (
            <span
              key={i}
              style={{
                fontFamily: FONT,
                fontWeight: 900,
                fontSize: 92,
                lineHeight: 1.3,
                color: active ? YELLOW : "#FFFFFF",
                textShadow:
                  "0 0 2px rgba(0,0,0,.95), 2px 2px 0 rgba(0,0,0,.85), -2px 2px 0 rgba(0,0,0,.85), 2px -2px 0 rgba(0,0,0,.85), -2px -2px 0 rgba(0,0,0,.85), 0 6px 18px rgba(0,0,0,.4)",
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
      <div
        dir="rtl"
        style={{
          position: "absolute",
          top: 990,
          width: 800,
          padding: "24px 36px 28px",
          borderRadius: 44,
          background: "rgba(255,255,255,0.18)",
          border: "2px solid rgba(255,255,255,0.7)",
          boxShadow: "0 18px 50px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.6)",
          backdropFilter: "blur(22px) saturate(150%)",
          WebkitBackdropFilter: "blur(22px) saturate(150%)",
          textAlign: "center",
          fontFamily: FONT,
          color: "#fff",
          opacity: inP,
          transform: `translateY(${(1 - inP) * 60}px) scale(${0.9 + 0.1 * inP})`,
          textShadow: "0 2px 10px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 52, lineHeight: 1.3 }}>عبايات شمس 2027</div>
        <div style={{ fontWeight: 900, fontSize: 96, lineHeight: 1.25, marginTop: 2 }}>اطلبيها الآن</div>
      </div>
      <svg
        width="70"
        height="86"
        viewBox="0 0 70 86"
        style={{ position: "absolute", top: 1262, transform: `translateY(${bob}px) scale(${arrowIn})`, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.5))" }}
      >
        <path d="M27 4 h16 v44 h20 L35 82 L7 48 h20 z" fill="#E5202E" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
      </svg>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- audio (same music + voice as the first reel)
const MUSIC_BASE = 0.3;
const MUSIC_DUCK = 0.16;
function musicVolume(frame: number) {
  const t = frame / FPS;
  let duck = 0;
  for (const [s, e] of SPEECH) duck = Math.max(duck, interpolate(t, [s - 0.15, s, e, e + 0.2], [0, 1, 1, 0], clamp));
  const v = MUSIC_BASE + (MUSIC_DUCK - MUSIC_BASE) * duck;
  return v * Math.min(interpolate(t, [0, 0.5], [0, 1], clamp), interpolate(t, [DURATION - 0.9, DURATION], [1, 0], clamp));
}
const SFX_PULSE = 0.3; // seconds into velvet-swish.wav where the soft pulse hits
const SFX_VOL = 0.25;

// ---------------------------------------------------------------- main
export const SalonReel: React.FC = () => {
  const [handle] = useState(() => delayRender("Loading Cairo"));
  useEffect(() => {
    Promise.all([document.fonts.load(`900 92px Cairo`, "عبايات شمس 2027"), document.fonts.load(`700 52px Cairo`, "عبايات 2027")]).then(() =>
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

      <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0) 55%, rgba(0,0,0,0.25) 82%, rgba(0,0,0,0.12) 100%)" }} />

      <Sequence from={f(CTA_START)}>
        <Cta />
      </Sequence>

      {GROUPS.map((g, i) => {
        const start = g[0].start;
        const next = GROUPS[i + 1]?.[0].start ?? DURATION;
        return (
          <Sequence key={i} from={f(start)} durationInFrames={f(next) - f(start)}>
            <CaptionGroup words={g} start={start} />
          </Sequence>
        );
      })}

      <Audio src={staticFile("music.m4a")} volume={musicVolume} />
      <Audio src={staticFile("v3/voice.wav")} volume={1} />
      {CUTS.map((c, i) => (
        // the pulse (0.30 s into the file) lands on the first frame of the new shot
        <Sequence key={i} from={f(c) - f(SFX_PULSE)} durationInFrames={f(0.65)}>
          <Audio src={staticFile("v4/velvet-swish.wav")} volume={SFX_VOL * (SFX_GAIN[c] ?? 1)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
