// All times are in seconds.
// Voice-over: public/voice.m4a (20.35 s). Footage: public/source.mp4 (37 s, the original abaya video).

export const FPS = 30;
export const VOICE_END = 20.35;
export const TOTAL = 22.5; // voice-over + end card

// Each shot plays source.mp4 from `from` for (end - start) seconds, placed at `start` on the timeline.
export type Shot = { start: number; end: number; from: number; zoom?: "in" | "out" };
export const SHOTS: Shot[] = [
  { start: 0.0, end: 2.4, from: 16.3, zoom: "in" }, // navy, facing camera – hook
  { start: 2.4, end: 4.28, from: 1.0, zoom: "out" }, // two abayas in the marble lobby – "the 2027 collection"
  { start: 4.28, end: 5.08, from: 6.0 }, // parking, olive + camo pair
  { start: 5.08, end: 5.88, from: 7.0 }, // parking, walking
  { start: 5.88, end: 6.58, from: 8.87, zoom: "in" }, // velvet detail close-up – "design"
  { start: 6.58, end: 8.26, from: 10.0 }, // mauve walking – "elegance & luxury"
  { start: 8.26, end: 10.34, from: 32.0, zoom: "in" }, // burgundy spin – "steal the show at weddings"
  { start: 10.34, end: 12.42, from: 26.6, zoom: "out" }, // green seated – "Ramadan nights, Eid"
  { start: 12.42, end: 15.38, from: 19.0 }, // navy spin – "competitive prices"
  { start: 15.38, end: 17.52, from: 13.9, zoom: "in" }, // mauve – "don't miss the deal, order today"
  { start: 17.52, end: TOTAL, from: 29.1, zoom: "out" }, // burgundy by the pool – delivery + end card
];

// Captions in Darija, word-level timings from the voice-over transcription.
export type Word = { text: string; start: number; end: number; accent?: boolean };
export type Page = { words: Word[] };

const w = (text: string, start: number, end: number, accent = false): Word => ({ text, start, end, accent });

export const PAGES: Page[] = [
  { words: [w("راكي", 0.0, 0.24), w("حابة", 0.24, 0.54), w("تكونين", 0.54, 0.88)] },
  { words: [w("نجمة", 0.88, 1.22, true), w("كل", 1.22, 1.42), w("المناسبات؟", 1.42, 2.4)] },
  { words: [w("عبايات", 2.4, 3.0), w("شمس", 3.0, 3.46), w("2027", 3.46, 4.28, true)] },
  { words: [w("راهم", 4.28, 4.88), w("دايرين", 4.88, 5.32), w("حالة", 5.32, 5.88, true)] },
  { words: [w("تصميم", 5.88, 6.44), w("جمعت", 6.44, 6.84), w("بين", 6.84, 7.0)] },
  { words: [w("الأناقة", 7.0, 7.58, true), w("والفخامة", 7.58, 8.26, true)] },
  { words: [w("تخليك", 8.26, 8.78), w("تخطفي", 8.78, 9.1), w("الأنظار", 9.1, 9.6, true)] },
  { words: [w("في", 9.6, 9.7), w("الأعراس،", 9.7, 10.34, true)] },
  { words: [w("سهرات", 10.34, 10.78), w("رمضان", 10.78, 11.24, true)] },
  { words: [w("وحتى", 11.24, 11.8), w("يوم", 11.8, 12.0), w("العيد", 12.0, 12.42, true)] },
  { words: [w("كل", 12.42, 12.66), w("هذا", 12.66, 13.0), w("بأسعار", 13.0, 13.68), w("تنافسية", 13.68, 14.28, true)] },
  { words: [w("في", 14.28, 14.46), w("السوق", 14.46, 14.8), w("الجزائري", 14.8, 15.38, true)] },
  { words: [w("ما", 15.38, 15.66), w("تراطيش", 15.66, 16.04), w("لافار", 16.04, 16.6, true)] },
  { words: [w("اطلبيها", 16.6, 17.1, true), w("اليوم", 17.1, 17.52, true)] },
  { words: [w("والتوصيل", 17.52, 18.22), w("متوفر", 18.22, 18.76)] },
  { words: [w("لـ", 18.76, 18.88), w("69", 18.88, 19.3, true), w("ولاية", 19.3, VOICE_END, true)] },
];

// Spans where the voice is speaking; the music is ducked under these.
export const SPEECH: [number, number][] = [[0.0, 20.0]];
