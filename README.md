# felo-football

Football fixtures, live scores and results for **felo.news/football**. A small
Node service, separate from the news app: it polls API-Sports, keeps each UTC
day as a JSON file under `data/`, and serves server-rendered pages that a
little script keeps fresh.

| Route | What |
|---|---|
| `/football` | Today — every match, top competitions first |
| `/football/live` | Matches in play now (yesterday + today) |
| `/football/fixtures` | The rest of today, then tomorrow |
| `/football/results` | Yesterday's final scores + links to stored earlier days |
| `/football/date/YYYY-MM-DD` | Any day in the window or already on disk |
| `/football/api/day/YYYY-MM-DD` | JSON the page polls — memory only, never calls the API |
| `/football/healthz` | Budget, scheduler state, recent polls |

## The request budget

The Free plan allows **100 requests per UTC day** and **only serves
yesterday, today and tomorrow**. One `fixtures?date=` call returns the whole
day (800–1,200 matches, ~240 leagues), so the poller just decides which day
to refresh:

- today/yesterday while matches are in play: the spare budget spread over
  the minutes left with a match in its window (≈10–20 min between refreshes
  on Free; clamped to 5–120 min)
- today when nothing is on: every 3 h
- yesterday: one final sweep at 03:00 UTC for late finishes
- tomorrow: every 6 h
- a refused date is not retried for an hour; `RESERVE` requests are never spent

**Scores on Free lag the real match by up to ~15 minutes.** A paid plan
(7,500/day) needs no code change — raise `DAILY_LIMIT` (and `DAYS_AHEAD`) in
`.env` and the interval drops to the 5-minute floor.

Past days are never re-fetched: the results archive is the `data/day-*.json`
files the service has kept since it started running. **Local runs and
production share one key and one daily budget** — don't leave a local copy
running.

## Run

```bash
cp .env.example .env   # set APISPORTS_KEY
npm install
npm start              # http://localhost:5100/football
```

## Deploy (felo.news, 75.119.134.58)

```bash
cd /var/www && git clone <this repo> felo-football && cd felo-football
npm ci --omit=dev
cp .env.example .env && nano .env      # APISPORTS_KEY
pm2 start src/server.js --name felo-football && pm2 save
```

nginx, inside the `felo.news` server block (`^~` so the static-asset regex
locations can't steal `/football/static/*`):

```nginx
location ^~ /football {
    proxy_pass http://127.0.0.1:5100;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```
