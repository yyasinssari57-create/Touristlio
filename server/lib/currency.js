/** Static FX rates → TRY estimate (approximate, not live trading) */
const RATES_TO_TRY = {
  TRY: 1,
  USD: 34.5,
  EUR: 37.2,
  GBP: 43.8,
  JPY: 0.23,
  AED: 9.4,
  AUD: 22.1,
  THB: 0.98,
  EGP: 0.71,
  INR: 0.41,
  BRL: 6.2,
  KRW: 0.026,
  NOK: 3.1,
  ISK: 0.25,
  VND: 0.0014,
  KHR: 0.0085,
  JOD: 48.7,
  NPR: 0.26,
  PEN: 9.2,
  CUP: 1.4,
  TZS: 0.013,
};

const COUNTRY_CURRENCY = {
  Turkey: { code: 'TRY', symbol: '₺' },
  'France 🇫🇷': { code: 'EUR', symbol: '€' },
  France: { code: 'EUR', symbol: '€' },
  'Italy 🇮🇹': { code: 'EUR', symbol: '€' },
  Italy: { code: 'EUR', symbol: '€' },
  'Spain 🇪🇸': { code: 'EUR', symbol: '€' },
  Spain: { code: 'EUR', symbol: '€' },
  'Greece 🇬🇷': { code: 'EUR', symbol: '€' },
  Greece: { code: 'EUR', symbol: '€' },
  'Portugal 🇵🇹': { code: 'EUR', symbol: '€' },
  Portugal: { code: 'EUR', symbol: '€' },
  'UK 🇬🇧': { code: 'GBP', symbol: '£' },
  UK: { code: 'GBP', symbol: '£' },
  'USA 🇺🇸': { code: 'USD', symbol: '$' },
  USA: { code: 'USD', symbol: '$' },
  'Japan 🇯🇵': { code: 'JPY', symbol: '¥' },
  Japan: { code: 'JPY', symbol: '¥' },
  'UAE 🇦🇪': { code: 'AED', symbol: 'د.إ' },
  UAE: { code: 'AED', symbol: 'د.إ' },
  'Australia 🇦🇺': { code: 'AUD', symbol: 'A$' },
  Australia: { code: 'AUD', symbol: 'A$' },
  'Brazil 🇧🇷': { code: 'BRL', symbol: 'R$' },
  Brazil: { code: 'BRL', symbol: 'R$' },
  'India 🇮🇳': { code: 'INR', symbol: '₹' },
  India: { code: 'INR', symbol: '₹' },
  'South Korea 🇰🇷': { code: 'KRW', symbol: '₩' },
  'South Korea': { code: 'KRW', symbol: '₩' },
  'Vietnam 🇻🇳': { code: 'VND', symbol: '₫' },
  Vietnam: { code: 'VND', symbol: '₫' },
  'Cambodia 🇰🇭': { code: 'KHR', symbol: '៛' },
  Cambodia: { code: 'KHR', symbol: '៛' },
  'Jordan 🇯🇴': { code: 'JOD', symbol: 'JD' },
  Jordan: { code: 'JOD', symbol: 'JD' },
  'Nepal 🇳🇵': { code: 'NPR', symbol: 'Rs' },
  Nepal: { code: 'NPR', symbol: 'Rs' },
  'Peru 🇵🇪': { code: 'PEN', symbol: 'S/' },
  Peru: { code: 'PEN', symbol: 'S/' },
  'Cuba 🇨🇺': { code: 'CUP', symbol: '$' },
  Cuba: { code: 'CUP', symbol: '$' },
  'Tanzania 🇹🇿': { code: 'TZS', symbol: 'TSh' },
  Tanzania: { code: 'TZS', symbol: 'TSh' },
  'Egypt 🇪🇬': { code: 'EGP', symbol: 'E£' },
  Egypt: { code: 'EGP', symbol: 'E£' },
  'Norway 🇳🇴': { code: 'NOK', symbol: 'kr' },
  Norway: { code: 'NOK', symbol: 'kr' },
  'Iceland 🇮🇸': { code: 'ISK', symbol: 'kr' },
  Iceland: { code: 'ISK', symbol: 'kr' },
};

const COUNTRY_TZ = {
  Turkey: 'Europe/Istanbul',
  'France 🇫🇷': 'Europe/Paris',
  France: 'Europe/Paris',
  'Italy 🇮🇹': 'Europe/Rome',
  Italy: 'Europe/Rome',
  'Japan 🇯🇵': 'Asia/Tokyo',
  Japan: 'Asia/Tokyo',
  'USA 🇺🇸': 'America/New_York',
  USA: 'America/New_York',
  'UK 🇬🇧': 'Europe/London',
  UK: 'Europe/London',
  'UAE 🇦🇪': 'Asia/Dubai',
  UAE: 'Asia/Dubai',
  'Australia 🇦🇺': 'Australia/Sydney',
  Australia: 'Australia/Sydney',
  'Greece 🇬🇷': 'Europe/Athens',
  Greece: 'Europe/Athens',
  'Spain 🇪🇸': 'Europe/Madrid',
  Spain: 'Europe/Madrid',
  'Portugal 🇵🇹': 'Europe/Lisbon',
  Portugal: 'Europe/Lisbon',
  'Brazil 🇧🇷': 'America/Sao_Paulo',
  Brazil: 'America/Sao_Paulo',
  'India 🇮🇳': 'Asia/Kolkata',
  India: 'Asia/Kolkata',
  'Egypt 🇪🇬': 'Africa/Cairo',
  Egypt: 'Africa/Cairo',
  'Norway 🇳🇴': 'Europe/Oslo',
  Norway: 'Europe/Oslo',
  'Iceland 🇮🇸': 'Atlantic/Reykjavik',
  Iceland: 'Atlantic/Reykjavik',
};

function currencyForCountry(country) {
  return COUNTRY_CURRENCY[country] || { code: 'USD', symbol: '$' };
}

function timezoneForCountry(country) {
  return COUNTRY_TZ[country] || 'UTC';
}

function toTryEstimate(amount, currencyCode) {
  const rate = RATES_TO_TRY[currencyCode] || RATES_TO_TRY.USD;
  return Math.round(amount * rate);
}

function parseEntryFeeTry(entryFee) {
  if (!entryFee) return null;
  const m = String(entryFee).match(/(\d[\d.,]*)/);
  if (!m) return null;
  const num = parseFloat(m[1].replace(',', '.'));
  if (Number.isNaN(num)) return null;
  if (/₺|TL|try/i.test(entryFee)) return num;
  if (/€|EUR/i.test(entryFee)) return toTryEstimate(num, 'EUR');
  if (/\$|USD/i.test(entryFee)) return toTryEstimate(num, 'USD');
  if (/£|GBP/i.test(entryFee)) return toTryEstimate(num, 'GBP');
  return num;
}

module.exports = {
  RATES_TO_TRY,
  currencyForCountry,
  timezoneForCountry,
  toTryEstimate,
  parseEntryFeeTry,
};
