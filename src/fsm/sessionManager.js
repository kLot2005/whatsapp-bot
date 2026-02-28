const Redis = require('ioredis');
const config = require('../../config');
const STATES = require('../fsm/states');

const redis = new Redis(config.redis.url);

redis.on('connect', () => console.log('[Redis] Connected'));
redis.on('error', (err) => console.error('[Redis] Error:', err));

const SESSION_PREFIX = 'session:';

/**
 * Получить сессию пользователя по номеру телефона
 * @param {string} phone - номер телефона в международном формате
 * @returns {Promise<Object|null>}
 */
async function getSession(phone) {
  const key = SESSION_PREFIX + phone;
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

/**
 * Создать новую сессию
 * @param {string} phone
 * @returns {Promise<Object>}
 */
async function createSession(phone) {
  const session = {
    phone,
    state: STATES.AWAITING_START,
    data: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveSession(phone, session);
  return session;
}

/**
 * Сохранить/обновить сессию (обновляет TTL)
 * @param {string} phone
 * @param {Object} session
 */
async function saveSession(phone, session) {
  const key = SESSION_PREFIX + phone;
  session.updatedAt = new Date().toISOString();
  await redis.setex(key, config.session.ttlSeconds, JSON.stringify(session));
}

/**
 * Удалить сессию
 * @param {string} phone
 */
async function deleteSession(phone) {
  const key = SESSION_PREFIX + phone;
  await redis.del(key);
}

/**
 * Получить или создать сессию
 * @param {string} phone
 * @returns {Promise<{session: Object, isNew: boolean}>}
 */
async function getOrCreateSession(phone) {
  let session = await getSession(phone);
  if (!session) {
    session = await createSession(phone);
    return { session, isNew: true };
  }
  return { session, isNew: false };
}

module.exports = { getSession, createSession, saveSession, deleteSession, getOrCreateSession };
