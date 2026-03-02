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
 * Утилита для обрезки строки до заданного лимита
 */
function truncate(str, limit) {
  if (!str) return '';
  return str.length > limit ? str.substring(0, limit) : str;
}

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
 */
async function sendButtons(to, bodyText, buttons, headerText = null, footerText = null) {
  const interactive = {
    type: 'button',
    body: { text: bodyText },
    action: {
      buttons: buttons.slice(0, 3).map((btn) => ({
        type: 'reply',
        reply: {
          id: btn.id,
          title: truncate(btn.title, 20),
        },
      })),
    },
  };

  if (headerText) {
    interactive.header = { type: 'text', text: truncate(headerText, 60) };
  }
  if (footerText) {
    interactive.footer = { text: truncate(footerText, 60) };
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
 */
async function sendList(to, bodyText, buttonLabel, sections, headerText = null, footerText = null) {
  // Валидация и нормализация секций и строк
  const normalizedSections = sections.slice(0, 10).map((section) => ({
    title: truncate(section.title, 24),
    rows: (section.rows || []).slice(0, 10).map((row) => ({
      id: row.id,
      title: truncate(row.title, 24),
      description: truncate(row.description, 72),
    })),
  }));

  const interactive = {
    type: 'list',
    body: { text: bodyText },
    action: {
      button: truncate(buttonLabel, 20),
      sections: normalizedSections,
    },
  };

  if (headerText) {
    interactive.header = { type: 'text', text: truncate(headerText, 60) };
  }
  if (footerText) {
    interactive.footer = { text: truncate(footerText, 60) };
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
