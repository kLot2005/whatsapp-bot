const Redis = require('ioredis');
const config = require('../../config');
const { createLead } = require('../integrations/bitrix24');
const logger = require('./logger');

const queueClient = new Redis(config.redis.url);
queueClient.on('error', (err) => logger.error('[RetryQueue] Redis error', { error: err.message }));

const QUEUE_KEY = 'retry_queue';
const DEAD_LETTER_KEY = 'retry_queue_dead';

/**
 * Задержки перед повторной попыткой (в миллисекундах)
 * attempt 1 → 1 мин, 2 → 5 мин, 3 → 15 мин, 4 → 1 час, 5+ → dead letter
 */
const BACKOFF_DELAYS_MS = [
    1 * 60 * 1000,   // 1 мин
    5 * 60 * 1000,   // 5 мин
    15 * 60 * 1000,  // 15 мин
    60 * 60 * 1000,  // 1 час
];

const MAX_ATTEMPTS = BACKOFF_DELAYS_MS.length + 1; // 5 попыток, 5-я → dead letter

/**
 * Добавить задачу в очередь повторных попыток.
 *
 * @param {string} type - тип задачи (например, 'createLead')
 * @param {Object} payload - данные задачи ({ data, phone })
 * @param {number} [attempts=0] - кол-во уже сделанных попыток
 */
async function enqueueJob(type, payload, attempts = 0) {
    const delayMs = BACKOFF_DELAYS_MS[attempts] ?? BACKOFF_DELAYS_MS.at(-1);

    const job = {
        type,
        payload,
        attempts,
        maxAttempts: MAX_ATTEMPTS,
        nextRetryAt: Date.now() + delayMs,
        enqueuedAt: new Date().toISOString(),
    };

    await queueClient.rpush(QUEUE_KEY, JSON.stringify(job));
    logger.info(`[RetryQueue] Job enqueued: ${type} for ${payload.phone}, attempt ${attempts + 1}/${MAX_ATTEMPTS}, retry in ${delayMs / 1000}s`);
}

/**
 * Обработать очередь: взять все задачи, выполнить готовые,
 * вернуть ещё-не-готовые обратно.
 * Вызывается по интервалу из app.js.
 */
async function processQueue() {
    // Берём длину очереди на момент начала — не уходим в бесконечный цикл
    const queueLength = await queueClient.llen(QUEUE_KEY);
    if (queueLength === 0) return;

    logger.info(`[RetryQueue] Processing ${queueLength} job(s)...`);

    for (let i = 0; i < queueLength; i++) {
        // Берём задачу с головы очереди
        const raw = await queueClient.lpop(QUEUE_KEY);
        if (!raw) break;

        let job;
        try {
            job = JSON.parse(raw);
        } catch {
            logger.error('[RetryQueue] Failed to parse job, discarding', { raw });
            continue;
        }

        // Ещё не время — возвращаем в хвост очереди и пропускаем
        if (Date.now() < job.nextRetryAt) {
            await queueClient.rpush(QUEUE_KEY, raw);
            continue;
        }

        // Обрабатываем задачу
        const success = await executeJob(job);

        if (!success) {
            const nextAttempt = job.attempts + 1;

            if (nextAttempt >= MAX_ATTEMPTS) {
                // Исчерпали все попытки — в dead letter
                await queueClient.rpush(DEAD_LETTER_KEY, JSON.stringify({ ...job, failedAt: new Date().toISOString() }));
                logger.error(`[RetryQueue] Job moved to dead letter queue: ${job.type} for ${job.payload.phone}`);
            } else {
                // Повторим позже
                await enqueueJob(job.type, job.payload, nextAttempt);
            }
        }
    }
}

/**
 * Выполнить конкретную задачу.
 * @returns {boolean} true — успех, false — нужен повтор
 */
async function executeJob(job) {
    try {
        if (job.type === 'createLead') {
            const { data, phone } = job.payload;
            const leadId = await createLead(data, phone);
            logger.info(`[RetryQueue] Job succeeded: createLead, lead ID: ${leadId}, phone: ${job.payload.phone}`);
            return true;
        }

        logger.warn(`[RetryQueue] Unknown job type: ${job.type}`);
        return true; // Неизвестный тип — не ретраить бесконечно
    } catch (err) {
        logger.error(`[RetryQueue] Job failed (attempt ${job.attempts + 1}): ${job.type} — ${err.message}`);
        return false;
    }
}

module.exports = { enqueueJob, processQueue };
