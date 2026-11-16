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
import { FPS, PAGES, SHOTS, SPEECH, TOTAL, VOICE_END, type Page, type Shot } from "./data";

const GOLD = "#E8C46A";
const FONT = "Cairo, sans-serif";
const f = (s: number) => Math.round(s * FPS);

// ---------- music ducking ----------
const MUSIC_FULL = 0.75;
const MUSIC_DUCKED = 0.14;
const RAMP = 0.3; // seconds

function musicVolume(frame: number): number {
  const t = frame / FPS;
  let duck = 0; // 0 = full, 1 = fully ducked
  for (const [s, e] of SPEECH) {
    const v = interpolate(t, [s - RAMP, s, e, e + RAMP], [0, 1, 1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    duck = Math.max(duck, v);
  }
  const vol = MUSIC_FULL + (MUSIC_DUCKED - MUSIC_FULL) * duck;
  const fadeOut = interpolate(t, [TOTAL - 0.9, TOTAL], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return vol * fadeOut;
}

// ---------- footage ----------
const ShotClip: React.FC<{ shot: Shot }> = ({ shot }) => {
  const frame = useCurrentFrame();
  const len = f(shot.end - shot.start);
  const p = frame / len;
  const scale =
    shot.zoom === "in" ? 1.0 + 0.08 * p : shot.zoom === "out" ? 1.08 - 0.08 * p : 1.03 + 0.02 * p;
  // quick "punch" at each cut
  const punch = interpolate(frame, [0, 5], [1.04, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ transform: `scale(${scale * punch})` }}>
      <OffthreadVideo
        src={staticFile("source.mp4")}
        trimBefore={f(shot.from)}
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </AbsoluteFill>
  );
};

// ---------- captions ----------
const CaptionPage: React.FC<{ page: Page; pageStart: number }> = ({ page, pageStart }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = pageStart + frame / fps;
  const enter = spring({ frame, fps, config: { damping: 14, stiffness: 180 } });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 560 }}>
      <div
        dir="rtl"
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0 44px",
          maxWidth: 940,
          transform: `translateY(${(1 - enter) * 40}px) scale(${0.85 + 0.15 * enter})`,
          opacity: enter,
        }}
      >
        {page.words.map((w, i) => {
          const active = t >= w.start && t < w.end;
          const spoken = t >= w.start;
          const pop = spring({ frame: frame - f(w.start - pageStart), fps, config: { damping: 12, stiffness: 260 } });
          const color = active || (spoken && w.accent) ? GOLD : "#FFFFFF";
          return (
            <span
              key={i}
              style={{
                fontFamily: FONT,
                fontWeight: 900,
                fontSize: w.accent ? 108 : 96,
                lineHeight: 1.35,
                color,
                opacity: spoken ? 1 : 0.55,
                transform: `scale(${active ? 1 + 0.1 * pop : 1})`,
                display: "inline-block",
                textShadow:
                  "0 0 3px #000, 3px 3px 0 #000, -3px 3px 0 #000, 3px -3px 0 #000, -3px -3px 0 #000, 0 4px 0 #000, 0 -4px 0 #000, 4px 0 0 #000, -4px 0 0 #000, 0 10px 28px rgba(0,0,0,0.6)",
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

// ---------- end card ----------
const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bg = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const a = spring({ frame, fps, config: { damping: 14 } });
  const b = spring({ frame: frame - 6, fps, config: { damping: 12 } });
  const c = spring({ frame: frame - 12, fps, config: { damping: 14 } });
  const pulse = 1 + 0.04 * Math.sin((frame / fps) * Math.PI * 3);
  return (
    <AbsoluteFill
      dir="rtl"
      style={{
        background: `rgba(11,11,12,${0.62 * bg})`,
        backdropFilter: `blur(${10 * bg}px)`,
        justifyContent: "center",
        alignItems: "center",
        fontFamily: FONT,
        color: "#fff",
        textAlign: "center",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 130, lineHeight: 1.25, transform: `scale(${a})` }}>
        عبايات <span style={{ color: GOLD }}>المخمل</span>
      </div>
      <div style={{ fontWeight: 700, fontSize: 64, opacity: a, marginTop: 4, color: GOLD }}>شتاء 2027</div>
      <div
        style={{
          marginTop: 80,
          background: GOLD,
          color: "#0B0B0C",
          fontWeight: 900,
          fontSize: 76,
          borderRadius: 28,
          padding: "14px 70px 26px",
          transform: `scale(${b * pulse})`,
        }}
      >
        اطلبي الآن
      </div>
      <div style={{ marginTop: 56, fontWeight: 700, fontSize: 50, opacity: c, lineHeight: 1.6 }}>
        الدفع عند الاستلام
        <br />
        التوصيل لـ 69 ولاية
      </div>
    </AbsoluteFill>
  );
};

// ---------- main ----------
export const AbayaAd: React.FC = () => {
  const [handle] = useState(() => delayRender("Loading Cairo font"));
  useEffect(() => {
    Promise.all([
      document.fonts.load(`900 96px Cairo`, "نجمة 2027"),
      document.fonts.load(`700 50px Cairo`, "الدفع 69"),
    ]).then(() => continueRender(handle));
  }, [handle]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {SHOTS.map((s, i) => (
        <Sequence key={i} from={f(s.start)} durationInFrames={f(s.end) - f(s.start)} premountFor={30}>
          <ShotClip shot={s} />
        </Sequence>
      ))}

      {/* soft gradient so captions stay readable */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.45) 78%, rgba(0,0,0,0.25) 100%)",
        }}
      />

      {PAGES.map((p, i) => {
        const start = p.words[0].start;
        const next = PAGES[i + 1]?.words[0].start ?? VOICE_END;
        return (
          <Sequence key={i} from={f(start)} durationInFrames={f(next) - f(start)}>
            <CaptionPage page={p} pageStart={start} />
          </Sequence>
        );
      })}

      <Sequence from={f(VOICE_END)}>
        <EndCard />
      </Sequence>

      <Audio src={staticFile("music.m4a")} volume={musicVolume} />
      <Audio src={staticFile("voice.m4a")} volume={1} />
    </AbsoluteFill>
  );
};
