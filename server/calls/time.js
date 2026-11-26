// الوقت بتوقيت الجزائر (أو أي منطقة) وفترات الاتصال المسموحة
const pad = (n) => String(n).padStart(2, '0');

// أجزاء التاريخ المحلي لـ Date معيّن في منطقة زمنية
export function localParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const o = Object.fromEntries(f.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
  return { y: o.year, m: o.month, d: o.day, h: o.hour, mi: o.minute, s: o.second, day: `${o.year}-${pad(o.month)}-${pad(o.day)}` };
}

// "2026-11-26" + "10:00" بتوقيت tz → Date (UTC)
export function zonedToDate(day, hhmm, tz) {
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  // فرق التوقيت لهاذ اليوم (يخدم حتى مع التوقيت الصيفي)
  const p = localParts(new Date(guess), tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  return new Date(guess - (asUtc - guess));
}

export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export const sortedWindows = (windows) => [...(windows || [])].filter((w) => /^\d\d:\d\d$/.test(w.start) && /^\d\d:\d\d$/.test(w.end) && w.start < w.end)
  .sort((a, b) => a.start.localeCompare(b.start));

/**
 * أول وقت مسموح للاتصال ابتداءً من `from`.
 * afterIndex: نتخطاو الفترات <= هاذ الرقم في نفس اليوم (ما نعوضوش فترة فاتت بمكالمات متتابعة).
 * يرجّع { at: Date, day, windowIndex } أو null إذا ما بقاتش فترة اليوم و allowNextDay=false.
 */
export function nextSlot(from, { windows, tz, afterIndex = -1, day = null, allowNextDay = true }) {
  const ws = sortedWindows(windows);
  if (!ws.length) return null;
  const today = day || localParts(from, tz).day;
  for (let i = 0; i < ws.length; i++) {
    if (i <= afterIndex) continue;
    const start = zonedToDate(today, ws[i].start, tz), end = zonedToDate(today, ws[i].end, tz);
    if (from < end) return { at: from > start ? from : start, day: today, windowIndex: i };
  }
  if (!allowNextDay) return null;
  const next = addDays(today, 1);
  return { at: zonedToDate(next, ws[0].start, tz), day: next, windowIndex: 0 };
}

export function windowAt(date, { windows, tz }) {
  const ws = sortedWindows(windows);
  const day = localParts(date, tz).day;
  const i = ws.findIndex((w) => date >= zonedToDate(day, w.start, tz) && date < zonedToDate(day, w.end, tz));
  return i < 0 ? null : { day, windowIndex: i };
}

export const fmtLocal = (date, tz) => { const p = localParts(date, tz); return `${p.day} ${pad(p.h)}:${pad(p.mi)}`; };
