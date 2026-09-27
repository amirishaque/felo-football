// All day keys are UTC `YYYY-MM-DD`, the same day boundary API-Sports uses.
const DAY = 86400000;

const utcDate = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const addDays = (date, n) => utcDate(Date.parse(date + 'T00:00:00Z') + n * DAY);
const dayStart = date => Date.parse(date + 'T00:00:00Z');
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && utcDate(dayStart(s)) === s;

module.exports = { DAY, utcDate, addDays, dayStart, isDate };
