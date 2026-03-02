require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,

  whatsapp: {
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    apiUrl: `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
  },

  bitrix24: {
    webhookUrl: process.env.BITRIX24_WEBHOOK_URL,
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  session: {
    ttlSeconds: parseInt(process.env.SESSION_TTL_SECONDS) || 86400, // 24 hours
  },
};
