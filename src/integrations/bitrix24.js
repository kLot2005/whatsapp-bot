const axios = require('axios');
const config = require('../../config');

/**
 * Создать лид в Bitrix24 через входящий вебхук REST API
 *
 * Документация: https://dev.1c-bitrix.ru/rest_help/crm/leads/crm_lead_add.php
 *
 * @param {Object} sessionData - данные из сессии пользователя
 * @param {string} phone - номер телефона клиента
 * @returns {Promise<number>} ID созданного лида
 */
async function createLead(sessionData, phone) {
  const { name, iin, property, debt, problem } = sessionData;

  // Формируем структурированный комментарий
  const comments = [
    `📋 АНКЕТА КЛИЕНТА WhatsApp`,
    `━━━━━━━━━━━━━━━━━━━━━━━`,
    `👤 ФИО: ${name}`,
    `🪪 ИИН: ${iin}`,
    `🏠 Имущество: ${property}`,
    `💰 Сумма долга: ${debt} тенге`,
    `━━━━━━━━━━━━━━━━━━━━━━━`,
    `📝 Суть проблемы:`,
    problem,
  ].join('\n');

  const leadFields = {
    TITLE: `Лид WhatsApp: ${name}`,
    NAME: name,
    PHONE: [{ VALUE: phone, VALUE_TYPE: 'WORK' }],
    COMMENTS: comments,
    SOURCE_ID: 'WHATSAPP',
    STATUS_ID: 'NEW',
  };

  try {
    const url = `${config.bitrix24.webhookUrl}/crm.lead.add.json`;
    const response = await axios.post(url, { fields: leadFields });

    if (response.data.error) {
      throw new Error(`Bitrix24 API error: ${response.data.error_description}`);
    }

    const leadId = response.data.result;
    console.log(`[Bitrix24] Lead created successfully. ID: ${leadId}`);
    return leadId;
  } catch (error) {
    const errMsg = error.response?.data || error.message;
    console.error('[Bitrix24] Failed to create lead:', errMsg);
    throw error;
  }
}

module.exports = { createLead };
