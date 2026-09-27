// Server-rendered pages. The scores are in the HTML itself so crawlers and
// no-JS readers get them; public/football.js only keeps them fresh.
const config = require('./config');
const store = require('./store');
const { isTop, topRank } = require('./leagues');
const { utcDate, addDays, dayStart } = require('./dates');

const B = config.basePath;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const hhmm = ts => new Date(ts).toISOString().slice(11, 16);
const dayLabel = (date, today = utcDate()) => {
    if (date === today) return 'Today';
    if (date === addDays(today, -1)) return 'Yesterday';
    if (date === addDays(today, 1)) return 'Tomorrow';
    return new Date(dayStart(date)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
};
const longDay = date => new Date(dayStart(date)).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function statusText(m) {
    if (m.phase === 'live') {
        if (m.status === 'HT') return 'HT';
        if (m.status === 'BT') return 'Break';
        if (m.status === 'P') return 'Pens';
        if (m.status === 'SUSP' || m.status === 'INT') return 'Susp.';
        return m.elapsed != null ? `${m.elapsed}${m.extra ? '+' + m.extra : ''}'` : 'Live';
    }
    if (m.phase === 'finished') return m.status === 'PEN' ? 'Pens' : m.status === 'AET' ? 'AET' : 'FT';
    if (m.phase === 'off') return { PST: 'Postp.', CANC: 'Canc.', ABD: 'Aband.' }[m.status] || m.status;
    return hhmm(m.ts);
}

function scoreHtml(m) {
    if (m.phase === 'upcoming' || (m.phase === 'off' && m.goals[0] == null)) return '<span class="sc-vs">–</span>';
    const [h, a] = m.goals;
    const pen = m.pen[0] != null ? `<span class="sc-pen">(${m.pen[0]}–${m.pen[1]} p)</span>` : '';
    return `<span class="sc-h">${h ?? 0}</span><span class="sc-sep">–</span><span class="sc-a">${a ?? 0}</span>${pen}`;
}

function teamHtml(t, side) {
    const win = t.winner === true ? ' is-win' : '';
    return `<span class="tm tm-${side}${win}">`
        + `<img src="${esc(t.logo)}" alt="" width="20" height="20" loading="lazy" decoding="async">`
        + `<span class="tm-n">${esc(t.name)}</span></span>`;
}

function matchRow(m) {
    const search = `${m.home.name} ${m.away.name} ${m.league.name} ${m.league.country}`.toLowerCase();
    return `<li class="mt ph-${m.phase}" data-id="${m.id}" data-phase="${m.phase}" data-q="${esc(search)}">`
        + `<span class="mt-st" data-ts="${m.ts}" title="${esc(m.statusLong)}">${esc(statusText(m))}</span>`
        + teamHtml(m.home, 'h')
        + `<span class="sc">${scoreHtml(m)}</span>`
        + teamHtml(m.away, 'a')
        + '</li>';
}

function groupByLeague(matches) {
    const groups = new Map();
    for (const m of matches) {
        if (!groups.has(m.league.id)) groups.set(m.league.id, { league: m.league, matches: [] });
        groups.get(m.league.id).matches.push(m);
    }
    return [...groups.values()];
}

function leagueBlock(g, { open }) {
    const live = g.matches.filter(m => m.phase === 'live').length;
    const flag = g.league.flag ? `<img class="lg-flag" src="${esc(g.league.flag)}" alt="" width="16" height="12" loading="lazy">` : '';
    return `<details class="lg"${open || live ? ' open' : ''}>`
        + `<summary><img class="lg-logo" src="${esc(g.league.logo)}" alt="" width="22" height="22" loading="lazy">`
        + `<span class="lg-name">${esc(g.league.name)}</span>`
        + `<span class="lg-cty">${flag}${esc(g.league.country)}</span>`
        + (live ? `<span class="lg-live">${live} live</span>` : '')
        + `<span class="lg-n">${g.matches.length}</span></summary>`
        + `<ul class="mts">${g.matches.map(matchRow).join('')}</ul></details>`;
}

// A day's matches: the big competitions first and open, the rest collapsed.
function dayBody(matches, { onlyTop = false } = {}) {
    const groups = groupByLeague(matches);
    const top = groups.filter(g => isTop(g.league.id)).sort((a, b) => topRank(a.league.id) - topRank(b.league.id));
    const rest = groups.filter(g => !isTop(g.league.id))
        .sort((a, b) => a.league.country.localeCompare(b.league.country) || a.league.name.localeCompare(b.league.name));

    let html = '';
    if (top.length) html += `<section class="band"><h2 class="band-h">Top competitions</h2>${top.map(g => leagueBlock(g, { open: true })).join('')}</section>`;
    if (!onlyTop && rest.length) {
        html += `<section class="band"><h2 class="band-h">Other competitions <span>${rest.length}</span></h2>${rest.map(g => leagueBlock(g, { open: false })).join('')}</section>`;
    }
    return html;
}

function tabs(active, liveCount) {
    const t = (key, href, label) => `<a class="tab${key === active ? ' is-on' : ''}" href="${href}">${label}</a>`;
    return `<nav class="tabs" aria-label="Football sections">`
        + t('live', `${B}/live`, `<span class="dot"></span>Live${liveCount ? ` <b data-live-count>${liveCount}</b>` : ' <b data-live-count hidden></b>'}`)
        + t('today', `${B}`, 'Today')
        + t('fixtures', `${B}/fixtures`, 'Fixtures')
        + t('results', `${B}/results`, 'Results')
        + '</nav>';
}

// Days the reader can open: the live window, plus the last week of
// finished days already on disk (the API will not serve older ones).
function dateStrip(current) {
    const today = utcDate();
    let html = '<div class="strip">';
    for (let k = -7; k <= config.daysAhead; k++) {
        const d = addDays(today, k);
        if (k < -config.daysBack && !store.get(d)) continue;
        const href = d === today ? B : `${B}/date/${d}`;
        html += `<a class="chip${d === current ? ' is-on' : ''}" href="${href}">${esc(dayLabel(d, today))}</a>`;
    }
    html += `<form class="goto" action="${B}/date" method="get"><input type="date" name="d" value="${current || today}" max="${addDays(today, config.daysAhead)}" aria-label="Pick a date"><button>Go</button></form>`;
    return html + '</div>';
}

function toolbar() {
    return '<div class="tools">'
        + '<div class="filters" role="group" aria-label="Filter matches">'
        + ['all:All', 'live:Live', 'finished:Finished', 'upcoming:Upcoming'].map((p, i) => {
            const [k, l] = p.split(':');
            return `<button type="button" data-filter="${k}"${i === 0 ? ' class="is-on"' : ''}>${l}</button>`;
        }).join('')
        + '</div><input class="search" type="search" placeholder="Search team or league" aria-label="Search team or league"></div>';
}

function updated(day) {
    if (!day) return '';
    return `<p class="upd">Scores updated <time data-fetched="${day.fetchedAt}" datetime="${new Date(day.fetchedAt).toISOString()}">${hhmm(day.fetchedAt)} UTC</time> · times shown in <span data-tz>UTC</span></p>`;
}

function layout({ title, description, canonical, index = true, active, liveCount, body, dates = [] }) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(config.siteUrl + canonical)}">
<meta name="robots" content="${index ? 'index,follow' : 'noindex,follow'}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(config.siteUrl + canonical)}">
<meta name="theme-color" content="#F3F4F7">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,600;6..72,700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${B}/static/football.css?v=${ASSET_V}">
</head>
<body data-base="${B}" data-dates="${esc(dates.join(','))}">
<header class="mast">
  <div class="wrap mast-in">
    <a class="brand" href="${esc(config.siteUrl)}/">Felo<span>News</span></a>
    <a class="sect" href="${B}">Football</a>
    <a class="back" href="${esc(config.siteUrl)}/">← All news</a>
  </div>
</header>
<main class="wrap">
${tabs(active, liveCount)}
${body}
</main>
<footer class="foot"><div class="wrap">Match data: API-Football. Scores refresh automatically and may lag the live action by several minutes. <a href="${esc(config.siteUrl)}/">felo.news</a></div></footer>
<script src="${B}/static/football.js?v=${ASSET_V}" defer></script>
</body>
</html>`;
}

const ASSET_V = Date.now().toString(36);

const emptyState = msg => `<div class="empty">${esc(msg)}</div>`;

// ---- pages -------------------------------------------------------------

function dayPage({ date, day, liveCount, active, canonical, index }) {
    const label = dayLabel(date);
    const n = day?.matches.length || 0;
    const h1 = date === utcDate() ? 'Football today' : `Football matches · ${label}`;
    const heading = `<div class="pg-h"><h1>${esc(h1)}</h1><p class="pg-sub">${esc(longDay(date))}${n ? ` · ${n} matches` : ''}</p></div>`;
    const body = heading + dateStrip(date)
        + (day ? toolbar() + updated(day) + (n ? dayBody(day.matches) : emptyState('No matches scheduled on this day.'))
            : emptyState(date < addDays(utcDate(), -config.daysBack) ? 'We have no results stored for this date.'
                : date > addDays(utcDate(), config.daysAhead) ? 'Fixtures for this date will appear closer to the day.'
                    : 'Match data for this day is loading. Please check back shortly.'));
    return layout({
        title: date === utcDate() ? 'Football Scores Today: Live Scores, Fixtures & Results | Felo News'
            : `Football Matches ${longDay(date)}: Scores & Results | Felo News`,
        description: `Every football match on ${longDay(date)}: kick-off times, live scores and final results from the Premier League, Champions League, La Liga and ${n > 50 ? 'hundreds of' : 'other'} competitions worldwide.`,
        canonical, index, active, liveCount, body, dates: [date],
    });
}

function livePage({ matches, days, liveCount }) {
    const body = '<div class="pg-h"><h1>Live football scores</h1><p class="pg-sub">Matches in play right now, across every competition we cover.</p></div>'
        + toolbar().replace('data-filter="all" class="is-on"', 'data-filter="all"').replace('data-filter="live"', 'data-filter="live" class="is-on"')
        + updated(days.find(Boolean))
        + (matches.length ? dayBody(matches) : emptyState('No matches are being played at the moment. See today\'s fixtures for the next kick-offs.'))
        + `<p class="more"><a href="${B}">Today's full schedule →</a></p>`;
    return layout({
        title: 'Live Football Scores Right Now | Felo News',
        description: 'Live football scores from matches in play right now: Premier League, Champions League, La Liga, Serie A, Bundesliga and more.',
        canonical: `${B}/live`, active: 'live', liveCount, body,
        dates: days.filter(Boolean).map(d => d.date),
    }).replace('<body ', '<body data-live-only="1" ');
}

// The rest of today, then the days ahead the plan lets us see.
function fixturesPage({ days, liveCount }) {
    const today = utcDate();
    let body = '<div class="pg-h"><h1>Football fixtures</h1><p class="pg-sub">Upcoming kick-offs, in your local time.</p></div>' + toolbar();
    const loaded = days.filter(Boolean);
    if (!loaded.length) body += emptyState('Fixtures are loading. Please check back shortly.');
    for (const d of loaded) {
        const upcoming = d.matches.filter(m => m.phase === 'upcoming' || m.phase === 'live');
        const title = d.date === today ? 'Later today' : `${dayLabel(d.date)} · ${longDay(d.date)}`;
        body += `<section class="day" data-date="${d.date}"><h2 class="day-h"><a href="${d.date === today ? B : `${B}/date/${d.date}`}">${esc(title)}</a><span>${upcoming.length} matches</span></h2>`
            + (upcoming.length ? dayBody(upcoming) : emptyState('No more matches scheduled.'))
            + '</section>';
    }
    return layout({
        title: 'Football Fixtures: Upcoming Matches & Kick-off Times | Felo News',
        description: 'Upcoming football fixtures and kick-off times across the Premier League, Champions League, La Liga, Serie A, Bundesliga and hundreds of competitions worldwide.',
        canonical: `${B}/fixtures`, active: 'fixtures', liveCount, body,
        dates: loaded.map(d => d.date),
    });
}

function resultsPage({ day, archive, liveCount }) {
    const date = day?.date;
    let body = '<div class="pg-h"><h1>Football results</h1><p class="pg-sub">Final scores from yesterday. Pick any earlier date for past results.</p></div>'
        + dateStrip(date);
    if (day) {
        const done = day.matches.filter(m => m.phase === 'finished' || m.phase === 'off');
        body += updated(day) + toolbar() + (done.length ? dayBody(done) : emptyState('No results for this day.'));
    } else {
        body += emptyState('Results are loading. Please check back shortly.');
    }
    if (archive.length) {
        body += `<section class="band"><h2 class="band-h">Earlier results</h2><div class="arch">`
            + archive.map(d => `<a class="chip" href="${B}/date/${d}">${esc(longDay(d))}</a>`).join('') + '</div></section>';
    }
    return layout({
        title: 'Football Results: Yesterday\'s Final Scores | Felo News',
        description: 'Final football scores from yesterday\'s matches in the Premier League, Champions League, La Liga, Serie A, Bundesliga and competitions worldwide.',
        canonical: `${B}/results`, active: 'results', liveCount, body, dates: date ? [date] : [],
    });
}

module.exports = { dayPage, livePage, fixturesPage, resultsPage, layout, emptyState };
