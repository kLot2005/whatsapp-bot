/**
 * WhatsApp Legal Bot — Entry Point
 *
 * Обрабатывает:
 *  GET  /webhook  — верификация вебхука Meta
 *  POST /webhook  — входящие сообщения WhatsApp Cloud API
 */

require('dotenv').config();
const express = require('express');
const config = require('../config');
const { getOrCreateSession } = require('./fsm/sessionManager');
const { handleMessage } = require('./middleware/messageHandler');

const app = express();
app.use(express.json());

// ─── Верификация вебхука Meta (GET) ─────────────────────────────────────────

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    console.log('[Webhook] Verification successful');
    return res.status(200).send(challenge);
  }

  console.warn('[Webhook] Verification failed — token mismatch');
  return res.sendStatus(403);
});

// ─── Приём входящих сообщений (POST) ────────────────────────────────────────

app.post('/webhook', async (req, res) => {
  // Немедленно возвращаем 200, чтобы Meta не повторял запрос
  res.sendStatus(200);

  const body = req.body;

  // Проверяем что это событие WhatsApp
  if (body.object !== 'whatsapp_business_account') return;

  const entries = body.entry || [];

  for (const entry of entries) {
    const changes = entry.changes || [];

    for (const change of changes) {
      const value = change.value;

      // Пропускаем статусные обновления (доставлено, прочитано)
      if (value.statuses) continue;

      const messages = value.messages || [];

      for (const message of messages) {
        let phone = message.from; // Номер отправителя (например, 77472151786)

        // Глобальная нормализация номера для WhatsApp API и Bitrix24 (7 -> 78)
        if (phone.startsWith('7') && phone.length === 11) {
          phone = '78' + phone.substring(1);
        }

        console.log(`[Webhook] Incoming message from ${phone}, type: ${message.type}`);

        try {
          const { session, isNew } = await getOrCreateSession(phone);
          await handleMessage(phone, message, session, isNew);
        } catch (err) {
          console.error(`[Webhook] Error processing message from ${phone}:`, err.message);
        }
      }
    }
  }
});

// ─── Health check ────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.send('WhatsApp Bot is running!');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Запуск сервера ──────────────────────────────────────────────────────────

app.listen(config.port, () => {
  console.log(`[Server] WhatsApp Legal Bot running on port ${config.port}`);
  console.log(`[Server] Webhook URL: http://your-domain.com/webhook`);
});

module.exports = app;
