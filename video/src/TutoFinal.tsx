import React from 'react';
import {
  AbsoluteFill, Audio, Easing, Img, Sequence,
  interpolate, staticFile, useCurrentFrame,
} from 'remotion';
import {loadFont} from '@remotion/fonts';

// ---------- Police (Cairo locale : latin + arabe) ----------
const FONT = 'Cairo';
for (const w of ['700', '800', '900']) {
  loadFont({family: FONT, weight: w, url: staticFile(`fonts/cairo-latin-${w}-normal.woff2`),
    unicodeRange: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2190-2199, U+2713, U+2714'});
  loadFont({family: FONT, weight: w, url: staticFile(`fonts/cairo-latin-ext-${w}-normal.woff2`),
    unicodeRange: 'U+0100-024F, U+1E00-1EFF'});
  loadFont({family: FONT, weight: w, url: staticFile(`fonts/cairo-arabic-${w}-normal.woff2`),
    unicodeRange: 'U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF, U+200C-200F'});
}

const FPS = 30;
// Images extraites de Meta-Acces-Publicitaire-Pratique.mp4 (24 i/s) : npm run frames
const SRC_FPS = 24;
const SRC_FRAMES = 792;
const f = (sec: number) => Math.round(sec * FPS);
export const FINAL_DURATION = f(34.3);
export const BUSINESS_ID = '899290721240157';

const C = {bg1: '#030c33', bg2: '#0a2a8c', blue: '#1877F2', glow: '#3d8bff', ring: '#FFC83D', win: '#0b1640'};

// ---------- Voix off : découpée aux silences, petites respirations ajoutées ----------
// [début source, fin source, position dans la vidéo] (secondes)
const VOICE: Array<[number, number, number]> = [
  [0.0, 3.5, 0.2],
  [3.5, 8.95, 3.7],
  [8.95, 14.05, 9.55],
  [14.05, 17.95, 15.45],
  [17.95, 22.05, 20.15],
  [22.05, 25.95, 25.25],
  [25.95, 29.08, 29.95],
];

// ---------- Fenêtre de capture (coordonnées vidéo de sortie) ----------
const WIN = {x: 30, y: 400, w: 1020, h: 860};

type Box = [number, number, number, number]; // x0,y0,x1,y1 dans la vidéo source 1280x800
type Cam = [number, number, number, number]; // t (s, sortie), cx, cy, zoom
type Hl = {t: number; box: Box; dur?: number};

type Shot = {
  from: number; to: number; step: number;
  box: Box;               // zone de la vraie capture Meta dans la source
  map: Array<[number, number]>; // [t sortie, t source] — clics alignés sur la voix
  cam: Cam[];
  hl: Hl[];
};

const SHOTS: Shot[] = [
  { // Paramètres → Partenaires (clic source 0.92 s ↔ « Partenaires » 8.15 s)
    from: 2.0, to: 9.7, step: 0, box: [274, 184, 1006, 724],
    map: [[2.0, 0.0], [7.6, 0.35], [8.15, 0.92], [9.7, 2.4]],
    cam: [[2.0, 640, 454, 1.25], [5.2, 640, 454, 1.36], [5.9, 560, 300, 2.0], [7.3, 560, 300, 2.05], [7.9, 480, 440, 2.3], [9.7, 480, 440, 2.4]],
    hl: [{t: 5.8, box: [520, 200, 760, 250], dur: 1.6}, {t: 8.1, box: [365, 426, 618, 466]}],
  },
  { // Ajouter (clic 5.9 ↔ 10.08) → Donner accès (clic 7.95 ↔ 12.86)
    from: 9.7, to: 14.8, step: 1, box: [46, 195, 1229, 712],
    map: [[9.7, 5.4], [10.08, 5.9], [12.0, 7.4], [12.86, 7.95], [14.8, 9.3]],
    cam: [[9.7, 880, 380, 1.75], [10.9, 880, 380, 1.85], [11.6, 570, 455, 1.22], [14.8, 570, 455, 1.26]],
    hl: [{t: 10.05, box: [920, 300, 1140, 368]}, {t: 12.85, box: [198, 404, 940, 512]}],
  },
  { // Saisie du Business ID (clic champ 10.95 ↔ 16.0 ; frappe 11.4→13.0)
    from: 14.8, to: 17.9, step: 2, box: [133, 184, 1147, 724],
    map: [[14.8, 10.3], [16.0, 10.95], [17.4, 13.0], [17.9, 13.6]],
    cam: [[14.8, 640, 450, 1.0], [15.6, 590, 560, 1.28], [17.9, 590, 565, 1.3]],
    hl: [{t: 16.0, box: [200, 548, 975, 598], dur: 1.9}],
  },
  { // Suivant (clic 16.9 ↔ 18.48)
    from: 17.9, to: 19.9, step: 2, box: [102, 184, 1178, 717],
    map: [[17.9, 16.3], [18.48, 16.9], [19.9, 18.3]],
    cam: [[17.9, 820, 520, 1.3], [18.4, 880, 580, 1.55], [19.9, 880, 580, 1.6]],
    hl: [{t: 18.45, box: [815, 536, 1097, 662]}],
  },
  { // Facebook Pages → cocher la page (clic 19.9 ↔ 21.3)
    from: 19.9, to: 22.6, step: 3, box: [172, 180, 1108, 723],
    map: [[19.9, 19.1], [21.3, 19.92], [22.6, 21.4]],
    cam: [[19.9, 545, 420, 1.35], [20.7, 545, 420, 1.4], [21.1, 790, 470, 1.75], [22.6, 790, 470, 1.8]],
    hl: [{t: 20.4, box: [184, 282, 538, 322], dur: 0.9}, {t: 21.25, box: [578, 420, 1100, 500]}],
  },
  { // Publicités (clic interrupteur 24.9 ↔ 23.25)
    from: 22.6, to: 25.2, step: 4, box: [51, 269, 1229, 623],
    map: [[22.6, 24.3], [23.25, 24.9], [25.2, 26.4]],
    cam: [[22.6, 600, 470, 1.15], [23.1, 470, 486, 1.28], [25.2, 470, 486, 1.32]],
    hl: [{t: 23.2, box: [112, 402, 832, 572], dur: 1.9}],
  },
  { // Affecter des éléments (clic 29.9 ↔ 27.65)
    from: 25.2, to: 34.3, step: 5, box: [51, 269, 1229, 631],
    map: [[25.2, 29.2], [27.65, 29.92], [29.4, 31.3], [34.3, 31.3]],
    cam: [[25.2, 700, 480, 1.15], [26.6, 790, 540, 1.3], [27.4, 900, 540, 1.6], [29.6, 900, 540, 1.65], [30.4, 790, 520, 1.2], [34.3, 790, 520, 1.25]],
    hl: [{t: 27.6, box: [664, 486, 1172, 598], dur: 1.8}],
  },
];

const STEP_TITLES = [
  'Paramètres → Partenaires',
  'Ajouter → Donner accès à vos ressources',
  'ID de partenaire d’entreprise → Suivant',
  'Facebook Pages → votre page',
  'Accès partiel → Publicités',
  'Affecter des éléments',
];

// Sous-titres darija : une ligne courte à la fois
const SUBS: Array<[number, number, string]> = [
  [0.2, 1.25, 'خويا،'],
  [1.25, 2.95, 'هاكيفاش تعطيني صلاحية الإعلان'],
  [2.95, 3.7, 'على صفحتك'],
  [3.75, 5.6, 'افتح الرابط اللي بعثتهولك'],
  [5.6, 7.55, 'اختار البورتفوي اللي فيه صفحتك'],
  [7.55, 9.45, 'وروح لـ Partenaires'],
  [9.55, 10.95, 'اضغط Ajouter'],
  [10.95, 12.75, 'ومن بعد اختار أول خيار'],
  [12.75, 14.75, 'Donner accès à vos ressources'],
  [15.45, 16.75, 'لصق الرقم اللي بعثتهولك'],
  [16.75, 17.95, 'في هاذ الخانة'],
  [17.95, 19.85, 'واضغط Suivant'],
  [20.15, 21.15, 'من Facebook Pages'],
  [21.15, 22.6, 'علّم على صفحتك'],
  [22.6, 25.1, 'وفعّل Publicités'],
  [25.25, 27.45, 'وفي الأخير اضغط على الزر الأزرق'],
  [27.45, 29.8, 'Affecter des éléments'],
  [29.95, 31.65, 'هكدا نقدر نديرلك الحملة'],
  [31.65, 34.3, 'باسم صفحتك'],
];

// ---------- Utilitaires ----------
const ease = Easing.inOut(Easing.cubic);
const piecewise = (t: number, pts: Array<[number, number]>) =>
  interpolate(t, pts.map((p) => p[0]), pts.map((p) => p[1]), {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

const camAt = (t: number, cam: Cam[]): [number, number, number] => {
  if (t <= cam[0][0]) return [cam[0][1], cam[0][2], cam[0][3]];
  for (let i = 0; i < cam.length - 1; i++) {
    const a = cam[i], b = cam[i + 1];
    if (t <= b[0]) {
      const p = ease((t - a[0]) / (b[0] - a[0]));
      return [a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p, a[3] + (b[3] - a[3]) * p];
    }
  }
  const l = cam[cam.length - 1];
  return [l[1], l[2], l[3]];
};

const clampCenter = (c: number, half: number, lo: number, hi: number) =>
  hi - lo <= half * 2 ? (lo + hi) / 2 : Math.min(Math.max(c, lo + half), hi - half);

// ---------- Plan Meta ----------
const ShotView: React.FC<{shot: Shot; t: number; opacity: number}> = ({shot, t, opacity}) => {
  const srcT = piecewise(t, shot.map);
  let [cx, cy, z] = camAt(t, shot.cam);
  // léger « push » au moment de chaque mise en évidence
  for (const h of shot.hl) z *= 1 + 0.05 * interpolate(t, [h.t - 0.15, h.t + 0.15, h.t + 0.9, h.t + 1.3], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const [bx0, by0, bx1, by1] = shot.box;
  cx = clampCenter(cx, WIN.w / 2 / z, bx0, bx1);
  cy = clampCenter(cy, WIN.h / 2 / z, by0, by1);
  const tx = WIN.w / 2 - cx * z;
  const ty = WIN.h / 2 - cy * z;
  const toWin = (x: number, y: number) => [tx + x * z, ty + y * z];

  return (
    <AbsoluteFill style={{opacity}}>
      <div style={{position: 'absolute', left: 0, top: 0, width: 1280, height: 800,
        transform: `translate(${tx}px, ${ty}px) scale(${z})`, transformOrigin: '0 0',
        clipPath: `inset(${by0}px ${1280 - bx1}px ${800 - by1}px ${bx0}px round 10px)`}}>
        <Img src={staticFile(`src-frames/${String(Math.min(SRC_FRAMES - 1, Math.round(srcT * SRC_FPS))).padStart(4, '0')}.jpg`)}
          style={{width: 1280, height: 800, display: 'block'}} />
      </div>
      {shot.hl.map((h, i) => {
        const dur = h.dur ?? 1.5;
        const o = interpolate(t, [h.t - 0.12, h.t + 0.1, h.t + dur, h.t + dur + 0.3], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        if (o <= 0) return null;
        const grow = interpolate(t, [h.t - 0.12, h.t + 0.25], [1.25, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
        const [x0, y0] = toWin(h.box[0], h.box[1]);
        const [x1, y1] = toWin(h.box[2], h.box[3]);
        const pad = 10;
        const w = x1 - x0 + pad * 2, hh = y1 - y0 + pad * 2;
        return (
          <div key={i} style={{position: 'absolute', left: x0 - pad, top: y0 - pad, width: w, height: hh,
            border: `6px solid ${C.ring}`, borderRadius: Math.min(hh / 2, 40), opacity: o,
            transform: `scale(${grow})`, boxShadow: `0 0 26px ${C.ring}aa`}} />
        );
      })}
    </AbsoluteFill>
  );
};

const Background: React.FC = () => {
  const fr = useCurrentFrame();
  const sh = interpolate(fr, [0, FINAL_DURATION], [0, 140]);
  return (
    <AbsoluteFill style={{background: `radial-gradient(circle at 85% ${8 + sh / 8}%, ${C.bg2} 0%, ${C.bg1} 60%)`}}>
      <div style={{position: 'absolute', right: -300, top: -260 + sh, width: 760, height: 760,
        background: `linear-gradient(135deg, ${C.glow}44, transparent 70%)`, transform: 'rotate(35deg)', borderRadius: 80}} />
    </AbsoluteFill>
  );
};

const Header: React.FC<{t: number}> = ({t}) => {
  const shot = SHOTS.find((s) => t >= s.from && t < s.to) ?? SHOTS[SHOTS.length - 1];
  const step = shot.step;
  const stepStart = SHOTS.find((s) => s.step === step)!.from;
  const k = interpolate(t, [stepStart, stepStart + 0.35], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  return (
    <>
      <div style={{position: 'absolute', top: 92, left: 50, right: 50, display: 'flex', gap: 14}}>
        {STEP_TITLES.map((_, i) => (
          <div key={i} style={{flex: 1, height: 12, borderRadius: 6, background: i <= step ? C.blue : 'rgba(255,255,255,0.22)',
            boxShadow: i === step ? `0 0 20px ${C.glow}` : 'none'}} />
        ))}
      </div>
      <div style={{position: 'absolute', top: 140, left: 50, right: 50, opacity: k, transform: `translateY(${(1 - k) * -24}px)`}}>
        <div style={{display: 'inline-block', background: C.blue, color: 'white', fontSize: 38, fontWeight: 900,
          padding: '6px 28px', borderRadius: 40, letterSpacing: 2}}>ÉTAPE {step + 1} / {STEP_TITLES.length}</div>
        <div style={{color: 'white', fontSize: 62, fontWeight: 900, lineHeight: 1.12, marginTop: 18}}>{STEP_TITLES[step]}</div>
      </div>
    </>
  );
};

const IdCard: React.FC<{t: number}> = ({t}) => {
  const o = interpolate(t, [15.3, 15.7, 19.7, 20.0], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  if (o <= 0) return null;
  return (
    <div style={{position: 'absolute', top: WIN.y + WIN.h + 26, left: 60, right: 60, opacity: o,
      transform: `translateY(${(1 - o) * 30}px)`, background: 'white', borderRadius: 30, padding: '14px 20px 18px',
      textAlign: 'center', boxShadow: `0 0 0 5px ${C.blue}, 0 20px 50px rgba(0,0,0,0.4)`}}>
      <div style={{fontSize: 30, fontWeight: 800, color: '#4a5a86'}}>Business ID · MAIN BM 1</div>
      <div style={{fontFamily: '"DejaVu Sans Mono", monospace', fontWeight: 700, fontSize: 80, color: '#0b1b4d',
        letterSpacing: 1, lineHeight: 1.1, whiteSpace: 'nowrap'}}>{BUSINESS_ID}</div>
    </div>
  );
};

const Subtitle: React.FC<{t: number}> = ({t}) => {
  const cur = SUBS.find(([a, b]) => t >= a && t < b);
  if (!cur) return null;
  const [a, b, text] = cur;
  const o = interpolate(t, [a, a + 0.12, b - 0.1, b], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', left: 40, right: 40, top: 1640, display: 'flex', justifyContent: 'center', opacity: o}}>
      <div dir="rtl" style={{background: 'rgba(0,0,0,0.62)', color: 'white', fontSize: 56, fontWeight: 800,
        padding: '10px 34px', borderRadius: 24, whiteSpace: 'nowrap', lineHeight: 1.45,
        transform: `translateY(${(1 - o) * 12}px)`}}>{text}</div>
    </div>
  );
};

const Cover: React.FC = () => {
  const fr = useCurrentFrame();
  const scale = interpolate(fr, [0, f(2.3)], [1, 1.07]);
  const o = interpolate(fr, [f(1.9), f(2.3)], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{opacity: o}}>
      <Img src={staticFile('cover.png')} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})`}} />
    </AbsoluteFill>
  );
};

const XF = 0.25; // fondu entre plans (s)

export const TutoFinal: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const winIn = interpolate(t, [1.85, 2.35], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill style={{backgroundColor: C.bg1, fontFamily: FONT}}>
      <Background />
      {t >= 1.85 ? (
        <AbsoluteFill style={{opacity: winIn}}>
          <Header t={Math.max(t, 2.0)} />
          <div style={{position: 'absolute', left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h, borderRadius: 34,
            overflow: 'hidden', background: C.win, transform: `scale(${0.94 + 0.06 * winIn})`,
            boxShadow: `0 0 0 3px ${C.glow}88, 0 30px 90px rgba(0,0,0,0.5), 0 0 70px ${C.glow}40`}}>
            {SHOTS.map((s, i) => {
              const start = s.from - (i === 0 ? 0.15 : 0);
              const end = s.to + (i < SHOTS.length - 1 ? XF : 0);
              if (t < start || t >= end) return null;
              const fadeIn = i === 0 ? 1 : interpolate(t, [s.from, s.from + XF], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
              return <ShotView key={i} shot={s} t={t} opacity={fadeIn} />;
            })}
          </div>
          <IdCard t={t} />
          <div style={{position: 'absolute', bottom: 70, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.55)',
            fontSize: 26, fontWeight: 700}}>Captures réelles · Meta Business Suite</div>
        </AbsoluteFill>
      ) : null}
      <Sequence from={0} durationInFrames={f(2.35)}><Cover /></Sequence>
      <Subtitle t={t} />
      {VOICE.map(([a, b, at], i) => (
        <Sequence key={i} from={f(at)} durationInFrames={f(b - a) + 1}>
          <Audio src={staticFile('voix-off.mp3')} startFrom={f(a)} endAt={f(b)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
