import React from 'react';
import {
  AbsoluteFill, Audio, Img, Sequence, interpolate, spring,
  staticFile, useCurrentFrame, useVideoConfig, Easing,
} from 'remotion';
import {loadFont} from '@remotion/fonts';

const fontFamily = 'Cairo';
const FONT_FILES: Array<[string, string, string]> = [];
for (const w of ['700', '800', '900']) {
  FONT_FILES.push([w, 'latin', 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2190-2199, U+2713']);
  FONT_FILES.push([w, 'latin-ext', 'U+0100-024F, U+1E00-1EFF']);
  FONT_FILES.push([w, 'arabic', 'U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF, U+200C-200E']);
}
FONT_FILES.forEach(([weight, sub, range]) => {
  loadFont({family: fontFamily, url: staticFile(`fonts/cairo-${sub}-${weight}-normal.woff2`), weight, unicodeRange: range});
});

const FPS = 30;
const s = (sec: number) => Math.round(sec * FPS);
export const TOTAL = s(35);

// Segments (seconds) — calés sur le brief
const STEPS = [
  {from: 3, to: 10},
  {from: 10, to: 18},
  {from: 18, to: 24},
  {from: 24, to: 35},
];

export const BUSINESS_ID = '899290721240157';

const C = {
  bg1: '#04103a', bg2: '#0a2a8c', blue: '#1877F2', glow: '#3d8bff',
  card: 'rgba(255,255,255,0.97)', ink: '#0b1b4d', mute: '#4a5a86', green: '#19c37d',
};

const Background: React.FC = () => {
  const f = useCurrentFrame();
  const shift = interpolate(f, [0, TOTAL], [0, 120]);
  return (
    <AbsoluteFill style={{background: `radial-gradient(circle at 80% ${10 + shift / 6}%, ${C.bg2} 0%, ${C.bg1} 62%)`}}>
      <div style={{position: 'absolute', right: -260, top: -200 + shift, width: 760, height: 760,
        background: `linear-gradient(135deg, ${C.glow}55, transparent 70%)`, transform: 'rotate(35deg)', borderRadius: 80}} />
      <div style={{position: 'absolute', left: -300, bottom: -120 - shift / 2, width: 700, height: 700,
        background: `radial-gradient(circle, ${C.blue}40, transparent 70%)`}} />
    </AbsoluteFill>
  );
};

const Cover: React.FC = () => {
  const f = useCurrentFrame();
  const scale = interpolate(f, [0, s(3)], [1, 1.06]);
  const out = interpolate(f, [s(2.6), s(3)], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{opacity: out}}>
      <Img src={staticFile('cover.png')} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale})`}} />
    </AbsoluteFill>
  );
};

const Progress: React.FC<{active: number}> = ({active}) => (
  <div style={{position: 'absolute', top: 110, left: 70, right: 70, display: 'flex', gap: 18}}>
    {STEPS.map((_, i) => (
      <div key={i} style={{flex: 1, height: 14, borderRadius: 7,
        background: i <= active ? C.blue : 'rgba(255,255,255,0.22)',
        boxShadow: i === active ? `0 0 24px ${C.glow}` : 'none'}} />
    ))}
  </div>
);

const Pill: React.FC<{text: string; delay: number; strong?: boolean}> = ({text, delay, strong}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const p = spring({frame: f - delay, fps, config: {damping: 14, stiffness: 140}});
  return (
    <div style={{opacity: p, transform: `translateX(${(1 - p) * 80}px)`, display: 'flex', alignItems: 'center', gap: 22}}>
      <div style={{width: 20, height: 20, borderRadius: 10, background: strong ? C.green : C.blue, flexShrink: 0}} />
      <div style={{fontSize: 52, fontWeight: 800, color: C.ink, lineHeight: 1.18,
        background: strong ? '#e6f9f0' : '#eaf1ff', border: `3px solid ${strong ? C.green : C.blue}`,
        borderRadius: 24, padding: '16px 28px'}}>{text}</div>
    </div>
  );
};

const Arrow: React.FC<{delay: number}> = ({delay}) => {
  const f = useCurrentFrame();
  const o = interpolate(f - delay, [0, 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <div style={{opacity: o, fontSize: 54, color: C.blue, fontWeight: 900, marginLeft: 2, lineHeight: 1}}>↓</div>;
};

const Caption: React.FC<{text: string}> = ({text}) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [s(0.3), s(0.8)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div dir="rtl" style={{position: 'absolute', left: 60, right: 60, bottom: 130, opacity: o,
      background: 'rgba(0,0,0,0.55)', borderRadius: 28, padding: '26px 34px',
      color: 'white', fontSize: 44, fontWeight: 700, lineHeight: 1.45, textAlign: 'center'}}>
      {text}
    </div>
  );
};

const StepScene: React.FC<{
  index: number; duration: number; title: string; caption: string; children: React.ReactNode;
}> = ({index, duration, title, caption, children}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame: f, fps, config: {damping: 16, stiffness: 120}});
  const exit = interpolate(f, [duration - 8, duration], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{fontFamily, opacity: exit}}>
      <Progress active={index} />
      <div style={{position: 'absolute', top: 170, left: 70, right: 70, opacity: enter,
        transform: `translateY(${(1 - enter) * -40}px)`}}>
        <div style={{display: 'inline-block', background: C.blue, color: 'white', fontSize: 40, fontWeight: 900,
          padding: '10px 30px', borderRadius: 40, letterSpacing: 2}}>ÉTAPE {index + 1} / 4</div>
        <div style={{color: 'white', fontSize: 74, fontWeight: 900, lineHeight: 1.08, marginTop: 26}}>{title}</div>
      </div>
      <div style={{position: 'absolute', top: 520, left: 60, right: 60,
        transform: `translateY(${(1 - enter) * 200}px) scale(${0.92 + 0.08 * enter})`, opacity: enter,
        background: C.card, borderRadius: 48, padding: '56px 48px',
        boxShadow: `0 30px 90px rgba(0,0,0,0.45), 0 0 60px ${C.glow}55`,
        display: 'flex', flexDirection: 'column', gap: 18}}>
        {children}
      </div>
      <Caption text={caption} />
    </AbsoluteFill>
  );
};

const Step1: React.FC<{d: number}> = ({d}) => (
  <StepScene index={0} duration={d} title="Ouvrir les paramètres Business"
    caption="خويا، افتح الرابط اللي بعثتهولك، واختار الـ portefeuille business اللي فيه صفحتك.">
    <div style={{fontSize: 40, fontWeight: 700, color: C.mute}}>Ouvrir le lien :</div>
    <Pill delay={s(0.6)} text="business.facebook.com/settings/" />
    <Arrow delay={s(2.6)} />
    <div style={{fontSize: 40, fontWeight: 700, color: C.mute}}>Puis sélectionner :</div>
    <Pill delay={s(3)} strong text="Le portefeuille business qui possède votre page" />
  </StepScene>
);

const Step2: React.FC<{d: number}> = ({d}) => (
  <StepScene index={1} duration={d} title="Ajouter un partenaire"
    caption="روح لـ Partenaires واضغط Ajouter. اختار الخيار اللي يعطي صلاحية لشريك.">
    <Pill delay={s(0.5)} text="Utilisateurs" />
    <Arrow delay={s(1.4)} />
    <Pill delay={s(1.6)} text="Partenaires" />
    <Arrow delay={s(2.6)} />
    <Pill delay={s(2.8)} text="Ajouter" />
    <Arrow delay={s(4)} />
    <Pill delay={s(4.2)} strong text="Donner à un partenaire l’accès à vos ressources" />
  </StepScene>
);

const Step3: React.FC<{d: number}> = ({d}) => {
  const f = useCurrentFrame();
  const pulse = 1 + 0.02 * Math.sin(f / 6);
  return (
    <StepScene index={2} duration={d} title="Saisir le Business ID"
      caption="وحط الـ Business ID اللي بعثتهولك.">
      <div style={{fontSize: 44, fontWeight: 800, color: C.mute}}>Business ID de</div>
      <div style={{fontSize: 70, fontWeight: 900, color: C.ink, lineHeight: 1}}>MAIN BM 1</div>
      <div style={{marginTop: 24, background: C.ink, borderRadius: 32, padding: '44px 10px',
        textAlign: 'center', transform: `scale(${pulse})`, boxShadow: `0 0 0 6px ${C.blue}`}}>
        <div style={{fontFamily: '"DejaVu Sans Mono", "Courier New", monospace', fontWeight: 700,
          fontSize: 84, color: 'white', letterSpacing: 2, whiteSpace: 'nowrap'}}>{BUSINESS_ID}</div>
      </div>
      <div style={{fontSize: 38, fontWeight: 700, color: C.mute, textAlign: 'center', marginTop: 8}}>
        15 chiffres — à copier exactement
      </div>
    </StepScene>
  );
};

const Step4: React.FC<{d: number}> = ({d}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const on = spring({frame: f - s(4.6), fps, config: {damping: 14}});
  return (
    <StepScene index={3} duration={d} title="Activer les Publicités"
      caption="من بعد روح لـ Pages، اختار صفحتك، فعّل Publicités واضغط Enregistrer. هكدا نقدر نديرلك الحملة من حساب الإعلانات تاعي، والصفحة تبقى تاعك.">
      <Pill delay={s(0.5)} text="Pages" />
      <Arrow delay={s(1.6)} />
      <Pill delay={s(1.8)} text="Choisir votre page" />
      <Arrow delay={s(3.2)} />
      <div style={{display: 'flex', alignItems: 'center', gap: 28, opacity: interpolate(f, [s(3.4), s(3.8)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>
        <div style={{width: 150, height: 80, borderRadius: 40, background: on > 0.5 ? C.green : '#c5cbe0', position: 'relative'}}>
          <div style={{position: 'absolute', top: 8, left: 8 + on * 70, width: 64, height: 64, borderRadius: 32, background: 'white',
            boxShadow: '0 4px 10px rgba(0,0,0,0.25)'}} />
        </div>
        <div style={{fontSize: 56, fontWeight: 900, color: C.ink}}>Publicités</div>
      </div>
      <Arrow delay={s(6)} />
      <Pill delay={s(6.2)} strong text="Enregistrer ✓" />
    </StepScene>
  );
};

export const MetaAcces: React.FC<{voiceover: string | null}> = ({voiceover}) => {
  const scenes = [Step1, Step2, Step3, Step4];
  return (
    <AbsoluteFill style={{backgroundColor: C.bg1}}>
      <Background />
      {scenes.map((Scene, i) => {
        const d = s(STEPS[i].to - STEPS[i].from);
        return (
          <Sequence key={i} from={s(STEPS[i].from)} durationInFrames={d}>
            <Scene d={d} />
          </Sequence>
        );
      })}
      <Sequence from={0} durationInFrames={s(3)}><Cover /></Sequence>
      {voiceover ? <Audio src={staticFile(voiceover)} /> : null}
    </AbsoluteFill>
  );
};
