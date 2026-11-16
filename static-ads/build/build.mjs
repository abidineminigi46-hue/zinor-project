// Renders spec.mjs to PNG (via headless Chromium) and writes the After Effects script.
//   node build.mjs            → ../png/*.png  and  ../ae/abayat-chams-2027-static-ads.jsx
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { ASSETS, COMPS, FONTS } from "./spec.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const BASELINE = 0.32; // baseline = visual middle + 0.32 em (Cairo, Arabic)

// ---------------------------------------------------------------- SVG
function svgFor(comp) {
  let defs = "";
  let body = "";
  let id = 0;
  const uid = (p) => `${p}${id++}`;
  for (const L of comp.layers) {
    if (L.type === "bg") {
      const g = uid("g"), v = uid("v");
      defs += `<linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${L.top}"/><stop offset="1" stop-color="${L.bottom}"/></linearGradient>`;
      body += `<rect width="${comp.w}" height="${comp.h}" fill="url(#${g})"/>`;
      if (L.edge) {
        defs += `<radialGradient id="${v}" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stop-color="${L.edge}" stop-opacity="0"/><stop offset="1" stop-color="${L.edge}" stop-opacity="0.6"/></radialGradient>`;
        body += `<rect width="${comp.w}" height="${comp.h}" fill="url(#${v})"/>`;
      }
    } else if (L.type === "vignette") {
      const v = uid("v");
      defs += `<radialGradient id="${v}" cx="0.5" cy="0.5" r="0.75"><stop offset="0.5" stop-color="${L.color}" stop-opacity="0"/><stop offset="1" stop-color="${L.color}" stop-opacity="${L.opacity}"/></radialGradient>`;
      body += `<rect width="${comp.w}" height="${comp.h}" fill="url(#${v})"/>`;
    } else if (L.type === "image") {
      const A = ASSETS[L.asset];
      const [sx, sy, sw, sh] = L.crop;
      const s = L.w / sw, h = sh * s;
      const c = uid("c");
      defs += `<clipPath id="${c}"><rect x="${L.x}" y="${L.y}" width="${L.w}" height="${h}" rx="${L.r || 0}"/></clipPath>`;
      let mask = "";
      if (L.feather) {
        const m = uid("m"), f = uid("f"), e = L.feather / 2;
        defs += `<filter id="${f}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${L.feather / 2.5}"/></filter>`;
        defs += `<mask id="${m}" maskUnits="userSpaceOnUse" x="0" y="0" width="${comp.w}" height="${comp.h}"><rect x="${L.x + e}" y="${L.y + e}" width="${L.w - 2 * e}" height="${h - 2 * e}" fill="#fff" filter="url(#${f})"/></mask>`;
        mask = ` mask="url(#${m})"`;
      }
      const href = pathToFileURL(resolve(root, "assets", A.file)).href;
      body += `<g clip-path="url(#${c})"${mask}><image href="${href}" x="${L.x - sx * s}" y="${L.y - sy * s}" width="${A.w * s}" height="${A.h * s}" preserveAspectRatio="none"/></g>`;
    } else if (L.type === "rect") {
      let filt = "";
      if (L.shadow) {
        const f = uid("s");
        defs += `<filter id="${f}" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#000" flood-opacity="0.35"/></filter>`;
        filt = ` filter="url(#${f})"`;
      }
      body += `<rect x="${L.x}" y="${L.y}" width="${L.w}" height="${L.h}" rx="${L.r || 0}" fill="${L.fill}" fill-opacity="${L.opacity ?? 1}"${filt}/>`;
    } else if (L.type === "stroke") {
      body += `<rect x="${L.x}" y="${L.y}" width="${L.w}" height="${L.h}" rx="${L.r || 0}" fill="none" stroke="${L.color}" stroke-width="${L.width}"/>`;
    } else if (L.type === "line") {
      body += `<line x1="${L.x1}" y1="${L.y1}" x2="${L.x2}" y2="${L.y2}" stroke="${L.color}" stroke-width="${L.width}" stroke-linecap="round"/>`;
    } else if (L.type === "dot") {
      body += `<circle cx="${L.x}" cy="${L.y}" r="${L.r}" fill="${L.fill}" stroke="${L.ring}" stroke-width="4"/>`;
    } else if (L.type === "text") {
      body += `<text x="${L.cx}" y="${L.cy + BASELINE * L.size}" text-anchor="middle" direction="rtl" font-family="${L.font}" font-size="${L.size}" fill="${L.color}">${L.text}</text>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${comp.w}" height="${comp.h}" viewBox="0 0 ${comp.w} ${comp.h}"><defs>${defs}</defs>${body}</svg>`;
}

function htmlFor(comp) {
  const faces = Object.entries(FONTS)
    .map(([ps, f]) => `@font-face{font-family:"${ps}";src:url("${pathToFileURL(resolve(root, "fonts", f.file)).href}") format("truetype");}`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>${faces}html,body{margin:0;background:#000}svg{display:block}</style></head><body>${svgFor(comp)}</body></html>`;
}

// ---------------------------------------------------------------- PNG
async function renderPngs() {
  const require = createRequire(import.meta.url);
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  mkdirSync(resolve(root, "png"), { recursive: true });
  for (const comp of COMPS) {
    const page = await browser.newPage({ viewport: { width: comp.w, height: comp.h }, deviceScaleFactor: 1 });
    const tmp = resolve(here, `_${comp.name}.html`);
    writeFileSync(tmp, htmlFor(comp));
    await page.goto(pathToFileURL(tmp).href);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => i.decode?.()));
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(root, "png", comp.file), clip: { x: 0, y: 0, width: comp.w, height: comp.h } });
    await page.close();
    console.log("png", comp.file);
  }
  await browser.close();
}

// ---------------------------------------------------------------- JSX (After Effects)
function writeJsx() {
  const data = JSON.stringify({ assets: ASSETS, comps: COMPS, baseline: BASELINE }, null, 1);
  const jsx = `// عبايات شمس 2027 — Static Ads (3 تصاميم × مقاسين)
// يبني 6 Compositions في After Effects ويضيفهم لـ Render Queue بصيغة PNG.
//
// طريقة الاستعمال:
//   1) ثبّتي خطوط Cairo اللي في المجلد fonts/ (Cairo-Black, Cairo-Bold, Cairo-SemiBold) وعاودي فتح After Effects.
//   2) فعّلي محرك النصوص العربي: Edit > Preferences > Type > Text Engine = "South Asian and Middle Eastern"، وعاودي التشغيل.
//   3) File > Scripts > Run Script File… واختاري هذا الملف (خليه في مجلد ae/ جنب مجلد assets/).
//   4) Composition > Save Frame As… أو Render Queue > Render. بعدها File > Save As باش يكون عندك ملف .aep.
//
// Generated from static-ads/build/spec.mjs — the same layout used for the PNG exports.

(function () {
  var D = ${data};

  function hex(c) {
    c = c.replace("#", "");
    return [parseInt(c.substr(0, 2), 16) / 255, parseInt(c.substr(2, 2), 16) / 255, parseInt(c.substr(4, 2), 16) / 255];
  }

  // rounded-rectangle bezier in a given coordinate space
  function roundRectShape(x, y, w, h, r) {
    var s = new Shape();
    r = Math.min(r || 0, w / 2, h / 2);
    if (r <= 0) {
      s.vertices = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      s.closed = true;
      return s;
    }
    var k = r * 0.5523;
    s.vertices = [[x + r, y], [x + w - r, y], [x + w, y + r], [x + w, y + h - r], [x + w - r, y + h], [x + r, y + h], [x, y + h - r], [x, y + r]];
    s.inTangents = [[-k, 0], [0, 0], [0, -k], [0, 0], [k, 0], [0, 0], [0, k], [0, 0]];
    s.outTangents = [[0, 0], [k, 0], [0, 0], [0, k], [0, 0], [-k, 0], [0, 0], [0, -k]];
    s.closed = true;
    return s;
  }

  function addShapeLayer(comp, name) {
    var l = comp.layers.addShape();
    l.name = name;
    l.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0, 0]);
    l.property("ADBE Transform Group").property("ADBE Position").setValue([0, 0]);
    return l;
  }
  function addGroup(layer) {
    return layer.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group").property("ADBE Vectors Group");
  }
  function addPathTo(contents, shape) {
    var p = contents.addProperty("ADBE Vector Shape - Group");
    p.property("ADBE Vector Shape").setValue(shape);
  }
  function addFill(contents, color, opacity) {
    var f = contents.addProperty("ADBE Vector Graphic - Fill");
    f.property("ADBE Vector Fill Color").setValue(hex(color));
    f.property("ADBE Vector Fill Opacity").setValue((opacity === undefined ? 1 : opacity) * 100);
  }
  function addStroke(contents, color, width) {
    var s = contents.addProperty("ADBE Vector Graphic - Stroke");
    s.property("ADBE Vector Stroke Color").setValue(hex(color));
    s.property("ADBE Vector Stroke Width").setValue(width);
    s.property("ADBE Vector Stroke Line Cap").setValue(2);
  }
  function addShadow(layer) {
    var e = layer.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
    e.property("ADBE Drop Shadow-0002").setValue(35 * 2.55); // opacity
    e.property("ADBE Drop Shadow-0003").setValue(180); // direction (down)
    e.property("ADBE Drop Shadow-0004").setValue(16); // distance
    e.property("ADBE Drop Shadow-0005").setValue(40); // softness
  }

  // darkened edges: solid with an inverted, heavily feathered ellipse mask
  function addVignette(comp, C, color, opacity) {
    var v = comp.layers.addSolid(hex(color), "Vignette", C.w, C.h, 1);
    var m = v.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
    var cx = C.w / 2, cy = C.h / 2, rx = C.w * 0.62, ry = C.h * 0.62, k = 0.5523;
    var e = new Shape();
    e.vertices = [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
    e.inTangents = [[-rx * k, 0], [0, -ry * k], [rx * k, 0], [0, ry * k]];
    e.outTangents = [[rx * k, 0], [0, ry * k], [-rx * k, 0], [0, -ry * k]];
    e.closed = true;
    m.property("ADBE Mask Shape").setValue(e);
    m.property("ADBE Mask Feather").setValue([C.w * 0.45, C.w * 0.45]);
    m.inverted = true;
    v.property("ADBE Transform Group").property("ADBE Opacity").setValue(opacity * 100);
    return v;
  }

  var base = File($.fileName).parent.parent; // static-ads/
  var assetsDir = new Folder(base.fsName + "/assets");
  if (!assetsDir.exists) {
    alert("ما لقيتش مجلد assets/ جنب مجلد ae/.\\n" + assetsDir.fsName);
    return;
  }

  app.beginUndoGroup("Abayat Chams 2027 static ads");
  var proj = app.project || app.newProject();
  var root = proj.items.addFolder("Abayat Chams 2027 – Static Ads");
  var fFolder = proj.items.addFolder("Footage");
  fFolder.parentFolder = root;

  var footage = {};
  for (var key in D.assets) {
    var f = new File(assetsDir.fsName + "/" + D.assets[key].file);
    var item = proj.importFile(new ImportOptions(f));
    item.parentFolder = fFolder;
    footage[key] = item;
  }

  var outDir = new Folder(base.fsName + "/png-ae");
  if (!outDir.exists) outDir.create();

  for (var c = 0; c < D.comps.length; c++) {
    var C = D.comps[c];
    var comp = proj.items.addComp(C.name, C.w, C.h, 1, 5, 30);
    comp.parentFolder = root;
    comp.bgColor = [0, 0, 0];

    for (var i = 0; i < C.layers.length; i++) {
      var L = C.layers[i];
      var lay, g;

      if (L.type === "bg") {
        lay = comp.layers.addSolid(hex(L.top), "Background", C.w, C.h, 1);
        var ramp = lay.property("ADBE Effect Parade").addProperty("ADBE Ramp");
        ramp.property("ADBE Ramp-0001").setValue([C.w / 2, 0]);
        ramp.property("ADBE Ramp-0002").setValue(hex(L.top));
        ramp.property("ADBE Ramp-0003").setValue([C.w / 2, C.h]);
        ramp.property("ADBE Ramp-0004").setValue(hex(L.bottom));
        if (L.edge) addVignette(comp, C, L.edge, 0.6);
      } else if (L.type === "vignette") {
        addVignette(comp, C, L.color, L.opacity);
      } else if (L.type === "image") {
        var A = D.assets[L.asset];
        var sx = L.crop[0], sy = L.crop[1], sw = L.crop[2], sh = L.crop[3];
        var s = L.w / sw, h = sh * s;
        lay = comp.layers.add(footage[L.asset]);
        lay.name = L.asset;
        var T = lay.property("ADBE Transform Group");
        T.property("ADBE Anchor Point").setValue([0, 0]);
        T.property("ADBE Scale").setValue([s * 100, s * 100]);
        T.property("ADBE Position").setValue([L.x - sx * s, L.y - sy * s]);
        var m = lay.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
        m.property("ADBE Mask Shape").setValue(roundRectShape(sx, sy, sw, sh, (L.r || 0) / s));
        if (L.feather) {
          m.property("ADBE Mask Feather").setValue([L.feather / s, L.feather / s]);
          m.property("ADBE Mask Offset").setValue(-L.feather / 2 / s);
        }
      } else if (L.type === "rect") {
        lay = addShapeLayer(comp, "Rect");
        g = addGroup(lay);
        addPathTo(g, roundRectShape(L.x, L.y, L.w, L.h, L.r));
        addFill(g, L.fill, L.opacity);
        if (L.shadow) addShadow(lay);
      } else if (L.type === "stroke") {
        lay = addShapeLayer(comp, "Outline");
        g = addGroup(lay);
        addPathTo(g, roundRectShape(L.x, L.y, L.w, L.h, L.r));
        addStroke(g, L.color, L.width);
      } else if (L.type === "line") {
        lay = addShapeLayer(comp, "Callout line");
        g = addGroup(lay);
        var ln = new Shape();
        ln.vertices = [[L.x1, L.y1], [L.x2, L.y2]];
        ln.closed = false;
        addPathTo(g, ln);
        addStroke(g, L.color, L.width);
      } else if (L.type === "dot") {
        lay = addShapeLayer(comp, "Callout dot");
        g = addGroup(lay);
        var el = g.addProperty("ADBE Vector Shape - Ellipse");
        el.property("ADBE Vector Ellipse Size").setValue([L.r * 2, L.r * 2]);
        el.property("ADBE Vector Ellipse Position").setValue([L.x, L.y]);
        addFill(g, L.fill, 1);
        addStroke(g, L.ring, 4);
      } else if (L.type === "text") {
        lay = comp.layers.addText(L.text);
        lay.name = L.text;
        var tp = lay.property("ADBE Text Properties").property("ADBE Text Document");
        var td = tp.value;
        td.resetCharStyle();
        td.resetParagraphStyle();
        td.font = L.font;
        td.fontSize = L.size;
        td.applyFill = true;
        td.fillColor = hex(L.color);
        td.applyStroke = false;
        td.tracking = 0;
        td.justification = ParagraphJustification.CENTER_JUSTIFY;
        try { td.direction = ParagraphDirection.DIRECTION_RIGHT_TO_LEFT; } catch (e1) {}
        tp.setValue(td);
        lay.property("ADBE Transform Group").property("ADBE Position").setValue([L.cx, L.cy + D.baseline * L.size]);
      }
    }

    var rq = proj.renderQueue.items.add(comp);
    rq.timeSpanDuration = comp.frameDuration;
    var om = rq.outputModule(1);
    try { om.applyTemplate("PNG Sequence"); } catch (e2) {}
    om.file = new File(outDir.fsName + "/" + C.file.replace(".png", "_[#].png"));
  }

  app.endUndoGroup();
  alert("تم بناء 6 تصاميم ✔\\nRender Queue جاهزة (PNG).\\nما تنساش File > Save As باش تحفظي ملف .aep.");
})();
`;
  mkdirSync(resolve(root, "ae"), { recursive: true });
  writeFileSync(resolve(root, "ae", "abayat-chams-2027-static-ads.jsx"), jsx);
  console.log("jsx written");
}

writeJsx();
if (!process.argv.includes("--jsx-only")) await renderPngs();
