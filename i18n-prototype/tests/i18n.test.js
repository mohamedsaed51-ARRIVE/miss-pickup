// اختبارات نموذج الترجمة (AR/EN) — بيانات اصطناعية فقط، الشبكة محجوبة.
// التشغيل: node i18n-prototype/tests/i18n.test.js     (playwright + chromium)
const { chromium } = require('playwright');
const fs = require('fs'), vm = require('vm'), path = require('path');
const DIR = path.join(__dirname, '..');
const INDEX = 'file://' + path.join(DIR, 'index.html');
let pass = 0, fail = 0;
const check = (n, c, extra) => { c ? pass++ : fail++; console.log((c ? 'PASS' : 'FAIL') + ' - ' + n + (c || extra === undefined ? '' : ' ' + JSON.stringify(extra).slice(0, 300))); };
const ARABIC = /[؀-ۿ]/;

// ---------- 1) قاموس + نواة (بدون متصفح) ----------
const w = { addEventListener() {}, document: { addEventListener() {}, documentElement: { setAttribute() {}, getAttribute() {} }, querySelectorAll: () => [] }, localStorage: { getItem: () => null, setItem() {} }, location: { search: '' }, parent: null };
w.window = w; vm.createContext(w);
vm.runInContext(fs.readFileSync(path.join(DIR, 'arrive-i18n.js'), 'utf8'), w);
vm.runInContext(fs.readFileSync(path.join(DIR, 'miss-pickup.dict.js'), 'utf8'), w);
const D = w.MP_I18N, I = w.ArriveI18n;
I.init({ dicts: D.dicts, values: D.values });
const diff = I.keysDiff();
check('القاموس: لا مفاتيح ناقصة بين AR وEN', diff.onlyAr.length === 0 && diff.onlyEn.length === 0, diff);
check('القاموس: المتغيرات {…} متطابقة بين اللغتين', diff.varMismatch.length === 0, diff.varMismatch);
const enAr = Object.entries(D.dicts.en).filter(([k, v]) => ARABIC.test(typeof v === 'object' ? JSON.stringify(v) : v));
check('القاموس: لا حروف عربية داخل قيم EN', enAr.length === 0, enAr.map((x) => x[0]));
const empty = Object.entries(D.dicts.ar).concat(Object.entries(D.dicts.en)).filter(([k, v]) => v === '' || v == null);
check('القاموس: لا قيم فارغة', empty.length === 0, empty.map((x) => x[0]));
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const used = new Set();
for (const m of html.matchAll(/\b(?:tt|te|tnn)\('([\w.]+)'/g)) used.add(m[1]);
for (const m of html.matchAll(/data-i18n="([\w.]+)"/g)) used.add(m[1]);
for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) m[1].split(';').forEach((p) => used.add(p.split(':')[1].trim()));
for (const m of html.matchAll(/data-title-key="([\w.]+)"/g)) used.add(m[1]);
for (const m of html.matchAll(/'(q\.\w+\.(?:label|note))'/g)) used.add(m[1]);
for (const m of html.matchAll(/'(conn\.\w+)'/g)) used.add(m[1]);
const missingInDict = [...used].filter((k) => !(k in D.dicts.ar) || !(k in D.dicts.en));
check('الاستخدام: كل مفتاح مستخدم في الكود موجود في القاموسين (' + used.size + ' مفتاحًا)', missingInDict.length === 0, missingInDict);
const unusedKeys = Object.keys(D.dicts.ar).filter((k) => !used.has(k));
check('الاستخدام: لا مفاتيح يتيمة في القاموس', unusedKeys.length === 0, unusedKeys);
// الجمع
const pl = (lang, n) => { I._state.lang = lang; return I.tn('results', n); };
const A = [0, 1, 2, 3, 10, 11, 99, 100].map((n) => pl('ar', n));
check('الجمع العربي: 0/1/2/3-10/11-99/100', A[0] === 'لا نتائج' && A[1] === 'نتيجة واحدة' && A[2] === 'نتيجتان' && A[3] === '3 نتائج' && A[4] === '10 نتائج' && A[5] === '11 نتيجة' && A[6] === '99 نتيجة' && A[7] === '100 نتيجة', A);
const E = [0, 1, 2, 5].map((n) => pl('en', n));
check('الجمع الإنجليزي: 0/1/2/5', E[0] === '0 results' && E[1] === '1 result' && E[2] === '2 results' && E[3] === '5 results', E);
I._state.lang = 'ar'; check('الجمع: فروع "أخرى"', I.tn('rp.otherBranches', 1) === 'أخرى (فرع واحد)' && I.tn('rp.otherBranches', 2) === 'أخرى (فرعان)' && I.tn('rp.otherBranches', 5) === 'أخرى (5 فروع)' && I.tn('rp.otherBranches', 12) === 'أخرى (12 فرعًا)');
// المتغيرات المتكررة (كل الظهور)
I._state.dicts.en.__dbl = '{a}-{a}'; check('المتغير المتكرر يُستبدل في كل ظهور', (I._state.lang = 'en', I.t('__dbl', { a: 'x' })) === 'x-x'); I._state.lang = 'ar';
// مفتاح ناقص
const before = I.missing().length; I.t('no.such.key'); check('مفتاح ناقص يُسجَّل ولا يمرّ بصمت', I.missing().includes('ar:no.such.key') && I.missing().length === before + 1);
check('ترجمة القيم: العربية تبقى كما هي، الإنجليزية تُترجم، غير المعرّف يُسجَّل', (I._state.lang = 'en', I.tv('followup', 'مغلقة') === 'Closed' && I.tv('branch', 'فرع غير معرّف') === 'فرع غير معرّف' && I.unmapped().branch.includes('فرع غير معرّف')) && (I._state.lang = 'ar', I.tv('followup', 'مغلقة') === 'مغلقة'));

// ---------- 2) المتصفح ----------
const FU = ['لم يرد الفرع', 'تم الرد - بانتظار الأوديت', 'تحت مراجعة الأوديت', 'مطلوب استكمال الرد', 'إجراء تصحيحي مطلوب', 'مغلقة'];
const rows = [];
for (let i = 0; i < 40; i++) rows.push({ id: 'T-' + String(i + 1).padStart(4, '0'), type: i % 3 ? 'طلبات العملاء' : 'تم استلام بيك اب', name: 'عميل اختبار ' + (i % 7), f: ['الغاء', 'لا يوجد اذن', 'تم تخصيص المندوب'][i % 3], g: ['سبب الالغاء', '', 'فين البيك اب'][i % 3], h: i % 4 ? 'عوده تاني يوم' : 'نص حر غير معرّف ' + (i % 2), i: 'غير محدد', j: ['لا يوجد مخطئ', 'خدمه العملاء', 'فرع تجريبي غير معرّف'][i % 3], k: FU[i % 6], m: 'لم تتم المراجعة', c: '', d: '26/10/2026' });
const ALLOWED_AR = [/^عميل اختبار \d$/, /^نص حر غير معرّف \d$/, /^فرع تجريبي غير معرّف$/, /^العربية$/]; // بيانات المصدر غير المعرّفة + زر اللغة بلغته
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const open = async (query, width, storage) => {
    const pg = await b.newPage({ viewport: { width: width || 1440, height: 900 } });
    const errs = []; pg.on('pageerror', (e) => errs.push(String(e).slice(0, 140))); pg.__errs = errs;
    await pg.route('**/*', (r) => { const u = r.request().url();
      if (u.includes('script.google.com')) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, rows }) });
      return u.startsWith('file:') ? r.continue() : r.abort(); });
    if (storage) await pg.addInitScript((v) => { try { localStorage.setItem('arrive_lang', v); } catch (e) {} }, storage);
    await pg.goto(INDEX + (query || ''), { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(1800);
    return pg;
  };
  const visibleArabic = (pg) => pg.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const n = w.currentNode, t = n.textContent.trim(); if (!t || !/[؀-ۿ]/.test(t)) continue; const p = n.parentElement; if (!p || p.closest('script,style,option:not(:checked)') && false) continue; if (p.offsetParent === null && getComputedStyle(p).position !== 'fixed') continue; out.push(t); }
    document.querySelectorAll('option').forEach((o) => { if (/[؀-ۿ]/.test(o.textContent)) out.push(o.textContent.trim()); });
    document.querySelectorAll('[placeholder],[aria-label],[title]').forEach((e) => ['placeholder', 'aria-label', 'title'].forEach((a) => { const v = e.getAttribute(a); if (v && /[؀-ۿ]/.test(v)) out.push(v); }));
    return out; });
  const kpiTexts = (pg) => pg.evaluate(() => [...document.querySelectorAll('#mp-root [data-source="kpis"][data-field]')].map((e) => e.dataset.field + '=' + e.textContent));

  // الافتراضي: عربي
  let pg = await open('');
  const st0 = await pg.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, root: document.getElementById('mp-root').dir, title: document.title, btn: document.getElementById('mp-lang').textContent }));
  check('الافتراضي عربي: lang=ar dir=rtl والجذر rtl وعنوان الصفحة وزر التبديل "English"', st0.lang === 'ar' && st0.dir === 'rtl' && st0.root === 'rtl' && st0.title.includes('لوحة رقابة') && st0.btn === 'English', st0);
  const arKpi = await kpiTexts(pg);
  const arCount = await pg.evaluate("document.getElementById('mp-n').textContent");
  check('بيانات الاختبار ظهرت (عدد النتائج بالعربية)', arCount === '40 نتيجة', arCount);
  const arHeadX = await pg.evaluate(() => { const t = [...document.querySelectorAll('#t-cases th')].map((e) => e.getBoundingClientRect().left); return t[0] > t[1]; });
  check('RTL: أول عمود في جدول الحالات على اليمين', arHeadX);
  check('لا تمرير أفقي @1440 (عربي)', await pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'));

  // تبديل إلى الإنجليزية
  await pg.click('#mp-lang'); await pg.waitForTimeout(500);
  const st1 = await pg.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, root: document.getElementById('mp-root').dir, title: document.title, btn: document.getElementById('mp-lang').textContent, saved: localStorage.getItem('arrive_lang'), count: document.getElementById('mp-n').textContent, theme: document.getElementById('mp-theme').textContent, conn: document.getElementById('mp-conn-l').textContent }));
  check('الإنجليزية: lang=en dir=ltr والجذر ltr وعنوان الصفحة وزر "العربية" وحفظ الاختيار', st1.lang === 'en' && st1.dir === 'ltr' && st1.root === 'ltr' && st1.title.startsWith('ARRIVE | Miss Pickup') && st1.btn === 'العربية' && st1.saved === 'en', st1);
  check('الجمع والاتصال والثيم بالإنجليزية', st1.count === '40 results' && st1.theme === 'Dark mode' && st1.conn === 'Connected to the sheet', st1);
  check('LTR: أول عمود في جدول الحالات على اليسار', await pg.evaluate(() => { const t = [...document.querySelectorAll('#t-cases th')].map((e) => e.getBoundingClientRect().left); return t[0] < t[1]; }));
  const enKpi = await kpiTexts(pg);
  check('الأرقام (المؤشرات) متطابقة حرفيًا بين العربية والإنجليزية', JSON.stringify(arKpi) === JSON.stringify(enKpi), { arKpi, enKpi });
  let ar = await visibleArabic(pg); let bad = ar.filter((t) => !ALLOWED_AR.some((r) => r.test(t)));
  check('الإنجليزية: لا نص عربي ظاهر إلا بيانات المصدر غير المعرّفة وزر اللغة', bad.length === 0, bad.slice(0, 8));
  check('الإنجليزية: ArriveI18n.unmapped يكشف القيم غير المعرّفة بدقة', await pg.evaluate(() => { const u = ArriveI18n.unmapped(); return JSON.stringify(Object.keys(u).sort()) === JSON.stringify(['branch', 'firstmile']) && u.branch.length === 1 && u.firstmile.length === 1; }));
  // تفاعل كامل بالإنجليزية: بطاقة، نقر صف جدول، فلتر، بحث، تقرير
  await pg.click('.mp-stub[data-card="no_reply"]'); await pg.waitForTimeout(400);
  const chip = await pg.evaluate("document.getElementById('mp-cardchip').textContent");
  check('رقاقة الفلتر بالإنجليزية', chip === 'Filter: Branch did not reply ✕', chip);
  const opts = await pg.evaluate(() => [...document.querySelector('.mp-type').options].map((o) => o.textContent));
  check('قائمة الأنواع بالإنجليزية (All types / Customer requests / Pickup received)', opts[0] === 'All types' && opts.includes('Customer requests') && opts.includes('Pickup received'), opts);
  await pg.click('.mp-reset'); await pg.waitForTimeout(200);
  await pg.fill('.mp-q', 'closed'); await pg.waitForTimeout(300);
  const srch = await pg.evaluate("document.getElementById('mp-n').textContent");
  check('البحث بالإنجليزية يطابق النص المترجم (closed) ولا يطابق عربي', srch !== '0 results' && srch !== '40 results', srch);
  await pg.click('.mp-reset'); await pg.waitForTimeout(200);
  await pg.click('#mp-report'); await pg.waitForTimeout(2500);
  const rp = await pg.evaluate(() => ({ pages: document.querySelectorAll('.rp-page').length, dir: getComputedStyle(document.getElementById('rp-ov')).direction, text: document.getElementById('rp-ov').innerText }));
  check('التقرير بالإنجليزية: صفحات + اتجاه ltr + عناوينه', rp.pages >= 2 && rp.dir === 'ltr' && /miss pickup control report/i.test(rp.text) && /page 2 of \d+/i.test(rp.text), { pages: rp.pages, dir: rp.dir });
  const rpAr = rp.text.split(/[\n\t]/).filter((t) => ARABIC.test(t) && !/^\s*\d+(\.\d+)?%?\s*$/.test(t) && !ALLOWED_AR.some((r) => r.test(t.trim())));
  check('التقرير بالإنجليزية: لا نص عربي إلا بيانات المصدر', rpAr.length === 0, rpAr.slice(0, 6));
  // تبديل اللغة والتقرير مفتوح: يُعاد بناؤه
  await pg.evaluate("ArriveI18n.setLang('ar')"); await pg.waitForTimeout(1500);
  const rp2 = await pg.evaluate(() => ({ dir: getComputedStyle(document.getElementById('rp-ov')).direction, text: document.getElementById('rp-ov').innerText }));
  check('تبديل اللغة والتقرير مفتوح يعيد بناءه بالعربية (rtl)', rp2.dir === 'rtl' && /تقرير رقابة/.test(rp2.text) && /صفحة 2 من \d+/.test(rp2.text));
  await pg.keyboard.press('Escape');
  check('لا مفاتيح ناقصة بعد استخدام كامل للغتين', (await pg.evaluate('ArriveI18n.missing()')).length === 0, await pg.evaluate('ArriveI18n.missing()'));
  check('لا أخطاء JavaScript', pg.__errs.length === 0, pg.__errs);
  await pg.close();

  // الحفظ بعد إعادة التحميل + ?lang=
  pg = await open('', 1440, 'en');
  check('الحفظ: التحميل مع اختيار سابق en يفتح بالإنجليزية', (await pg.evaluate('document.documentElement.lang')) === 'en' && (await pg.evaluate("document.querySelector('.mp-take').innerText")).startsWith('Report'));
  await pg.close();
  pg = await open('?lang=ar', 1440, 'en');
  check('?lang=ar يتغلّب على المحفوظ ويُحفظ', (await pg.evaluate('document.documentElement.lang')) === 'ar' && (await pg.evaluate("localStorage.getItem('arrive_lang')")) === 'ar');
  await pg.close();
  pg = await open('?lang=fr', 1440, 'en');
  check('?lang= غير مدعومة تُتجاهل', (await pg.evaluate('document.documentElement.lang')) === 'en');
  // رسائل postMessage
  const origin = await pg.evaluate('location.origin');
  await pg.evaluate(() => window.postMessage({ type: 'arrive-lang', lang: 'ar' }, '*')); await pg.waitForTimeout(300);
  check('postMessage من أصل غير مصرّح به يُتجاهل', (await pg.evaluate('document.documentElement.lang')) === 'en');
  await pg.evaluate((o) => { ArriveI18n._state.origins.push('null'); window.postMessage({ type: 'arrive-lang', lang: 'ar' }, '*'); }, origin); await pg.waitForTimeout(300);
  check('postMessage من أصل مصرّح به يغيّر اللغة', (await pg.evaluate('document.documentElement.lang')) === 'ar');
  await pg.close();
  // وضع التشخيص يُظهر المفتاح الناقص
  pg = await open('?i18nDebug=1');
  check('وضع i18nDebug يُظهر ⚠ للمفتاح الناقص', (await pg.evaluate("ArriveI18n.t('absent.key')")) === '⚠absent.key');
  await pg.close();
  // XSS: بيانات ضارة تمر عبر الواجهة بلغتين ومعها التقرير — لا تنفيذ
  {
    const X = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
    const hostile = rows.slice(0, 12).map((r, i) => Object.assign({}, r, { name: X, f: X, g: X, h: X, j: X + i, type: X, k: i % 2 ? X : r.k }));
    for (const lang of ['ar', 'en']) {
      const pg2 = await b.newPage({ viewport: { width: 1440, height: 900 } });
      await pg2.route('**/*', (r) => { const u = r.request().url();
        if (u.includes('script.google.com')) return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, rows: hostile }) });
        return u.startsWith('file:') ? r.continue() : r.abort(); });
      await pg2.goto(INDEX + '?lang=' + lang, { waitUntil: 'domcontentloaded' }); await pg2.waitForTimeout(1500);
      await pg2.click('#mp-report'); await pg2.waitForTimeout(2200); await pg2.evaluate("ArriveI18n.setLang('" + (lang === 'ar' ? 'en' : 'ar') + "')"); await pg2.waitForTimeout(1800);
      check('XSS (' + lang + '→' + (lang === 'ar' ? 'en' : 'ar') + '): بيانات ضارة + تقرير + تبديل لغة = 0 تنفيذ', (await pg2.evaluate('window.__xss||0')) === 0 && (await pg2.evaluate("document.querySelectorAll('img[onerror]').length")) === 0);
      await pg2.close();
    }
  }
  // تخطيط الجوال
  for (const lang of ['ar', 'en']) {
    pg = await open('?lang=' + lang, 390);
    check('لا تمرير أفقي @390 (' + lang + ')', await pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), await pg.evaluate('document.documentElement.scrollWidth'));
    await pg.close();
  }
  await b.close();
  console.log(`\n${pass}/${pass + fail} اختبارًا ناجحًا`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.stack || e.message); process.exit(2); });
