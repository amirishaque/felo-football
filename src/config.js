require('dotenv').config();
const path = require('path');

const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);

module.exports = {
    apiKey: process.env.APISPORTS_KEY || '',
    apiBase: 'https://v3.football.api-sports.io',
    dailyLimit: int(process.env.DAILY_LIMIT, 100),
    reserve: int(process.env.RESERVE, 8),
    port: int(process.env.PORT, 5100),
    basePath: (process.env.BASE_PATH || '/football').replace(/\/+$/, ''),
    siteUrl: (process.env.SITE_URL || 'https://felo.news').replace(/\/+$/, ''),
    dataDir: path.resolve(__dirname, '../data'),
    // The rolling window the poller keeps warm, in UTC days. The Free plan
    // only serves yesterday..tomorrow ("Free plans do not have access to this
    // date"); a paid plan can widen DAYS_AHEAD. Older results come from the
    // day files already on disk, never from the API.
    daysBack: 1,
    daysAhead: int(process.env.DAYS_AHEAD, 1),
};
