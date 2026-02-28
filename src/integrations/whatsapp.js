const axios = require('axios');
const config = require('../../config');

const apiClient = axios.create({
  baseURL: config.whatsapp.apiUrl,
  headers: {
    Authorization: `Bearer ${config.whatsapp.token}`,
    'Content-Type': 'application/json',
  },
});

/**
 * Базовый метод отправки сообщения через WhatsApp Cloud API
 */
async function sendRequest(payload) {
  try {
    const response = await apiClient.post('', payload);
    return response.data;
  } catch (error) {
    const errData = error.response?.data || error.message;
    console.error('[WhatsApp API] Error:', JSON.stringify(errData, null, 2));
    throw error;
  }
}

/**
 * Отправить обычное текстовое сообщение
 * @param {string} to - номер телефона
 * @param {string} text - текст сообщения
 */
async function sendText(to, text) {
  return sendRequest({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text },
  });
}

/**
 * Отправить сообщение с интерактивными кнопками (до 3 кнопок)
 *
 * Пример payload:
 * {
 *   "messaging_product": "whatsapp",
 *   "to": "77001234567",
 *   "type": "interactive",
 *   "interactive": {
 *     "type": "button",
 *     "body": { "text": "Вы согласны с условиями?" },
 *     "action": {
 *       "buttons": [
 *         { "type": "reply", "reply": { "id": "agree", "title": "Согласен ✅" } },
 *         { "type": "reply", "reply": { "id": "decline", "title": "Отказ ❌" } }
 *       ]
 *     }
 *   }
 * }
 *
 * @param {string} to
 * @param {string} bodyText - текст сообщения
 * @param {Array<{id: string, title: string}>} buttons - массив кнопок
 * @param {string} [headerText] - заголовок (опционально)
 * @param {string} [footerText] - подвал (опционально)
 */
async function sendButtons(to, bodyText, buttons, headerText = null, footerText = null) {
  const interactive = {
    type: 'button',
    body: { text: bodyText },
    action: {
      buttons: buttons.map((btn) => ({
        type: 'reply',
        reply: { id: btn.id, title: btn.title },
      })),
    },
  };

  if (headerText) {
    interactive.header = { type: 'text', text: headerText };
  }
  if (footerText) {
    interactive.footer = { text: footerText };
  }

  return sendRequest({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive,
  });
}

/**
 * Отправить сообщение со списком (List Message) — до 10 пунктов
 *
 * Пример payload:
 * {
 *   "messaging_product": "whatsapp",
 *   "to": "77001234567",
 *   "type": "interactive",
 *   "interactive": {
 *     "type": "list",
 *     "header": { "type": "text", "text": "Выберите услугу" },
 *     "body": { "text": "Нажмите кнопку ниже и выберите нужный пункт" },
 *     "footer": { "text": "Юридическая фирма" },
 *     "action": {
 *       "button": "Открыть список",
 *       "sections": [
 *         {
 *           "title": "Категории",
 *           "rows": [
 *             { "id": "bankruptcy", "title": "Банкротство", "description": "Списание долгов через суд" },
 *             { "id": "realty", "title": "Недвижимость", "description": "Сделки с имуществом" }
 *           ]
 *         }
 *       ]
 *     }
 *   }
 * }
 *
 * @param {string} to
 * @param {string} bodyText
 * @param {string} buttonLabel - текст на кнопке открытия списка
 * @param {Array<{title: string, rows: Array<{id, title, description?}>}>} sections
 * @param {string} [headerText]
 * @param {string} [footerText]
 */
async function sendList(to, bodyText, buttonLabel, sections, headerText = null, footerText = null) {
  const interactive = {
    type: 'list',
    body: { text: bodyText },
    action: { button: buttonLabel, sections },
  };

  if (headerText) {
    interactive.header = { type: 'text', text: headerText };
  }
  if (footerText) {
    interactive.footer = { text: footerText };
  }

  return sendRequest({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive,
  });
}

module.exports = { sendText, sendButtons, sendList };
