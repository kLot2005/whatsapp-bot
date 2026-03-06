/**
 * Finite State Machine — состояния диалога бота
 */
const STATES = {
  NEW: 'NEW',                                   // Новый пользователь / нет сессии

  // ── AI-консультант (3 стадии через session.data.consultantStage) ──────────
  AI_CONSULTANT: 'AI_CONSULTANT',               // empathy → dig_deeper → offer_consultation

  // ── Переход к анкете ───────────────────────────────────────────────────────
  QUESTIONNAIRE: 'QUESTIONNAIRE',               // Ожидание "Да/Нет" на анкету

  // ── Шаги анкеты ───────────────────────────────────────────────────────────
  AWAITING_NAME: 'AWAITING_NAME',               // ФИО
  AWAITING_CITY: 'AWAITING_CITY',               // Город
  AWAITING_IIN: 'AWAITING_IIN',                 // ИИН (12 цифр)
  AWAITING_CREDIT_TYPES: 'AWAITING_CREDIT_TYPES', // Типы кредитов (множественный выбор)
  AWAITING_DEBT: 'AWAITING_DEBT',               // Общая сумма долга
  AWAITING_MONTHLY_PAYMENT: 'AWAITING_MONTHLY_PAYMENT', // Ежемесячный платёж
  AWAITING_HAS_OVERDUE: 'AWAITING_HAS_OVERDUE', // Есть ли просрочки (да/нет)
  AWAITING_OVERDUE_DAYS: 'AWAITING_OVERDUE_DAYS', // Кол-во дней просрочки (если есть)
  AWAITING_HAS_INCOME: 'AWAITING_HAS_INCOME',   // Есть ли официальный доход (да/нет)
  AWAITING_HAS_BUSINESS: 'AWAITING_HAS_BUSINESS', // Есть ли ТОО/ИП (да/нет)
  AWAITING_HAS_PROPERTY: 'AWAITING_HAS_PROPERTY', // Есть ли имущество (да/нет)
  AWAITING_PROPERTY_TYPES: 'AWAITING_PROPERTY_TYPES', // Типы имущества (если есть)
  AWAITING_HAS_SPOUSE: 'AWAITING_HAS_SPOUSE',   // Есть ли супруг(а) (да/нет)
  AWAITING_HAS_CHILDREN: 'AWAITING_HAS_CHILDREN', // Есть ли дети (да/нет)
  AWAITING_SOCIAL_STATUS: 'AWAITING_SOCIAL_STATUS', // Социальный статус (множественный выбор)

  DONE: 'DONE',                                 // Анкета завершена, лид отправлен в Bitrix24
};

module.exports = STATES;
