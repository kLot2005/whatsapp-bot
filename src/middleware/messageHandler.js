const STATES = require('../fsm/states');
const { saveSession, deleteSession } = require('../fsm/sessionManager');
const { sendText, sendButtons } = require('../integrations/whatsapp');
const { createLead } = require('../integrations/bitrix24');
const { validateIIN, validateDebt, normalizeDebt } = require('../utils/validators');

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
  return sendText(to, '📝 Пожалуйста, введите ваше *ФИО* полностью (Фамилия Имя Отчество):');
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
    '✅ *Спасибо! Ваша заявка принята.*\n\nНаш юрист свяжется с вами в ближайшее время для проведения консультации.\n\n⏱ Время ответа: в рабочие дни с 9:00 до 18:00'
  );
}

async function sendDeclineMessage(to) {
  return sendText(
    to,
    '🙏 Понимаем ваше решение. Если вы передумаете, просто напишите нам снова.\n\nБез вашего согласия мы не можем продолжить оформление заявки.'
  );
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

    // Ожидание нажатия "Начать"
    case STATES.AWAITING_START: {
      if (buttonId === 'start') {
        session.state = STATES.AWAITING_CONSENT;
        await saveSession(phone, session);
        await sendConsentRequest(phone);
      } else {
        // Пользователь пишет что-то — напоминаем нажать кнопку
        await sendWelcome(phone);
      }
      break;
    }

    // Ожидание согласия GDPR
    case STATES.AWAITING_CONSENT: {
      if (buttonId === 'agree') {
        session.state = STATES.AWAITING_NAME;
        await saveSession(phone, session);
        await sendNameRequest(phone);
      } else if (buttonId === 'decline') {
        await deleteSession(phone);
        await sendDeclineMessage(phone);
      } else {
        // Нажали не кнопку
        await sendConsentRequest(phone);
      }
      break;
    }

    // Сбор ФИО
    case STATES.AWAITING_NAME: {
      if (msgType !== 'text' || !text) {
        await sendNonTextWarning(phone);
        await sendNameRequest(phone);
        break;
      }
      session.data.name = text;
      session.state = STATES.AWAITING_IIN;
      await saveSession(phone, session);
      await sendIINRequest(phone);
      break;
    }

    // Сбор и валидация ИИН
    case STATES.AWAITING_IIN: {
      if (msgType !== 'text' || !text) {
        await sendNonTextWarning(phone);
        await sendIINRequest(phone);
        break;
      }
      if (!validateIIN(text)) {
        await sendIINError(phone);
        break;
      }
      session.data.iin = text.trim();
      session.state = STATES.AWAITING_PROPERTY;
      await saveSession(phone, session);
      await sendPropertyRequest(phone);
      break;
    }

    // Выбор наличия имущества
    case STATES.AWAITING_PROPERTY: {
      if (buttonId === 'has_property') {
        session.data.property = 'Есть недвижимость/транспортное средство';
      } else if (buttonId === 'no_property') {
        session.data.property = 'Имущество отсутствует';
      } else {
        await sendNonTextWarning(phone);
        await sendPropertyRequest(phone);
        break;
      }
      session.state = STATES.AWAITING_DEBT;
      await saveSession(phone, session);
      await sendDebtRequest(phone);
      break;
    }

    // Сбор суммы долга
    case STATES.AWAITING_DEBT: {
      if (msgType !== 'text' || !text) {
        await sendNonTextWarning(phone);
        await sendDebtRequest(phone);
        break;
      }
      if (!validateDebt(text)) {
        await sendDebtError(phone);
        break;
      }
      session.data.debt = normalizeDebt(text);
      session.state = STATES.AWAITING_PROBLEM;
      await saveSession(phone, session);
      await sendProblemRequest(phone);
      break;
    }

    // Сбор описания проблемы
    case STATES.AWAITING_PROBLEM: {
      if (msgType !== 'text' || !text) {
        await sendNonTextWarning(phone);
        await sendProblemRequest(phone);
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
      break;
    }

    // Сессия завершена — предлагаем начать заново
    case STATES.COMPLETED: {
      await deleteSession(phone);
      await sendWelcome(phone);
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
