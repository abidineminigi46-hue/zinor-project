# عبايات شمس 2027 — Static Ads

3 تصاميم إعلانية ثابتة لـ Facebook وInstagram، كل واحد بمقاسين:

| التصميم | Feed 1080×1350 | Stories 1080×1920 |
|---|---|---|
| 1 — القَصّة (العنابي، العباية كاملة) | `png/ad1-cut-feed-1080x1350.png` | `png/ad1-cut-story-1080x1920.png` |
| 2 — التفاصيل (الذهبي، لقطة قريبة للكُمّ والقماش) | `png/ad2-details-feed-1080x1350.png` | `png/ad2-details-story-1080x1920.png` |
| 3 — الطلب (الزيتي + زر «اطلبي الآن») | `png/ad3-order-feed-1080x1350.png` | `png/ad3-order-story-1080x1920.png` |

## فتح التصاميم في After Effects

ما كانش After Effects متوفر هنا، لهذا كاين سكريبت يبني التصاميم داخل البرنامج: `ae/abayat-chams-2027-static-ads.jsx`.

1. ثبّتي الخطوط اللي في `fonts/` (Cairo Black وBold وSemiBold) وعاودي فتح After Effects.
2. فعّلي النص العربي: **Edit › Preferences › Type › Text Engine = South Asian and Middle Eastern**، وعاودي تشغيل البرنامج.
3. **File › Scripts › Run Script File…** واختاري الملف `ae/abayat-chams-2027-static-ads.jsx`. خلّي المجلدات `ae/` و`assets/` و`fonts/` في نفس البلاصة (مع بعضاهم).
4. السكريبت يصنع 6 Compositions (كل نص layer قابل للتعديل) ويحضّر Render Queue بصيغة PNG في `png-ae/`.
5. **File › Save As** باش يكون عندك ملف `.aep` قابل للتعديل.

بلاصة النصوص في After Effects تقريبية شوية (فرق بضع pixels في الارتفاع). إذا كاين فرق مع صور الـ PNG، حرّكي الـ layer شوية.

## الصور المستعملة

- `assets/*.png`: لقطات من الصور الأصلية، مكبّرة ×2 بـ Real-ESRGAN باش تبان تفاصيل القماش. اللون والقَصّة ما تبدّلوش.
- `assets/*-plate.png`: نفس الصورة، والخلفية تاع الاستوديو ممدودة لبرّا (`build/make_plates.py`) باش ما تبانش حواف الصورة.

## إعادة التوليد

`build/spec.mjs` فيه كامل المقاسات والنصوص والألوان. `node build/build.mjs` يعاود يصدّر الـ PNG بـ Chromium ويكتب ملف الـ .jsx من نفس المواصفات.
