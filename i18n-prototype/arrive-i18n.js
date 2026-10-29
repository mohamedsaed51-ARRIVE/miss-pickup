/**
 * arrive-i18n.js — نواة الترجمة المشتركة لداشبوردات ARRIVE (نموذج أولي، مستخلصة من تصميم First-Mile)
 * ------------------------------------------------------------------------------------------------
 * بلا اعتماديات ولا خطوة بناء. تضيف على نمط First-Mile (t(lang,key,vars) + data-i18n):
 *   1) حفظ اللغة:   ?lang=  >  localStorage  >  الافتراضي        (+ استقبال اللغة من البوابة عبر postMessage)
 *   2) RTL/LTR:    تضبط lang و dir على <html> وعلى كل عنصر يحمل data-dir-follow
 *   3) الجمع:      tn(key, n, vars) باستخدام Intl.PluralRules (العربية: zero/one/two/few/many/other)
 *   4) المفاتيح الناقصة: تُسجَّل في missing() ولا تمرّ بصمت (وضع التشخيص يُظهرها ⚠)
 *   5) قيم الشيت:  tv(group, raw) تترجم المفردات المضبوطة فقط؛ غير المعرّف يبقى كما هو ويُسجَّل في unmapped()
 * المبدأ: بيانات المصدر (قيم الشيت) تبقى هي المفتاح المنطقي؛ الترجمة للعرض فقط ولا تدخل في أي حساب.
 */
(function (global) {
  'use strict';
  var LANGS = {
    ar: { dir: 'rtl', locale: 'ar-EG-u-nu-latn', label: 'العربية' }, // أرقام لاتينية (نفس نمط First-Mile)
    en: { dir: 'ltr', locale: 'en-US', label: 'English' }
  };
  var S = { lang: 'ar', def: 'ar', dicts: { ar: {}, en: {} }, values: {}, key: 'arrive_lang', debug: false,
            missing: {}, unmapped: {}, subs: [], origins: [], plural: {} };

  function lsGet(k) { try { return global.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { global.localStorage.setItem(k, v); } catch (e) { /* التخزين محجوب: نكمل بدون حفظ */ } }
  function valid(l) { return l === 'ar' || l === 'en'; }

  function resolveInitial() {
    var q = null;
    try { q = new URLSearchParams(global.location.search).get('lang'); } catch (e) {}
    if (valid(q)) { lsSet(S.key, q); return q; }
    var st = lsGet(S.key);
    return valid(st) ? st : S.def;
  }

  function fmt(str, vars) {
    if (!vars) return str;
    return String(str).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] == null ? m : vars[k]; }); // كل ظهور (لا الأول فقط)
  }

  function lookup(key) {
    var d = S.dicts[S.lang] && S.dicts[S.lang][key];
    if (d != null) return d;
    S.missing[S.lang + ':' + key] = true;
    if (S.debug && global.console) global.console.warn('[i18n] missing key', S.lang + ':' + key);
    var f = S.dicts[S.def] && S.dicts[S.def][key];
    return f != null ? f : null;
  }

  function t(key, vars) {
    var v = lookup(key);
    if (v == null) return S.debug ? '⚠' + key : key;
    if (typeof v === 'object') v = v.other != null ? v.other : '';
    return (S.debug && S.missing[S.lang + ':' + key] ? '⚠' : '') + fmt(v, vars);
  }

  function tn(key, n, vars) {
    var v = lookup(key);
    if (v == null) return S.debug ? '⚠' + key : key;
    var pr = S.plural[S.lang] || (S.plural[S.lang] = new Intl.PluralRules(S.lang));
    var form = typeof v === 'object' ? (v[pr.select(n)] != null ? v[pr.select(n)] : v.other) : v;
    var all = { n: fmtNum(n) }; if (vars) for (var k in vars) all[k] = vars[k];
    return fmt(form, all);
  }

  function tv(group, raw) {
    if (raw == null || raw === '') return raw == null ? '' : raw;
    if (S.lang === 'ar') return raw; // مصدر البيانات عربي
    var m = S.values[group];
    if (m && Object.prototype.hasOwnProperty.call(m, raw)) return m[raw];
    (S.unmapped[group] || (S.unmapped[group] = {}))[raw] = true;
    return raw;
  }

  function fmtNum(n, o) { return (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString(LANGS[S.lang].locale, o); }
  function fmtPct(r, digits) { return (r == null || isNaN(r)) ? '—' : (r * 100).toFixed(digits == null ? 1 : digits) + '%'; }

  function apply(root) {
    var el = global.document, h = el.documentElement;
    h.setAttribute('lang', S.lang); h.setAttribute('dir', LANGS[S.lang].dir);
    el.querySelectorAll('[data-dir-follow]').forEach(function (e) { e.setAttribute('dir', LANGS[S.lang].dir); });
    (root || el).querySelectorAll('[data-i18n]').forEach(function (e) { e.textContent = t(e.getAttribute('data-i18n')); });
    (root || el).querySelectorAll('[data-i18n-attr]').forEach(function (e) {
      e.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var p = pair.split(':'); if (p.length === 2) e.setAttribute(p[0].trim(), t(p[1].trim()));
      });
    });
    var tk = h.getAttribute('data-title-key'); if (tk) el.title = t(tk);
    el.querySelectorAll('[data-lang-toggle]').forEach(function (b) { b.textContent = S.lang === 'ar' ? LANGS.en.label : LANGS.ar.label; b.setAttribute('lang', S.lang === 'ar' ? 'en' : 'ar'); });
  }

  function setLang(l, opt) {
    if (!valid(l)) return;
    S.lang = l; lsSet(S.key, l); apply();
    S.subs.forEach(function (f) { try { f(l); } catch (e) { if (global.console) global.console.error(e); } });
    if (!(opt && opt.silent)) try { if (global.parent && global.parent !== global) global.parent.postMessage({ type: 'arrive-lang-changed', lang: l }, '*'); } catch (e) {}
  }

  function onMessage(ev) {
    var d = ev.data; if (!d || d.type !== 'arrive-lang' || !valid(d.lang)) return;
    if (S.origins.indexOf(ev.origin) < 0) return;   // فقط أصول البوابة المصرّح بها صراحةً
    if (d.lang !== S.lang) setLang(d.lang, { silent: true });
  }

  function init(o) {
    S.dicts = o.dicts; S.values = o.values || {}; S.def = o.defaultLang || 'ar'; S.key = o.storageKey || 'arrive_lang';
    S.origins = o.allowedOrigins || [];
    var dbg = false; try { dbg = /[?&]i18nDebug=1/.test(global.location.search); } catch (e) {}
    S.debug = !!(o.debug || dbg);
    S.lang = resolveInitial();
    apply();
    global.addEventListener('message', onMessage);
    global.document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-lang-toggle]'); if (b) setLang(S.lang === 'ar' ? 'en' : 'ar'); });
    try { if (global.parent && global.parent !== global) global.parent.postMessage({ type: 'arrive-lang-ready', lang: S.lang }, '*'); } catch (e) {}
  }

  function keysDiff() { // أداة فحص (تُستخدم في الاختبارات): فروق المفاتيح والمتغيرات بين اللغتين
    var out = { onlyAr: [], onlyEn: [], varMismatch: [] }, a = S.dicts.ar, b = S.dicts.en;
    var vars = function (v) { var s = typeof v === 'object' ? JSON.stringify(v) : String(v); return (s.match(/\{\w+\}/g) || []).filter(function (x, i, arr) { return arr.indexOf(x) === i; }).sort().join(); };
    Object.keys(a).forEach(function (k) { if (!(k in b)) out.onlyAr.push(k); else if (vars(a[k]) !== vars(b[k])) out.varMismatch.push(k); });
    Object.keys(b).forEach(function (k) { if (!(k in a)) out.onlyEn.push(k); });
    return out;
  }

  global.ArriveI18n = {
    init: init, t: t, tn: tn, tv: tv, setLang: setLang, getLang: function () { return S.lang; }, dir: function () { return LANGS[S.lang].dir; },
    locale: function () { return LANGS[S.lang].locale; }, apply: apply, onChange: function (f) { S.subs.push(f); },
    fmtNum: fmtNum, fmtPct: fmtPct, missing: function () { return Object.keys(S.missing); }, unmapped: function () {
      var o = {}; Object.keys(S.unmapped).forEach(function (g) { o[g] = Object.keys(S.unmapped[g]); }); return o; },
    keysDiff: keysDiff, _state: S
  };
})(typeof window !== 'undefined' ? window : this);
