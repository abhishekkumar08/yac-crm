import { BRAND } from "@/brand.js";
import { COPY } from "@/copy.js";
import { displayType } from "@shared/field-types.js";

export { pad, ymd } from "@shared/dates.js";

const currency = { multiCurrency: false, corporate: BRAND.CURRENCY, rates: new Map() };
const formatters = new Map();

export function setCurrencyContext({ multiCurrency, corporate, currencies = [] }) {
  currency.multiCurrency = Boolean(multiCurrency);
  currency.corporate = corporate || BRAND.CURRENCY;
  currency.rates = new Map(currencies.map((c) => [c.isoCode, c.rate]));
}

export const currencyContext = () => currency;

function moneyFormat(code, compact) {
  const key = `${code}:${compact}`;
  if (!formatters.has(key)) {
    formatters.set(key, new Intl.NumberFormat(BRAND.LOCALE, { style: "currency", currency: code,
      ...(compact ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: 2 }) }));
  }
  return formatters.get(key);
}

export function toCorporate(amount, from) {
  const value = Number(amount ?? 0);
  if (!currency.multiCurrency || !from || from === currency.corporate) return value;
  const rate = currency.rates.get(from);
  return rate ? value / rate : value;
}
const number = new Intl.NumberFormat(BRAND.LOCALE, { maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat(BRAND.LOCALE, { year: "numeric", month: "short", day: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat(BRAND.LOCALE, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const timeFmt = new Intl.DateTimeFormat(BRAND.LOCALE, { hour: "numeric", minute: "2-digit" });

const ISO_CODE = /^[A-Z]{3}$/;
const codeOr = (code) => (typeof code === "string" && ISO_CODE.test(code) ? code : currency.corporate);

export const formatMoney = (v, code) => moneyFormat(codeOr(code), false).format(Number(v ?? 0));
export const formatMoneyShort = (v, code) => moneyFormat(codeOr(code), true).format(Number(v ?? 0));

export function formatRecordMoney(value, code) {
  const own = formatMoney(value, code || currency.corporate);
  if (!currency.multiCurrency || !code || code === currency.corporate) return own;
  return `${own} (${formatMoney(toCorporate(value, code))})`;
}
export const formatNumber = (v) => number.format(Number(v ?? 0));
export const formatDate = (s) => (s ? dateFmt.format(new Date(`${String(s).slice(0, 10)}T00:00:00`)) : "");
export const formatDateTime = (s) => (s ? dateTimeFmt.format(new Date(s)) : "");
export const formatTime = (s) => (s ? timeFmt.format(new Date(s)) : "");

export { displayType };

export function formatPlain(field, value, names = {}, currencyCode) {
  if (value === null || value === undefined || value === "") return "";
  switch (displayType(field)) {
    case "currency": return formatRecordMoney(value, currencyCode);
    case "percent": return `${formatNumber(value)}%`;
    case "number": return formatNumber(value);
    case "date": return formatDate(value);
    case "datetime": return formatDateTime(value);
    case "checkbox": return value ? COPY.COMMON.YES : COPY.COMMON.NO;
    case "multipicklist": return Array.isArray(value) ? value.join("; ") : String(value);
    case "lookup": return names[field.name] ?? value;
    default: return String(value);
  }
}

export const fieldValueOf = (record, field) => record[field.key ?? field.name];
