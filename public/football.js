// Keeps a server-rendered football page current: local kick-off times,
// filters, search, and score refresh from the service's own cache (the
// cache endpoint never spends an API request).
(function () {
  var body = document.body;
  var base = body.getAttribute('data-base') || '';
  var dates = (body.getAttribute('data-dates') || '').split(',').filter(Boolean);
  var liveOnly = body.hasAttribute('data-live-only');
  var POLL = 60000;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function localTime(ts) { var d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  // Pages are UTC days, so a late kick-off can fall on the reader's next
  // (or previous) calendar day — say which, instead of a time that looks
  // out of order.
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function kickoffHtml(ts, pageDate) {
    var d = new Date(ts);
    var local = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    return (pageDate && local !== pageDate ? '<small>' + WD[d.getDay()] + '</small>' : '') + localTime(ts);
  }
  function pageDateOf(el) {
    var sec = el.closest('[data-date]');
    return sec ? sec.getAttribute('data-date') : (dates.length === 1 ? dates[0] : '');
  }

  // Kick-off times arrive in UTC; show them in the reader's zone.
  function localiseTimes() {
    document.querySelectorAll('.ph-upcoming .mt-st[data-ts]').forEach(function (el) {
      el.innerHTML = kickoffHtml(+el.getAttribute('data-ts'), pageDateOf(el));
    });
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    document.querySelectorAll('[data-tz]').forEach(function (el) { el.textContent = tz ? 'your time (' + tz.replace(/_/g, ' ') + ')' : 'your local time'; });
  }

  function ago(ms) {
    var m = Math.round((Date.now() - ms) / 60000);
    return m < 1 ? 'just now' : m === 1 ? '1 min ago' : m < 60 ? m + ' min ago' : localTime(ms);
  }
  function refreshAgo() {
    document.querySelectorAll('time[data-fetched]').forEach(function (el) { el.textContent = ago(+el.getAttribute('data-fetched')); });
  }

  // ---- filters + search ---------------------------------------------------
  var filter = 'all';
  document.querySelectorAll('[data-filter]').forEach(function (b) {
    if (b.classList.contains('is-on')) filter = b.getAttribute('data-filter');
    b.addEventListener('click', function () {
      document.querySelectorAll('[data-filter]').forEach(function (x) { x.classList.toggle('is-on', x === b); });
      filter = b.getAttribute('data-filter');
      apply();
    });
  });
  var search = document.querySelector('.search');
  var q = '';
  if (search) search.addEventListener('input', function () { q = search.value.trim().toLowerCase(); apply(); });

  function apply() {
    document.querySelectorAll('details.lg').forEach(function (lg) {
      var shown = 0;
      lg.querySelectorAll('.mt').forEach(function (mt) {
        var ok = (filter === 'all' || mt.getAttribute('data-phase') === filter)
          && (!q || mt.getAttribute('data-q').indexOf(q) !== -1);
        mt.hidden = !ok;
        if (ok) shown++;
      });
      lg.hidden = shown === 0;
      if (q && shown) lg.open = true;
    });
    document.querySelectorAll('.band').forEach(function (band) {
      var lgs = band.querySelectorAll('details.lg');
      if (!lgs.length) return;
      band.hidden = Array.prototype.every.call(lgs, function (l) { return l.hidden; });
    });
  }

  // ---- live refresh -------------------------------------------------------
  function statusText(m) {
    if (m.phase === 'live') {
      if (m.status === 'HT') return 'HT';
      if (m.status === 'BT') return 'Break';
      if (m.status === 'P') return 'Pens';
      if (m.status === 'SUSP' || m.status === 'INT') return 'Susp.';
      return m.elapsed != null ? m.elapsed + (m.extra ? '+' + m.extra : '') + "'" : 'Live';
    }
    if (m.phase === 'finished') return m.status === 'PEN' ? 'Pens' : m.status === 'AET' ? 'AET' : 'FT';
    return ({ PST: 'Postp.', CANC: 'Canc.', ABD: 'Aband.' })[m.status] || m.status;
  }

  function scoreHtml(m) {
    if (m.phase === 'upcoming' || (m.phase === 'off' && m.goals[0] == null)) return '<span class="sc-vs">–</span>';
    var pen = m.pen && m.pen[0] != null ? '<span class="sc-pen">(' + m.pen[0] + '–' + m.pen[1] + ' p)</span>' : '';
    return '<span class="sc-h">' + (m.goals[0] || 0) + '</span><span class="sc-sep">–</span><span class="sc-a">' + (m.goals[1] || 0) + '</span>' + pen;
  }

  function update(day) {
    var byId = {};
    day.matches.forEach(function (m) { byId[m.id] = m; });
    document.querySelectorAll('.mt[data-id]').forEach(function (row) {
      var m = byId[row.getAttribute('data-id')];
      if (!m) return;
      var st = row.querySelector('.mt-st');
      var sc = row.querySelector('.sc');
      var html = scoreHtml(m);
      if (sc.innerHTML !== html) {
        var scored = row.getAttribute('data-phase') === 'live' && m.phase === 'live';
        sc.innerHTML = html;
        if (scored) { row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); }
      }
      if (m.phase === 'upcoming') st.innerHTML = kickoffHtml(+st.getAttribute('data-ts'), pageDateOf(st));
      else st.textContent = statusText(m);
      row.className = row.className.replace(/\bph-\w+/, 'ph-' + m.phase);
      row.setAttribute('data-phase', m.phase);
      var h = row.querySelector('.tm-h'), a = row.querySelector('.tm-a');
      if (h) h.classList.toggle('is-win', m.hw === true);
      if (a) a.classList.toggle('is-win', m.aw === true);
    });
    document.querySelectorAll('time[data-fetched]').forEach(function (el) { el.setAttribute('data-fetched', day.fetchedAt); });
    refreshAgo();
    apply();
  }

  function liveCount() {
    var n = document.querySelectorAll('.mt[data-phase="live"]').length;
    document.querySelectorAll('[data-live-count]').forEach(function (b) { b.textContent = n; b.hidden = !n; });
  }

  var today = new Date().toISOString().slice(0, 10);
  var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  // Only days that can still change are worth polling.
  var pollDates = dates.filter(function (d) { return d === today || d === yesterday; });

  function poll() {
    if (document.hidden || !pollDates.length) return;
    pollDates.forEach(function (d) {
      fetch(base + '/api/day/' + d, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (day) {
          if (!day) return;
          update(day);
          // The tab badge counts every live match, so only pages that list them all may reset it.
          if (liveOnly || (dates.length === 1 && dates[0] === today)) liveCount();
        })
        .catch(function () {});
    });
  }

  // A logo the CDN cannot serve leaves a blank slot rather than a broken-image icon.
  document.addEventListener('error', function (e) {
    if (e.target && e.target.tagName === 'IMG') e.target.style.visibility = 'hidden';
  }, true);
  document.querySelectorAll('img').forEach(function (img) {
    if (img.complete && !img.naturalWidth) img.style.visibility = 'hidden';
  });

  // ---- ads ----------------------------------------------------------------
  // Mirrors the news frontend (components/ads): real host only, script loaded
  // once, and a slot Google leaves empty is removed rather than left as a
  // blank block over the scores.
  (function ads() {
    var client = body.getAttribute('data-ad-client');
    var hosts = (body.getAttribute('data-ad-hosts') || '').split(',');
    var slots = document.querySelectorAll('.ad[data-ad-slot]');
    if (!client || !slots.length || hosts.indexOf(location.hostname) === -1) {
      slots.forEach(function (el) { el.remove(); });
      return;
    }
    var s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(client);
    s.onerror = function () { slots.forEach(function (el) { el.remove(); }); };
    document.head.appendChild(s);
    slots.forEach(function (el) {
      var ins = document.createElement('ins');
      ins.className = 'adsbygoogle';
      ins.style.display = 'block';
      ins.setAttribute('data-ad-client', client);
      ins.setAttribute('data-ad-slot', el.getAttribute('data-ad-slot'));
      ins.setAttribute('data-ad-format', el.getAttribute('data-ad-format') || 'auto');
      ins.setAttribute('data-full-width-responsive', 'true');
      if (el.getAttribute('data-ad-format') !== 'auto') ins.setAttribute('data-full-width-responsive', 'false');
      el.appendChild(ins);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { el.remove(); return; }
      setTimeout(function () {
        if (ins.getAttribute('data-ad-status') === 'filled' || ins.querySelector('iframe')) return;
        el.remove();
      }, 5000);
    });
  })();

  localiseTimes();
  refreshAgo();
  apply();
  setInterval(refreshAgo, 30000);
  setInterval(poll, POLL);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
})();
