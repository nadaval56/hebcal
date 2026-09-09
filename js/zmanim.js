/* zmanim.js — חישוב זמני היום לפי אלגוריתם NOAA (מיקום השמש).
   כל החישובים מקומיים בדפדפן — ללא שרת וללא אינטרנט. */
var Zmanim = (function () {
  'use strict';

  var RAD = Math.PI / 180;
  var MIN = 60000; // מילישניות בדקה

  /* ---------- אסטרונומיה ---------- */
  function julianDay(y, m, d) {
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000) + 2440587.5;
  }
  function julianCenturies(jd) { return (jd - 2451545) / 36525; }

  function geomMeanLongSun(t) {
    var l = (280.46646 + t * (36000.76983 + 0.0003032 * t)) % 360;
    return l < 0 ? l + 360 : l;
  }
  function geomMeanAnomalySun(t) { return 357.52911 + t * (35999.05029 - 0.0001537 * t); }
  function eccentricityEarthOrbit(t) { return 0.016708634 - t * (0.000042037 + 0.0000001267 * t); }
  function sunEqOfCenter(t) {
    var m = geomMeanAnomalySun(t) * RAD;
    return Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
      Math.sin(2 * m) * (0.019993 - 0.000101 * t) + Math.sin(3 * m) * 0.000289;
  }
  function sunTrueLong(t) { return geomMeanLongSun(t) + sunEqOfCenter(t); }
  function sunApparentLong(t) {
    var o = sunTrueLong(t);
    var omega = 125.04 - 1934.136 * t;
    return o - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  }
  function meanObliquityOfEcliptic(t) {
    var s = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
    return 23 + (26 + s / 60) / 60;
  }
  function obliquityCorrection(t) {
    return meanObliquityOfEcliptic(t) + 0.00256 * Math.cos((125.04 - 1934.136 * t) * RAD);
  }
  function sunDeclination(t) {
    var e = obliquityCorrection(t) * RAD, lambda = sunApparentLong(t) * RAD;
    return Math.asin(Math.sin(e) * Math.sin(lambda)) / RAD;
  }
  function equationOfTime(t) { // בדקות
    var eps = obliquityCorrection(t) * RAD;
    var l0 = geomMeanLongSun(t) * RAD;
    var e = eccentricityEarthOrbit(t);
    var m = geomMeanAnomalySun(t) * RAD;
    var y = Math.tan(eps / 2); y = y * y;
    var etime = y * Math.sin(2 * l0) - 2 * e * Math.sin(m) + 4 * e * y * Math.sin(m) * Math.cos(2 * l0) -
      0.5 * y * y * Math.sin(4 * l0) - 1.25 * e * e * Math.sin(2 * m);
    return etime / RAD * 4;
  }

  function hourAngle(lat, dec, zenith) {
    var latR = lat * RAD, decR = dec * RAD;
    var c = (Math.cos(zenith * RAD) - Math.sin(latR) * Math.sin(decR)) /
      (Math.cos(latR) * Math.cos(decR));
    if (c > 1 || c < -1) return null; // השמש לא חוצה את הזווית הזו ביום זה
    return Math.acos(c) / RAD;
  }

  /** דקות UTC של מאורע שמש. rising=true זריחה, false שקיעה. */
  function timeUTC(jd, lat, lng, zenith, rising) {
    var t = julianCenturies(jd);
    var eq = equationOfTime(t), dec = sunDeclination(t);
    var ha = hourAngle(lat, dec, zenith);
    if (ha === null) return null;
    var delta = -lng + (rising ? -ha : ha);
    var mins = 720 + 4 * delta - eq;
    // איטרציה נוספת לדיוק
    t = julianCenturies(jd + mins / 1440);
    eq = equationOfTime(t); dec = sunDeclination(t);
    ha = hourAngle(lat, dec, zenith);
    if (ha === null) return null;
    delta = -lng + (rising ? -ha : ha);
    return 720 + 4 * delta - eq;
  }

  /** תיקון זווית בגלל גובה מעל פני הים (במטרים) */
  function elevationAdjustment(meters) {
    if (!meters || meters <= 0) return 0;
    return Math.acos(6356900 / (6356900 + meters)) / RAD;
  }

  /* ---------- API ---------- */
  /**
   * loc = { lat, lng, elevation }
   * date = אובייקט Date (התאריך האזרחי המבוקש)
   * מחזיר Date או null.
   */
  function sunEvent(date, loc, zenith, rising) {
    var jd = julianDay(date.getFullYear(), date.getMonth() + 1, date.getDate());
    var mins = timeUTC(jd, loc.lat, loc.lng, zenith, rising);
    if (mins === null || isNaN(mins)) return null;
    return new Date((jd - 2440587.5) * 86400000 + mins * MIN);
  }

  /** זריחה/שקיעה נראות (כולל שבירת אור וגובה) */
  function sunrise(date, loc) {
    return sunEvent(date, loc, 90.833 + elevationAdjustment(loc.elevation), true);
  }
  function sunset(date, loc) {
    return sunEvent(date, loc, 90.833 + elevationAdjustment(loc.elevation), false);
  }
  /** זריחה/שקיעה במישור (גובה 0) — כפי שנהוג ברוב הלוחות בארץ */
  function sunriseSeaLevel(date, loc) { return sunEvent(date, loc, 90.833, true); }
  function sunsetSeaLevel(date, loc) { return sunEvent(date, loc, 90.833, false); }

  /** זמן לפי מעלות מתחת לאופק (לפני הזריחה / אחרי השקיעה) */
  function degreesBefore(date, loc, deg) { return sunEvent(date, loc, 90 + deg, true); }
  function degreesAfter(date, loc, deg) { return sunEvent(date, loc, 90 + deg, false); }

  function addMin(dt, minutes) { return dt ? new Date(dt.getTime() + minutes * MIN) : null; }

  /** שעה זמנית (1/12 מהיום) במילישניות */
  function shaahZmanit(start, end) {
    if (!start || !end) return null;
    return (end.getTime() - start.getTime()) / 12;
  }
  function proportional(start, end, hours) {
    var s = shaahZmanit(start, end);
    if (s === null) return null;
    return new Date(start.getTime() + s * hours);
  }

  /* ---------- הגדרות שיטות ---------- */
  var ALOT_OPTS = [
    { id: '72', label: '72 דקות לפני הנץ', min: 72, hint: 'השיטה הרווחת בלוחות בארץ' },
    { id: '90', label: '90 דקות לפני הנץ', min: 90, hint: '' },
    { id: '120', label: '120 דקות לפני הנץ', min: 120, hint: '' },
    { id: '16.1', label: '16.1 מעלות', deg: 16.1, hint: 'לפי גובה השמש — כ־72 דקות בשוויון, משתנה לפי העונה' },
    { id: '19.8', label: '19.8 מעלות', deg: 19.8, hint: 'לפי גובה השמש — כ־90 דקות בשוויון' }
  ];
  var MISHEYAKIR_OPTS = [
    { id: '45', label: '45 דקות לפני הנץ', min: 45, hint: '' },
    { id: '52', label: '52 דקות לפני הנץ', min: 52, hint: '' },
    { id: '60', label: '60 דקות לפני הנץ', min: 60, hint: '' },
    { id: '10.2', label: '10.2 מעלות', deg: 10.2, hint: 'לפי גובה השמש — כ־44 דקות בשוויון' },
    { id: '11.5', label: '11.5 מעלות', deg: 11.5, hint: 'לפי גובה השמש — כ־50 דקות בשוויון' }
  ];
  var TZEIT_OPTS = [
    { id: '13.5', label: '13.5 דקות אחרי השקיעה', min: 13.5, hint: 'שיעור שלושת רבעי מיל — שיטת הגאונים' },
    { id: '18', label: '18 דקות אחרי השקיעה', min: 18, hint: '' },
    { id: '20', label: '20 דקות אחרי השקיעה', min: 20, hint: 'מקובל ברבים מהלוחות בארץ' },
    { id: '24', label: '24 דקות אחרי השקיעה', min: 24, hint: '' },
    { id: '25', label: '25 דקות אחרי השקיעה', min: 25, hint: '' },
    { id: '27', label: '27 דקות אחרי השקיעה', min: 27, hint: '' },
    { id: '30', label: '30 דקות אחרי השקיעה', min: 30, hint: '' },
    { id: '3.65', label: '3.65 מעלות', deg: 3.65, hint: 'לפי גובה השמש — כ־13 דקות בשוויון' },
    { id: '4.8', label: '4.8 מעלות', deg: 4.8, hint: 'לפי גובה השמש — כ־19 דקות בשוויון' },
    { id: '5.95', label: '5.95 מעלות', deg: 5.95, hint: 'לפי גובה השמש — כ־24 דקות בשוויון' },
    { id: '8.5', label: '8.5 מעלות', deg: 8.5, hint: 'לפי גובה השמש — כ־36 דקות בשוויון' }
  ];
  var SHABBAT_END_OPTS = [
    { id: '25', label: '25 דקות אחרי השקיעה', min: 25, hint: '' },
    { id: '30', label: '30 דקות אחרי השקיעה', min: 30, hint: '' },
    { id: '35', label: '35 דקות אחרי השקיעה', min: 35, hint: 'מקובל ברבים מהלוחות בארץ' },
    { id: '40', label: '40 דקות אחרי השקיעה', min: 40, hint: '' },
    { id: '42', label: '42 דקות אחרי השקיעה', min: 42, hint: '' },
    { id: '50', label: '50 דקות אחרי השקיעה', min: 50, hint: '' },
    { id: '72', label: '72 דקות — שיטת רבנו תם', min: 72, hint: '' },
    { id: '7.083', label: '7.083 מעלות', deg: 7.083, hint: 'לפי גובה השמש — כ־29 דקות בשוויון' },
    { id: '8.5', label: '8.5 מעלות', deg: 8.5, hint: 'לפי גובה השמש — כ־36 דקות בשוויון' }
  ];
  var CANDLE_HINTS = {
    18: 'נהוג בחלק מהיישובים', 20: 'המקובל ברוב היישובים בארץ', 22: '',
    25: '', 30: 'מנהג חיפה', 40: 'מנהג ירושלים'
  };
  var CANDLE_OPTS = [18, 20, 22, 25, 30, 40];

  function findOpt(opts, id, fallback) {
    for (var i = 0; i < opts.length; i++) if (opts[i].id === id) return opts[i];
    return findOptById(opts, fallback);
  }
  function findOptById(opts, id) {
    for (var i = 0; i < opts.length; i++) if (opts[i].id === id) return opts[i];
    return opts[0];
  }

  /** מחשב זמן לפי הגדרת שיטה (דקות קבועות או מעלות) ביחס לזריחה/שקיעה */
  function byOpt(date, loc, opt, base, before) {
    if (opt.deg !== undefined) {
      return before ? degreesBefore(date, loc, opt.deg) : degreesAfter(date, loc, opt.deg);
    }
    return addMin(base, before ? -opt.min : opt.min);
  }

  var DEFAULTS = {
    alot: '72', misheyakir: '45', tzeit: '25', shabbatEnd: '35',
    candles: 20, useElevation: false
  };

  /**
   * מחשב את כל זמני היום.
   * loc: {lat,lng,elevation,tz}; opts: ראה DEFAULTS
   * מחזיר { sunrise, sunset, chatzot, list:[{key,label,note,time,group}] }
   */
  function compute(date, loc, opts) {
    opts = opts || {};
    var o = {};
    for (var k in DEFAULTS) o[k] = (opts[k] !== undefined ? opts[k] : DEFAULTS[k]);
    var L = { lat: loc.lat, lng: loc.lng, elevation: o.useElevation ? (loc.elevation || 0) : 0 };

    var sr = sunrise(date, L), ss = sunset(date, L);
    var prev = new Date(date.getTime() - 86400000), next = new Date(date.getTime() + 86400000);
    var nextSr = sunrise(next, L), prevSs = sunset(prev, L);

    var alotOpt = findOptById(ALOT_OPTS, o.alot);
    var mishOpt = findOptById(MISHEYAKIR_OPTS, o.misheyakir);
    var tzeitOpt = findOptById(TZEIT_OPTS, o.tzeit);
    var shabOpt = findOptById(SHABBAT_END_OPTS, o.shabbatEnd);

    var alot = byOpt(date, L, alotOpt, sr, true);
    var alot72 = addMin(sr, -72);
    var tzeit72 = addMin(ss, 72);
    var misheyakir = byOpt(date, L, mishOpt, sr, true);
    var tzeit = byOpt(date, L, tzeitOpt, ss, false);
    var tzeitShabbat = byOpt(date, L, shabOpt, ss, false);

    // שעות זמניות
    function gra(h) { return proportional(sr, ss, h); }
    function mga(h) { return proportional(alot72, tzeit72, h); }

    var chatzot = gra(6);
    var chatzotLayla = (ss && nextSr) ? new Date(ss.getTime() + (nextSr.getTime() - ss.getTime()) / 2) : null;

    var shaahGra = shaahZmanit(sr, ss), shaahMga = shaahZmanit(alot72, tzeit72);

    var list = [
      { key: 'alot', label: 'עלות השחר', note: alotOpt.label, time: alot, group: 'בוקר' },
      { key: 'misheyakir', label: 'משיכיר', note: mishOpt.label + ' · טלית ותפילין', time: misheyakir, group: 'בוקר' },
      { key: 'sunrise', label: 'הנץ החמה', note: o.useElevation ? 'לפי גובה המקום' : 'בגובה פני הים', time: sr, group: 'בוקר' },
      { key: 'shemaMga', label: 'סוף זמן קריאת שמע', note: 'מגן אברהם · 72 דקות', time: mga(3), group: 'בוקר' },
      { key: 'shemaGra', label: 'סוף זמן קריאת שמע', note: 'הגר״א ובעל התניא', time: gra(3), group: 'בוקר' },
      { key: 'tefilaMga', label: 'סוף זמן תפילה', note: 'מגן אברהם · 72 דקות', time: mga(4), group: 'בוקר' },
      { key: 'tefilaGra', label: 'סוף זמן תפילה', note: 'הגר״א ובעל התניא', time: gra(4), group: 'בוקר' },
      { key: 'chatzot', label: 'חצות היום', note: 'אמצע היום', time: chatzot, group: 'צהריים' },
      { key: 'minchaGedola', label: 'מנחה גדולה', note: 'שש שעות ומחצה', time: gra(6.5), group: 'צהריים' },
      { key: 'minchaKetana', label: 'מנחה קטנה', note: 'תשע שעות ומחצה', time: gra(9.5), group: 'צהריים' },
      { key: 'plag', label: 'פלג המנחה', note: 'עשר שעות ושלושה רבעים', time: gra(10.75), group: 'צהריים' },
      { key: 'sunset', label: 'שקיעת החמה', note: o.useElevation ? 'לפי גובה המקום' : 'בגובה פני הים', time: ss, group: 'ערב' },
      { key: 'tzeit', label: 'צאת הכוכבים', note: tzeitOpt.label, time: tzeit, group: 'ערב' },
      { key: 'tzeitRT', label: 'צאת הכוכבים דרבנו תם', note: '72 דקות אחרי השקיעה', time: tzeit72, group: 'ערב' },
      { key: 'chatzotLayla', label: 'חצות הלילה', note: 'אמצע הלילה', time: chatzotLayla, group: 'ערב' }
    ];

    return {
      date: date, loc: loc, opts: o,
      sunrise: sr, sunset: ss, chatzot: chatzot,
      alot: alot, alot72: alot72, misheyakir: misheyakir,
      tzeit: tzeit, tzeit72: tzeit72, tzeitShabbat: tzeitShabbat,
      candles: addMin(ss, -o.candles),
      prevSunset: prevSs, nextSunrise: nextSr,
      shaahGra: shaahGra, shaahMga: shaahMga,
      gra: gra, mga: mga,
      list: list
    };
  }

  return {
    julianDay: julianDay,
    ALOT_OPTS: ALOT_OPTS, MISHEYAKIR_OPTS: MISHEYAKIR_OPTS, TZEIT_OPTS: TZEIT_OPTS,
    SHABBAT_END_OPTS: SHABBAT_END_OPTS, CANDLE_OPTS: CANDLE_OPTS,
    CANDLE_HINTS: CANDLE_HINTS, DEFAULTS: DEFAULTS,
    compute: compute, findOptById: findOptById,
    sunEvent: sunEvent,
    sunrise: sunrise, sunset: sunset,
    sunriseSeaLevel: sunriseSeaLevel, sunsetSeaLevel: sunsetSeaLevel,
    degreesBefore: degreesBefore, degreesAfter: degreesAfter,
    elevationAdjustment: elevationAdjustment,
    addMin: addMin, shaahZmanit: shaahZmanit, proportional: proportional
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Zmanim;
