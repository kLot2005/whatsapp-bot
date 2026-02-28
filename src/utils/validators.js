/**
 * Валидация ИИН (Индивидуальный Идентификационный Номер Казахстана)
 * Правила: ровно 12 цифр, только числа
 * @param {string} value
 * @returns {boolean}
 */
function validateIIN(value) {
  return /^\d{12}$/.test(value.trim());
}

/**
 * Валидация суммы долга — число (целое или с запятой/точкой)
 * @param {string} value
 * @returns {boolean}
 */
function validateDebt(value) {
  return /^\d[\d\s.,]*$/.test(value.trim());
}

/**
 * Нормализовать сумму долга (убрать пробелы, заменить запятую на точку)
 * @param {string} value
 * @returns {string}
 */
function normalizeDebt(value) {
  return value.trim().replace(/\s/g, '').replace(',', '.');
}

module.exports = { validateIIN, validateDebt, normalizeDebt };
