/**
 * Finite State Machine — состояния диалога бота
 */
const STATES = {
  NEW: 'NEW',                         // Новый пользователь / нет сессии
  AWAITING_START: 'AWAITING_START',   // Ожидание нажатия кнопки "Начать"
  AWAITING_CONSENT: 'AWAITING_CONSENT', // Ожидание согласия GDPR
  AWAITING_NAME: 'AWAITING_NAME',     // Ожидание ввода ФИО
  AWAITING_IIN: 'AWAITING_IIN',       // Ожидание ввода ИИН
  AWAITING_PROPERTY: 'AWAITING_PROPERTY', // Ожидание выбора имущества
  AWAITING_DEBT: 'AWAITING_DEBT',     // Ожидание ввода суммы долга
  AWAITING_PROBLEM: 'AWAITING_PROBLEM', // Ожидание описания проблемы
  COMPLETED: 'COMPLETED',             // Анкета завершена, режим AI-консультации
};

module.exports = STATES;
