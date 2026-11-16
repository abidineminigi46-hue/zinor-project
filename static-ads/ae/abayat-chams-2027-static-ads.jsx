// عبايات شمس 2027 — Static Ads (3 تصاميم × مقاسين)
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
  var D = {
 "assets": {
  "burgundy-front": {
   "file": "burgundy-front.png",
   "w": 1092,
   "h": 1372
  },
  "gold-three-quarter": {
   "file": "gold-three-quarter.png",
   "w": 1092,
   "h": 1372
  },
  "olive-front": {
   "file": "olive-front.png",
   "w": 1092,
   "h": 1372
  },
  "burgundy-front-plate": {
   "file": "burgundy-front-plate.png",
   "w": 2132,
   "h": 2412,
   "pad": 520,
   "bg": "#907671"
  },
  "olive-front-plate": {
   "file": "olive-front-plate.png",
   "w": 2132,
   "h": 2412,
   "pad": 520,
   "bg": "#977e72"
  }
 },
 "comps": [
  {
   "name": "Ad1_Cut_Feed_1080x1350",
   "file": "ad1-cut-feed-1080x1350.png",
   "w": 1080,
   "h": 1350,
   "layers": [
    {
     "type": "bg",
     "top": "#907671",
     "bottom": "#907671"
    },
    {
     "type": "image",
     "asset": "burgundy-front-plate",
     "crop": [
      0,
      0,
      2132,
      2412
     ],
     "x": -244.8571428571429,
     "y": -186.8571428571429,
     "w": 1569.7142857142858
    },
    {
     "type": "vignette",
     "color": "#000000",
     "opacity": 0.22
    },
    {
     "type": "text",
     "text": "عبايات شمس 2027",
     "cx": 540,
     "cy": 100,
     "size": 92,
     "font": "Cairo-Black",
     "color": "#2a1214"
    },
    {
     "type": "rect",
     "x": 480,
     "y": 168,
     "w": 120,
     "h": 5,
     "r": 2.5,
     "fill": "#6d1526"
    },
    {
     "type": "text",
     "text": "قَصّة واسعة · أكمام عريضة · طول كامل",
     "cx": 540,
     "cy": 1268,
     "size": 44,
     "font": "Cairo-Bold",
     "color": "#2a1214"
    }
   ]
  },
  {
   "name": "Ad1_Cut_Story_1080x1920",
   "file": "ad1-cut-story-1080x1920.png",
   "w": 1080,
   "h": 1920,
   "layers": [
    {
     "type": "bg",
     "top": "#907671",
     "bottom": "#907671"
    },
    {
     "type": "image",
     "asset": "burgundy-front-plate",
     "crop": [
      0,
      0,
      2132,
      2412
     ],
     "x": -354.1904761904762,
     "y": 63.809523809523796,
     "w": 1788.3809523809525
    },
    {
     "type": "vignette",
     "color": "#000000",
     "opacity": 0.22
    },
    {
     "type": "text",
     "text": "عبايات شمس 2027",
     "cx": 540,
     "cy": 300,
     "size": 100,
     "font": "Cairo-Black",
     "color": "#2a1214"
    },
    {
     "type": "rect",
     "x": 470,
     "y": 372,
     "w": 140,
     "h": 6,
     "r": 3,
     "fill": "#6d1526"
    },
    {
     "type": "text",
     "text": "قَصّة واسعة · أكمام عريضة · طول كامل",
     "cx": 540,
     "cy": 440,
     "size": 46,
     "font": "Cairo-Bold",
     "color": "#2a1214"
    }
   ]
  },
  {
   "name": "Ad2_Details_Feed_1080x1350",
   "file": "ad2-details-feed-1080x1350.png",
   "w": 1080,
   "h": 1350,
   "layers": [
    {
     "type": "bg",
     "top": "#977b6d",
     "bottom": "#a08376",
     "edge": "#6f5a4f",
     "ink": "#2a1d12",
     "accent": "#7a5a12"
    },
    {
     "type": "rect",
     "x": 290,
     "y": 225,
     "w": 650,
     "h": 797.7272727272727,
     "r": 36,
     "fill": "#000000",
     "shadow": true
    },
    {
     "type": "image",
     "asset": "gold-three-quarter",
     "crop": [
      330,
      360,
      440,
      540
     ],
     "x": 290,
     "y": 225,
     "w": 650,
     "r": 36
    },
    {
     "type": "stroke",
     "x": 290,
     "y": 225,
     "w": 650,
     "h": 797.7272727272727,
     "r": 36,
     "color": "#F6EEE6",
     "width": 6
    },
    {
     "type": "line",
     "x1": 496.8181818181818,
     "y1": 355,
     "x2": 458,
     "y2": 321,
     "color": "#F6EEE6",
     "width": 4
    },
    {
     "type": "dot",
     "x": 496.8181818181818,
     "y": 355,
     "r": 11,
     "fill": "#F6EEE6",
     "ring": "#2a1d12"
    },
    {
     "type": "rect",
     "x": 308,
     "y": 249,
     "w": 250,
     "h": 72,
     "r": 36,
     "fill": "#2a1d12",
     "opacity": 0.92
    },
    {
     "type": "text",
     "text": "حاشية ساتان",
     "cx": 433,
     "cy": 285,
     "size": 36,
     "font": "Cairo-Bold",
     "color": "#F6EEE6"
    },
    {
     "type": "line",
     "x1": 578.0681818181818,
     "y1": 564.7727272727273,
     "x2": 772,
     "y2": 530.7727272727273,
     "color": "#F6EEE6",
     "width": 4
    },
    {
     "type": "dot",
     "x": 578.0681818181818,
     "y": 564.7727272727273,
     "r": 11,
     "fill": "#F6EEE6",
     "ring": "#2a1d12"
    },
    {
     "type": "rect",
     "x": 672,
     "y": 458.77272727272725,
     "w": 250,
     "h": 72,
     "r": 36,
     "fill": "#2a1d12",
     "opacity": 0.92
    },
    {
     "type": "text",
     "text": "كُمّ واسع",
     "cx": 797,
     "cy": 494.77272727272725,
     "size": 36,
     "font": "Cairo-Bold",
     "color": "#F6EEE6"
    },
    {
     "type": "line",
     "x1": 496.8181818181818,
     "y1": 875,
     "x2": 458,
     "y2": 841,
     "color": "#F6EEE6",
     "width": 4
    },
    {
     "type": "dot",
     "x": 496.8181818181818,
     "y": 875,
     "r": 11,
     "fill": "#F6EEE6",
     "ring": "#2a1d12"
    },
    {
     "type": "rect",
     "x": 308,
     "y": 769,
     "w": 250,
     "h": 72,
     "r": 36,
     "fill": "#2a1d12",
     "opacity": 0.92
    },
    {
     "type": "text",
     "text": "مخمل لامع",
     "cx": 433,
     "cy": 805,
     "size": 36,
     "font": "Cairo-Bold",
     "color": "#F6EEE6"
    },
    {
     "type": "rect",
     "x": 40,
     "y": 732.7272727272727,
     "w": 210,
     "h": 263.84615384615387,
     "r": 18,
     "fill": "#000000",
     "shadow": true
    },
    {
     "type": "image",
     "asset": "gold-three-quarter",
     "crop": [
      0,
      0,
      1092,
      1372
     ],
     "x": 40,
     "y": 732.7272727272727,
     "w": 210,
     "r": 18
    },
    {
     "type": "stroke",
     "x": 40,
     "y": 732.7272727272727,
     "w": 210,
     "h": 263.84615384615387,
     "r": 18,
     "color": "#F6EEE6",
     "width": 5
    },
    {
     "type": "stroke",
     "x": 103.46153846153847,
     "y": 801.958041958042,
     "w": 84.61538461538461,
     "h": 103.84615384615385,
     "r": 4,
     "color": "#2a1d12",
     "width": 3
    },
    {
     "type": "text",
     "text": "عبايات شمس 2027",
     "cx": 540,
     "cy": 92,
     "size": 84,
     "font": "Cairo-Black",
     "color": "#2a1d12"
    },
    {
     "type": "text",
     "text": "تفاصيل تبان من قريب",
     "cx": 540,
     "cy": 160,
     "size": 44,
     "font": "Cairo-Bold",
     "color": "#2a1d12"
    },
    {
     "type": "rect",
     "x": 720,
     "y": 1163,
     "w": 300,
     "h": 84,
     "r": 42,
     "fill": "#F6EEE6",
     "opacity": 0.9
    },
    {
     "type": "text",
     "text": "مخمل لامع",
     "cx": 870,
     "cy": 1205,
     "size": 38,
     "font": "Cairo-Bold",
     "color": "#2a1d12"
    },
    {
     "type": "rect",
     "x": 390,
     "y": 1163,
     "w": 300,
     "h": 84,
     "r": 42,
     "fill": "#F6EEE6",
     "opacity": 0.9
    },
    {
     "type": "text",
     "text": "حواشي ساتان",
     "cx": 540,
     "cy": 1205,
     "size": 38,
     "font": "Cairo-Bold",
     "color": "#2a1d12"
    },
    {
     "type": "rect",
     "x": 60,
     "y": 1163,
     "w": 300,
     "h": 84,
     "r": 42,
     "fill": "#F6EEE6",
     "opacity": 0.9
    },
    {
     "type": "text",
     "text": "أكمام واسعة",
     "cx": 210,
     "cy": 1205,
     "size": 38,
     "font": "Cairo-Bold",
     "color": "#2a1d12"
    }
   ]
  },
  {
   "name": "Ad2_Details_Story_1080x1920",
   "file": "ad2-details-story-1080x1920.png",
   "w": 1080,
   "h": 1920,
   "layers": [
    {
     "type": "bg",
     "top": "#977b6d",
     "bottom": "#a08376",
     "edge": "#6f5a4f",
     "ink": "#2a1d12",
     "accent": "#7a5a12"
    },
    {
     "type": "rect",
     "x": 190,
     "y": 440,
     "w": 760,
     "h": 932.7272727272727,
     "r": 36,
     "fill": "#000000",
     "shadow": true
    },
    {
     "type": "image",
     "asset": "gold-three-quarter",
     "crop": [
      330,
      360,
      440,
      540
     ],
     "x": 190,
     "y": 440,
     "w": 760,
     "r": 36
    },
    {
     "type": "stroke",
     "x": 190,
     "y": 440,
     "w": 760,
     "h": 932.7272727272727,
     "r": 36,
     "color": "#F6EEE6",
     "width": 6
    },
    {
     "type": "line",
     "x1": 431.8181818181818,
     "y1": 592,
     "x2": 358,
     "y2": 558,
     "color": "#F6EEE6",
     "width": 4
    },
    {
     "type": "dot",
     "x": 431.8181818181818,
     "y": 592,
     "r": 11,
     "fill": "#F6EEE6",
     "ring": "#2a1d12"
    },
    {
     "type": "rect",
     "x": 208,
     "y": 486,
     "w": 250,
     "h": 72,
     "r": 36,
     "fill": "#2a1d12",
     "opacity": 0.92
    },
    {
     "type": "text",
     "text": "حاشية ساتان",
     "cx": 333,
     "cy": 522,
     "size": 36,
     "font": "Cairo-Bold",
     "color": "#F6EEE6"
    },
    {
     "type": "line",
     "x1": 526.8181818181818,
     "y1": 837.2727272727273,
     "x2": 782,
     "y2": 803.2727272727273,
     "color": "#F6EEE6",
     "width": 4
    },
    {
     "type": "dot",
     "x": 526.8181818181818,
     "y": 837.2727272727273,
     "r": 11,
     "fill": "#F6EEE6",
     "ring": "#2a1d12"
    },
    {
     "type": "rect",
     "x": 682,
     "y": 731.2727272727273,
     "w": 250,
     "h": 72,
     "r": 36,
     "fill": "#2a1d12",
     "opacity": 0.92
    },
    {
     "type": "text",
     "text": "كُمّ واسع",
     "cx": 807,
     "cy": 767.2727272727273,
     "size": 36,
     "font": "Cairo-Bold",
     "color": "#F6EEE6"
    },
    {
     "type": "line",
     "x1": 431.8181818181818,
     "y1": 1200,
     "x2": 358,
     "y2": 1166,
     "color": "#F6EEE6",
     "width": 4
    },
    {
     "type": "dot",
     "x": 431.8181818181818,
     "y": 1200,
     "r": 11,
     "fill": "#F6EEE6",
     "ring": "#2a1d12"
    },
    {
     "type": "rect",
     "x": 208,
     "y": 1094,
     "w": 250,
     "h": 72,
     "r": 36,
     "fill": "#2a1d12",
     "opacity": 0.92
    },
    {
     "type": "text",
     "text": "مخمل لامع",
     "cx": 333,
     "cy": 1130,
     "size": 36,
     "font": "Cairo-Bold",
     "color": "#F6EEE6"
    },
    {
     "type": "text",
     "text": "عبايات شمس 2027",
     "cx": 540,
     "cy": 285,
     "size": 84,
     "font": "Cairo-Black",
     "color": "#2a1d12"
    },
    {
     "type": "text",
     "text": "تفاصيل تبان من قريب",
     "cx": 540,
     "cy": 360,
     "size": 44,
     "font": "Cairo-Bold",
     "color": "#2a1d12"
    },
    {
     "type": "rect",
     "x": 720,
     "y": 1518,
     "w": 300,
     "h": 84,
     "r": 42,
     "fill": "#F6EEE6",
     "opacity": 0.9
    },
    {
     "type": "text",
     "text": "مخمل لامع",
     "cx": 870,
     "cy": 1560,
     "size": 38,
     "font": "Cairo-Bold",
     "color": "#2a1d12"
    },
    {
     "type": "rect",
     "x": 390,
     "y": 1518,
     "w": 300,
     "h": 84,
     "r": 42,
     "fill": "#F6EEE6",
     "opacity": 0.9
    },
    {
     "type": "text",
     "text": "حواشي ساتان",
     "cx": 540,
     "cy": 1560,
     "size": 38,
     "font": "Cairo-Bold",
     "color": "#2a1d12"
    },
    {
     "type": "rect",
     "x": 60,
     "y": 1518,
     "w": 300,
     "h": 84,
     "r": 42,
     "fill": "#F6EEE6",
     "opacity": 0.9
    },
    {
     "type": "text",
     "text": "أكمام واسعة",
     "cx": 210,
     "cy": 1560,
     "size": 38,
     "font": "Cairo-Bold",
     "color": "#2a1d12"
    }
   ]
  },
  {
   "name": "Ad3_Order_Feed_1080x1350",
   "file": "ad3-order-feed-1080x1350.png",
   "w": 1080,
   "h": 1350,
   "layers": [
    {
     "type": "bg",
     "top": "#977e72",
     "bottom": "#977e72"
    },
    {
     "type": "image",
     "asset": "olive-front-plate",
     "crop": [
      0,
      0,
      2132,
      2412
     ],
     "x": -698.3333333333334,
     "y": -443.33333333333337,
     "w": 1981.6666666666667
    },
    {
     "type": "vignette",
     "color": "#000000",
     "opacity": 0.22
    },
    {
     "type": "text",
     "text": "عبايات",
     "cx": 822,
     "cy": 335,
     "size": 78,
     "font": "Cairo-Black",
     "color": "#20200f"
    },
    {
     "type": "text",
     "text": "شمس 2027",
     "cx": 822,
     "cy": 430,
     "size": 78,
     "font": "Cairo-Black",
     "color": "#20200f"
    },
    {
     "type": "rect",
     "x": 762,
     "y": 505,
     "w": 120,
     "h": 5,
     "r": 2.5,
     "fill": "#4f4a14"
    },
    {
     "type": "rect",
     "x": 627,
     "y": 596,
     "w": 390,
     "h": 128,
     "r": 64,
     "fill": "#17150b",
     "shadow": true
    },
    {
     "type": "text",
     "text": "اطلبي الآن",
     "cx": 822,
     "cy": 660,
     "size": 60,
     "font": "Cairo-Black",
     "color": "#F3E2B3"
    },
    {
     "type": "rect",
     "x": 627,
     "y": 778,
     "w": 390,
     "h": 84,
     "r": 42,
     "fill": "#F6EEE6",
     "opacity": 0.9
    },
    {
     "type": "text",
     "text": "الدفع عند الاستلام",
     "cx": 822,
     "cy": 820,
     "size": 38,
     "font": "Cairo-Bold",
     "color": "#20200f"
    },
    {
     "type": "rect",
     "x": 627,
     "y": 878,
     "w": 390,
     "h": 84,
     "r": 42,
     "fill": "#F6EEE6",
     "opacity": 0.9
    },
    {
     "type": "text",
     "text": "التوصيل متوفر",
     "cx": 822,
     "cy": 920,
     "size": 38,
     "font": "Cairo-Bold",
     "color": "#20200f"
    }
   ]
  },
  {
   "name": "Ad3_Order_Story_1080x1920",
   "file": "ad3-order-story-1080x1920.png",
   "w": 1080,
   "h": 1920,
   "layers": [
    {
     "type": "bg",
     "top": "#977e72",
     "bottom": "#977e72"
    },
    {
     "type": "image",
     "asset": "olive-front-plate",
     "crop": [
      0,
      0,
      2132,
      2412
     ],
     "x": -268.2857142857143,
     "y": -39.28571428571428,
     "w": 1616.5714285714284
    },
    {
     "type": "vignette",
     "color": "#000000",
     "opacity": 0.22
    },
    {
     "type": "text",
     "text": "عبايات شمس 2027",
     "cx": 540,
     "cy": 290,
     "size": 100,
     "font": "Cairo-Black",
     "color": "#20200f"
    },
    {
     "type": "rect",
     "x": 210,
     "y": 1403,
     "w": 660,
     "h": 144,
     "r": 72,
     "fill": "#17150b",
     "shadow": true
    },
    {
     "type": "text",
     "text": "اطلبي الآن",
     "cx": 540,
     "cy": 1475,
     "size": 70,
     "font": "Cairo-Black",
     "color": "#F3E2B3"
    },
    {
     "type": "rect",
     "x": 560,
     "y": 1568,
     "w": 400,
     "h": 84,
     "r": 42,
     "fill": "#F6EEE6",
     "opacity": 0.9
    },
    {
     "type": "text",
     "text": "الدفع عند الاستلام",
     "cx": 760,
     "cy": 1610,
     "size": 38,
     "font": "Cairo-Bold",
     "color": "#20200f"
    },
    {
     "type": "rect",
     "x": 120,
     "y": 1568,
     "w": 400,
     "h": 84,
     "r": 42,
     "fill": "#F6EEE6",
     "opacity": 0.9
    },
    {
     "type": "text",
     "text": "التوصيل متوفر",
     "cx": 320,
     "cy": 1610,
     "size": 38,
     "font": "Cairo-Bold",
     "color": "#20200f"
    }
   ]
  }
 ],
 "baseline": 0.32
};

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
    alert("ما لقيتش مجلد assets/ جنب مجلد ae/.\n" + assetsDir.fsName);
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
  alert("تم بناء 6 تصاميم ✔\nRender Queue جاهزة (PNG).\nما تنساش File > Save As باش تحفظي ملف .aep.");
})();
