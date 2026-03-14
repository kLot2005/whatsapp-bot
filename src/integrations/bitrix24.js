const axios = require('axios');
const config = require('../../config');

/**
 * Создать лид в Bitrix24:
 *  1. crm.lead.add  — с UF_CRM_* полями анкеты (видны прямо в карточке)
 *  2. crm.timeline.comment.add — полный текст анкеты в ленте активности
 *
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

  // ── Формируем полный текст анкеты для таймлайна ───────────────────────────
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

  const timelineComment = lines.join('\n');

  // ── Конвертация номера для Bitrix24: 787... → +77... ──────────────────────
  // Внутри бота номер хранится c префиксом 8 (787...) для Meta API.
  // В Bitrix24 нужен стандартный международный формат: +77...
  const bitrixPhone = phone.startsWith('78')
    ? '+7' + phone.substring(2)   // 787472151786 → +77472151786
    : '+' + phone;

  // ── Поля лида: стандартные + UF_CRM_* (кастомные) ─────────────────────────
  const leadFields = {
    TITLE: `Лид WhatsApp: ${name}`,
    NAME: name,
    PHONE: [{ VALUE: bitrixPhone, VALUE_TYPE: 'WORK' }],
    SOURCE_ID: 'WHATSAPP',
    STATUS_ID: 'NEW',

    // Кастомные поля (создать через: node scripts/setupBitrix24Fields.js)
    ...(city && { UF_CRM_WA_CITY: city }),
    ...(iin && { UF_CRM_WA_IIN: iin }),
    ...(creditTypes && { UF_CRM_WA_CREDIT_TYPES: Array.isArray(creditTypes) ? creditTypes.join(', ') : creditTypes }),
    ...(debt && { UF_CRM_WA_DEBT: debt }),
    ...(monthlyPayment && { UF_CRM_WA_MONTHLY_PAYMENT: monthlyPayment }),
    ...(hasOverdue !== undefined && { UF_CRM_WA_HAS_OVERDUE: hasOverdue ? '1' : '0' }),
    ...(overdueDays && { UF_CRM_WA_OVERDUE_DAYS: overdueDays }),
    ...(hasIncome !== undefined && { UF_CRM_WA_HAS_INCOME: hasIncome ? '1' : '0' }),
    ...(hasBusiness !== undefined && { UF_CRM_WA_HAS_BUSINESS: hasBusiness ? '1' : '0' }),
    ...(hasProperty !== undefined && { UF_CRM_WA_HAS_PROPERTY: hasProperty ? '1' : '0' }),
    ...(propertyTypes && { UF_CRM_WA_PROPERTY_TYPES: Array.isArray(propertyTypes) ? propertyTypes.join(', ') : propertyTypes }),
    ...(hasSpouse !== undefined && { UF_CRM_WA_HAS_SPOUSE: hasSpouse ? '1' : '0' }),
    ...(hasChildren !== undefined && { UF_CRM_WA_HAS_CHILDREN: hasChildren ? '1' : '0' }),
    ...(socialStatus && { UF_CRM_WA_SOCIAL_STATUS: Array.isArray(socialStatus) ? socialStatus.join(', ') : socialStatus }),
  };

  const baseUrl = config.bitrix24.webhookUrl;

  try {
    // 1. Создаём лид с UF_ полями
    const leadRes = await axios.post(`${baseUrl}/crm.lead.add.json`, { fields: leadFields });
    if (leadRes.data.error) {
      throw new Error(`Bitrix24 API error: ${leadRes.data.error_description}`);
    }

    const leadId = leadRes.data.result;
    console.log(`[Bitrix24] Lead created. ID: ${leadId}, Phone: ${phone}`);

    // 2. Добавляем полный текст анкеты в таймлайн (лента активности)
    try {
      await axios.post(`${baseUrl}/crm.timeline.comment.add.json`, {
        fields: {
          ENTITY_ID: leadId,
          ENTITY_TYPE: 'lead',
          COMMENT: timelineComment,
        },
      });
      console.log(`[Bitrix24] Timeline comment added for lead ID: ${leadId}`);
    } catch (commentErr) {
      console.warn(`[Bitrix24] Failed to add timeline comment:`, commentErr.response?.data || commentErr.message);
    }

    return leadId;
  } catch (error) {
    const errMsg = error.response?.data || error.message;
    console.error('[Bitrix24] Failed to create lead:', errMsg);
    throw error;
  }
}

module.exports = { createLead };
