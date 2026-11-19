// «عبايات شمس 2027» — second ad: avatar without hijab, living room at night (public/v4/*.mp4).
// Same voice-over, music and caption timing as the first reel (src/chams). Times in seconds.

export { DURATION, FPS, GROUPS, SPEECH, CTA_START } from "../chams/data";

export type Clip = "burgundy" | "olive" | "blue" | "brown" | "black" | "mauve";

// zoom: scale start → end; ox/oy: zoom origin in %; capY: caption centre (px of 1920),
// set per shot so the line never covers the face or the hand showing the abaya.
export type Shot = { start: number; end: number; clip: Clip; from: number; zoom: [number, number]; ox?: number; oy?: number; capY: number };

// Main cuts sit in the pause just before each sentence starts (speech onsets 2.63 · 6.16 · 8.51 · 12.66),
// so the transition pulse lands in the pause and never on a word. 16.81 = «اطلبيها» (no pause there).
export const CUTS = [2.57, 6.1, 8.45, 12.6, 16.81];

import { DURATION } from "../chams/data";

export const SHOTS: Shot[] = [
  // 0 – 2.57  burgundy, front: opens the abaya on the first word, then the velvet folds up close
  { start: 0.0, end: 1.37, clip: "burgundy", from: 0.6, zoom: [1.04, 1.0], ox: 50, oy: 40, capY: 1460 },
  { start: 1.37, end: 2.57, clip: "burgundy", from: 3.0, zoom: [1.26, 1.32], ox: 50, oy: 66, capY: 1460 },
  // 2.57 – 6.10  olive: walks away, the fabric falls and swings; punch-in on the drape mid-walk
  { start: 2.57, end: 4.36, clip: "olive", from: 1.0, zoom: [1.0, 1.04], ox: 50, oy: 50, capY: 1460 },
  { start: 4.36, end: 6.1, clip: "olive", from: 2.79, zoom: [1.16, 1.2], ox: 50, oy: 72, capY: 1460 },
  // 6.10 – 8.45  midnight blue: extends the arm to show the sleeve width, then the sleeve seam up close
  { start: 6.1, end: 7.25, clip: "blue", from: 1.55, zoom: [1.0, 1.04], ox: 50, oy: 50, capY: 1080 },
  { start: 7.25, end: 8.45, clip: "blue", from: 2.8, zoom: [1.28, 1.34], ox: 22, oy: 52, capY: 1080 },
  // 8.45 – 12.60  chocolate brown, seated: hand glides over the velvet (wide → close), then a smile
  { start: 8.45, end: 9.83, clip: "brown", from: 0.4, zoom: [1.0, 1.04], ox: 50, oy: 50, capY: 1470 },
  { start: 9.83, end: 11.34, clip: "brown", from: 1.78, zoom: [1.3, 1.36], ox: 48, oy: 58, capY: 1490 },
  { start: 11.34, end: 12.6, clip: "brown", from: 4.2, zoom: [1.05, 1.0], ox: 50, oy: 35, capY: 1470 },
  // 12.60 – 16.81  black: one continuous move — turn, then opening it to show how it's worn
  { start: 12.6, end: 16.81, clip: "black", from: 0.95, zoom: [1.0, 1.05], ox: 50, oy: 50, capY: 1470 },
  // 16.81 – end  mauve: spreads the fabric wide and lets it fall (CTA appears)
  { start: 16.81, end: DURATION, clip: "mauve", from: 0.55, zoom: [1.06, 1.0], ox: 50, oy: 50, capY: 1455 },
];

// transition sound per cut: volume multiplier (the CTA cut has speech running through it → softer)
export const SFX_GAIN: Record<number, number> = { 2.57: 1, 6.1: 1, 8.45: 1, 12.6: 1, 16.81: 0.6 };
