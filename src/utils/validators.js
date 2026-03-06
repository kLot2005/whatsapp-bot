// ─── ИИН ───────────────────────────────────────────────────────────────────

/**
 * Валидация ИИН (12 цифр)
 */
function validateIIN(value) {
  return /^\d{12}$/.test(value.trim());
}

// ─── Числа / суммы ───────────────────────────────────────────────────────────

/**
 * Извлечь число из произвольного текста: "50 000 000 тг" → 50000000
 * Возвращает number или null
 */
function extractNumber(text) {
  const cleaned = text.replace(/[^\d.,]/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ─── Да / Нет (рус + каз) ───────────────────────────────────────────────────

const YES_WORDS = ['да', 'есть', 'да есть', 'да, есть', 'ия', 'иә', 'жарайды', 'жақсы', 'ок', 'ok', 'ладно', 'конечно', 'согласен', 'согласна'];
const NO_WORDS = ['нет', 'жоқ', 'жок', 'не было', 'отсутствует', 'нету'];

function isYesAnswer(text) {
  return YES_WORDS.includes(text.trim().toLowerCase());
}

function isNoAnswer(text) {
  return NO_WORDS.includes(text.trim().toLowerCase());
}

// ─── Типы кредитов ─────────────────────────────────────────────────────────

const CREDIT_TYPES = {
  1: 'Потребительский кредит',
  2: 'Залоговый кредит',
  3: 'Автокредит',
  4: 'Ипотека',
  5: 'Микрозаймы',
  6: 'Долги перед физ.лицами',
  7: 'Алименты',
  8: 'Другое',
};

/**
 * Парсинг строки "1, 3, 5" → ['Потребительский кредит', 'Автокредит', 'Микрозаймы']
 */
function parseCreditTypes(text) {
  const nums = text.match(/\d+/g);
  if (!nums) return null;
  const result = nums.map(n => CREDIT_TYPES[parseInt(n)]).filter(Boolean);
  return result.length ? result : null;
}

// ─── Типы имущества ─────────────────────────────────────────────────────────

const PROPERTY_TYPES = {
  1: 'Дом',
  2: 'Квартира',
  3: 'Гараж',
  4: 'Доля',
  5: 'Автомобиль',
  6: 'Акции',
  7: 'Другое',
};

function parsePropertyTypes(text) {
  const nums = text.match(/\d+/g);
  if (!nums) return null;
  const result = nums.map(n => PROPERTY_TYPES[parseInt(n)]).filter(Boolean);
  return result.length ? result : null;
}

// ─── Социальный статус ──────────────────────────────────────────────────────

const SOCIAL_STATUSES = {
  1: 'Лицо с инвалидностью',
  2: 'Получатель АСП',
  3: 'Многодетная семья',
  4: 'Иные пособия/льготы',
  5: 'Не отношусь к льготным категориям',
};

function parseSocialStatus(text) {
  const nums = text.match(/\d+/g);
  if (!nums) return null;
  const result = nums.map(n => SOCIAL_STATUSES[parseInt(n)]).filter(Boolean);
  return result.length ? result : null;
}

module.exports = {
  validateIIN,
  extractNumber,
  isYesAnswer,
  isNoAnswer,
  parseCreditTypes,
  parsePropertyTypes,
  parseSocialStatus,
};
