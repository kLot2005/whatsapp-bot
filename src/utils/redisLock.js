const Redis = require('ioredis');
const config = require('../../config');
const logger = require('./logger');

// Используем отдельный Redis-клиент для блокировок (чтобы не мешать сессиям)
const lockClient = new Redis(config.redis.url);

lockClient.on('error', (err) => logger.error('[RedisLock] Error', { error: err.message }));

const LOCK_PREFIX = 'lock:phone:';

/**
 * TTL блокировки в секундах.
 * Если обработка сообщения не завершилась за это время —
 * блокировка снимается автоматически (защита от deadlock).
 */
const LOCK_TTL_SECONDS = 15;

/**
 * Интервал (мс) между попытками захватить блокировку.
 */
const RETRY_INTERVAL_MS = 100;

/**
 * Максимальное время ожидания блокировки (мс).
 * Если за это время не удалось — сообщение игнорируется (throttle).
 */
const WAIT_TIMEOUT_MS = 5000;

/**
 * Захватить блокировку для номера телефона.
 * Использует SET NX EX — атомарная операция Redis.
 *
 * @param {string} phone - номер телефона (ключ блокировки)
 * @returns {Promise<string|null>} lockToken (нужен для releaseLock) или null если тайм-аут
 */
async function acquireLock(phone) {
    const key = LOCK_PREFIX + phone;
    // Уникальный токен — чтобы случайно не снять чужой lock
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const deadline = Date.now() + WAIT_TIMEOUT_MS;

    while (Date.now() < deadline) {
        // SET key token NX EX ttl — устанавливает только если ключа НЕТ
        const result = await lockClient.set(key, token, 'EX', LOCK_TTL_SECONDS, 'NX');
        if (result === 'OK') {
            return token; // Успешно захватили блокировку
        }
        // Ждём и пробуем снова
        await sleep(RETRY_INTERVAL_MS);
    }

    logger.warn(`[RedisLock] Timeout acquiring lock for ${phone} — skipping message`);
    return null; // Не удалось получить блокировку за WAIT_TIMEOUT_MS
}

/**
 * Освободить блокировку для номера телефона.
 * Проверяет токен — чтобы не снять блокировку другого обработчика.
 *
 * @param {string} phone
 * @param {string} token - токен, полученный от acquireLock
 */
async function releaseLock(phone, token) {
    const key = LOCK_PREFIX + phone;

    // Lua-скрипт: снимаем lock только если он принадлежит нам (атомарно)
    const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;
    await lockClient.eval(script, 1, key, token);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { acquireLock, releaseLock };
