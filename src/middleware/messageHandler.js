const STATES = require('../fsm/states');
const { saveSession, deleteSession, addChatMessage } = require('../fsm/sessionManager');
const { sendText, sendButtons } = require('../integrations/whatsapp');
const { createLead } = require('../integrations/bitrix24');
const { validateIIN, validateDebt, normalizeDebt } = require('../utils/validators');
const { askGemini } = require('../integrations/gemini');

// ─── Контекстные подсказки для Gemini по каждому состоянию FSM ─────────────

const STATE_CONTEXT = {
  [STATES.AWAITING_START]: 'Клиент ещё не начал анкету. Тебе нужно чтобы он нажал кнопку "Начать". НЕ говори что запишешь его — ты только помогаешь заполнить анкету.',
  [STATES.AWAITING_CONSENT]: 'Клиент должен дать согласие на обработку персональных данных. Кнопки: "Согласен(на)" или "Отказ". Объясни зачем нужны данные, но НЕ обещай записать на приём.',
  [STATES.AWAITING_NAME]: 'Ожидаем ФИО клиента (Фамилия Имя Отчество). Верни к вводу ФИО. НЕ говори что потом "запишешь" или "зарегистрируешь".',
  [STATES.AWAITING_IIN]: 'Ожидаем ИИН клиента — 12-значный идентификационный номер Казахстана. Верни к вводу ИИН. НЕ обещай запись — просто собираем данные.',
  [STATES.AWAITING_PROPERTY]: 'Ожидаем ответ есть ли у клиента недвижимость или транспортное средство. Кнопки: "Есть имущество" или "Нет имущества". Верни к выбору.',
  [STATES.AWAITING_DEBT]: 'Ожидаем общую сумму долгов клиента в тенге (только цифры). Верни к вводу суммы долга. НЕ обещай когда юрист позвонит.',
  [STATES.AWAITING_PROBLEM]: 'Ожидаем описание проблемы клиента (коллекторы, суд, арест счёта и т.д.). Верни к описанию ситуации. Это последний шаг анкеты — после него заявка автоматически уйдёт юристам.',
  [STATES.COMPLETED]: 'Анкета заполнена. Заявка передана юристам. Ты можешь подробно отвечать на юридические вопросы. НЕ говори когда именно позвонит юрист — ты этого не знаешь. Скажи только что юрист свяжется в рабочее время.',
};

// ─── Вспомогательные функции отправки типовых сообщений ─────────────────────

async function sendWelcome(to) {
  return sendButtons(
    to,
    '👋 Здравствуйте! Это юридическая консультация онлайн.\n\nМы поможем вам разобраться с долгами, имуществом и другими правовыми вопросами.\n\nНажмите кнопку ниже, чтобы начать.',
    [{ id: 'start', title: '🚀 Начать' }],
    '⚖️ Юридическая фирма'
  );
}

async function sendConsentRequest(to) {
  return sendButtons(
    to,
    '🔒 *Согласие на обработку персональных данных*\n\nДля оказания юридической помощи нам необходимо собрать ваши персональные данные (ФИО, ИИН, контактный номер).\n\nДанные будут использованы исключительно для подготовки юридической консультации и не передаются третьим лицам.',
    [
      { id: 'agree', title: '✅ Согласен(на)' },
      { id: 'decline', title: '❌ Отказ' },
    ]
  );
}

async function sendNameRequest(to) {
  return sendText(to, '📝 Пожалуйста, введите ваше *ФИО* полностью (Фами    лия Имя Отчество):');
}

async function sendIINRequest(to) {
  return sendText(to, '🪪 Введите ваш *ИИН* (12 цифр):');
}

async function sendIINError(to) {
  return sendText(
    to,
    '❗ИИН введён неверно. ИИН должен состоять ровно из *12 цифр* и не содержать букв или пробелов.\n\nПожалуйста, попробуйте ещё раз:'
  );
}

async function sendPropertyRequest(to) {
  return sendButtons(
    to,
    '🏠 Есть ли у вас недвижимость или транспортное средство?',
    [
      { id: 'has_property', title: '🏡 Есть имущество' },
      { id: 'no_property', title: '🚫 Нет имущества' },
    ]
  );
}

async function sendDebtRequest(to) {
  return sendText(
    to,
    '💰 Укажите *общую сумму ваших долгов* в тенге (только цифры, например: 5000000):'
  );
}

async function sendDebtError(to) {
  return sendText(
    to,
    '❗Пожалуйста, введите сумму *только цифрами* (например: 3500000):'
  );
}

async function sendProblemRequest(to) {
  return sendText(
    to,
    '📋 Опишите вашу ситуацию подробнее:\n\n_Что произошло? Есть ли судебные решения, звонки коллекторов, арест счётов и т.д._'
  );
}

async function sendNonTextWarning(to) {
  return sendText(
    to,
    '⚠️ Пожалуйста, ответьте *текстом* или нажмите на предложенную кнопку. Голосовые сообщения, фото и файлы на данном этапе не принимаются.'
  );
}

async function sendCompletionMessage(to) {
  return sendText(
    to,
    '✅ *Спасибо! Ваша заявка принята.*\n\nНаш юрист свяжется с вами в ближайшее время для проведения консультации.\n\n⏱ Время ответа: в рабочие дни с 9:00 до 18:00\n\n💬 Пока ждёте — можете задать мне любой вопрос по вашей ситуации.'
  );
}

async function sendDeclineMessage(to) {
  return sendText(
    to,
    '🙏 Понимаем ваше решение. Если вы передумаете, просто напишите нам снова.\n\nБез вашего согласия мы не можем продолжить оформление заявки.'
  );
}

// ─── AI-ответ с обработкой ошибок ───────────────────────────────────────────

/**
 * Получить ответ от Gemini и отправить клиенту
 * Если Gemini недоступен — отправляет fallback-сообщение
 */
async function sendAIResponse(phone, session, userText, contextHint = '') {
  try {
    // Добавляем имя клиента в подсказку если оно уже известно
    const nameHint = session.data?.name ? ` Клиента зовут ${session.data.name} — обращайся по имени.` : '';
    const fullContextHint = contextHint + nameHint;

    const aiReply = await askGemini(userText, session.chatHistory, fullContextHint);

    // Сохраняем обмен в историю
    addChatMessage(session, 'user', userText);
    addChatMessage(session, 'model', aiReply);

    await sendText(phone, aiReply);
    return true;
  } catch (err) {
    console.error(`[AI] Gemini error for ${phone}:`, err.message);
    return false;
  }
}

// ─── Основной обработчик сообщений ──────────────────────────────────────────

/**
 * Обработать входящее сообщение от пользователя
 * @param {string} phone - номер телефона отправителя
 * @param {Object} message - объект сообщения из WhatsApp API
 * @param {Object} session - текущая сессия пользователя
 * @param {boolean} isNew - является ли сессия новой
 */
async function handleMessage(phone, message, session, isNew) {
  const msgType = message.type;

  // Извлекаем текст из сообщения в зависимости от типа
  let text = null;
  let buttonId = null;

  if (msgType === 'text') {
    text = message.text?.body?.trim();
  } else if (msgType === 'interactive') {
    if (message.interactive?.type === 'button_reply') {
      buttonId = message.interactive.button_reply?.id;
      text = message.interactive.button_reply?.title;
    } else if (message.interactive?.type === 'list_reply') {
      buttonId = message.interactive.list_reply?.id;
      text = message.interactive.list_reply?.title;
    }
  }

  // Новая сессия — сразу отправляем приветствие
  if (isNew || session.state === STATES.NEW) {
    await sendWelcome(phone);
    return;
  }

  // ─── FSM: обработка состояний ───────────────────────────────────────────

  switch (session.state) {

    // ── Ожидание нажатия "Начать" ──────────────────────────────────────────
    case STATES.AWAITING_START: {
      if (buttonId === 'start') {
        session.state = STATES.AWAITING_CONSENT;
        await saveSession(phone, session);
        await sendConsentRequest(phone);
      } else if (text) {
        // Клиент пишет — AI отвечает и напоминает нажать кнопку
        const contextHint = STATE_CONTEXT[STATES.AWAITING_START];
        const aiSent = await sendAIResponse(phone, session, text, contextHint);
        await saveSession(phone, session);

        if (!aiSent) {
          await sendWelcome(phone);
        } else {
          // После AI-ответа повторяем кнопку через небольшую паузу
          await sendWelcome(phone);
        }
      } else {
        await sendWelcome(phone);
      }
      break;
    }

    // ── Ожидание согласия GDPR ─────────────────────────────────────────────
    case STATES.AWAITING_CONSENT: {
      if (buttonId === 'agree') {
        session.state = STATES.AWAITING_NAME;
        await saveSession(phone, session);
        await sendNameRequest(phone);
      } else if (buttonId === 'decline') {
        await deleteSession(phone);
        await sendDeclineMessage(phone);
      } else if (text) {
        // Клиент задаёт вопрос вместо выбора — AI отвечает
        const contextHint = STATE_CONTEXT[STATES.AWAITING_CONSENT];
        const aiSent = await sendAIResponse(phone, session, text, contextHint);
        await saveSession(phone, session);

        if (!aiSent) {
          await sendConsentRequest(phone);
        } else {
          await sendConsentRequest(phone);
        }
      } else {
        await sendConsentRequest(phone);
      }
      break;
    }

    // ── Сбор ФИО ────────────────────────────────────────────────────────────
    case STATES.AWAITING_NAME: {
      if (msgType !== 'text' || !text) {
        await sendNonTextWarning(phone);
        await sendNameRequest(phone);
        break;
      }

      // Проверяем: это похоже на ФИО (минимум 2 слова) или это вопрос?
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      const looksLikeName = wordCount >= 2 && !/[?!]/.test(text) && text.length < 80;

      if (looksLikeName) {
        // Принимаем как ФИО
        session.data.name = text;
        session.state = STATES.AWAITING_IIN;
        await saveSession(phone, session);
        await sendIINRequest(phone);
      } else {
        // Выглядит как вопрос или нерелевантный текст — передаём AI
        const contextHint = STATE_CONTEXT[STATES.AWAITING_NAME];
        const aiSent = await sendAIResponse(phone, session, text, contextHint);
        await saveSession(phone, session);

        if (!aiSent) {
          await sendNameRequest(phone);
        } else {
          await sendNameRequest(phone);
        }
      }
      break;
    }

    // ── Сбор и валидация ИИН ────────────────────────────────────────────────
    case STATES.AWAITING_IIN: {
      if (msgType !== 'text' || !text) {
        await sendNonTextWarning(phone);
        await sendIINRequest(phone);
        break;
      }

      if (validateIIN(text)) {
        // Валидный ИИН
        session.data.iin = text.trim();
        session.state = STATES.AWAITING_PROPERTY;
        await saveSession(phone, session);
        await sendPropertyRequest(phone);
      } else if (/^\d+$/.test(text.replace(/\s/g, ''))) {
        // Цифры, но неверный формат — стандартная ошибка
        await sendIINError(phone);
      } else {
        // Похоже на вопрос или текст — AI отвечает
        const contextHint = STATE_CONTEXT[STATES.AWAITING_IIN];
        const aiSent = await sendAIResponse(phone, session, text, contextHint);
        await saveSession(phone, session);

        if (!aiSent) {
          await sendIINRequest(phone);
        } else {
          await sendIINRequest(phone);
        }
      }
      break;
    }

    // ── Выбор наличия имущества ─────────────────────────────────────────────
    case STATES.AWAITING_PROPERTY: {
      if (buttonId === 'has_property') {
        session.data.property = 'Есть недвижимость/транспортное средство';
        session.state = STATES.AWAITING_DEBT;
        await saveSession(phone, session);
        await sendDebtRequest(phone);
      } else if (buttonId === 'no_property') {
        session.data.property = 'Имущество отсутствует';
        session.state = STATES.AWAITING_DEBT;
        await saveSession(phone, session);
        await sendDebtRequest(phone);
      } else if (text) {
        // Клиент пишет текст вместо кнопки — AI отвечает
        const contextHint = STATE_CONTEXT[STATES.AWAITING_PROPERTY];
        const aiSent = await sendAIResponse(phone, session, text, contextHint);
        await saveSession(phone, session);

        if (!aiSent) {
          await sendPropertyRequest(phone);
        } else {
          await sendPropertyRequest(phone);
        }
      } else {
        await sendNonTextWarning(phone);
        await sendPropertyRequest(phone);
      }
      break;
    }

    // ── Сбор суммы долга ────────────────────────────────────────────────────
    case STATES.AWAITING_DEBT: {
      if (msgType !== 'text' || !text) {
        await sendNonTextWarning(phone);
        await sendDebtRequest(phone);
        break;
      }

      if (validateDebt(text)) {
        session.data.debt = normalizeDebt(text);
        session.state = STATES.AWAITING_PROBLEM;
        await saveSession(phone, session);
        await sendProblemRequest(phone);
      } else if (/\d/.test(text) && text.length < 20) {
        // Есть цифры, но не прошли валидацию — стандартная ошибка
        await sendDebtError(phone);
      } else {
        // Выглядит как вопрос — AI отвечает
        const contextHint = STATE_CONTEXT[STATES.AWAITING_DEBT];
        const aiSent = await sendAIResponse(phone, session, text, contextHint);
        await saveSession(phone, session);

        if (!aiSent) {
          await sendDebtRequest(phone);
        } else {
          await sendDebtRequest(phone);
        }
      }
      break;
    }

    // ── Сбор описания проблемы ──────────────────────────────────────────────
    case STATES.AWAITING_PROBLEM: {
      if (msgType !== 'text' || !text) {
        await sendNonTextWarning(phone);
        await sendProblemRequest(phone);
        break;
      }

      // На этом этапе любой текст принимается — это и есть описание проблемы
      // НО если текст слишком короткий (< 10 символов) — AI просит уточнить
      if (text.length < 10) {
        const contextHint = 'Клиент прислал слишком короткое описание проблемы. Попроси описать подробнее что происходит: коллекторы, долги, суд и т.д.';
        const aiSent = await sendAIResponse(phone, session, text, contextHint);
        await saveSession(phone, session);
        if (!aiSent) await sendProblemRequest(phone);
        break;
      }

      session.data.problem = text;
      session.state = STATES.COMPLETED;
      await saveSession(phone, session);

      // Отправка данных в Bitrix24
      try {
        const leadId = await createLead(session.data, phone);
        console.log(`[Bot] Lead created in Bitrix24. ID: ${leadId}, Phone: ${phone}`);
      } catch (err) {
        console.error(`[Bot] Bitrix24 lead creation failed for ${phone}:`, err.message);
        // Не прерываем UX — клиент всё равно получит подтверждение
      }

      await sendCompletionMessage(phone);

      // AI сразу комментирует описание проблемы клиента
      try {
        const firstAIComment = await askGemini(
          text,
          [],
          'Анкета только что завершена. Клиент описал свою проблему. Дай краткий, сочувствующий и профессиональный комментарий по ситуации (2-4 предложения). Не давай юридических советов, напомни что юрист свяжется.'
        );
        addChatMessage(session, 'user', text);
        addChatMessage(session, 'model', firstAIComment);
        await saveSession(phone, session);
        await sendText(phone, firstAIComment);
      } catch (err) {
        console.error(`[AI] First comment error for ${phone}:`, err.message);
      }

      break;
    }

    // ── Режим AI-консультации после завершения анкеты ──────────────────────
    case STATES.COMPLETED: {
      if (msgType !== 'text' || !text) {
        await sendNonTextWarning(phone);
        break;
      }

      // Полноценная AI-консультация с историей диалога
      const contextHint = STATE_CONTEXT[STATES.COMPLETED];
      const aiSent = await sendAIResponse(phone, session, text, contextHint);
      await saveSession(phone, session);

      if (!aiSent) {
        await sendText(
          phone,
          '⚠️ Извините, AI-консультант временно недоступен. Наш юрист ответит вам в ближайшее время.'
        );
      }
      break;
    }

    default: {
      console.warn(`[Bot] Unknown state: ${session.state} for ${phone}`);
      await deleteSession(phone);
      await sendWelcome(phone);
    }
  }
}

module.exports = { handleMessage };
