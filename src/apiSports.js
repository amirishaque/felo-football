// Thin API-Sports client. Every call goes through here so the daily budget
// is counted in one place — the free plan is 100 requests per UTC day and
// one careless loop would burn it before lunch.
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { utcDate } = require('./dates');

const BUDGET_FILE = path.join(config.dataDir, 'budget.json');

let budget = load();

function load() {
    try {
        const b = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
        if (b.day === utcDate()) return b;
    } catch { /* first run or new day */ }
    return fresh();
}

function fresh() {
    return { day: utcDate(), used: 0, remaining: null, exhausted: false, lastError: null };
}

function save() {
    try { fs.writeFileSync(BUDGET_FILE, JSON.stringify(budget)); } catch { /* not fatal */ }
}

function rollover() {
    if (budget.day !== utcDate()) { budget = fresh(); save(); }
}

// What is left today, trusting the server's own header when we have one.
function remaining() {
    rollover();
    if (budget.exhausted) return 0;
    const local = config.dailyLimit - budget.used;
    return budget.remaining == null ? local : Math.min(budget.remaining, local);
}

// Requests the poller may still spend today without touching the reserve.
function spendable() {
    return Math.max(0, remaining() - config.reserve);
}

async function get(endpoint, params = {}) {
    if (!config.apiKey) throw new Error('APISPORTS_KEY is not set');
    rollover();
    if (remaining() <= 0) throw new Error('Daily API budget exhausted');

    const url = new URL(config.apiBase + endpoint);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    budget.used += 1;
    save();

    const res = await fetch(url, {
        headers: { 'x-apisports-key': config.apiKey },
        signal: AbortSignal.timeout(30000),
    });

    const left = parseInt(res.headers.get('x-ratelimit-requests-remaining'), 10);
    if (Number.isFinite(left)) budget.remaining = left;

    if (!res.ok) {
        budget.lastError = `HTTP ${res.status}`;
        save();
        throw new Error(`API-Sports ${endpoint} → HTTP ${res.status}`);
    }

    const body = await res.json();
    // API-Sports answers 200 with an `errors` object for quota/auth problems.
    const errs = body.errors && (Array.isArray(body.errors) ? body.errors : Object.values(body.errors));
    if (errs && errs.length) {
        const msg = errs.join('; ');
        budget.lastError = msg;
        if (/limit|requests/i.test(msg)) budget.exhausted = true;
        save();
        throw new Error(`API-Sports ${endpoint}: ${msg}`);
    }

    budget.lastError = null;
    save();
    return body.response;
}

module.exports = { get, remaining, spendable, stats: () => ({ ...budget, remaining: remaining() }) };
