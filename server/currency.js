export class CurrencyError extends Error {}

const DEFAULTS = { multiCurrency: false, corporate: "USD" };
const ISO = /^[A-Z]{3}$/;

export function getSetting(db, key, fallback) {
  const row = db.prepare("SELECT value FROM org_settings WHERE key = ?").get(key);
  return row ? JSON.parse(row.value) : fallback;
}

export function setSetting(db, key, value) {
  db.prepare("INSERT INTO org_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .run(key, JSON.stringify(value));
}

export const getSettings = (db) => getSetting(db, "currency", DEFAULTS);

export function listCurrencies(db) {
  return db.prepare("SELECT * FROM currencies ORDER BY iso_code").all()
    .map((r) => ({ isoCode: r.iso_code, name: r.name, rate: r.rate, active: Boolean(r.active) }));
}

export function activeCodes(db) {
  return db.prepare("SELECT iso_code FROM currencies WHERE active = 1 ORDER BY iso_code").all().map((r) => r.iso_code);
}

export function saveCurrencies(db, { multiCurrency, corporate, currencies = [] }) {
  for (const c of currencies) {
    if (!ISO.test(c.isoCode ?? "")) throw new CurrencyError(`${c.isoCode} is not a three-letter currency code.`);
    if (!(Number(c.rate) > 0)) throw new CurrencyError(`Enter a conversion rate above 0 for ${c.isoCode}.`);
  }
  const corp = currencies.find((c) => c.isoCode === corporate);
  if (multiCurrency && (!corp || !corp.active)) throw new CurrencyError("The corporate currency must be active.");
  const base = corp ? Number(corp.rate) : 1;
  const upsert = db.prepare(`INSERT INTO currencies (iso_code, name, rate, active) VALUES (?, ?, ?, ?)
    ON CONFLICT (iso_code) DO UPDATE SET name = excluded.name, rate = excluded.rate, active = excluded.active`);
  for (const c of currencies) upsert.run(c.isoCode, c.name || c.isoCode, c.isoCode === corporate ? 1 : Number(c.rate) / base, c.active ? 1 : 0);
  setSetting(db, "currency", { multiCurrency: Boolean(multiCurrency), corporate: corporate || DEFAULTS.corporate });
  return { ...getSettings(db), currencies: listCurrencies(db) };
}

function rates(db) {
  return new Map(db.prepare("SELECT iso_code, rate FROM currencies").all().map((r) => [r.iso_code, r.rate]));
}

const round = (n) => Math.round(n * 100) / 100;

export function convert(db, amount, from, to) {
  if (amount === null || amount === undefined || amount === "") return null;
  const settings = getSettings(db);
  const source = from || settings.corporate;
  const target = to || settings.corporate;
  if (!settings.multiCurrency || source === target) return Number(amount);
  const r = rates(db);
  if (!r.has(source) || !r.has(target)) return Number(amount);
  return round((Number(amount) / r.get(source)) * r.get(target));
}

export const toCorporate = (db, amount, from) => convert(db, amount, from, getSettings(db).corporate);
