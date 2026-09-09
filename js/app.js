/* app.js — ממשק המשתמש של "לוח" */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var DAY = 86400000;

  /* ================= הגדרות ================= */
  var DEFAULTS = {
    locName: 'ירושלים', lat: 31.7683, lng: 35.2137, elevation: 754, tz: 'Asia/Jerusalem',
    israel: true, theme: 'auto', calMode: 'greg', showParasha: true, isGps: false,
    alot: '72', misheyakir: '45', tzeit: '25', shabbatEnd: '35', candles: 40, useElevation: false
  };
  var S = load();

  function load() {
    var o = {};
    for (var k in DEFAULTS) o[k] = DEFAULTS[k];
    try {
      var raw = localStorage.getItem('luach.settings');
      if (raw) { var p = JSON.parse(raw); for (var j in p) if (j in DEFAULTS) o[j] = p[j]; }
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
  /** עד שתי תוויות ליום: מועדים לפי חשיבות, ואז פרשה או שבת מיוחדת */
  function dayLabels(info) {
    var out = [];
    info.items.slice().sort(function (a, b) {
      return (KIND_RANK[a.kind] || 9) - (KIND_RANK[b.kind] || 9);
    }).forEach(function (it) {
      out.push({
        text: shortName(it.name),
        cls: it.kind === 'fast' ? 'fast' : it.kind === 'modern' ? 'modern' : ''
      });
    });
    if (S.showParasha && info.parasha) out.push({ text: info.parasha.name, cls: 'par' });
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
  function shortName(name) {
    return name
      .replace('חול המועד', 'חוה״מ')
      .replace('יום הזיכרון לחללי מערכות ישראל', 'יום הזיכרון')
      .replace('יום הזיכרון לשואה ולגבורה', 'יום השואה')
      .replace('ראש חודש ', 'ר״ח ')
      .replace('שמיני עצרת · שמחת תורה', 'שמח״ת')
      .replace('ראש השנה — יום ב׳', 'ראש השנה')
      .replace('חנוכה — יום ', 'חנוכה ')
      .replace('צום י״ז בתמוז', 'י״ז בתמוז')
      .replace('צום עשרה בטבת', 'י׳ בטבת')
      .replace('שביעי של פסח', 'שביעי ש״פ');
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

  function renderMonthTitle() {
    var t = monthTitleParts();
    $('#month-title').innerHTML = '<div class="heb">' + esc(t.heb) + '</div>' +
      '<div class="greg">' + esc(t.greg) + '</div>';
  }

  function renderGrid() {
    renderMonthTitle();
    var grid = $('#grid');
    grid.innerHTML = '';
    var tAbs = todayAbs();
    monthCells().forEach(function (c) {
      var h = HDate.make(c.abs);
      var info = Holidays.forDate(h, S.israel);
      var labels = dayLabels(info);
      var cell = el('div', 'cell' + (c.out ? ' out' : '') + (h.dow === 6 ? ' shabbat' : '') +
        (c.abs === tAbs ? ' today' : '') + (c.abs === state.sel ? ' sel' : '') +
        (labels.length > 1 ? ' multi' : ''));
      cell.appendChild(el('div', 'g', String(h.gd)));
      cell.appendChild(el('div', 'h', h.dayHeb));
      labels.forEach(function (l) {
        cell.appendChild(el('div', 'lbl' + (l.cls ? ' ' + l.cls : '') +
          (l.text.length > 9 ? ' long' : ''), esc(l.text)));
      });
      cell.addEventListener('click', function () { state.sel = c.abs; renderCal(); });
      grid.appendChild(cell);
    });
  }

  function renderDayCard() {
    var h = HDate.make(state.sel);
    var info = Holidays.forDate(h, S.israel);
    var z = Zmanim.compute(h.date, loc(), zopts());
    var up = Holidays.upcomingShabbat(state.sel, S.israel);
    var c = $('#daycard');
    var tags = [];
    info.items.forEach(function (it) {
      var cls = it.kind === 'yomtov' ? ' yomtov' : it.kind === 'fast' ? ' fast' : it.kind === 'modern' ? ' modern' : '';
      tags.push('<span class="tag' + cls + '">' + esc(it.name) + '</span>');
    });
    if (info.special) tags.push('<span class="tag">' + esc(info.special) + '</span>');
    if (info.mevarchim) tags.push('<span class="tag">שבת מברכים</span>');
    if (info.omer) tags.push('<span class="tag">' + esc('עומר: יום ' + info.omer) + '</span>');
    if (info.candles) tags.push('<span class="tag">' + esc(candleText(info.candles)) + '</span>');
    if (info.mevarchim) tags.push('<span class="tag">' + esc(HDate.moladText(h.hy, Holidays.nextMonth(h.hm, h.hy))) + '</span>');

    var parName = info.parasha ? ('פרשת ' + info.parasha.name) : (up ? up.label : '');
    c.innerHTML =
      '<div class="card-pad">' +
      '<div class="row"><div>' +
      '<div class="hd">' + esc(h.dayHebMarks + ' ' + h.monthName + ' ' + h.yearHeb) + '</div>' +
      '<div class="gd">' + esc(HDate.DAY_NAMES_FULL[h.dow] + ', ' + gregStr(h, true)) + '</div>' +
      '</div>' +
      (parName ? '<div class="par">' + esc(parName) + '</div>' : '') +
      '</div>' +
      (tags.length ? '<div class="tags">' + tags.join('') + '</div>' : '') +
      '<div class="quick">' +
      '<div><div class="k">הנץ החמה</div><div class="v">' + fmtTime(z.sunrise) + '</div></div>' +
      '<div><div class="k">שקיעה</div><div class="v">' + fmtTime(z.sunset) + '</div></div>' +
      '<div><div class="k">' + (h.dow === 5 ? 'הדלקת נרות' : h.dow === 6 ? 'צאת שבת' : 'צאת הכוכבים') + '</div>' +
      '<div class="v">' + fmtTime(h.dow === 5 ? z.candles : h.dow === 6 ? z.tzeitShabbat : z.tzeit) + '</div></div>' +
      '</div>' +
      '<button id="go-zman" style="margin-top:14px;width:100%;padding:11px;background:none;' +
      'border:1px solid rgba(255,255,255,.25);color:inherit;font-size:14px;font-weight:500;border-radius:12px">כל זמני היום ←</button>' +
      '</div>';
    $('#go-zman').addEventListener('click', function () {
      state.zman = state.sel; go('zman');
    });
  }

  /** אירועים קרובים */
  function renderUpcoming() {
    var box = $('#upcoming');
    box.innerHTML = '';
    var start = todayAbs(), found = 0;
    var SHOW = { yomtov: 1, fast: 1, modern: 1, minor: 1 };
    for (var a = start; a < start + 400 && found < 7; a++) {
      var h = HDate.make(a);
      var items = Holidays.holidaysFor(h.hy, h.hm, h.hd, S.israel);
      var pick = null;
      items.forEach(function (it) {
        if (SHOW[it.kind] && !pick) pick = it;
        if (it.kind === 'chanukah' && it.name.indexOf('נר 1') > -1 && !pick) pick = { name: 'חנוכה', kind: 'minor' };
      });
      if (!pick) continue;
      if (pick.name.indexOf('יום ב׳') > -1) continue;
      found++;
      var days = a - start;
      var row = el('div', 'item');
      row.innerHTML = '<div class="txt"><div class="t">' + esc(pick.name) + '</div>' +
        '<div class="s">' + esc(h.dayHebMarks + ' ' + h.monthName + ' · ' + HDate.DAY_NAMES[h.dow] + ', ' + gregStr(h, true)) + '</div></div>' +
        '<div class="val" style="font-size:13px;color:var(--muted);white-space:nowrap">' +
        (days === 0 ? 'היום' : days === 1 ? 'מחר' : 'בעוד ' + days + ' ימים') + '</div>';
      (function (abs) {
        row.addEventListener('click', function () { state.sel = abs; resetAnchor(abs); renderCal(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
      })(a);
      box.appendChild(row);
    }
    if (!found) box.appendChild(el('div', 'empty', 'אין אירועים קרובים'));
  }

  function renderCal() {
    renderGrid(); renderDayCard(); renderUpcoming();
    $('#act-mode').innerHTML = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/>' +
      '<path d="M8 3v4M16 3v4M3 10h18"/></svg>' +
      (S.calMode === 'greg' ? 'מעבר לחודש עברי' : 'מעבר לחודש לועזי');
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
    var up = Holidays.upcomingShabbat(convAbs, S.israel);
    var lines = [];
    if (info.items.length) lines.push(info.items.map(function (i) { return i.name; }).join(' · '));
    if (info.special) lines.push(info.special);
    if (info.omer) lines.push(Holidays.omerText(info.omer));
    if (info.candles) lines.push(candleText(info.candles));
    if (info.mevarchim) lines.push(HDate.moladText(h.hy, Holidays.nextMonth(h.hm, h.hy)));
    if (up) lines.push(up.label);
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

  /* ================= הגדרות ================= */
  function selectRow(title, sub, options, current, onChange) {
    var row = el('div', 'setting');
    var sel = el('select');
    options.forEach(function (o) { sel.appendChild(new Option(o.label, o.value)); });
    sel.value = current;
    sel.addEventListener('change', function () { onChange(sel.value); });
    row.innerHTML = '<div class="txt"><div class="t">' + esc(title) + '</div>' +
      (sub ? '<div class="s">' + esc(sub) + '</div>' : '') + '</div>';
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
    return arr.map(function (o) { return { label: o.label, value: o.id }; });
  }

  function renderSettings() {
    $('#set-loc-name').textContent = S.locName + (S.isGps ? ' · GPS' : '');
    $('#set-loc-sub').textContent = S.lat.toFixed(4) + '°, ' + S.lng.toFixed(4) + '°' +
      (S.useElevation ? ' · ' + Math.round(S.elevation) + ' מ׳' : '');

    var m = $('#set-methods');
    m.innerHTML = '';
    m.appendChild(selectRow('עלות השחר', 'תחילת היום ההלכתי', opts2(Zmanim.ALOT_OPTS), S.alot,
      function (v) { S.alot = v; save(); renderZman(); }));
    m.appendChild(selectRow('משיכיר', 'זמן טלית ותפילין', opts2(Zmanim.MISHEYAKIR_OPTS), S.misheyakir,
      function (v) { S.misheyakir = v; save(); renderZman(); }));
    m.appendChild(selectRow('צאת הכוכבים', '', opts2(Zmanim.TZEIT_OPTS), S.tzeit,
      function (v) { S.tzeit = v; save(); renderZman(); renderCal(); }));
    m.appendChild(selectRow('צאת השבת', '', opts2(Zmanim.SHABBAT_END_OPTS), S.shabbatEnd,
      function (v) { S.shabbatEnd = v; save(); renderZman(); renderCal(); }));
    m.appendChild(selectRow('הדלקת נרות', 'דקות לפני השקיעה',
      Zmanim.CANDLE_OPTS.map(function (n) { return { label: n + ' דקות', value: n }; }), S.candles,
      function (v) { S.candles = +v; save(); renderZman(); renderCal(); }));
    m.appendChild(switchRow('התחשבות בגובה המקום', 'ברירת המחדל: חישוב בגובה פני הים', S.useElevation,
      function (v) { S.useElevation = v; save(); renderZman(); renderCal(); renderSettings(); }));
    m.appendChild(switchRow('ארץ ישראל', 'יום טוב אחד; בחו״ל — יום טוב שני של גלויות', S.israel,
      function (v) { S.israel = v; save(); renderAll(); }));

    var d = $('#set-display');
    d.innerHTML = '';
    d.appendChild(selectRow('ערכת נושא', '', [
      { label: 'לפי המכשיר', value: 'auto' }, { label: 'בהיר', value: 'light' }, { label: 'כהה', value: 'dark' }
    ], S.theme, function (v) { S.theme = v; save(); applyTheme(); }));
    d.appendChild(selectRow('תצוגת הלוח', '', [
      { label: 'חודש לועזי', value: 'greg' }, { label: 'חודש עברי', value: 'heb' }
    ], S.calMode, function (v) { S.calMode = v; save(); resetAnchor(state.sel); renderCal(); }));
    d.appendChild(switchRow('הצגת פרשת השבוע בלוח', '', S.showParasha,
      function (v) { S.showParasha = v; save(); renderCal(); }));

    $('#about').innerHTML =
      'לוח · לוח שנה עברי וזמני היום<br>' +
      'כל החישובים מתבצעים במכשיר — ללא שרת, ללא מעקב וללא פרסומות.<br>' +
      'ניתן להוסיף למסך הבית ולעבוד גם ללא חיבור לאינטרנט.<br>' +
      '<span style="opacity:.6">גרסה 1.0</span>';
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
        var lines = [];
        info.items.slice().sort(function (a, b) {
          return (KIND_RANK[a.kind] || 9) - (KIND_RANK[b.kind] || 9);
        }).forEach(function (it) { lines.push({ text: it.name, par: false }); });
        if (info.parasha) lines.push({ text: info.parasha.name, par: true });
        if (info.special) lines.push({ text: info.special, par: true });
        lines.slice(0, 3).forEach(function (l) {
          html += '<div class="pr-l' + (l.par ? ' par' : '') + '">' + esc(l.text) + '</div>';
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
    window.scrollTo(0, 0);
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
    if (meta) meta.setAttribute('content', t === 'dark' ? '#0d0d0c' : '#1a1a19');
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

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { });
      });
    }
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
