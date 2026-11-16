// Single source of truth for the 3 static ads × 2 sizes.
// build.mjs renders these to PNG and writes the After Effects .jsx from the same data.
//
// Coordinates are canvas pixels. Layers are listed bottom → top.
//   bg    : vertical gradient (top → bottom) + radial vignette
//   image : draws crop [sx,sy,sw,sh] of an asset into dest rect x,y,w (height follows aspect);
//           feather = soft edge in px, r = rounded corners in px
//   rect  : x,y,w,h, r (corner radius), fill, opacity, shadow
//   stroke: outline rectangle x,y,w,h, r, color, width
//   text  : centred at cx; cy is the visual middle of the line; size in px; font = PostScript name
//   dot   : x,y, r, fill, ring (ring colour)
//   line  : x1,y1 → x2,y2

const TITLE = "عبايات شمس 2027";

// Asset sizes (2× upscaled crops of the supplied photos, 1092×1372 each)
export const ASSETS = {
  "burgundy-front": { file: "burgundy-front.png", w: 1092, h: 1372 },
  "gold-three-quarter": { file: "gold-three-quarter.png", w: 1092, h: 1372 },
  "olive-front": { file: "olive-front.png", w: 1092, h: 1372 },
  // photo + its studio background extended outward (make_plates.py); the border is a flat colour
  "burgundy-front-plate": { file: "burgundy-front-plate.png", w: 2132, h: 2412, pad: 520, bg: "#907671" },
  "olive-front-plate": { file: "olive-front-plate.png", w: 2132, h: 2412, pad: 520, bg: "#977e72" },
};

// Place a plate so the photo inside it lands at x,y with width w (same framing as the plain photo).
const plate = (asset, x, y, w) => {
  const A = ASSETS[asset];
  const s = w / (A.w - 2 * A.pad);
  return { type: "image", asset, crop: [0, 0, A.w, A.h], x: x - A.pad * s, y: y - A.pad * s, w: A.w * s };
};
const flatBg = (asset) => ({ type: "bg", top: ASSETS[asset].bg, bottom: ASSETS[asset].bg });
const VIGNETTE = { type: "vignette", color: "#000000", opacity: 0.22 };

export const FONTS = {
  "Cairo-Black": { file: "Cairo_900Black.ttf", weight: 900 },
  "Cairo-Bold": { file: "Cairo_700Bold.ttf", weight: 700 },
  "Cairo-SemiBold": { file: "Cairo_600SemiBold.ttf", weight: 600 },
};

const full = (asset) => [0, 0, ASSETS[asset].w, ASSETS[asset].h];

// ---------- palettes (backgrounds sampled from each photo so the edges blend) ----------
const P = {
  burgundy: { top: "#8f7570", bottom: "#9c817c", edge: "#6f5955", ink: "#2a1214", accent: "#6d1526" },
  gold: { top: "#977b6d", bottom: "#a08376", edge: "#6f5a4f", ink: "#2a1d12", accent: "#7a5a12" },
  olive: { top: "#977e71", bottom: "#a58b80", edge: "#71605a", ink: "#20200f", accent: "#4f4a14" },
};
const CREAM = "#F6EEE6";

// ---------- ad 1 — the cut (burgundy, full length) ----------
const ad1Feed = {
  name: "Ad1_Cut_Feed_1080x1350", file: "ad1-cut-feed-1080x1350.png", w: 1080, h: 1350,
  layers: [
    flatBg("burgundy-front-plate"),
    plate("burgundy-front-plate", 138, 196, 804),
    VIGNETTE,
    { type: "text", text: TITLE, cx: 540, cy: 100, size: 92, font: "Cairo-Black", color: P.burgundy.ink },
    { type: "rect", x: 480, y: 168, w: 120, h: 5, r: 2.5, fill: P.burgundy.accent },
    { type: "text", text: "قَصّة واسعة · أكمام عريضة · طول كامل", cx: 540, cy: 1268, size: 44, font: "Cairo-Bold", color: P.burgundy.ink },
  ],
};
const ad1Story = {
  name: "Ad1_Cut_Story_1080x1920", file: "ad1-cut-story-1080x1920.png", w: 1080, h: 1920,
  layers: [
    flatBg("burgundy-front-plate"),
    plate("burgundy-front-plate", 82, 500, 916),
    VIGNETTE,
    { type: "text", text: TITLE, cx: 540, cy: 300, size: 100, font: "Cairo-Black", color: P.burgundy.ink },
    { type: "rect", x: 470, y: 372, w: 140, h: 6, r: 3, fill: P.burgundy.accent },
    { type: "text", text: "قَصّة واسعة · أكمام عريضة · طول كامل", cx: 540, cy: 440, size: 46, font: "Cairo-Bold", color: P.burgundy.ink },
  ],
};

// ---------- ad 2 — the details (gold, close-up of sleeve, satin trim and velvet) ----------
// Close-up crop of gold-three-quarter (in asset px): sleeve, satin trim, velvet drape
const DETAIL = [330, 360, 440, 540];
const detailLayers = (card, chipsY, chipW, chipGap, titleY, subY, withInset) => {
  const s = card.w / DETAIL[2];
  const pt = (ax, ay) => [card.x + (ax - DETAIL[0]) * s, card.y + (ay - DETAIL[1]) * s];
  const ch = DETAIL[3] * s;
  // features visible in the photo (asset px) → callout pills
  const callouts = [
    { at: pt(470, 448), label: "حاشية ساتان", side: "left" },
    { at: pt(525, 590), label: "كُمّ واسع", side: "right" },
    { at: pt(470, 800), label: "مخمل لامع", side: "left" },
  ];
  const L = [
    { type: "bg", ...P.gold },
    { type: "rect", x: card.x, y: card.y, w: card.w, h: ch, r: 36, fill: "#000000", shadow: true },
    { type: "image", asset: "gold-three-quarter", crop: DETAIL, x: card.x, y: card.y, w: card.w, r: 36 },
    { type: "stroke", x: card.x, y: card.y, w: card.w, h: ch, r: 36, color: CREAM, width: 6 },
  ];
  for (const c of callouts) {
    const [x, y] = c.at;
    const pw = 250, ph = 72;
    const px = c.side === "left" ? card.x + 18 : card.x + card.w - pw - 18;
    const py = y - ph / 2 - 70;
    const ax = c.side === "left" ? px + pw * 0.6 : px + pw * 0.4;
    L.push({ type: "line", x1: x, y1: y, x2: ax, y2: py + ph, color: CREAM, width: 4 });
    L.push({ type: "dot", x, y, r: 11, fill: CREAM, ring: P.gold.ink });
    L.push({ type: "rect", x: px, y: py, w: pw, h: ph, r: ph / 2, fill: P.gold.ink, opacity: 0.92 });
    L.push({ type: "text", text: c.label, cx: px + pw / 2, cy: py + ph / 2, size: 36, font: "Cairo-Bold", color: CREAM });
  }
  if (withInset) {
    const iw = 210, ix = 40, iy = card.y + ch - 290;
    const is = iw / 1092;
    L.push({ type: "rect", x: ix, y: iy, w: iw, h: 1372 * is, r: 18, fill: "#000000", shadow: true });
    L.push({ type: "image", asset: "gold-three-quarter", crop: full("gold-three-quarter"), x: ix, y: iy, w: iw, r: 18 });
    L.push({ type: "stroke", x: ix, y: iy, w: iw, h: 1372 * is, r: 18, color: CREAM, width: 5 });
    L.push({ type: "stroke", x: ix + DETAIL[0] * is, y: iy + DETAIL[1] * is, w: DETAIL[2] * is, h: DETAIL[3] * is, r: 4, color: P.gold.ink, width: 3 });
  }
  L.push({ type: "text", text: TITLE, cx: 540, cy: titleY, size: 84, font: "Cairo-Black", color: P.gold.ink });
  L.push({ type: "text", text: "تفاصيل تبان من قريب", cx: 540, cy: subY, size: 44, font: "Cairo-Bold", color: P.gold.ink });
  const chips = ["مخمل لامع", "حواشي ساتان", "أكمام واسعة"];
  chips.forEach((t, i) => {
    const total = chips.length * chipW + (chips.length - 1) * chipGap;
    const x = 540 + total / 2 - chipW - i * (chipW + chipGap); // right → left
    L.push({ type: "rect", x, y: chipsY - 42, w: chipW, h: 84, r: 42, fill: CREAM, opacity: 0.9 });
    L.push({ type: "text", text: t, cx: x + chipW / 2, cy: chipsY, size: 38, font: "Cairo-Bold", color: P.gold.ink });
  });
  return L;
};
const ad2Feed = {
  name: "Ad2_Details_Feed_1080x1350", file: "ad2-details-feed-1080x1350.png", w: 1080, h: 1350,
  layers: detailLayers({ x: 290, y: 225, w: 650 }, 1205, 300, 30, 92, 160, true),
};
const ad2Story = {
  name: "Ad2_Details_Story_1080x1920", file: "ad2-details-story-1080x1920.png", w: 1080, h: 1920,
  layers: detailLayers({ x: 190, y: 440, w: 760 }, 1560, 300, 30, 285, 360, false),
};

// ---------- ad 3 — order (olive, full abaya + strong CTA) ----------
const button = (cx, cy, w, h, size) => [
  { type: "rect", x: cx - w / 2, y: cy - h / 2, w, h, r: h / 2, fill: "#17150b", shadow: true },
  { type: "text", text: "اطلبي الآن", cx, cy, size, font: "Cairo-Black", color: "#F3E2B3" },
];
const chip = (cx, cy, w, text) => [
  { type: "rect", x: cx - w / 2, y: cy - 42, w, h: 84, r: 42, fill: CREAM, opacity: 0.9 },
  { type: "text", text, cx, cy, size: 38, font: "Cairo-Bold", color: P.olive.ink },
];
const ad3Feed = {
  name: "Ad3_Order_Feed_1080x1350", file: "ad3-order-feed-1080x1350.png", w: 1080, h: 1350,
  layers: [
    flatBg("olive-front-plate"),
    plate("olive-front-plate", -215, 40, 1015),
    VIGNETTE,
    { type: "text", text: "عبايات", cx: 822, cy: 335, size: 78, font: "Cairo-Black", color: P.olive.ink },
    { type: "text", text: "شمس 2027", cx: 822, cy: 430, size: 78, font: "Cairo-Black", color: P.olive.ink },
    { type: "rect", x: 762, y: 505, w: 120, h: 5, r: 2.5, fill: P.olive.accent },
    ...button(822, 660, 390, 128, 60),
    ...chip(822, 820, 390, "الدفع عند الاستلام"),
    ...chip(822, 920, 390, "التوصيل متوفر"),
  ],
};
const ad3Story = {
  name: "Ad3_Order_Story_1080x1920", file: "ad3-order-story-1080x1920.png", w: 1080, h: 1920,
  layers: [
    flatBg("olive-front-plate"),
    plate("olive-front-plate", 126, 355, 828),
    VIGNETTE,
    { type: "text", text: TITLE, cx: 540, cy: 290, size: 100, font: "Cairo-Black", color: P.olive.ink },
    ...button(540, 1475, 660, 144, 70),
    ...chip(760, 1610, 400, "الدفع عند الاستلام"),
    ...chip(320, 1610, 400, "التوصيل متوفر"),
  ],
};

export const COMPS = [ad1Feed, ad1Story, ad2Feed, ad2Story, ad3Feed, ad3Story];
