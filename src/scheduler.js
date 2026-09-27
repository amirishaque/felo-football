// Decides, once a minute, which day feeds are worth a request.
//
// One `fixtures?date=` call returns every match of that UTC day — schedule,
// live score and final result together — so the whole product is "which
// day do we refresh next". The live days (yesterday and today) get whatever
// the daily budget can spare, spread evenly over the minutes that still
// have a match in play; the days ahead only need a slow refresh for
// kick-off changes.
const config = require('./config');
const api = require('./apiSports');
const store = require('./store');
const { DAY, utcDate, addDays, dayStart } = require('./dates');

const MIN = 60000;
const PRE = 5 * MIN;        // start polling a little before kick-off
const SPAN = 135 * MIN;     // 90' + half-time + stoppage, with room to spare
const FINAL_SWEEP = 3 * 60 * MIN; // re-read yesterday once, 3h into today
const IDLE_REFRESH = 180 * MIN;   // today, when nothing is in play
const MIN_LIVE = 5 * MIN;
const MAX_LIVE = 120 * MIN;
const MAX_CALLS_PER_TICK = 3;     // the plan also caps 10/minute
// The feed sometimes leaves a match "live" for hours after it ended. Past
// this age a live flag no longer keeps the poller busy.
const STALE_LIVE = 4 * 60 * MIN;
const reallyLive = (m, now) => m.phase === 'live' && now - m.ts < STALE_LIVE;

const aheadInterval = k => (k <= 2 ? 6 : 12) * 60 * MIN;

const state = { lastTick: null, liveInterval: null, activeNow: false, lastRun: [], errors: [] };
let running = false;

// A date the API refused is not asked for again for an hour — a request
// spent on an error still counts against the day.
const RETRY_AFTER = 60 * MIN;
const failedAt = new Map();
const coolingDown = (date, now) => now - (failedAt.get(date) || 0) < RETRY_AFTER;

// Minutes between now and the end of today (UTC) during which some match
// of `days` is in its window. Clipped at midnight because the budget resets.
function activity(now, days) {
    const end = dayStart(utcDate(now)) + DAY;
    const spans = [];
    for (const day of days) {
        for (const m of day?.matches || []) {
            if (m.phase === 'finished' || m.phase === 'off') continue;
            let s = m.ts - PRE, e = m.ts + SPAN;
            if (reallyLive(m, now)) e = Math.max(e, now + 15 * MIN);
            s = Math.max(s, now); e = Math.min(e, end);
            if (e > s) spans.push([s, e]);
        }
    }
    spans.sort((a, b) => a[0] - b[0]);
    let total = 0, curS = null, curE = null;
    for (const [s, e] of spans) {
        if (curE == null || s > curE) { if (curE != null) total += curE - curS; curS = s; curE = e; }
        else curE = Math.max(curE, e);
    }
    if (curE != null) total += curE - curS;
    const activeNow = spans.some(([s]) => s <= now);
    return { activeMs: total, activeNow };
}

// Calls the slow refreshes of the coming days will still need before midnight.
function plannedAhead(now, today) {
    const left = dayStart(today) + DAY - now;
    let n = 0;
    for (let k = 1; k <= config.daysAhead; k++) n += Math.ceil(left / aheadInterval(k));
    return n;
}

async function fetchDay(date, why) {
    const raw = await api.get('/fixtures', { date });
    const day = store.put(date, raw);
    state.lastRun.unshift({ date, why, at: new Date().toISOString(), matches: day.matches.length });
    state.lastRun.length = Math.min(state.lastRun.length, 20);
    console.log(`[poll] ${date} (${why}) → ${day.matches.length} matches, ${api.remaining()} requests left today`);
    return day;
}

function plan(now) {
    const today = utcDate(now);
    const yesterday = addDays(today, -config.daysBack);
    const tDay = store.get(today), yDay = store.get(yesterday);
    const age = d => (d ? now - d.fetchedAt : Infinity);

    const { activeMs, activeNow } = activity(now, [yDay, tDay]);
    const spend = Math.max(1, api.spendable() - plannedAhead(now, today));
    const liveInterval = Math.min(MAX_LIVE, Math.max(MIN_LIVE, Math.ceil(activeMs / spend)));
    state.liveInterval = liveInterval;
    state.activeNow = activeNow;

    const jobs = [];
    if (!tDay) jobs.push([today, 'missing']);
    else if (activeNow ? age(tDay) >= liveInterval : age(tDay) >= IDLE_REFRESH) jobs.push([today, activeNow ? 'live' : 'idle']);

    const sweepAt = dayStart(today) + FINAL_SWEEP;
    if (!yDay) jobs.push([yesterday, 'missing']);
    else if (yDay.fetchedAt < sweepAt && now >= sweepAt) jobs.push([yesterday, 'final']);
    else if (yDay.matches.some(m => reallyLive(m, now)) && age(yDay) >= liveInterval) jobs.push([yesterday, 'live']);

    for (let k = 1; k <= config.daysAhead; k++) {
        const date = addDays(today, k);
        const d = store.get(date);
        if (!d) jobs.push([date, 'missing']);
        else if (age(d) >= aheadInterval(k) && api.spendable() > 15) jobs.push([date, 'ahead']);
    }
    return jobs.filter(([date]) => !coolingDown(date, now));
}

async function tick() {
    if (running) return;
    running = true;
    const now = Date.now();
    state.lastTick = new Date(now).toISOString();
    try {
        const jobs = plan(now).slice(0, MAX_CALLS_PER_TICK);
        for (const [date, why] of jobs) {
            if (api.spendable() <= 0) break;
            try {
                await fetchDay(date, why);
            } catch (err) {
                failedAt.set(date, Date.now());
                state.errors.unshift({ date, at: new Date().toISOString(), error: err.message });
                state.errors.length = Math.min(state.errors.length, 20);
                console.error(`[poll] ${date}: ${err.message}`);
                break;
            }
        }
    } finally {
        running = false;
    }
}

// A day inside the window that a visitor reached before the poller filled
// it (e.g. right after a first deploy). Anything outside the window the
// plan will not serve, so it is never asked for.
const pending = new Map();
function fetchWindowDay(date) {
    const today = utcDate();
    if (date < addDays(today, -config.daysBack) || date > addDays(today, config.daysAhead)) return Promise.resolve(null);
    if (coolingDown(date, Date.now()) || api.spendable() <= 30) return Promise.resolve(null);
    if (!pending.has(date)) {
        pending.set(date, fetchDay(date, 'visitor')
            .catch(() => { failedAt.set(date, Date.now()); return null; })
            .finally(() => pending.delete(date)));
    }
    return pending.get(date);
}

function start() {
    tick();
    setInterval(tick, MIN).unref?.();
}

module.exports = { start, tick, fetchWindowDay, state };
