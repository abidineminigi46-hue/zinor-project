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
  staticFile,
  useCurrentFrame,
} from "remotion";
import { EndCard, musicVolume } from "./AbayaAd";
import { FPS, TOTAL, VOICE_END } from "./data";

// Second ad: new clips (public/v2/c1..c5.mp4), same voice-over and music as v1.
// No on-screen text until the end card.
//   c1 brown satin, night alley   c2 olive velvet, hallway   c3 grey, terrace
//   c4 purple satin, wall         c5 gold, courtyard
const f = (s: number) => Math.round(s * FPS);

type Shot = { start: number; end: number; clip: string; from: number; zoom?: "in" | "out" };
const SHOTS_V2: Shot[] = [
  { start: 0.0, end: 2.4, clip: "c2", from: 3.0, zoom: "in" }, // "راكي حابة تكونين نجمة كل المناسبات؟" – olive, facing camera
  { start: 2.4, end: 4.28, clip: "c5", from: 2.0, zoom: "out" }, // "عبايات شمس 2027" – gold
  { start: 4.28, end: 5.88, clip: "c4", from: 4.0 }, // "راهم دايرين حالة" – purple spin
  { start: 5.88, end: 8.26, clip: "c3", from: 0.0, zoom: "in" }, // "تصميم جمعت بين الأناقة والفخامة" – grey
  { start: 8.26, end: 10.34, clip: "c1", from: 0.0 }, // "تخطفي الأنظار في الأعراس" – brown, doorway
  { start: 10.34, end: 12.42, clip: "c1", from: 5.5, zoom: "out" }, // "سهرات رمضان وحتى يوم العيد" – brown, lanterns
  { start: 12.42, end: 15.38, clip: "c3", from: 5.0 }, // "بأسعار تنافسية" – grey twirl
  { start: 15.38, end: 17.52, clip: "c4", from: 6.6, zoom: "in" }, // "ما تراطيش لافار، اطلبيها اليوم" – purple, points at camera
  { start: 17.52, end: TOTAL, clip: "c5", from: 7.0, zoom: "out" }, // "التوصيل متوفر لـ 69 ولاية" + end card – gold spin
];

const Clip: React.FC<{ shot: Shot }> = ({ shot }) => {
  const frame = useCurrentFrame();
  const p = frame / f(shot.end - shot.start);
  const scale = shot.zoom === "in" ? 1 + 0.07 * p : shot.zoom === "out" ? 1.07 - 0.07 * p : 1.02 + 0.02 * p;
  const punch = interpolate(frame, [0, 5], [1.04, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ transform: `scale(${scale * punch})` }}>
      <OffthreadVideo
        src={staticFile(`v2/${shot.clip}.mp4`)}
        trimBefore={f(shot.from)}
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </AbsoluteFill>
  );
};

export const AbayaAdV2: React.FC = () => {
  const [handle] = useState(() => delayRender("Loading Cairo font"));
  useEffect(() => {
    Promise.all([
      document.fonts.load(`900 96px Cairo`, "عبايات شمس 2027"),
      document.fonts.load(`700 50px Cairo`, "الدفع 69"),
    ]).then(() => continueRender(handle));
  }, [handle]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {SHOTS_V2.map((s, i) => (
        <Sequence key={i} from={f(s.start)} durationInFrames={f(s.end) - f(s.start)} premountFor={30}>
          <Clip shot={s} />
        </Sequence>
      ))}

      <Sequence from={f(VOICE_END)}>
        <EndCard />
      </Sequence>

      <Audio src={staticFile("music.m4a")} volume={musicVolume} />
      <Audio src={staticFile("voice.m4a")} volume={1} />
    </AbsoluteFill>
  );
};
