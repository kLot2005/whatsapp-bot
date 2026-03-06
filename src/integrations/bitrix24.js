const axios = require('axios');
const config = require('../../config');

/**
 * Создать лид в Bitrix24 с расширенным набором полей анкеты
 * @param {Object} data - данные из session.data
 * @param {string} phone - номер телефона клиента
 * @returns {Promise<number>} ID созданного лида
 */
async function createLead(data, phone) {
  const {
    name = 'Не указано',
    city,
    iin,
    creditTypes,
    debt,
    monthlyPayment,
    hasOverdue,
    overdueDays,
    hasIncome,
    hasBusiness,
    hasProperty,
    propertyTypes,
    hasSpouse,
    hasChildren,
    socialStatus,
    problemSummary,
  } = data;

  // ── Формируем читаемый комментарий ────────────────────────────────────────
  const lines = [
    `📋 АНКЕТА КЛИЕНТА WhatsApp`,
    `━━━━━━━━━━━━━━━━━━━━━━━`,
    `👤 ФИО: ${name}`,
    city && `📍 Город: ${city}`,
    iin && `🪪 ИИН: ${iin}`,
    `━━━━━━━━━━━━━━━━━━━━━━━`,
    creditTypes && `💳 Типы кредитов: ${Array.isArray(creditTypes) ? creditTypes.join(', ') : creditTypes}`,
    debt && `💰 Общий долг: ${debt} тг`,
    monthlyPayment && `📅 Ежемесячный платёж: ${monthlyPayment} тг`,
    hasOverdue !== undefined && `⚠️ Просрочки: ${hasOverdue ? 'Да' : 'Нет'}`,
    overdueDays && `📆 Дней просрочки: ${overdueDays}`,
    `━━━━━━━━━━━━━━━━━━━━━━━`,
    hasIncome !== undefined && `💼 Официальный доход: ${hasIncome ? 'Есть' : 'Нет'}`,
    hasBusiness !== undefined && `🏢 ТОО/ИП: ${hasBusiness ? 'Есть' : 'Нет'}`,
    hasProperty !== undefined && `🏠 Имущество: ${hasProperty ? 'Есть' : 'Нет'}`,
    propertyTypes && `🏡 Типы имущества: ${Array.isArray(propertyTypes) ? propertyTypes.join(', ') : propertyTypes}`,
    hasSpouse !== undefined && `💑 Супруг(а): ${hasSpouse ? 'Есть' : 'Нет'}`,
    hasChildren !== undefined && `👶 Дети: ${hasChildren ? 'Есть' : 'Нет'}`,
    socialStatus && `🎗️ Соц. статус: ${Array.isArray(socialStatus) ? socialStatus.join(', ') : socialStatus}`,
  ].filter(Boolean);

  if (problemSummary) {
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━━`, `📝 Описание проблемы:`, problemSummary);
  }

  const comments = lines.join('\n');

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
    console.log(`[Bitrix24] Lead created. ID: ${leadId}, Phone: ${phone}`);
    return leadId;
  } catch (error) {
    const errMsg = error.response?.data || error.message;
    console.log(leadFields);
    console.error('[Bitrix24] Failed to create lead:', errMsg);
    throw error;
  }
}

module.exports = { createLead };
