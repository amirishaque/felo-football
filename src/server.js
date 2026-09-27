const path = require('path');
const express = require('express');
const compression = require('compression');
const config = require('./config');
const store = require('./store');
const scheduler = require('./scheduler');
const api = require('./apiSports');
const render = require('./render');
const { utcDate, addDays, isDate } = require('./dates');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(compression());

const router = express.Router();
const B = config.basePath;

// Pages are rebuilt from memory on every hit; a short shared cache keeps a
// traffic spike off the renderer without making scores noticeably staler.
const page = (res, html, maxAge = 30) => {
    res.set('Cache-Control', `public, max-age=${maxAge}`);
    res.type('html').send(html);
};

// Live matches of yesterday + today (a late kick-off runs past midnight UTC).
function liveNow() {
    const today = utcDate();
    const days = [store.get(today), store.get(addDays(today, -1))];
    const matches = days.flatMap(d => d?.matches || []).filter(m => m.phase === 'live');
    return { days, matches };
}

router.use('/static', express.static(path.join(__dirname, '../public'), { maxAge: '7d' }));

router.get('/', (req, res) => {
    const date = utcDate();
    page(res, render.dayPage({ date, day: store.get(date), liveCount: liveNow().matches.length, active: 'today', canonical: B, index: true }));
});

router.get('/live', (req, res) => {
    const { days, matches } = liveNow();
    page(res, render.livePage({ matches, days, liveCount: matches.length }));
});

router.get('/fixtures', (req, res) => {
    const today = utcDate();
    const days = [];
    for (let k = 0; k <= config.daysAhead; k++) days.push(store.get(addDays(today, k)));
    page(res, render.fixturesPage({ days, liveCount: liveNow().matches.length }), 300);
});

router.get('/results', (req, res) => {
    const today = utcDate();
    const yesterday = addDays(today, -1);
    const archive = store.archivedDates().filter(d => d < yesterday).slice(0, 30);
    page(res, render.resultsPage({ day: store.get(yesterday), archive, liveCount: liveNow().matches.length }), 120);
});

// The date picker submits ?d=YYYY-MM-DD
router.get('/date', (req, res) => {
    const d = String(req.query.d || '');
    res.redirect(302, isDate(d) ? (d === utcDate() ? B : `${B}/date/${d}`) : B);
});

router.get('/date/:date', async (req, res) => {
    const { date } = req.params;
    if (!isDate(date)) return res.status(404).type('html').send(render.layout({
        title: 'Not found | Felo News', description: '', canonical: B, index: false, active: '', body: render.emptyState('That is not a valid date.'),
    }));
    if (date === utcDate()) return res.redirect(301, B);

    let day = store.get(date);
    if (!day) day = await scheduler.fetchWindowDay(date);

    const past = date < utcDate();
    page(res, render.dayPage({
        date, day, liveCount: liveNow().matches.length, active: past ? 'results' : 'fixtures',
        canonical: `${B}/date/${date}`, index: false,
    }), past && day ? 3600 : 60);
});

// What the page script polls. Served from memory only — a visitor can
// never cause an API-Sports request through this route.
router.get('/api/day/:date', (req, res) => {
    const { date } = req.params;
    if (!isDate(date)) return res.status(400).json({ error: 'bad date' });
    const day = store.get(date);
    res.set('Cache-Control', 'public, max-age=30');
    if (!day) return res.status(404).json({ error: 'not loaded' });
    res.json({
        date: day.date,
        fetchedAt: day.fetchedAt,
        matches: day.matches.map(m => ({ id: m.id, phase: m.phase, status: m.status, elapsed: m.elapsed, extra: m.extra, goals: m.goals, pen: m.pen, hw: m.home.winner, aw: m.away.winner })),
    });
});

router.get('/healthz', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
        ok: true,
        budget: api.stats(),
        scheduler: scheduler.state,
        days: store.archivedDates().slice(0, 10).map(d => ({ date: d, matches: store.get(d).matches.length, fetchedAt: new Date(store.get(d).fetchedAt).toISOString() })),
    });
});

app.use(B || '/', router);
if (B) app.get('/', (req, res) => res.redirect(302, B));

app.use((req, res) => res.status(404).type('text').send('Not found'));

store.loadAll();
app.listen(config.port, () => {
    console.log(`felo-football on :${config.port}${B} — ${api.remaining()} API requests left today`);
    scheduler.start();
});
