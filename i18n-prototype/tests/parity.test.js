// تكافؤ النموذج مع اللوحة الأصلية + رسائل الخطأ + الحفظ بعد التحديث — بيانات اصطناعية، الشبكة محجوبة.
// التشغيل: node i18n-prototype/tests/parity.test.js
const { chromium } = require('playwright');
const path = require('path');
const ORIG = 'file://' + path.join(__dirname, '..', '..', 'index.html');
const PROTO = 'file://' + path.join(__dirname, '..', 'index.html');
let pass = 0, fail = 0;
const check = (n, c, extra) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c || extra === undefined ? '' : ' ' + JSON.stringify(extra).slice(0, 400))); };
const FU = ['لم يرد الفرع', 'تم الرد - بانتظار الأوديت', 'تحت مراجعة الأوديت', 'مطلوب استكمال الرد', 'إجراء تصحيحي مطلوب', 'مغلقة'];
const rows = [];
for (let i = 0; i < 60; i++) rows.push({ id: 'T-' + String(i + 1).padStart(4, '0'), type: i % 3 ? 'طلبات العملاء' : 'تم استلام بيك اب', name: 'عميل اختبار ' + (i % 7), f: ['الغاء', 'لا يوجد اذن', 'تم تخصيص', ''][i % 4], g: '', h: '', i: '', j: '', k: '', m: '', c: '', d: '2' + (i % 8) + '/10/2026', e: '', l: FU[i % 6], status: FU[i % 6] });
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const open = async (url, mode, lang) => {
    const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
    pg.__errs = []; pg.on('pageerror', (e) => pg.__errs.push(String(e).slice(0, 140)));
    await pg.addInitScript(() => { window.__blobs = []; const o = URL.createObjectURL; URL.createObjectURL = (x) => { window.__blobs.push(x); return o.call(URL, x); }; });
    if (lang) await pg.addInitScript((v) => { try { localStorage.setItem('arrive_lang', v); } catch (e) {} }, lang);
    await pg.route('**/*', (r) => { const u = r.request().url();
      if (u.includes('script.google.com')) {
        if (mode === 'err') return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: false, error: 'boom-server' }) });
        if (mode === 'abort') return r.abort();
        return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, rows }) });
      }
      return u.startsWith('file:') ? r.continue() : r.abort(); });
    await pg.goto(url, { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(1800);
    return pg;
  };
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const snap = (pg) => pg.evaluate(() => ({
    body: document.body.innerText,
    rows: document.querySelectorAll('tbody tr').length,
    nums: (document.body.innerText.match(/\d+/g) || []).join(','),
  }));
  const csv = async (pg) => { await pg.evaluate('toCsv()'); await pg.waitForTimeout(300); return pg.evaluate(async () => window.__blobs.length ? await window.__blobs[window.__blobs.length - 1].text() : ''); };

  // 1) تكافؤ العربية: الأصلية مقابل النموذج
  const o = await open(ORIG), p = await open(PROTO + '?lang=ar');
  const so = await snap(o), sp = await snap(p);
  const stripBtn = (t) => norm(t.replace(/English|العربية/g, ''));
  check('تكافؤ: عدد صفوف الجداول متطابق', so.rows === sp.rows && so.rows > 0, [so.rows, sp.rows]);
  check('تكافؤ: كل الأرقام الظاهرة متطابقة', so.nums === sp.nums, [so.nums.slice(0, 120), sp.nums.slice(0, 120)]);
  const wo = new Set(stripBtn(so.body).split(' ')), wp = new Set(stripBtn(sp.body).split(' '));
  const onlyO = [...wo].filter((x) => !wp.has(x)), onlyP = [...wp].filter((x) => !wo.has(x));
  check('تكافؤ: نص الصفحة العربي متطابق كلمةً بكلمة (عدا فروق موثقة)', onlyO.length === 0 && onlyP.length === 0, { onlyO: onlyO.slice(0, 15), onlyP: onlyP.slice(0, 15) });
  const co = await csv(o), cp = await csv(p);
  check('تكافؤ: ملف CSV (عربي) مطابق للأصلي حرفيًا', co.length > 0 && co === cp, [co.length, cp.length]);
  check('لا أخطاء JS (الأصلية والنموذج)', o.__errs.length === 0 && p.__errs.length === 0, [o.__errs, p.__errs]);
  // 2) CSV لا يتغير بتغيير اللغة (القيم الأصلية محفوظة)
  await p.evaluate("ArriveI18n.setLang('en')"); await p.waitForTimeout(500);
  const cpEn = await csv(p);
  check('القيم الأصلية: CSV بالإنجليزية يحمل نفس قيم المصدر (لا يترجمها)', cpEn === co, [cpEn.length, co.length]);
  // 3) الحفظ بعد تحديث الصفحة فعليًا (بدون ?lang= لأنه يتغلب على المحفوظ بالتصميم)
  const q = await open(PROTO);
  await q.evaluate("ArriveI18n.setLang('en')"); await q.waitForTimeout(300);
  await p.close(); const p2 = q;
  await p2.reload({ waitUntil: 'domcontentloaded' }); await p2.waitForTimeout(1500);
  check('الحفظ: بعد reload يبقى en/ltr', await p2.evaluate("document.documentElement.lang==='en' && document.documentElement.dir==='ltr'"));
  await p2.evaluate("ArriveI18n.setLang('ar')"); await p2.reload({ waitUntil: 'domcontentloaded' }); await p2.waitForTimeout(1500);
  check('الحفظ: بعد reload يبقى ar/rtl', await p2.evaluate("document.documentElement.lang==='ar' && document.documentElement.dir==='rtl'"));
  // 4) رسائل الخطأ بلغتين
  for (const mode of ['err', 'abort']) for (const lang of ['ar', 'en']) {
    const e = await open(PROTO + '?lang=' + lang, mode);
    const conn = await e.evaluate("(document.querySelector('.mp-conn')||{}).textContent||''");
    const st = await e.evaluate("(document.querySelector('.mp-conn')||{dataset:{}}).dataset.state");
    const hasAr = /[؀-ۿ]/.test(conn);
    check(`الأخطاء (${mode}/${lang}): الحالة error والنص باللغة الصحيحة`, st === 'error' && conn.length > 0 && (lang === 'ar' ? hasAr : !hasAr || /boom-server/.test(conn)), { st, conn });
    check(`الأخطاء (${mode}/${lang}): لا مفاتيح ناقصة`, (await e.evaluate('ArriveI18n.missing()')).length === 0);
    await e.close();
  }
  await b.close();
  console.log(`\n${pass}/${pass + fail} اختبارًا ناجحًا`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(2); });
