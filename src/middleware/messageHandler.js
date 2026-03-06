const STATES = require('../fsm/states');
const { saveSession, deleteSession, addChatMessage } = require('../fsm/sessionManager');
const { sendText, sendButtons } = require('../integrations/whatsapp');
const { createLead } = require('../integrations/bitrix24');
const {
  validateIIN,
  extractNumber,
  isYesAnswer,
  isNoAnswer,
  parseCreditTypes,
  parsePropertyTypes,
  parseSocialStatus,
} = require('../utils/validators');
const {
  askEmpathy,
  askDigDeeper,
  askOfferConsultation,
  generateProblemSummary,
  detectConsultationConsent,
} = require('../integrations/gemini');

// ─── Вспомогательные функции ─────────────────────────────────────────────────

async function reply(phone, text) {
  return sendText(phone, text);
}

function isText(message) {
  return message.type === 'text';
}

function getText(message) {
  if (message.type === 'text') return message.text?.body?.trim() || '';
  if (message.type === 'interactive') {
    return (
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      ''
    );
  }
  return '';
}

// ─── Основной обработчик ─────────────────────────────────────────────────────

async function handleMessage(phone, message, session, isNew) {
  const text = getText(message);

  // ── Новая сессия — AI приветствует ────────────────────────────────────────
  if (isNew || session.state === STATES.NEW) {
    const welcome = [
      'Здравствуйте! 👋',
      'Вы написали в юридическую компанию *YCG – Защита прав заёмщиков* ⚖️',
      '',
      'Мы помогаем решить финансовые вопросы:',
      '📌 Восстановление платёжеспособности',
      '📌 Банкротство физических лиц',
      '📌 Переговоры с банками и МФО',
      '',
      'Расскажите, пожалуйста, с какой проблемой вы столкнулись? Мы постараемся вам помочь 🤝',
    ].join('\n');

    session.data.consultantStage = 'empathy';
    await saveSession(phone, session);
    await reply(phone, welcome);
    return;
  }

  // ─── FSM ─────────────────────────────────────────────────────────────────

  switch (session.state) {

    // ══════════════════════════════════════════════════════════════════════════
    // AI-КОНСУЛЬТАНТ (3 стадии через session.data.consultantStage)
    // ══════════════════════════════════════════════════════════════════════════
    case STATES.AI_CONSULTANT: {
      if (!isText(message) || !text) {
        await reply(phone, '⚠️ Пожалуйста, напишите ваш вопрос текстом.');
        break;
      }

      const stage = session.data.consultantStage || 'empathy';

      try {
        let aiReply;

        if (stage === 'empathy') {
          // Стадия 1: сочувствие + уточняющий вопрос
          aiReply = await askEmpathy(text, session.chatHistory);
          addChatMessage(session, 'user', text);
          addChatMessage(session, 'model', aiReply);
          session.data.consultantStage = 'dig_deeper';
          await saveSession(phone, session);
          await reply(phone, aiReply);

        } else if (stage === 'dig_deeper') {
          // Стадия 2: углубление в детали
          aiReply = await askDigDeeper(text, session.chatHistory);
          addChatMessage(session, 'user', text);
          addChatMessage(session, 'model', aiReply);
          session.data.consultantStage = 'offer_consultation';
          await saveSession(phone, session);
          await reply(phone, aiReply);

        } else if (stage === 'offer_consultation') {
          // Стадия 3: убеждение + предложение анкеты
          aiReply = await askOfferConsultation(text, session.chatHistory);
          addChatMessage(session, 'user', text);
          addChatMessage(session, 'model', aiReply);
          session.state = STATES.QUESTIONNAIRE;
          await saveSession(phone, session);
          await reply(phone, aiReply);
        }

      } catch (err) {
        console.error(`[AI/Consultant] Error for ${phone}:`, err.message);
        await reply(phone, '⚠️ Временные технические неполадки. Попробуйте написать снова.');
      }
      break;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // QUESTIONNAIRE — ожидание "Да/Нет" на анкету
    // ══════════════════════════════════════════════════════════════════════════
    case STATES.QUESTIONNAIRE: {
      const msg = text.toLowerCase().trim();

      if (isYesAnswer(msg)) {
        session.state = STATES.AWAITING_NAME;
        await saveSession(phone, session);
        await reply(phone,
          'Отлично! Давайте заполним краткую анкету 📝\n\n' +
          '🔹 *Введите ваше полное ФИО*\n' +
          'Формат: Фамилия Имя Отчество\n' +
          'Пример: *Иванов Иван Иванович*'
        );

      } else if (isNoAnswer(msg)) {
        await reply(phone, 'Хорошо, если передумаете — мы всегда готовы помочь! 🙏');

      } else {
        // Может клиент всё же соглашается в свободной форме
        const agreed = await detectConsultationConsent(text, session.chatHistory);
        if (agreed) {
          session.state = STATES.AWAITING_NAME;
          await saveSession(phone, session);
          await reply(phone,
            'Отлично! Давайте заполним краткую анкету 📝\n\n' +
            '🔹 *Введите ваше полное ФИО*\n' +
            'Формат: Фамилия Имя Отчество\n' +
            'Пример: *Иванов Иван Иванович*'
          );
        } else {
          await reply(phone, "Пожалуйста, ответьте *Да* или *Нет* 🙏");
        }
      }
      break;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ФИО
    // ══════════════════════════════════════════════════════════════════════════
    case STATES.AWAITING_NAME: {
      if (!isText(message) || !text) {
        await reply(phone, '⚠️ Пожалуйста, введите ФИО текстом.');
        break;
      }

      const words = text.split(/\s+/).filter(Boolean);
      if (words.length < 2) {
        await reply(phone,
          '⚠️ Введите *полное ФИО* (минимум Фамилия и Имя):\n' +
          'Пример: *Иванов Иван Иванович*'
        );
        break;
      }

      const cleanName = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      session.data.name = cleanName;
      session.state = STATES.AWAITING_CITY;
      await saveSession(phone, session);
      await reply(phone, `✅ ФИО сохранено!\n📍 *В каком городе вы проживаете?*\nПример: *Астана* или *Алматы*`);
      break;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ГОРОД
    // ══════════════════════════════════════════════════════════════════════════
    case STATES.AWAITING_CITY: {
      if (!isText(message) || !text) {
        await reply(phone, '⚠️ Пожалуйста, напишите название города.');
        break;
      }

      const city = text.trim();
      if (city.length < 2 || city.length > 50 || !/^[\p{L}\s-]+$/u.test(city)) {
        await reply(phone,
          '❗ Укажите корректный город\n' +
          'Примеры: *Алматы*, *Астана*, *Шымкент*'
        );
        break;
      }

      session.data.city = city.charAt(0).toUpperCase() + city.slice(1);
      session.state = STATES.AWAITING_IIN;
      await saveSession(phone, session);
      await reply(phone,
        '✅ Город сохранён!\n\n' +
        '🪪 *Введите ваш ИИН*\n' +
        'Формат: 12 цифр без пробелов\n' +
        'Пример: *123456789012*'
      );
      break;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ИИН
    // ══════════════════════════════════════════════════════════════════════════
    case STATES.AWAITING_IIN: {
      if (!isText(message) || !text) {
        await reply(phone, '⚠️ Введите ИИН текстом.');
        break;
      }

      const cleanIIN = text.replace(/\D/g, '');
      if (!validateIIN(cleanIIN)) {
        await reply(phone,
          '❗ Неверный формат ИИН\n\n' +
          'Требования: ровно *12 цифр*, без пробелов\n' +
          'Пример: *123456789012*'
        );
        break;
      }

      session.data.iin = cleanIIN;
      session.state = STATES.AWAITING_CREDIT_TYPES;
      await saveSession(phone, session);
      await reply(phone,
        '✅ ИИН принят!\n\n' +
        '💳 *Выберите типы ваших кредитов:*\n' +
        '1. Потребительский кредит\n' +
        '2. Залоговый кредит\n' +
        '3. Автокредит\n' +
        '4. Ипотека\n' +
        '5. Микрозаймы\n' +
        '6. Долги перед физ.лицами\n' +
        '7. Алименты\n' +
        '8. Другое\n\n' +
        '📌 Можно выбрать несколько через запятую\n' +
        'Пример: *1, 3, 5*'
      );
      break;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ТИПЫ КРЕДИТОВ
    // ══════════════════════════════════════════════════════════════════════════
    case STATES.AWAITING_CREDIT_TYPES: {
      if (!isText(message) || !text) {
        await reply(phone, '⚠️ Выберите типы кредитов из списка.');
        break;
      }

      const creditTypes = parseCreditTypes(text);
      if (!creditTypes) {
        await reply(phone, '❗ Выберите из списка по номеру\nПример: *1, 3, 5*');
        break;
      }

      session.data.creditTypes = creditTypes;
      session.state = STATES.AWAITING_DEBT;
      await saveSession(phone, session);
      await reply(phone,
        '✅ Данные сохранены!\n\n' +
        '💰 *Укажите общую сумму задолженности* (в тенге)\n' +
        'Пример: *5 000 000*\n' +
        'Если не знаете точно — отправьте *-*'
      );
      break;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ОБЩИЙ ДОЛГ
    // ══════════════════════════════════════════════════════════════════════════
    case STATES.AWAITING_DEBT: {
      if (!isText(message) || !text) {
        await reply(phone, '⚠️ Введите сумму текстом.');
        break;
      }

      if (text.trim() !== '-') {
        const amount = extractNumber(text);
        if (amount === null) {
          await reply(phone, '❗ Не удалось распознать сумму\nПример: *5 000 000*\nИли отправьте *-* если не знаете');
          break;
        }
        session.data.debt = amount;
      }

      session.state = STATES.AWAITING_MONTHLY_PAYMENT;
      await saveSession(phone, session);
      await reply(phone,
        '✅ Записано!\n\n' +
        '📅 *Укажите ваш ежемесячный платёж по кредитам* (в тенге)\n' +
        'Пример: *120 000*\n' +
        'Если не знаете — отправьте *-*'
      );
      break;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ЕЖЕМЕСЯЧНЫЙ ПЛАТЁЖ
    // ══════════════════════════════════════════════════════════════════════════
    case STATES.AWAITING_MONTHLY_PAYMENT: {
      if (!isText(message) || !text) {
        await reply(phone, '⚠️ Введите сумму текстом.');
        break;
      }

      if (text.trim() !== '-') {
        const amount = extractNumber(text);
        if (amount === null) {
          await reply(phone, '❗ Не удалось распознать сумму\nПример: *120 000*\nИли отправьте *-*');
          break;
        }
        session.data.monthlyPayment = amount;
      }

      session.state = STATES.AWAITING_HAS_OVERDUE;
      await saveSession(phone, session);
      await reply(phone, '✅ Данные сохранены!\n\n🔹 *Есть ли у вас просрочки по кредитам?*\nОтветьте *Да* или *Нет*');
      break;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ПРОСРОЧКИ (да/нет)
    // ══════════════════════════════════════════════════════════════════════════
    case STATES.AWAITING_HAS_OVERDUE: {
      if (!isText(message) || !text) {
        await reply(phone, '⚠️ Ответьте Да или Нет.');
        break;
      }

      const msg = text.toLowerCase().trim();
      if (isYesAnswer(msg)) {
        session.data.hasOverdue = true;
        session.state = STATES.AWAITING_OVERDUE_DAYS;
        await saveSession(phone, session);
        await reply(phone, '🔹 *Укажите приблизительное количество дней просрочки:*');

      } else if (isNoAnswer(msg)) {
        session.data.hasOverdue = false;
        session.state = STATES.AWAITING_HAS_INCOME;
        await saveSession(phone, session);
        await reply(phone, '🔹 *Есть ли у вас официальный доход?*\nОтветьте *Да* или *Нет*');

      } else {
        await reply(phone, '❗ Пожалуйста, ответьте *Да* или *Нет*');
      }
      break;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // КОЛИЧЕСТВО ДНЕЙ ПРОСРОЧКИ
    // ══════════════════════════════════════════════════════════════════════════
    case STATES.AWAITING_OVERDUE_DAYS: {
      if (!isText(message) || !text) {
        await reply(phone, '⚠️ Введите количество дней.');
        break;
      }

      session.data.overdueDays = text.trim();
      session.state = STATES.AWAITING_HAS_INCOME;
      await saveSession(phone, session);
      await reply(phone, '✅ Записано!\n\n🔹 *Есть ли у вас официальный доход?*\nОтветьте *Да* или *Нет*');
      break;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ОФИЦИАЛЬНЫЙ ДОХОД
    // ══════════════════════════════════════════════════════════════════════════
    case STATES.AWAITING_HAS_INCOME: {
      if (!isText(message) || !text) {
        await reply(phone, '⚠️ Ответьте Да или Нет.');
        break;
      }

      const msg = text.toLowerCase().trim();
      if (isYesAnswer(msg)) {
        session.data.hasIncome = true;
      } else if (isNoAnswer(msg)) {
        session.data.hasIncome = false;
      } else {
        await reply(phone, '❗ Пожалуйста, ответьте *Да* или *Нет*');
        break;
      }

      session.state = STATES.AWAITING_HAS_BUSINESS;
      await saveSession(phone, session);
      await reply(phone, '🔹 *Имеется ли у вас ТОО или ИП?*\nОтветьте *Да* или *Нет*');
      break;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ТОО/ИП (БИЗНЕС)
    // ══════════════════════════════════════════════════════════════════════════
    case STATES.AWAITING_HAS_BUSINESS: {
      if (!isText(message) || !text) {
        await reply(phone, '⚠️ Ответьте Да или Нет.');
        break;
      }

      const msg = text.toLowerCase().trim();
      if (isYesAnswer(msg)) {
        session.data.hasBusiness = true;
      } else if (isNoAnswer(msg)) {
        session.data.hasBusiness = false;
      } else {
        await reply(phone, '❗ Пожалуйста, ответьте *Да* или *Нет*');
        break;
      }

      session.state = STATES.AWAITING_HAS_PROPERTY;
      await saveSession(phone, session);
      await reply(phone, '🔹 *Имеется ли у вас имущество?*\nОтветьте *Да* или *Нет*');
      break;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // НАЛИЧИЕ ИМУЩЕСТВА
    // ══════════════════════════════════════════════════════════════════════════
    case STATES.AWAITING_HAS_PROPERTY: {
      if (!isText(message) || !text) {
        await reply(phone, '⚠️ Ответьте Да или Нет.');
        break;
      }

      const msg = text.toLowerCase().trim();
      if (isYesAnswer(msg)) {
        session.data.hasProperty = true;
        session.state = STATES.AWAITING_PROPERTY_TYPES;
        await saveSession(phone, session);
        await reply(phone,
          '🔹 *Выберите типы вашего имущества:*\n' +
          '1. Дом\n2. Квартира\n3. Гараж\n4. Доля\n' +
          '5. Автомобиль\n6. Акции\n7. Другое\n\n' +
          '📌 Можно несколько через запятую\n' +
          'Пример: *1, 3, 5*'
        );

      } else if (isNoAnswer(msg)) {
        session.data.hasProperty = false;
        session.state = STATES.AWAITING_HAS_SPOUSE;
        await saveSession(phone, session);
        await reply(phone, '🔹 *Есть ли у вас супруг(а)?*\nОтветьте *Да* или *Нет*');

      } else {
        await reply(phone, '❗ Пожалуйста, ответьте *Да* или *Нет*');
      }
      break;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ТИПЫ ИМУЩЕСТВА
    // ══════════════════════════════════════════════════════════════════════════
    case STATES.AWAITING_PROPERTY_TYPES: {
      if (!isText(message) || !text) {
        await reply(phone, '⚠️ Выберите типы из списка.');
        break;
      }

      const types = parsePropertyTypes(text);
      if (!types) {
        await reply(phone, '❗ Выберите из списка по номеру\nПример: *1, 3, 5*');
        break;
      }

      session.data.propertyTypes = types;
      session.state = STATES.AWAITING_HAS_SPOUSE;
      await saveSession(phone, session);
      await reply(phone, '✅ Данные сохранены!\n\n🔹 *Есть ли у вас супруг(а)?*\nОтветьте *Да* или *Нет*');
      break;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // СУПРУГ(А)
    // ══════════════════════════════════════════════════════════════════════════
    case STATES.AWAITING_HAS_SPOUSE: {
      if (!isText(message) || !text) {
        await reply(phone, '⚠️ Ответьте Да или Нет.');
        break;
      }

      const msg = text.toLowerCase().trim();
      if (isYesAnswer(msg)) {
        session.data.hasSpouse = true;
      } else if (isNoAnswer(msg)) {
        session.data.hasSpouse = false;
      } else {
        await reply(phone, '❗ Пожалуйста, ответьте *Да* или *Нет*');
        break;
      }

      session.state = STATES.AWAITING_HAS_CHILDREN;
      await saveSession(phone, session);
      await reply(phone, '🔹 *Есть ли у вас несовершеннолетние дети?*\nОтветьте *Да* или *Нет*');
      break;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ДЕТИ
    // ══════════════════════════════════════════════════════════════════════════
    case STATES.AWAITING_HAS_CHILDREN: {
      if (!isText(message) || !text) {
        await reply(phone, '⚠️ Ответьте Да или Нет.');
        break;
      }

      const msg = text.toLowerCase().trim();
      if (isYesAnswer(msg)) {
        session.data.hasChildren = true;
      } else if (isNoAnswer(msg)) {
        session.data.hasChildren = false;
      } else {
        await reply(phone, '❗ Пожалуйста, ответьте *Да* или *Нет*');
        break;
      }

      session.state = STATES.AWAITING_SOCIAL_STATUS;
      await saveSession(phone, session);
      await reply(phone,
        '🔹 *Выберите ваш социальный статус:*\n' +
        '1. Лицо с инвалидностью\n' +
        '2. Получатель АСП\n' +
        '3. Многодетная семья\n' +
        '4. Иные пособия/льготы\n' +
        '5. Не отношусь к льготным категориям\n\n' +
        '📌 Можно несколько через запятую\n' +
        'Пример: *2, 3* или просто *5*'
      );
      break;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // СОЦИАЛЬНЫЙ СТАТУС → ЗАВЕРШЕНИЕ
    // ══════════════════════════════════════════════════════════════════════════
    case STATES.AWAITING_SOCIAL_STATUS: {
      if (!isText(message) || !text) {
        await reply(phone, '⚠️ Выберите статус из списка.');
        break;
      }

      const statuses = parseSocialStatus(text);
      if (!statuses) {
        await reply(phone, '❗ Выберите из списка по номеру\nПример: *1, 2, 3* или *5*');
        break;
      }

      session.data.socialStatus = statuses;
      session.state = STATES.DONE;
      await saveSession(phone, session);

      // Отправляем подтверждение
      await reply(phone,
        '✅ *Спасибо! Анкета успешно заполнена.*\n\n' +
        'Наш специалист свяжется с вами в ближайшее рабочее время.\n' +
        '⏱ Пн–Пт, 9:00–18:00 (Астана)'
      );

      // Генерируем краткое описание проблемы через AI
      let problemSummary = '';
      try {
        problemSummary = await generateProblemSummary(session.chatHistory);
        session.data.problemSummary = problemSummary;
        await saveSession(phone, session);
      } catch (err) {
        console.error(`[AI/Summary] Error for ${phone}:`, err.message);
      }

      // Отправляем лид в Bitrix24
      try {
        const leadId = await createLead(session.data, phone);
        console.log(`[Bot] Lead created in Bitrix24. ID: ${leadId}, Phone: ${phone}`);
        console.log('data', session.data);
      } catch (err) {
        console.error(`[Bot] Bitrix24 lead creation failed for ${phone}:`, err.message);
      }

      break;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // DONE — анкета уже заполнена
    // ══════════════════════════════════════════════════════════════════════════
    case STATES.DONE: {
      await reply(phone, 'Ваша заявка уже передана специалистам. Ожидайте, с вами свяжутся в ближайшее время 🙏');
      break;
    }

    default: {
      console.warn(`[Bot] Unknown state: ${session.state} for ${phone}`);
      await deleteSession(phone);
      await reply(phone,
        'Здравствуйте! 👋 Вы написали в *YCG – Защита прав заёмщиков*.\n' +
        'Расскажите, с какой проблемой вы столкнулись?'
      );
    }
  }
}

module.exports = { handleMessage };
