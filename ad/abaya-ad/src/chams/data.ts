// «عبايات شمس 2027» — reel with the 6 avatar clips (hijab, outdoor courtyard, daylight).
// All times in seconds. Voice: public/v3/voice.wav (IKRAM_DZ.mp3, full length, natural speed).

export const FPS = 30;
export const DURATION = 20.35; // = voice-over length

// Real pauses in the voice-over (ffmpeg silencedetect, -38 dB): sentence starts land on these.
// 0.04 · 2.63 · 6.16 · 8.51 · 12.66 · 15.64
export const SPEECH: [number, number][] = [
  [0.04, 2.45],
  [2.63, 6.01],
  [6.16, 8.35],
  [8.51, 12.5],
  [12.66, 15.5],
  [15.64, 20.15],
];

export type Clip = "burgundy" | "olive" | "blue" | "brown" | "black" | "mauve";

// zoom: scale at the start → end of the shot; ox/oy: transform origin in % (where the zoom aims)
// capY: vertical centre of the captions for this shot (px, 1920 tall), chosen to keep face/hands visible
export type Shot = {
  start: number;
  end: number;
  clip: Clip;
  from: number;
  zoom: [number, number];
  ox?: number;
  oy?: number;
  capY: number;
};

export const SHOTS: Shot[] = [
  // 0 – 2.63  burgundy, front: turns her gaze to camera (hook), then hand on the velvet sleeve
  { start: 0.0, end: 1.37, clip: "burgundy", from: 8.2, zoom: [1.06, 1.0], ox: 50, oy: 30, capY: 1420 },
  { start: 1.37, end: 2.63, clip: "burgundy", from: 2.4, zoom: [1.22, 1.3], ox: 55, oy: 62, capY: 1430 },
  // 2.63 – 6.16  olive: full look, then she opens the abaya to show the width and lining
  { start: 2.63, end: 4.36, clip: "olive", from: 0.3, zoom: [1.0, 1.05], ox: 50, oy: 40, capY: 1420 },
  { start: 4.36, end: 6.16, clip: "olive", from: 4.6, zoom: [1.04, 1.0], ox: 50, oy: 50, capY: 1420 },
  // 6.16 – 8.51  blue: width of the sleeve, then the hem and stitching up close
  { start: 6.16, end: 7.25, clip: "blue", from: 0.4, zoom: [1.0, 1.04], ox: 50, oy: 50, capY: 1500 },
  { start: 7.25, end: 8.51, clip: "blue", from: 4.4, zoom: [1.18, 1.28], ox: 45, oy: 62, capY: 1500 },
  // 8.51 – 12.66  brown, seated: hands on the fabric, close on the velvet, then a smile to camera
  { start: 8.51, end: 9.83, clip: "brown", from: 1.8, zoom: [1.0, 1.04], ox: 50, oy: 45, capY: 1460 },
  { start: 9.83, end: 11.34, clip: "brown", from: 3.0, zoom: [1.3, 1.36], ox: 52, oy: 60, capY: 1500 },
  { start: 11.34, end: 12.66, clip: "brown", from: 11.6, zoom: [1.06, 1.0], ox: 50, oy: 30, capY: 1460 },
  // 12.66 – 16.81  black: walk towards camera (best strides), medium on the sleeves, walk again
  { start: 12.66, end: 14.43, clip: "black", from: 0.0, zoom: [1.0, 1.05], ox: 50, oy: 45, capY: 1420 },
  { start: 14.43, end: 15.64, clip: "black", from: 5.6, zoom: [1.22, 1.26], ox: 50, oy: 38, capY: 1440 },
  { start: 15.64, end: 16.81, clip: "black", from: 7.2, zoom: [1.04, 1.0], ox: 50, oy: 45, capY: 1420 },
  // 16.81 – end  mauve: looks over her shoulder, then the drape and width of the fabric (CTA on top)
  { start: 16.81, end: 18.4, clip: "mauve", from: 0.0, zoom: [1.0, 1.04], ox: 50, oy: 40, capY: 1450 },
  { start: 18.4, end: DURATION, clip: "mauve", from: 5.0, zoom: [1.1, 1.16], ox: 50, oy: 60, capY: 1450 },
];

// colour changes → short zoom-blur transition + whoosh
export const TRANSITIONS = [2.63, 6.16, 8.51, 12.66, 16.81];

// ---------- captions (Darija, as spoken; word times aligned to the audio) ----------
export type Word = { text: string; start: number; end: number };
const w = (text: string, start: number, end: number): Word => ({ text, start, end });

export const GROUPS: Word[][] = [
  [w("راكي", 0.04, 0.2), w("حابة", 0.2, 0.68), w("تكونين", 0.68, 0.95)],
  [w("نجمة", 0.95, 1.37), w("كل", 1.37, 1.52), w("المناسبات؟", 1.52, 2.45)],
  [w("عبايات", 2.63, 3.27), w("شمس", 3.27, 3.65), w("2027", 3.65, 4.36)],
  [w("راهم", 4.36, 5.04), w("دايرين", 5.04, 5.4), w("حالة", 5.4, 6.01)],
  [w("تصميم", 6.16, 6.64), w("جمعت", 6.64, 6.94), w("بين", 6.94, 7.25)],
  [w("الأناقة", 7.25, 7.82), w("والفخامة", 7.82, 8.35)],
  [w("تخليك", 8.51, 9.04), w("تخطفي", 9.04, 9.26), w("الأنظار", 9.26, 9.83)],
  [w("في", 9.83, 9.95), w("الأعراس،", 9.95, 10.42)],
  [w("سهرات", 10.42, 10.83), w("رمضان", 10.83, 11.34)],
  [w("وحتى", 11.34, 11.99), w("يوم", 11.99, 12.18), w("العيد", 12.18, 12.51)],
  [w("كل", 12.66, 12.99), w("هذا", 12.99, 13.28)],
  [w("بأسعار", 13.28, 13.77), w("تنافسية", 13.77, 14.43)],
  [w("في", 14.43, 14.68), w("السوق", 14.68, 14.95), w("الجزائري", 14.95, 15.5)],
  [w("ما", 15.64, 15.94), w("تراطيش", 15.94, 16.37), w("لافار", 16.37, 16.81)],
  [w("اطلبيها", 16.81, 17.35), w("اليوم", 17.35, 17.8)],
  [w("والتوصيل", 17.8, 18.4), w("متوفر", 18.4, 18.96)],
  [w("لـ", 18.96, 19.08), w("69", 19.08, 19.46), w("ولاية", 19.46, 20.14)],
];

export const CTA_START = 16.81; // «اطلبيها» in the voice-over
