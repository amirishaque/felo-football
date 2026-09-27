// One file per UTC day under data/. A day that has finished keeps its file
// forever, which is how the results archive grows without spending requests.
const fs = require('fs');
const path = require('path');
const config = require('./config');

const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE']);
const DONE = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO']);
const OFF = new Set(['PST', 'CANC', 'ABD']);

const phase = s => (LIVE.has(s) ? 'live' : DONE.has(s) ? 'finished' : OFF.has(s) ? 'off' : 'upcoming');

const days = new Map(); // date -> { date, fetchedAt, matches: [] }

const file = date => path.join(config.dataDir, `day-${date}.json`);

// Keep only what the pages show; the raw feed is ~1KB per match.
function compact(f) {
    const pair = o => [o?.home ?? null, o?.away ?? null];
    const team = t => ({ id: t.id, name: t.name, logo: t.logo, winner: t.winner });
    return {
        id: f.fixture.id,
        ts: f.fixture.timestamp * 1000,
        status: f.fixture.status.short,
        statusLong: f.fixture.status.long,
        elapsed: f.fixture.status.elapsed,
        extra: f.fixture.status.extra ?? null,
        phase: phase(f.fixture.status.short),
        venue: f.fixture.venue?.name || null,
        league: {
            id: f.league.id, name: f.league.name, country: f.league.country,
            logo: f.league.logo, flag: f.league.flag, round: f.league.round,
        },
        home: team(f.teams.home),
        away: team(f.teams.away),
        goals: pair(f.goals),
        ht: pair(f.score?.halftime),
        pen: pair(f.score?.penalty),
    };
}

function put(date, rawFixtures) {
    const day = { date, fetchedAt: Date.now(), matches: rawFixtures.map(compact).sort((a, b) => a.ts - b.ts) };
    days.set(date, day);
    fs.writeFileSync(file(date), JSON.stringify(day));
    return day;
}

function get(date) {
    if (days.has(date)) return days.get(date);
    try {
        const day = JSON.parse(fs.readFileSync(file(date), 'utf8'));
        days.set(date, day);
        return day;
    } catch {
        return null;
    }
}

function loadAll() {
    fs.mkdirSync(config.dataDir, { recursive: true });
    for (const f of fs.readdirSync(config.dataDir)) {
        const m = f.match(/^day-(\d{4}-\d{2}-\d{2})\.json$/);
        if (m) get(m[1]);
    }
}

// Past days on disk, newest first — the archive the results page links to.
function archivedDates() {
    return [...days.keys()].sort().reverse();
}

module.exports = { put, get, loadAll, archivedDates, phase };
