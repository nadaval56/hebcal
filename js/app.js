/* app.js — ממשק המשתמש של "לוח" */
(function () {
  'use strict';

  var APP_VERSION = '1.13.0';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var DAY = 86400000;

  /* ================= הגדרות ================= */
  var DEFAULTS = {
    locName: 'ירושלים', lat: 31.7683, lng: 35.2137, elevation: 754, tz: 'Asia/Jerusalem',
    israel: true, theme: 'auto', calMode: 'greg', showParasha: true, isGps: false,
    evShow: true, evEdit: false,
    remOmer: false, remOmerTime: '20:30',
    alot: '72', misheyakir: '45', tzeit: '25', shabbatEnd: '35', candles: 40, useElevation: false
  };
  var S = load();

  function load() {
    var o = {};
    for (var k in DEFAULTS) o[k] = DEFAULTS[k];
    try {
      var raw = localStorage.getItem('luach.settings');
      if (raw) {
        var p = JSON.parse(raw);
        for (var j in p) if (j in DEFAULTS) o[j] = p[j];
        // תאימות לאחור: פעם היה מתג אחד לאירועים, והוא שלט גם בכתיבה וגם בתצוגה
        if (typeof p.events === 'boolean' && typeof p.evEdit !== 'boolean') o.evEdit = p.events;
      }
    } catch (e) { }
    return o;
  }
  function save() {
    try { localStorage.setItem('luach.settings', JSON.stringify(S)); } catch (e) { }
  }
  function loc() { return { lat: S.lat, lng: S.lng, elevation: S.elevation, tz: S.tz, name: S.locName }; }
  function zopts() {
    return {
      alot: S.alot, misheyakir: S.misheyakir, tzeit: S.tzeit, shabbatEnd: S.shabbatEnd,
      candles: S.candles, useElevation: S.useElevation
    };
  }

  /* ================= עזרים ================= */
  function todayAbs() { return HDate.dateToAbs(new Date()); }
  function fmtTime(d) {
    if (!d) return '--:--';
    try {
      return new Intl.DateTimeFormat('he-IL', {
        timeZone: S.tz, hour: '2-digit', minute: '2-digit', hour12: false
      }).format(d);
    } catch (e) { return '--:--'; }
  }
  function gregStr(h, long) {
    return h.gd + ' ב' + HDate.GREG_MONTHS[h.gm - 1] + (long ? ' ' + h.gy : '');
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  /* ================= אירועים אישיים ================= */
  /* נשמרים במכשיר בלבד (localStorage), לצד ההגדרות. אין שרת ואין סנכרון:
     מחיקת נתוני האתר בדפדפן מוחקת גם אותם. המפתח הוא התאריך הלועזי, כדי
     שלא יהיה תלוי בחישוב העברי ויישאר קריא גם בגיבוי ידני. */
  var EV_MAX_TEXT = 80;   // אורך מרבי לתיאור — שומר על רוחב השבב בכרטיס
  var EV_CARD_MAX = 3;    // מספר השבבים בכרטיס היום; מעבר לזה — שבב «עוד N»
  var EV = evLoad();
  var evRev = 0;          // עולה בכל שינוי; חלק ממפתח המטמון של measureCard

  /**
   * שני שערים נפרדים, ושניהם אינם נוגעים בנתונים השמורים:
   *   evVisible  — האם האירועים מוצגים בלוח, בכרטיס היום ובהדפסה.
   *   evWritable — האם מותר להוסיף, לערוך ולמחוק.
   * כתיבה מותנית בתצוגה: אין טעם להוסיף אירוע שאינו נראה. ההעדפה עצמה
   * נשמרת כפי שהמשתמש קבע, וחוזרת לפעול ברגע שהאירועים מוצגים שוב.
   */
  function evVisible() { return !!S.evShow; }
  function evWritable() { return !!(S.evShow && S.evEdit); }

  function evLoad() {
    try {
      var o = JSON.parse(localStorage.getItem('luach.events') || '{}');
      return (o && typeof o === 'object' && !(o instanceof Array)) ? o : {};
    } catch (e) { return {}; }
  }
  function evSave() {
    evRev++;
    try { localStorage.setItem('luach.events', JSON.stringify(EV)); } catch (e) { }
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function evKey(abs) {
    var h = HDate.make(abs);
    return h.gy + '-' + pad2(h.gm) + '-' + pad2(h.gd);
  }
  /** אירועי היום, ממוינים לפי שעה; אירוע בלי שעה בא בסוף */
  function evList(abs) {
    var a = EV[evKey(abs)];
    if (!a || !(a instanceof Array) || !a.length) return [];
    return a.slice().sort(function (x, y) {
      var ta = x.time || '99:99', tb = y.time || '99:99';
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });
  }
  function evFind(abs, id) {
    var found = null;
    evList(abs).forEach(function (e) { if (e.id === id) found = e; });
    return found;
  }
  function evCount() {
    var n = 0;
    for (var k in EV) if (EV[k] && EV[k].length) n += EV[k].length;
    return n;
  }
  function evId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function evPut(abs, ev) {
    var k = evKey(abs);
    if (!(EV[k] instanceof Array)) EV[k] = [];
    var a = EV[k], at = -1;
    a.forEach(function (x, i) { if (x.id === ev.id) at = i; });
    if (at >= 0) a[at] = ev; else a.push(ev);
    evSave();
  }
  function evDel(abs, id) {
    var k = evKey(abs);
    if (!(EV[k] instanceof Array)) return;
    EV[k] = EV[k].filter(function (x) { return x.id !== id; });
    if (!EV[k].length) delete EV[k];
    evSave();
  }

  /** עד שתי תוויות ליום: מועדים לפי חשיבות, ואז פרשה או שבת מיוחדת */
  function dayLabels(info, abs) {
    var out = [];
    info.items.slice().sort(function (a, b) {
      return (KIND_RANK[a.kind] || 9) - (KIND_RANK[b.kind] || 9);
    }).forEach(function (it) {
      out.push({
        text: shortName(it.name),
        cls: it.kind === 'fast' ? 'fast' : it.kind === 'modern' ? 'modern' : ''
      });
    });
    // אירוע אישי קודם לפרשה: הוא הדבר שהמשתמש עצמו הוסיף ללוח
    if (evVisible()) {
      var evs = evList(abs);
      if (evs.length) out.push({ text: evs[0].text, cls: 'evt' });
    }
    if (S.showParasha && info.parasha) out.push({ text: shortName(info.parasha.name), cls: 'par' });
    if (info.special) out.push({ text: info.special, cls: 'par' });
    return out.slice(0, 2);
  }

  /** תווית ראשית ליום — לפי סדר חשיבות */
  var KIND_RANK = { yomtov: 0, fast: 1, cholhamoed: 2, chanukah: 3, modern: 4, minor: 5, erev: 6, roshchodesh: 7 };
  function mainItem(items) {
    var best = null;
    items.forEach(function (it) {
      if (!best || KIND_RANK[it.kind] < KIND_RANK[best.kind]) best = it;
    });
    return best;
  }
  function candleText(n) {
    return 'בערב מדליקים ' + (n === 1 ? 'נר אחד' : n === 2 ? 'שני נרות' : n + ' נרות');
  }
  /** קיצורים לתצוגה בתאי הלוח בלבד; בכרטיס היום מוצג השם המלא */
  function shortName(name) {
    return name
      .replace('חול המועד סוכות', 'חוה״מ')
      .replace('חול המועד פסח', 'חוה״מ')
      .replace('ערב ראש השנה', 'ערב ר״ה')
      .replace('ערב יום כיפור', 'ערב יו״כ')
      .replace('יום הזיכרון לחללי מערכות ישראל', 'יום הזיכרון')
      .replace('יום העצמאות', 'העצמאות')
      .replace('יום הזיכרון לשואה ולגבורה', 'יום השואה')
      .replace('ראש חודש ', 'ר״ח ')
      .replace('שמיני עצרת · שמחת תורה', 'שמח״ת')
      .replace('ראש השנה — יום ב׳', 'ראש השנה')
      .replace('חנוכה — יום ', 'חנוכה ')
      .replace('צום י״ז בתמוז', 'י״ז בתמוז')
      .replace('צום עשרה בטבת', 'י׳ בטבת')
      .replace('תשעה באב', 'ט׳ באב')
      .replace('שביעי של פסח', 'שביעי ש״פ')
      .replace('שושן פורים קטן', 'שו״פ קטן')
      .replace(' (מוקדם)', '')
      .replace(' (נדחה)', '')
      .replace('אחרי מות־קדושים', 'אחרי־קדושים');
  }

  /* ================= מצב ================= */
  var state = {
    view: 'cal',
    sel: todayAbs(),
    zman: todayAbs(),
    anchor: null // {gy,gm} או {hy,hm}
  };
  function resetAnchor(abs) {
    var h = HDate.make(abs);
    state.anchor = S.calMode === 'greg' ? { gy: h.gy, gm: h.gm } : { hy: h.hy, hm: h.hm };
  }
  resetAnchor(state.sel);

  /* ================= לוח שנה ================= */
  function monthCells() {
    var first, count, out = [];
    if (S.calMode === 'greg') {
      first = HDate.gregToAbs(state.anchor.gy, state.anchor.gm, 1);
      count = new Date(state.anchor.gy, state.anchor.gm, 0).getDate();
    } else {
      first = HDate.hebToAbs(state.anchor.hy, state.anchor.hm, 1);
      count = HDate.daysInMonth(state.anchor.hm, state.anchor.hy);
    }
    var dow = ((first % 7) + 7) % 7;
    var start = first - dow;
    var total = Math.ceil((dow + count) / 7) * 7;
    for (var i = 0; i < total; i++) {
      out.push({ abs: start + i, out: (start + i) < first || (start + i) >= first + count });
    }
    return out;
  }

  function monthTitleParts() {
    var first, last;
    if (S.calMode === 'greg') {
      var days = new Date(state.anchor.gy, state.anchor.gm, 0).getDate();
      first = HDate.make(HDate.gregToAbs(state.anchor.gy, state.anchor.gm, 1));
      last = HDate.make(HDate.gregToAbs(state.anchor.gy, state.anchor.gm, days));
      return {
        heb: first.monthName + (first.monthName !== last.monthName ? ' – ' + last.monthName : '') +
          ' ' + (first.hy !== last.hy ? last.yearHeb : first.yearHeb),
        greg: HDate.GREG_MONTHS[state.anchor.gm - 1] + ' ' + state.anchor.gy
      };
    }
    first = HDate.make(HDate.hebToAbs(state.anchor.hy, state.anchor.hm, 1));
    last = HDate.make(HDate.hebToAbs(state.anchor.hy, state.anchor.hm,
      HDate.daysInMonth(state.anchor.hm, state.anchor.hy)));
    return {
      heb: first.monthName + ' ' + first.yearHeb,
      greg: HDate.GREG_MONTHS[first.gm - 1] +
        (first.gm !== last.gm ? ' – ' + HDate.GREG_MONTHS[last.gm - 1] : '') + ' ' + last.gy
    };
  }

  var MIN_CARD_H = 132;   // גובה מזערי לכרטיס היום
  var CARD_MAX_H = 274;   // גיבוי: הכרטיס ביום העמוס ביותר בשנה
  var cardProbe = null;
  var cardReserve = CARD_MAX_H;
  var cardKey = '';
  var MIN_CELL_H = 50;    // גובה תא מזערי שבו התוכן עדיין נכנס
  var CELL_RATIO = 1.0;   // תא ריבועי: גובה השורה כרוחב העמודה
  var GROW_RATIO = 1.34;  // עד כמה מותר לשורה לגדול מעבר לריבוע כדי שהטקסט ייכנס
  var rowH = 0, rowCap = 0;

  /**
   * מודד את גובה הכרטיס ביום העמוס ביותר של החודש המוצג. הלוח שומר מקום
   * לכרטיס הזה ולא לעמוס בשנה כולה, ולכן בחודש בלי ספירת העומר התאים
   * גדולים יותר ואין רווח ריק — ועדיין הגובה זהה בכל ימי החודש, בלי קשר
   * ליום שנבחר.
   */
  function measureCard(cells) {
    var card = $('#daycard');
    var w = card.offsetWidth;
    if (!w) return CARD_MAX_H;
    var key = cells[0].abs + ':' + cells[cells.length - 1].abs + ':' + w + ':' +
      S.israel + ':' + S.showParasha + ':' + S.evShow + ':' + S.evEdit + ':' + evRev +
      ':' + window.innerHeight;
    if (key === cardKey) return cardReserve;
    cardKey = key;
    if (!cardProbe) {
      cardProbe = el('div', 'daycard');
      cardProbe.style.cssText = 'position:absolute; top:0; inset-inline-start:0; z-index:-1;' +
        ' visibility:hidden; pointer-events:none;';
      document.body.appendChild(cardProbe);
    }
    cardProbe.style.width = w + 'px';

    var times = $('#daycard .dc-times');
    // בטעינה הראשונה שורת הזמנים עדיין לא נבנתה — אז לא שומרים במטמון
    if (!times) cardKey = '';
    // offsetHeight אינו כולל את המרווח שמעל שורת הזמנים, והוא חלק מגובה הכרטיס
    var timesH = 46;
    if (times) {
      timesH = times.offsetHeight +
        (parseFloat(window.getComputedStyle(times).marginTop) || 0);
    }
    var max = 0;
    cells.forEach(function (c) {
      var h = HDate.make(c.abs);
      cardProbe.innerHTML = dayCardBody(h, Holidays.forDate(h, S.israel));
      if (cardProbe.offsetHeight > max) max = cardProbe.offsetHeight;
    });
    return Math.max(MIN_CARD_H, max + timesH + 2);
  }

  /**
   * קובע את גובה שורות הלוח מרוחב העמודה ומהמקום הפנוי בלבד — לעולם לא
   * מכמות התוכן בכרטיס — כך שהגובה זהה בכל ימי החודש.
   * השורות ריבועיות, ומצטמצמות רק אם אין די מקום לכרטיס ביומו העמוס.
   */
  function sizeGrid(rows) {
    var grid = $('#grid');
    var w = grid.clientWidth;
    if (!w || !rows) return;
    var col = w / 7;
    var avail = $('#view-cal').clientHeight - $('.month-nav').offsetHeight - $('.weekdays').offsetHeight;
    var floor = window.innerHeight <= 720 ? MIN_CELL_H - 4 : MIN_CELL_H;
    var room = (avail - cardReserve) / rows;          // המקום שנותר אחרי הכרטיס העמוס
    var h = Math.min(col * CELL_RATIO, room);
    // רצפת הקריאוּת לא תגבר על המקום שכרטיס היום צריך, אחרת הכרטיס
    // נדחס וגולל בתוכו
    h = Math.max(h, Math.min(floor, room));
    h = Math.min(h, (avail - MIN_CARD_H) / rows);     // ובכל זאת בלי גלילה במסך
    h = Math.floor(Math.max(h, 34));
    // תקרת הגדילה נגזרת מן המקום הפנוי בלבד, לא מן הכרטיס של היום שנבחר,
    // ולכן גובה השורה נשאר זהה בכל ימי החודש.
    rowCap = Math.max(h, Math.floor(Math.min(col * GROW_RATIO, room)));
    rowH = h;
    grid.style.setProperty('--row-h', h + 'px');
  }

  function renderMonthTitle() {
    var t = monthTitleParts();
    $('#month-title').innerHTML = '<div class="heb">' + esc(t.heb) + '</div>' +
      '<div class="greg">' + esc(t.greg) + '</div>';
  }

  function renderGrid() {
    renderMonthTitle();
    var grid = $('#grid');
    grid.innerHTML = '';
    var cells = monthCells();
    cardReserve = measureCard(cells);
    sizeGrid(cells.length / 7);
    var tAbs = todayAbs();
    cells.forEach(function (c) {
      var h = HDate.make(c.abs);
      var info = Holidays.forDate(h, S.israel);
      var labels = dayLabels(info, c.abs);
      // ביום עמוס נדחקת תווית האירוע החוצה; אז מסמנים את התא בנקודה, כדי
      // שלעולם לא ייעלם סימן לאירוע שהמשתמש הוסיף
      var evHidden = false;
      if (evVisible() && evList(c.abs).length) {
        evHidden = true;
        labels.forEach(function (l) { if (l.cls === 'evt') evHidden = false; });
      }
      var cell = el('div', 'cell' + (c.out ? ' out' : '') + (h.dow === 6 ? ' shabbat' : '') +
        (c.abs === tAbs ? ' today' : '') + (c.abs === state.sel ? ' sel' : '') +
        (labels.length > 1 ? ' multi' : '') + (evHidden ? ' evdot' : ''));
      cell.appendChild(el('div', 'g', String(h.gd)));
      cell.appendChild(el('div', 'h', h.dayHeb));
      labels.forEach(function (l) {
        cell.appendChild(el('div', 'lbl' + (l.cls ? ' ' + l.cls : '') +
          (l.text.length > 9 ? ' long' : ''), esc(l.text)));
      });
      cell.addEventListener('click', function () {
        // לחיצה חוזרת על היום שכבר נבחר פותחת הוספת אירוע — רק כשהכתיבה מותרת
        if (evWritable() && c.abs === state.sel) { openEventEditor(c.abs, null); return; }
        state.sel = c.abs; renderCal();
      });
      grid.appendChild(cell);
    });
    fitGrid();
  }

  /** שתי ספירות העומר: זו שנספרה אמש וזו שייספרו הערב */
  function omerBlock(omer) {
    if (!omer || (!omer.day && !omer.tonight)) return '';
    var html = '<div class="dc-omer">';
    if (omer.day) html += '<div class="now">' + esc(Holidays.omerText(omer.day)) + '</div>';
    if (omer.tonight) {
      html += '<div class="ev"><span>הערב נספור</span> ' +
        esc(Holidays.omerText(omer.tonight)) + '</div>';
    }
    return html + '</div>';
  }

  /**
   * שורת האירועים בכרטיס היום. מספר השבבים חסום (EV_CARD_MAX) כדי שהכרטיס
   * לא יגדל עם מספר האירועים ויכווץ את תאי הלוח; השאר נפתחים בחלון נפרד.
   * בלי הרשאת כתיבה אין שבב הוספה, ולכן ביום ריק אין שורה כלל.
   */
  function eventsBlock(abs) {
    if (!evVisible()) return '';
    var list = evList(abs);
    if (!list.length && !evWritable()) return '';
    var shown = list.length > EV_CARD_MAX ? EV_CARD_MAX - 1 : list.length;
    var chips = [];
    for (var i = 0; i < shown; i++) {
      chips.push('<button class="tag ev" data-ev="' + esc(list[i].id) + '">' +
        (list[i].time ? '<span class="hh">' + esc(list[i].time) + '</span>' : '') +
        '<span class="tx">' + esc(list[i].text) + '</span></button>');
    }
    if (list.length > shown) {
      chips.push('<button class="tag ev more" data-ev-all="1">עוד ' +
        (list.length - shown) + '</button>');
    }
    if (evWritable()) {
      chips.push('<button class="tag ev add" data-ev-add="1">' +
        '<span class="pl">+</span><span class="tx">אירוע</span></button>');
    }
    return '<div class="dc-events">' + chips.join('') + '</div>';
  }

  var inkProbe = null;
  var inkMemo = {};   // מדידת דיו חוזרת על עצמה בין חודשים; שומרים אותה

  /** גובה הדיו בפועל של מחרוזת בגופן נתון — כולל אותיות גבוהות ונמוכות */
  function inkHeight(font, text) {
    if (!inkProbe) {
      var c = document.createElement('canvas');
      inkProbe = c.getContext && c.getContext('2d');
      if (!inkProbe) return 0;
    }
    var key = font + '|' + text;
    if (inkMemo[key] !== undefined) return inkMemo[key];
    inkProbe.font = font;
    var m = inkProbe.measureText(text);
    if (!m || m.actualBoundingBoxAscent === undefined) return 0;
    return (inkMemo[key] = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
  }

  /**
   * שורת טקסט צרה מן האותיות חותכת את הגליפים עצמם — וזה נראה כמו טקסט
   * "מגולח" בתחתיתו. מודדים לכל תווית את גובה הדיו בגופן שהמכשיר בחר
   * ובגודל שהוא קבע, ומרחיבים את השורה אם צריך. כך זה נכון בכל גופן,
   * בכל שפה ובכל הגדלת טקסט של המשתמש.
   */
  function tuneLineHeights(root) {
    var labels = (root || $('#grid')).querySelectorAll('.lbl');
    for (var i = 0; i < labels.length; i++) {
      var l = labels[i];
      l.style.lineHeight = '';
      var st = window.getComputedStyle(l);
      var lh = parseFloat(st.lineHeight);
      if (!lh) continue;
      var ink = inkHeight(st.fontWeight + ' ' + st.fontSize + ' ' + st.fontFamily, l.textContent);
      if (ink > lh - 0.5) l.style.lineHeight = (Math.ceil(ink) + 1) + 'px';
    }
  }

  /**
   * החריגה, בפיקסלים, של תוכן התא מגבולות התא. מודדים מלבנים בפועל: זו
   * הדרך היחידה לדעת שהטקסט נחתך במכשיר הזה, עם הגופן והזום שלו, במקום
   * להסתמך על הנחות בדבר גובה המסך.
   */
  function overflowOf(cell) {
    var kids = cell.children;
    if (!kids.length) return 0;
    var box = cell.getBoundingClientRect();
    return Math.max(box.top - kids[0].getBoundingClientRect().top,
      kids[kids.length - 1].getBoundingClientRect().bottom - box.bottom);
  }

  function worstOverflow() {
    var cells = $('#grid').children, worst = 0;
    for (var i = 0; i < cells.length; i++) {
      var o = overflowOf(cells[i]);
      if (o > worst) worst = o;
    }
    return worst;
  }

  /** מוסיף סיווג צמצום רק לתאים שעדיין חורגים, ולא לכל הלוח */
  function reduceCells(cls) {
    var cells = $('#grid').children;
    for (var i = 0; i < cells.length; i++) {
      if (overflowOf(cells[i]) > 0.5) cells[i].classList.add(cls);
    }
  }

  /** מוצא אחרון: הקטנת הגופן בתא בודד, בצעדים, עד שהתוכן נכנס */
  function shrinkCells() {
    var cells = $('#grid').children;
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i], k = 1;
      while (k > 0.58 && overflowOf(c) > 0.5) {
        k -= 0.07;
        c.style.setProperty('--ls', k.toFixed(2));
        c.style.setProperty('--hs', k.toFixed(2));
        tuneLineHeights(c);
      }
    }
  }

  /**
   * מתאים את הלוח למסך: קודם מרחיב את השורות אל תוך המקום הפנוי, ואם גם
   * זה אינו מספיק מצמצם — תחילה לשורת טקסט אחת, ולבסוף רק בתאים הבודדים
   * שעדיין חורגים. כך זה עובד גם בדפדפן, שבו שורת הכתובת גוזלת גובה,
   * וגם באפליקציה המותקנת, ובכל גודל גופן שהמשתמש בחר.
   */
  function fitGrid() {
    var grid = $('#grid');
    grid.className = 'grid';
    tuneLineHeights();
    for (var i = 0; i < 20 && rowH < rowCap && worstOverflow() > 0.5; i++) {
      rowH = Math.min(rowCap, rowH + Math.ceil(worstOverflow()));
      grid.style.setProperty('--row-h', rowH + 'px');
    }
    if (worstOverflow() <= 0.5) return;
    grid.classList.add('tight');          // שורת טקסט אחת, שתי התוויות נשארות
    tuneLineHeights();
    if (worstOverflow() <= 0.5) return;
    reduceCells('one');                   // ובתאים הבודדים שעדיין חורגים
    tuneLineHeights();
    if (worstOverflow() <= 0.5) return;
    reduceCells('tiny');
    shrinkCells();
  }

  /** גוף כרטיס היום — הכל חוץ משורת הזמנים, שגובהה קבוע */
  function dayCardBody(h, info) {
    // התווית הראשית מוצגת לצד התאריך ולא בשורה נפרדת, כדי לחסוך גובה
    var sorted = info.items.slice().sort(function (a, b) {
      return (KIND_RANK[a.kind] || 9) - (KIND_RANK[b.kind] || 9);
    });
    var lead = sorted.length ? sorted[0] : null;
    var rest = lead ? sorted.slice(1) : [];

    var meta = '';
    if (info.parasha) meta += '<div class="dc-par">' + esc('פרשת ' + info.parasha.name) + '</div>';
    if (lead) {
      meta += '<div class="dc-holiday' + (lead.kind === 'fast' ? ' fast' : lead.kind === 'yomtov' ? ' yomtov' : '') +
        '">' + esc(lead.name) + '</div>';
    }

    var tags = [];
    rest.forEach(function (it) {
      tags.push('<span class="tag' + (it.kind === 'fast' ? ' fast' : '') + '">' + esc(it.name) + '</span>');
    });
    if (info.special) tags.push('<span class="tag">' + esc(info.special) + '</span>');
    if (info.candles) tags.push('<span class="tag">' + esc(candleText(info.candles)) + '</span>');
    if (info.mevarchim) tags.push('<span class="tag">' + esc(HDate.moladText(h.hy, Holidays.nextMonth(h.hm, h.hy))) + '</span>');

    return '<div class="dc-body">' +
      '<div class="dc-head"><div class="dc-when">' +
      '<div class="dc-date">' + esc(h.dayHebMarks + ' ' + h.monthName + ' ' + h.yearHeb) + '</div>' +
      '<div class="dc-greg">' + esc(HDate.DAY_NAMES_FULL[h.dow] + ', ' + gregStr(h, true)) + '</div>' +
      '</div>' + (meta ? '<div class="dc-meta">' + meta + '</div>' : '') + '</div>' +
      (tags.length ? '<div class="dc-tags">' + tags.join('') + '</div>' : '') +
      omerBlock(info.omer) +
      eventsBlock(h.abs) +
      '</div>';
  }

  function renderDayCard() {
    var h = HDate.make(state.sel);
    var info = Holidays.forDate(h, S.israel);
    var z = Zmanim.compute(h.date, loc(), zopts());
    var third = h.dow === 5 ? ['הדלקת נרות', z.candles]
      : h.dow === 6 ? ['צאת השבת', z.tzeitShabbat] : ['צאת הכוכבים', z.tzeit];
    $('#daycard').innerHTML =
      dayCardBody(h, info) +
      '<button class="dc-times" id="go-zman">' +
      '<span class="t"><span class="k">הנץ החמה</span><br><span class="v">' + fmtTime(z.sunrise) + '</span></span>' +
      '<span class="t"><span class="k">שקיעה</span><br><span class="v">' + fmtTime(z.sunset) + '</span></span>' +
      '<span class="t"><span class="k">' + esc(third[0]) + '</span><br><span class="v">' + fmtTime(third[1]) + '</span></span>' +
      '<svg class="chev" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>' +
      '</button>';
    $('#go-zman').addEventListener('click', function () { state.zman = state.sel; go('zman'); });

    var card = $('#daycard'), abs = state.sel;
    $$('[data-ev]', card).forEach(function (b) {
      b.addEventListener('click', function () {
        // בלי הרשאת כתיבה השבב עדיין נפתח — לקריאת התיאור המלא, בלי עריכה
        if (!evWritable()) { openDayEvents(abs); return; }
        openEventEditor(abs, evFind(abs, b.getAttribute('data-ev')));
      });
    });
    var add = $('[data-ev-add]', card);
    if (add) add.addEventListener('click', function () { openEventEditor(abs, null); });
    var all = $('[data-ev-all]', card);
    if (all) all.addEventListener('click', function () { openDayEvents(abs); });
  }

  function renderCal() {
    // מסמן את המצב על שורש המסמך: כך ההידוק לצורך שורת האירועים במסכים
    // נמוכים חל רק כשהשורה באמת מוצגת, ולכן הלוח הרגיל אינו משתנה
    document.documentElement.dataset.events =
      (evVisible() && (evWritable() || evCount())) ? '1' : '0';
    renderGrid(); renderDayCard();
  }

  function shiftMonth(dir) {
    if (S.calMode === 'greg') {
      var m = state.anchor.gm + dir, y = state.anchor.gy;
      if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
      state.anchor = { gy: y, gm: m };
    } else {
      var hy = state.anchor.hy, hm = state.anchor.hm;
      if (dir > 0) {
        hm = Holidays.nextMonth(hm, hy);
        if (hm === 7) hy++;
      } else {
        if (hm === 7) { hy--; hm = HDate.isLeapYear(hy) ? 13 : 12; }
        else if (hm === 1) hm = HDate.isLeapYear(hy) ? 13 : 12;
        else hm--;
      }
      state.anchor = { hy: hy, hm: hm };
    }
    renderCal();
  }

  /* ================= זמני היום ================= */
  function renderZman() {
    var h = HDate.make(state.zman);
    var info = Holidays.forDate(h, S.israel);
    var z = Zmanim.compute(h.date, loc(), zopts());
    var isToday = state.zman === todayAbs();

    $('#z-date').innerHTML =
      '<div class="a">' + esc(h.dayHebMarks + ' ' + h.monthName + ' ' + h.yearHeb) + '</div>' +
      '<div class="b">' + esc(HDate.DAY_NAMES_FULL[h.dow] + ', ' + gregStr(h, true)) +
      (isToday ? ' · היום' : '') + '</div>';
    $('#z-sunrise').textContent = fmtTime(z.sunrise);
    $('#z-sunset').textContent = fmtTime(z.sunset);

    $('.name', $('#z-loc')).textContent = S.locName;

    // רשימת הזמנים
    var wrap = $('#z-groups');
    wrap.innerHTML = '';
    var groups = {}, order = [];
    z.list.forEach(function (item) {
      if (!groups[item.group]) { groups[item.group] = []; order.push(item.group); }
      groups[item.group].push(item);
    });

    // זמנים מיוחדים ליום
    var extra = [];
    var isFast = info.items.some(function (i) { return i.kind === 'fast'; });
    var yk = info.items.some(function (i) { return i.name === 'יום הכיפורים'; });
    var av9 = info.items.some(function (i) { return i.name.indexOf('תשעה באב') === 0; });
    if (isFast) {
      var startFast = (yk || av9) ? Zmanim.compute(new Date(h.date.getTime() - DAY), loc(), zopts()).sunset : z.alot72;
      extra.push({ label: 'תחילת הצום', note: (yk || av9) ? 'שקיעת החמה אמש' : 'עלות השחר', time: startFast });
      extra.push({ label: 'סיום הצום', note: Zmanim.findOptById(Zmanim.TZEIT_OPTS, S.tzeit).label, time: z.tzeit });
    }
    if (h.hm === 1 && h.hd === 14) {
      extra.push({ label: 'סוף זמן אכילת חמץ', note: 'ארבע שעות — מגן אברהם', time: z.mga(4) });
      extra.push({ label: 'סוף זמן ביעור חמץ', note: 'חמש שעות — מגן אברהם', time: z.mga(5) });
    }
    if (h.dow === 5) extra.push({ label: 'הדלקת נרות', note: S.candles + ' דקות לפני השקיעה', time: z.candles });
    if (h.dow === 6) extra.push({ label: 'צאת השבת', note: Zmanim.findOptById(Zmanim.SHABBAT_END_OPTS, S.shabbatEnd).label, time: z.tzeitShabbat });
    if (extra.length) { groups['היום הזה'] = extra; order.unshift('היום הזה'); }

    var now = new Date(), nextKey = null;
    if (isToday) {
      var best = null;
      z.list.forEach(function (item) {
        if (item.time && item.time > now && (!best || item.time < best.time)) best = item;
      });
      if (best) nextKey = best.key;
      renderCountdown(best, now);
    } else {
      $('#z-countdown').classList.add('hidden');
    }

    order.forEach(function (g) {
      wrap.appendChild(el('div', 'section-title', esc(g)));
      var card = el('div', 'card');
      var listEl = el('div', 'list');
      groups[g].forEach(function (item) {
        var row = el('div', 'item' + (item.key && item.key === nextKey ? ' next' : ''));
        row.innerHTML = '<div class="txt"><div class="t">' + esc(item.label) + '</div>' +
          '<div class="s">' + esc(item.note) + '</div></div>' +
          '<div class="val">' + fmtTime(item.time) + '</div>';
        listEl.appendChild(row);
      });
      card.appendChild(listEl);
      wrap.appendChild(card);
    });

    // שעה זמנית
    var info2 = el('div', 'foot');
    info2.innerHTML = 'שעה זמנית (הגר״א): ' + Math.round(z.shaahGra / 60000) + ' דקות · ' +
      'שעה זמנית (מג״א): ' + Math.round(z.shaahMga / 60000) + ' דקות';
    wrap.appendChild(info2);
  }

  function renderCountdown(best, now) {
    var box = $('#z-countdown');
    if (!best || !best.time) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    var diff = best.time - now;
    var mins = Math.floor(diff / 60000), hrs = Math.floor(mins / 60);
    var txt = hrs > 0 ? hrs + ' שע׳ ' + (mins % 60) + ' דק׳' : mins + ' דקות';
    box.innerHTML = '<div><div class="k">הזמן הבא</div><div class="t">' + esc(best.label) + '</div></div>' +
      '<div style="text-align:end"><div class="v">' + fmtTime(best.time) + '</div>' +
      '<div class="k">בעוד ' + txt + '</div></div>';
  }

  /* ================= ממיר תאריכים ================= */
  function fillHebSelects(hy, hm, hd) {
    var ys = $('#conv-hy'), ms = $('#conv-hm'), ds = $('#conv-hd');
    var cur = HDate.make(todayAbs()).hy;
    if (!ys.options.length || +ys.dataset.base !== cur) {
      ys.innerHTML = ''; ys.dataset.base = cur;
      for (var y = cur - 120; y <= cur + 120; y++) {
        ys.appendChild(new Option(HDate.yearHeb(y), y));
      }
    }
    ys.value = hy;
    ms.innerHTML = '';
    var n = HDate.monthsInYear(hy);
    var seq = [7, 8, 9, 10, 11, 12]; if (n === 13) seq.push(13); seq = seq.concat([1, 2, 3, 4, 5, 6]);
    seq.forEach(function (m) { ms.appendChild(new Option(HDate.monthName(m, hy), m)); });
    ms.value = hm;
    ds.innerHTML = '';
    for (var d = 1; d <= HDate.daysInMonth(hm, hy); d++) ds.appendChild(new Option(HDate.num2heb(d, true), d));
    ds.value = Math.min(hd, HDate.daysInMonth(hm, hy));
  }

  var convAbs = todayAbs();
  function renderConv() {
    var h = HDate.make(convAbs);
    $('#conv-greg').value = h.gy + '-' + String(h.gm).padStart(2, '0') + '-' + String(h.gd).padStart(2, '0');
    fillHebSelects(h.hy, h.hm, h.hd);
    var info = Holidays.forDate(h, S.israel);
    var lines = [];
    if (info.items.length) lines.push(info.items.map(function (i) { return i.name; }).join(' · '));
    if (info.special) lines.push(info.special);
    if (info.omer.day) lines.push(Holidays.omerText(info.omer.day));
    if (info.omer.tonight) lines.push('הערב נספור: ' + Holidays.omerText(info.omer.tonight));
    if (info.candles) lines.push(candleText(info.candles));
    if (info.mevarchim) lines.push(HDate.moladText(h.hy, Holidays.nextMonth(h.hm, h.hy)));
    $('#conv-result').innerHTML =
      '<div class="big">' + esc(h.dayHebMarks + ' ' + h.monthName + ' ' + h.yearHeb) + '</div>' +
      '<div class="sub">' + esc(HDate.DAY_NAMES_FULL[h.dow] + ', ' + h.gd + ' ב' + HDate.GREG_MONTHS[h.gm - 1] + ' ' + h.gy) + '</div>' +
      (lines.length ? '<div class="sub" style="color:var(--accent);margin-top:8px">' + esc(lines.join(' · ')) + '</div>' : '');

    var box = $('#conv-years');
    box.innerHTML = '';
    for (var i = 1; i <= 6; i++) {
      var y = h.hy + i;
      var m = h.hm, d = h.hd;
      if (m === 13 && !HDate.isLeapYear(y)) m = 12;
      if (m === 12 && HDate.isLeapYear(y) && HDate.isLeapYear(h.hy) === false) m = 12;
      var maxD = HDate.daysInMonth(m, y);
      var dd = Math.min(d, maxD);
      var g = HDate.make(HDate.hebToAbs(y, m, dd));
      var row = el('div', 'item');
      row.innerHTML = '<div class="txt"><div class="t">' + esc(HDate.yearHeb(y)) + '</div>' +
        '<div class="s">' + esc(g.dayHebMarks + ' ' + g.monthName + (dd !== d ? ' (הותאם)' : '')) + '</div></div>' +
        '<div class="val" style="font-size:14px">' + esc(HDate.DAY_NAMES[g.dow] + ', ' + g.gd + '.' + g.gm + '.' + g.gy) + '</div>';
      box.appendChild(row);
    }
  }

  /* ================= הסברים להגדרות ================= */
  var EXPLAIN = {
    alot: {
      title: 'עלות השחר',
      body: [
        'עלות השחר הוא הרגע שבו מתחיל האור הראשון להאיר במזרח, זמן ניכר לפני הזריחה. ממנו מתחיל היום ההלכתי לעניינים שונים, וממנו מתחילים גם הצומות.',
        'המספר קובע כמה זמן לפני הנץ מחושב הזמן: ככל שהמספר גדול יותר, עלות השחר מוקדמת יותר.',
        'אפשרות במעלות מחשבת לפי גובה השמש מתחת לאופק, ולכן משתנה לפי העונה ולפי המיקום; חישוב בדקות נשאר קבוע כל השנה.'
      ]
    },
    misheyakir: {
      title: 'משיכיר',
      body: [
        'משיכיר הוא הזמן שבו יש כבר די אור כדי להבחין בין הצבעים, וממנו נהוג להתעטף בטלית ולהניח תפילין בשעת הדחק.',
        'ככל שהמספר גדול יותר, הזמן מוקדם יותר; מספר קטן יותר דוחה את הזמן.'
      ]
    },
    tzeit: {
      title: 'צאת הכוכבים',
      body: [
        'צאת הכוכבים הוא סוף היום ההלכתי — משעה זו מתחיל היום הבא. הוא קובע בין השאר את סיום התעניות ואת זמן תפילת ערבית.',
        'ככל שהמספר גדול יותר, צאת הכוכבים מאוחרת יותר.'
      ]
    },
    shabbatEnd: {
      title: 'צאת השבת',
      body: [
        'צאת השבת מאוחרת מצאת הכוכבים הרגיל, כדי להוסיף מן החול על הקודש.',
        'שיטת רבנו תם, 72 דקות, היא המאוחרת מכולן ונהוגה בחלק מהקהילות.'
      ]
    },
    candles: {
      title: 'הדלקת נרות',
      body: [
        'הדלקת הנרות נעשית לפני השקיעה, ומספר הדקות הוא מנהג המקום.',
        'בירושלים נהוג 40 דקות לפני השקיעה, בחיפה 30, וברוב היישובים בארץ 20. בעת החלפת יישוב באפליקציה נקבע המנהג המקובל בו.'
      ]
    }
  };
  var EXPLAIN_FOOT = 'הזמנים נועדו לנוחות בלבד, ובשאלה למעשה יש לשאול רב.';

  function openExplain(key) {
    var e = EXPLAIN[key];
    if (!e) return;
    openSheet(e.title, function (body) {
      var wrap = el('div');
      wrap.style.cssText = 'padding: 4px 18px 22px; font-size: 14.5px; line-height: 1.6; color: var(--ink-2)';
      e.body.forEach(function (para) {
        var pEl = el('p', '', esc(para));
        pEl.style.cssText = 'margin: 12px 0';
        wrap.appendChild(pEl);
      });
      var foot = el('p', '', esc(EXPLAIN_FOOT));
      foot.style.cssText = 'margin: 18px 0 0; padding-top: 14px; border-top: 1px solid var(--line);' +
        'font-size: 13px; color: var(--muted)';
      wrap.appendChild(foot);
      body.appendChild(wrap);
    });
  }

  /* ================= הגדרות ================= */
  function selectRow(title, sub, options, current, onChange, infoKey) {
    var row = el('div', 'setting');
    var txt = el('div', 'txt');
    var head = el('div', 't');
    head.appendChild(document.createTextNode(title));
    if (infoKey) {
      var info = el('button', 'info', '?');
      info.setAttribute('aria-label', 'מה זה ' + title);
      info.addEventListener('click', function (ev) { ev.stopPropagation(); openExplain(infoKey); });
      head.appendChild(info);
    }
    var hintEl = el('div', 's');
    txt.appendChild(head); txt.appendChild(hintEl);

    var sel = el('select');
    options.forEach(function (o) { sel.appendChild(new Option(o.label, o.value)); });
    sel.value = current;
    function showHint() {
      var cur = null;
      options.forEach(function (o) { if (String(o.value) === String(sel.value)) cur = o; });
      hintEl.textContent = (cur && cur.hint) || sub || '';
    }
    showHint();
    sel.addEventListener('change', function () { showHint(); onChange(sel.value); });

    row.appendChild(txt);
    row.appendChild(sel);
    return row;
  }

  function switchRow(title, sub, on, onChange) {
    var row = el('div', 'setting');
    row.innerHTML = '<div class="txt"><div class="t">' + esc(title) + '</div>' +
      (sub ? '<div class="s">' + esc(sub) + '</div>' : '') + '</div>';
    var sw = el('div', 'switch' + (on ? ' on' : ''));
    row.appendChild(sw);
    row.addEventListener('click', function () {
      on = !on; sw.classList.toggle('on', on); onChange(on);
    });
    return row;
  }
  function opts2(arr) {
    return arr.map(function (o) { return { label: o.label, value: o.id, hint: o.hint }; });
  }

  /* שעות לבחירה, בקפיצות של עשר דקות. במכוון אין כאן <input type="time">:
     הדפדפן מציג אותו לפי אזור הלוקאל של המערכת, ובמכשיר שאינו מוגדר עברית
     הוא מציג «08:30 PM» — בעוד שכל שאר הזמנים באפליקציה בני 24 שעות. */
  var REM_FROM = 17, REM_TO = 24, REM_STEP = 10;
  function timeOptions(current) {
    var out = [], seen = {};
    for (var h = REM_FROM; h < REM_TO; h++) {
      for (var m = 0; m < 60; m += REM_STEP) {
        var v = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
        out.push({ label: v, value: v }); seen[v] = true;
      }
    }
    // שעה שמורה שאינה על הרשת לא תיעלם ולא תתחלף בשקט
    if (current && !seen[current]) {
      out.push({ label: current, value: current });
      out.sort(function (a, b) { return a.value < b.value ? -1 : 1; });
    }
    return out;
  }

  /* ================= תזכורות ================= */
  /* אין בדפדפן דרך לתזמן התראה לעתיד, ולכן האפליקציה אינה מתריעה בעצמה
     אלא מייצרת קובץ יומן תקני; מערכת ההפעלה היא שמתריעה. ראו js/remind.js. */

  function omerReminders() {
    return Remind.omerReminders({
      fromAbs: todayAbs(), israel: S.israel, skipShabbat: true
    });
  }

  /**
   * השעה שאחריה אפשר לספור בכל לילות התקופה הקרובה: המאוחר שבזמני צאת
   * הכוכבים שלה, ובמוצאי שבת צאת השבת — שהוא מאוחר יותר. תזכורת מוקדמת
   * מזה תגיע בחלק מן הלילות לפני שהגיע זמן הספירה.
   */
  function omerLatestTzeit(reminders) {
    var best = '';
    if (!reminders.length) return best;
    var hy = reminders[0].hy;
    for (var i = 0; i < reminders.length; i++) {
      if (reminders[i].hy !== hy) break;
      var abs = reminders[i].abs;
      var z = Zmanim.compute(HDate.absToDate(abs), loc(), zopts());
      var t = Remind.dow(abs) === 6 ? z.tzeitShabbat : z.tzeit;   // מוצאי שבת
      if (!t) continue;
      var s = fmtTime(t);
      if (s > best) best = s;   // HH:MM מרופד באפסים — השוואת מחרוזות תקפה
    }
    return best;
  }

  function saveFile(name, text, mime) {
    var blob = new Blob([text], { type: mime });
    var file = null;
    try { file = new File([blob], name, { type: mime }); } catch (e) { }
    // באייפון הורדה רגילה מתוך יישום מותקן אינה אמינה; שיתוף המערכת
    // מציע «הוספה ליומן» או «שמירה בקבצים» ישירות.
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).catch(function (err) {
        if (err && err.name === 'AbortError') return;   // המשתמש ביטל
        anchorSave(blob, name);
      });
      return;
    }
    anchorSave(blob, name);
  }

  function anchorSave(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = el('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  function openOmerExport() {
    var rem = omerReminders();
    openSheet('הוספה ליומן', function (body) {
      body.appendChild(el('div', 'group-head',
        rem.length + ' תזכורות · ' + Remind.seasonsLabel(rem)));

      var card = el('div', 'card');
      card.appendChild(el('div', 'field',
        '<label>מה יקרה</label>' +
        'הקובץ מוסיף ליומן שבטלפון תזכורת יומית בשעה ' + esc(S.remOmerTime) +
        ', לכל לילות הספירה של ' + esc(Remind.seasonsLabel(rem)) +
        ' מלבד לילות שבת ויום טוב. ' +
        'מרגע הייבוא התזכורות עובדות מן היומן עצמו — גם כשהאפליקציה סגורה ' +
        'וגם בלי חיבור לאינטרנט. בשנה הבאה יש לייצא שוב.'));
      card.appendChild(el('div', 'field',
        '<label>איך מייבאים</label>' +
        '<b>אייפון:</b> לבחור «יומן» בחלון השיתוף, ולאשר «הוספת הכול».<br>' +
        '<b>אנדרואיד:</b> לפתוח את הקובץ שירד — יומן Google יציע לייבא אותו.'));
      card.appendChild(el('div', 'field',
        '<label>לביטול</label>' +
        'התזכורות שייכות ליומן שלך, והאפליקציה אינה יכולה למחוק אותן. ' +
        'מוחקים אותן ביומן עצמו — הן מסומנות «ספירת העומר».'));
      body.appendChild(card);

      var btns = el('div', 'btn-row');
      var ok = el('button', 'btn-main', 'הורדת הקובץ');
      ok.addEventListener('click', function () {
        saveFile('omer.ics', Remind.buildIcs(rem, {
          time: S.remOmerTime, version: APP_VERSION
        }), 'text/calendar;charset=utf-8');
        closeSheet();
      });
      btns.appendChild(ok);
      body.appendChild(btns);
    });
  }

  function renderReminders() {
    var r = $('#set-reminders');
    r.innerHTML = '';
    r.appendChild(switchRow('תזכורת לספירת העומר',
      'תזכורת יומית בלילות הספירה',
      S.remOmer, function (v) { S.remOmer = v; save(); renderSettings(); }));

    if (S.remOmer) {
      var rem = omerReminders();
      var latest = omerLatestTzeit(rem);
      var early = !!latest && S.remOmerTime < latest;
      var timeSub = latest ? (early
        ? 'מוקדם מצאת הכוכבים, שבתקופה זו ב' + S.locName + ' עד ' + latest
        : 'צאת הכוכבים בתקופה זו ב' + S.locName + ' עד ' + latest)
        : 'הספירה נאמרת אחרי צאת הכוכבים';
      var timeR = selectRow('שעת התזכורת', timeSub, timeOptions(S.remOmerTime),
        S.remOmerTime, function (v) { S.remOmerTime = v; save(); renderSettings(); });
      if (early) timeR.querySelector('.s').classList.add('warn');
      r.appendChild(timeR);

      var dl = el('button', 'setting');
      dl.innerHTML = '<div class="txt"><div class="t" style="color:var(--accent)">הוספה ליומן</div>' +
        '<div class="s">' + rem.length + ' תזכורות · ' + esc(Remind.seasonsLabel(rem)) + '</div></div>';
      dl.addEventListener('click', openOmerExport);
      r.appendChild(dl);
    }

    /* הדילוג על לילות שבת ויום טוב אינו העדפה אלא התנהגות קבועה — קהל
       היעד אינו בוחר בתזכורת בשבת, ומתג שאיש אינו מכבה הוא רעש בלבד.
       במקומו הערה, כדי שהחסר יהיה מוסבר ולא ייראה כתקלה. */
    $('#reminders-note').textContent = S.remOmer
      ? 'התזכורות נוספות ליומן של הטלפון, והוא שמתריע — גם כשהאפליקציה ' +
        'סגורה וגם ללא רשת. אין תזכורת בלילות שבת ויום טוב.'
      : 'תזכורת יומית לספירת העומר, דרך היומן של הטלפון.';
  }

  function renderSettings() {
    $('#set-loc-name').textContent = S.locName + (S.isGps ? ' · GPS' : '');
    $('#set-loc-sub').textContent = S.lat.toFixed(4) + '°, ' + S.lng.toFixed(4) + '°' +
      (S.useElevation ? ' · ' + Math.round(S.elevation) + ' מ׳' : '');

    var m = $('#set-methods');
    m.innerHTML = '';
    m.appendChild(selectRow('עלות השחר', 'תחילת היום ההלכתי', opts2(Zmanim.ALOT_OPTS), S.alot,
      function (v) { S.alot = v; save(); renderZman(); }, 'alot'));
    m.appendChild(selectRow('משיכיר', 'זמן טלית ותפילין', opts2(Zmanim.MISHEYAKIR_OPTS), S.misheyakir,
      function (v) { S.misheyakir = v; save(); renderZman(); }, 'misheyakir'));
    m.appendChild(selectRow('צאת הכוכבים', 'סוף היום ההלכתי', opts2(Zmanim.TZEIT_OPTS), S.tzeit,
      function (v) { S.tzeit = v; save(); renderZman(); renderCal(); }, 'tzeit'));
    m.appendChild(selectRow('צאת השבת', 'סיום השבת והמועדים', opts2(Zmanim.SHABBAT_END_OPTS), S.shabbatEnd,
      function (v) { S.shabbatEnd = v; save(); renderZman(); renderCal(); }, 'shabbatEnd'));
    m.appendChild(selectRow('הדלקת נרות', 'דקות לפני השקיעה',
      Zmanim.CANDLE_OPTS.map(function (n) {
        return { label: n + ' דקות', value: n, hint: Zmanim.CANDLE_HINTS[n] };
      }), S.candles,
      function (v) { S.candles = +v; save(); renderZman(); renderCal(); }, 'candles'));
    m.appendChild(switchRow('התחשבות בגובה המקום', 'ברירת המחדל: חישוב בגובה פני הים', S.useElevation,
      function (v) { S.useElevation = v; save(); renderZman(); renderCal(); renderSettings(); }));
    m.appendChild(switchRow('ארץ ישראל', 'יום טוב אחד; בחו״ל — יום טוב שני של גלויות', S.israel,
      function (v) { S.israel = v; save(); renderAll(); }));

    var reset = el('button', 'setting');
    reset.innerHTML = '<div class="txt"><div class="t" style="color:var(--accent)">איפוס שיטות החישוב</div>' +
      '<div class="s">חזרה לברירות המחדל המקובלות בארץ</div></div>';
    reset.addEventListener('click', function () {
      S.alot = DEFAULTS.alot; S.misheyakir = DEFAULTS.misheyakir;
      S.tzeit = DEFAULTS.tzeit; S.shabbatEnd = DEFAULTS.shabbatEnd;
      S.useElevation = DEFAULTS.useElevation;
      S.candles = S.locName === 'ירושלים' ? 40 : S.locName === 'חיפה' ? 30 : 20;
      save(); renderAll();
    });
    m.appendChild(reset);

    var d = $('#set-display');
    d.innerHTML = '';
    d.appendChild(selectRow('ערכת נושא', '', [
      { label: 'לפי המכשיר', value: 'auto' }, { label: 'בהיר', value: 'light' }, { label: 'כהה', value: 'dark' }
    ], S.theme, function (v) { S.theme = v; save(); applyTheme(); }));
    d.appendChild(selectRow('תצוגת הלוח', '', [
      { label: 'חודש לועזי', value: 'greg' }, { label: 'חודש עברי', value: 'heb' }
    ], S.calMode, function (v) { S.calMode = v; save(); resetAnchor(state.sel); renderCal(); }));
    d.appendChild(switchRow('הצגת פרשת השבוע בלוח', 'בתאי הלוח ובהדפסה', S.showParasha,
      function (v) { S.showParasha = v; save(); renderCal(); }));

    // שתי ההגדרות נפרדות, ואף אחת מהן אינה נוגעת באירועים השמורים
    var ev = $('#set-events');
    ev.innerHTML = '';
    ev.appendChild(switchRow('הצגת אירועים בלוח',
      'בלוח, בכרטיס היום ובהדפסה. הסתרה אינה מוחקת דבר.',
      S.evShow, function (v) { S.evShow = v; save(); renderCal(); renderSettings(); }));
    var editRow = switchRow('אפשר הוספה ועריכה',
      S.evShow ? 'הוספה, עריכה ומחיקה של אירועים'
        : 'לא פעיל בזמן שהאירועים מוסתרים',
      S.evEdit, function (v) { S.evEdit = v; save(); renderCal(); renderSettings(); });
    if (!S.evShow) editRow.style.opacity = '.55';
    ev.appendChild(editRow);
    if (evCount()) {
      var wipe = el('button', 'setting');
      wipe.innerHTML = '<div class="txt"><div class="t" style="color:var(--fast)">מחיקת כל האירועים</div>' +
        '<div class="s">' + evCount() + ' אירועים שמורים במכשיר</div></div>';
      wipe.addEventListener('click', function () {
        if (!confirm('למחוק את כל האירועים השמורים? הפעולה אינה הפיכה.')) return;
        EV = {};
        evSave();
        renderCal();
        renderSettings();
      });
      ev.appendChild(wipe);
    }
    $('#events-note').textContent = 'האירועים נשמרים במכשיר בלבד, ואינם נמחקים ' +
      'בעדכון גרסה של האפליקציה. ניקוי נתוני הדפדפן מוחק אותם.';

    renderReminders();

    $('#about').innerHTML =
      'לוח · לוח שנה עברי וזמני היום<br>' +
      'כל החישובים מתבצעים במכשיר — ללא שרת, ללא מעקב וללא פרסומות.<br>' +
      'ניתן להוסיף למסך הבית ולעבוד גם ללא חיבור לאינטרנט.<br>' +
      '<span style="opacity:.6">גרסה ' + APP_VERSION + '</span>';
  }

  /* ================= חלון בחירת מיקום ================= */
  function openSheet(title, build) {
    $('#sheet-title').textContent = title;
    var body = $('#sheet-body');
    body.innerHTML = '';
    build(body);
    $('#sheet').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeSheet() {
    $('#sheet').classList.remove('open');
    document.body.style.overflow = '';
  }

  /** בחירת חודש ושנה מהירה */
  function openMonthPicker() {
    openSheet('מעבר לחודש', function (body) {
      var wrap = el('div');
      body.appendChild(wrap);

      function draw() {
        wrap.innerHTML = '';
        var isGreg = S.calMode === 'greg';
        var year = isGreg ? state.anchor.gy : state.anchor.hy;

        var head = el('div', 'setting');
        head.innerHTML = '<div class="txt"><div class="t">שנה</div></div>';
        var row = el('div', 'seg');
        var minus = el('button', '', '−'), label = el('button', 'active',
          isGreg ? String(year) : HDate.yearHeb(year) + ' · ' + year), plus = el('button', '', '+');
        minus.addEventListener('click', function () { shiftYear(-1); });
        plus.addEventListener('click', function () { shiftYear(1); });
        row.appendChild(plus); row.appendChild(label); row.appendChild(minus);
        head.appendChild(row);
        wrap.appendChild(head);

        var months = el('div');
        months.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px 16px 20px';
        var seq = isGreg ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
          : (HDate.monthsInYear(year) === 13 ? [7, 8, 9, 10, 11, 12, 13, 1, 2, 3, 4, 5, 6]
            : [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]);
        seq.forEach(function (m) {
          var b = el('button');
          var active = isGreg ? (m === state.anchor.gm) : (m === state.anchor.hm);
          b.textContent = isGreg ? HDate.GREG_MONTHS[m - 1] : HDate.monthName(m, year);
          b.style.cssText = 'padding:12px 4px;border-radius:12px;font-size:13.5px;' +
            (active ? 'background:var(--accent);color:var(--on-accent);font-weight:600'
              : 'background:var(--surface);color:var(--ink)');
          b.addEventListener('click', function () {
            state.anchor = isGreg ? { gy: year, gm: m } : { hy: year, hm: m };
            var first = isGreg ? HDate.gregToAbs(year, m, 1) : HDate.hebToAbs(year, m, 1);
            var t = todayAbs();
            var len = isGreg ? new Date(year, m, 0).getDate() : HDate.daysInMonth(m, year);
            state.sel = (t >= first && t < first + len) ? t : first;
            closeSheet(); renderCal();
          });
          months.appendChild(b);
        });
        wrap.appendChild(months);

        function shiftYear(d) {
          if (isGreg) state.anchor = { gy: year + d, gm: state.anchor.gm };
          else {
            var hy = year + d, hm = state.anchor.hm;
            if (hm > HDate.monthsInYear(hy)) hm = 12;
            state.anchor = { hy: hy, hm: hm };
          }
          draw();
        }
      }
      draw();
    });
  }

  function openLocationPicker() {
    openSheet('בחירת מיקום', function (body) {
      var search = el('div', 'search-box');
      var input = el('input');
      input.type = 'text'; input.placeholder = 'חיפוש יישוב…';
      search.appendChild(input);
      body.appendChild(search);

      var gps = el('div', 'item');
      gps.innerHTML = '<div class="txt"><div class="t">איתור לפי GPS</div><div class="s">שימוש במיקום הנוכחי של המכשיר</div></div>';
      gps.addEventListener('click', function () { useGps(); closeSheet(); });
      body.appendChild(gps);

      var results = el('div');
      body.appendChild(results);

      function draw(q) {
        results.innerHTML = '';
        var found = Cities.search(q), lastRegion = null, n = 0;
        found.forEach(function (city) {
          if (n++ > 200) return;
          if (city.region !== lastRegion) {
            lastRegion = city.region;
            results.appendChild(el('div', 'group-head', esc(city.region)));
          }
          var row = el('div', 'item');
          row.innerHTML = '<div class="txt"><div class="t">' + esc(city.name) + '</div>' +
            '<div class="s">' + city.lat.toFixed(3) + '°, ' + city.lng.toFixed(3) + '°</div></div>' +
            (city.name === S.locName ? '<div class="val" style="color:var(--accent);font-size:14px">✓</div>' : '');
          row.addEventListener('click', function () { setCity(city); closeSheet(); });
          results.appendChild(row);
        });
        if (!found.length) results.appendChild(el('div', 'empty', 'לא נמצא יישוב בשם זה'));
      }
      draw('');
      input.addEventListener('input', function () { draw(input.value); });
      setTimeout(function () { input.focus(); }, 250);
    });
  }

  /* ================= חלונות האירועים ================= */
  function evDateLine(h) {
    return h.dayHebMarks + ' ' + h.monthName + ' · ' +
      HDate.DAY_NAMES_FULL[h.dow] + ', ' + gregStr(h, true);
  }

  /** הוספה או עריכה של אירוע בודד */
  function openEventEditor(abs, ev) {
    // הגנה: בלי הרשאת כתיבה אין עריכה, וכשהאירועים מוסתרים גם אין מה להציג
    if (!evWritable()) { if (evVisible()) openDayEvents(abs); return; }
    var isNew = !ev;
    var cur = ev || { id: '', text: '', time: '' };
    var h = HDate.make(abs);
    openSheet(isNew ? 'אירוע חדש' : 'עריכת אירוע', function (body) {
      body.appendChild(el('div', 'group-head', esc(evDateLine(h))));

      var card = el('div', 'card');
      var f1 = el('div', 'field', '<label>תיאור</label>');
      var input = el('input');
      input.type = 'text';
      input.maxLength = EV_MAX_TEXT;
      input.placeholder = 'יום הולדת, יארצייט, פגישה…';
      input.value = cur.text;
      f1.appendChild(input);
      card.appendChild(f1);

      var f2 = el('div', 'field', '<label>שעה — לא חובה</label>');
      var time = el('input');
      time.type = 'time';
      time.value = cur.time || '';
      f2.appendChild(time);
      card.appendChild(f2);
      body.appendChild(card);

      var btns = el('div', 'btn-row');
      var ok = el('button', 'btn-main', isNew ? 'הוספה' : 'שמירה');
      ok.addEventListener('click', function () {
        var text = input.value.replace(/\s+/g, ' ').trim().slice(0, EV_MAX_TEXT);
        if (!text) { input.focus(); return; }
        evPut(abs, {
          id: cur.id || evId(), text: text,
          time: /^\d{1,2}:\d{2}$/.test(time.value) ? time.value : ''
        });
        closeSheet();
        state.sel = abs;
        renderCal();
      });
      btns.appendChild(ok);
      if (!isNew) {
        var del = el('button', 'btn-danger', 'מחיקה');
        del.addEventListener('click', function () {
          if (!confirm('למחוק את האירוע «' + cur.text + '»?')) return;
          evDel(abs, cur.id);
          closeSheet();
          renderCal();
        });
        btns.appendChild(del);
      }
      body.appendChild(btns);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); ok.click(); }
      });
      setTimeout(function () { input.focus(); }, 250);
    });
  }

  /**
   * כל אירועי היום — נפתח מן השבב «עוד N», ובלי הרשאת כתיבה גם מכל שבב.
   * בלי הרשאת כתיבה זו רשימה לקריאה בלבד: אין מחיקה ואין הוספה.
   */
  function openDayEvents(abs) {
    var h = HDate.make(abs);
    var may = evWritable();
    openSheet('אירועי היום', function (body) {
      body.appendChild(el('div', 'group-head', esc(evDateLine(h))));
      var list = evList(abs);
      var card = el('div', 'card');
      if (!list.length) card.appendChild(el('div', 'empty', 'אין אירועים ביום זה'));
      list.forEach(function (e) {
        var row = el('div', 'item' + (may ? '' : ' plain'));
        row.innerHTML = '<div class="txt"><div class="t">' + esc(e.text) + '</div>' +
          (e.time ? '<div class="s">' + esc(e.time) + '</div>' : '') + '</div>';
        if (may) {
          var del = el('button', 'row-del', 'מחיקה');
          del.addEventListener('click', function (evt) {
            evt.stopPropagation();
            if (!confirm('למחוק את האירוע «' + e.text + '»?')) return;
            evDel(abs, e.id);
            renderCal();
            openDayEvents(abs);
          });
          row.appendChild(del);
          row.addEventListener('click', function () { openEventEditor(abs, e); });
        }
        card.appendChild(row);
      });
      body.appendChild(card);
      if (!may) {
        body.appendChild(el('div', 'foot',
          'הוספה ועריכה כבויות בהגדרות. האירועים השמורים אינם מושפעים.'));
        return;
      }
      var btns = el('div', 'btn-row');
      var add = el('button', 'btn-main', 'הוספת אירוע');
      add.addEventListener('click', function () { openEventEditor(abs, null); });
      btns.appendChild(add);
      body.appendChild(btns);
    });
  }

  function setCity(city) {
    S.locName = city.name; S.lat = city.lat; S.lng = city.lng;
    S.elevation = city.elevation; S.tz = city.tz;
    // מנהגי הדלקת נרות מקובלים — נקבעים מחדש בכל החלפת יישוב
    S.candles = city.name === 'ירושלים' ? 40 : city.name === 'חיפה' ? 30 : 20;
    S.isGps = false;
    save(); renderAll();
  }

  function useGps() {
    if (!navigator.geolocation) { alert('המכשיר אינו תומך באיתור מיקום'); return; }
    navigator.geolocation.getCurrentPosition(function (pos) {
      S.lat = +pos.coords.latitude.toFixed(5);
      S.lng = +pos.coords.longitude.toFixed(5);
      S.elevation = pos.coords.altitude ? Math.round(pos.coords.altitude) : 0;
      try { S.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || S.tz; } catch (e) { }
      var near = Cities.nearest(S.lat, S.lng);
      S.locName = (near && near.deg < 0.12) ? near.city.name : 'המיקום שלי';
      S.candles = S.locName === 'ירושלים' ? 40 : S.locName === 'חיפה' ? 30 : 20;
      S.isGps = true;
      save(); renderAll();
    }, function () {
      alert('לא ניתן לאתר את המיקום. ניתן לבחור יישוב מהרשימה.');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 600000 });
  }

  /* ================= הדפסה ================= */
  /** בונה טבלת לוח לרוחב העמוד ופותח את חלון ההדפסה */
  function printMonth() {
    var t = monthTitleParts();
    var cells = monthCells();
    var html = '<div class="pr-head"><div><div class="a">' + esc(t.heb) + '</div></div>' +
      '<div class="b">' + esc(t.greg) + '</div></div>' +
      '<table class="pr-table"><thead><tr>' +
      HDate.DAY_NAMES.map(function (d, i) {
        return '<th>' + esc(i === 6 ? 'שבת' : d) + '</th>';
      }).join('') + '</tr></thead><tbody>';

    for (var r = 0; r < cells.length; r += 7) {
      html += '<tr>';
      for (var i = 0; i < 7; i++) {
        var c = cells[r + i];
        if (!c) { html += '<td></td>'; continue; }
        var h = HDate.make(c.abs);
        var info = Holidays.forDate(h, S.israel);
        html += '<td class="' + (h.dow === 6 ? 'sh ' : '') + (c.out ? 'out' : '') + '">' +
          '<div class="pr-top"><span class="pr-h">' + esc(h.dayHeb) + '</span>' +
          '<span class="pr-g">' + h.gd + '</span></div>';
        // ההדפסה נגזרת מאותן הגדרות תצוגה של המסך: מה שמוסתר בלוח אינו מודפס
        var lines = [];
        info.items.slice().sort(function (a, b) {
          return (KIND_RANK[a.kind] || 9) - (KIND_RANK[b.kind] || 9);
        }).forEach(function (it) { lines.push({ text: it.name }); });
        if (evVisible()) {
          evList(c.abs).forEach(function (e) {
            lines.push({ text: (e.time ? e.time + ' ' : '') + e.text, ev: true });
          });
        }
        if (S.showParasha && info.parasha) lines.push({ text: info.parasha.name, par: true });
        if (info.special) lines.push({ text: info.special, par: true });
        lines.slice(0, evVisible() ? 4 : 3).forEach(function (l) {
          html += '<div class="pr-l' + (l.par ? ' par' : l.ev ? ' ev' : '') + '">' +
            esc(l.text) + '</div>';
        });
        html += '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table><div class="pr-foot"><span>' +
      esc(HDate.make(cells[0].abs).yearHeb === HDate.make(cells[cells.length - 1].abs).yearHeb
        ? 'שנת ' + HDate.make(cells[0].abs).yearHeb : '') +
      '</span><span>לוח · לוח שנה עברי</span></div>';

    $('#print-area').innerHTML = html;
    window.print();
  }

  /* ================= ניווט ותצוגה ================= */
  var TITLES = { cal: 'לוח שנה', zman: 'זמני היום', conv: 'ממיר תאריכים', set: 'הגדרות' };
  function go(view) {
    state.view = view;
    $$('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + view); });
    $$('.tabbar button').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
    $('#page-title').textContent = TITLES[view];
    $('#btn-jump').classList.toggle('hidden', view === 'conv' || view === 'set');
    $('#act-print').classList.toggle('hidden', view !== 'cal');
    var v = $('#view-' + view);
    if (v) v.scrollTop = 0;
    if (view === 'zman') renderZman();
    if (view === 'conv') renderConv();
    if (view === 'set') renderSettings();
  }

  function applyTheme() {
    var t = S.theme;
    if (t === 'auto') {
      t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.dataset.theme = t;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#1c1b19' : '#f4f2ec');
  }

  function renderLocLabel() {
    $('#topbar-loc').textContent = S.isGps ? 'GPS' : S.locName;
  }

  function renderAll() {
    applyTheme(); renderLocLabel(); renderCal();
    if (state.view === 'zman') renderZman();
    if (state.view === 'conv') renderConv();
    if (state.view === 'set') renderSettings();
  }

  /* ================= עדכוני גרסה ================= */
  /** רישום ה־Service Worker, בדיקת עדכון בכל פתיחה, ורענון אוטומטי כשמגיעה גרסה חדשה */
  function setupUpdates() {
    if (!('serviceWorker' in navigator)) return;
    var hadController = !!navigator.serviceWorker.controller;
    var reloading = false;

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      // גרסה חדשה השתלטה — רענון פעם אחת בלבד, ורק אם כבר הייתה גרסה מותקנת
      if (reloading || !hadController) return;
      reloading = true;
      location.reload();
    });

    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then(function (reg) {
        reg.update().catch(function () { });
        // בדיקת עדכון בכל חזרה לאפליקציה, לכל היותר פעם בחמש דקות
        var last = 0;
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState !== 'visible') return;
          var now = Date.now();
          if (now - last < 300000) return;
          last = now;
          reg.update().catch(function () { });
        });
      })
      .catch(function () { });
  }

  /* ================= אתחול ================= */
  function init() {
    applyTheme();
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(function () {
        if (S.theme === 'auto') applyTheme();
      });
    }

    $$('.tabbar button').forEach(function (b) {
      b.addEventListener('click', function () { go(b.dataset.view); });
    });
    $('#month-title').addEventListener('click', openMonthPicker);
    $('#m-prev').addEventListener('click', function () { shiftMonth(-1); });
    $('#m-next').addEventListener('click', function () { shiftMonth(1); });
    $('#z-prev').addEventListener('click', function () { state.zman--; renderZman(); });
    $('#z-next').addEventListener('click', function () { state.zman++; renderZman(); });
    $('#z-loc').addEventListener('click', openLocationPicker);
    $('#set-loc').addEventListener('click', openLocationPicker);
    $('#set-gps').addEventListener('click', useGps);
    $('#btn-loc').addEventListener('click', openLocationPicker);
    $('#act-print').addEventListener('click', printMonth);
    $('#btn-jump').addEventListener('click', jumpToday);
    $$('[data-close]').forEach(function (x) { x.addEventListener('click', closeSheet); });

    $('#conv-greg').addEventListener('change', function (e) {
      var v = e.target.value.split('-');
      if (v.length === 3) { convAbs = HDate.gregToAbs(+v[0], +v[1], +v[2]); renderConv(); }
    });
    ['#conv-hy', '#conv-hm', '#conv-hd'].forEach(function (sel) {
      $(sel).addEventListener('change', function () {
        var y = +$('#conv-hy').value, m = +$('#conv-hm').value, d = +$('#conv-hd').value;
        if (m > HDate.monthsInYear(y)) m = 12;
        d = Math.min(d, HDate.daysInMonth(m, y));
        convAbs = HDate.hebToAbs(y, m, d); renderConv();
      });
    });

    window.addEventListener('resize', function () { renderGrid(); });

    // החלקה בין חודשים
    var x0 = null, y0 = null;
    var grid = $('#grid');
    grid.addEventListener('touchstart', function (e) {
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
    }, { passive: true });
    grid.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.6) shiftMonth(dx > 0 ? 1 : -1);
      x0 = null;
    }, { passive: true });

    renderLocLabel();
    renderCal();
    go('cal');

    // רענון הספירה לאחור וחצות
    setInterval(function () {
      if (state.view === 'zman' && state.zman === todayAbs()) renderZman();
    }, 30000);
    setInterval(function () {
      var t = todayAbs();
      if (t !== initDay) { initDay = t; state.sel = t; state.zman = t; resetAnchor(t); renderAll(); }
    }, 60000);

    setupUpdates();
  }
  var initDay = todayAbs();

  function jumpToday() {
    var t = todayAbs();
    state.sel = t; state.zman = t; convAbs = t; resetAnchor(t);
    renderAll();
    if (state.view === 'zman') renderZman();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
