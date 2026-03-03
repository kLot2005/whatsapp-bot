const { GoogleGenerativeAI } = require('@google/generative-ai');

// ─── Инициализация клиента ───────────────────────────────────────────────────

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: `Ты — AI-консультант юридической фирмы в Казахстане, работающий через WhatsApp.

ТВОЯ РОЛЬ:
- Ты помогаешь клиентам разобраться с юридическими вопросами: долги, банкротство, имущество, коллекторы, судебные решения, арест счётов
- Ты общаешься на языке клиента (русский или казахский)
- Ты профессиональный, но дружелюбный и понимающий

ТЕКУЩИЙ КОНТЕКСТ:
Ты ведёшь клиента по анкете для записи на юридическую консультацию. В процессе сбора данных клиент может задавать вопросы — ты кратко отвечаешь и мягко возвращаешь к текущему шагу анкеты.

ПРАВИЛА ПОВЕДЕНИЯ:
1. Если клиент задаёт юридический вопрос во время заполнения анкеты — дай краткий полезный ответ (2-4 предложения), затем обязательно верни к текущему шагу анкеты
2. Если клиент выражает беспокойство, страх, растерянность — сначала проявь эмпатию, затем объясни что поможешь, затем верни к анкете
3. Если клиент пишет что-то нерелевантное (привет, спасибо, ок и т.д.) — кратко ответь и верни к анкете
4. Никогда не давай юридических советов вместо консультации юриста — предлагай записаться
5. Не выдумывай законы или судебную практику — говори что уточнит юрист
6. Максимальная длина ответа: 300 символов в режиме анкетирования, 500 символов в режиме свободной консультации
7. Используй эмодзи умеренно для WhatsApp-формата

КАЗАХСТАНСКИЙ КОНТЕКСТ:
- ИИН — индивидуальный идентификационный номер (12 цифр)
- Банкротство физлиц регулируется законом РК
- Коллекторская деятельность лицензируется
- Гос. органы: ЕНПФ, судебные исполнители, ЦОН

После завершения анкеты ты переходишь в режим свободной консультации, где можешь подробно отвечать на вопросы клиента.`,
});

// ─── Вспомогательные функции ─────────────────────────────────────────────────

/**
 * Форматирует историю чата для Gemini API
 * @param {Array} history - массив {role: 'user'|'model', text: string}
 */
function formatHistory(history = []) {
    return history.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.text }],
    }));
}

/**
 * Отправить сообщение в Gemini с историей диалога
 * @param {string} userMessage - текст от пользователя
 * @param {Array} history - история предыдущих сообщений
 * @param {string} contextHint - подсказка о текущем состоянии FSM (опционально)
 * @returns {Promise<string>} - ответ модели
 */
async function askGemini(userMessage, history = [], contextHint = '') {
    try {
        const formattedHistory = formatHistory(history);

        const chat = model.startChat({
            history: formattedHistory,
        });

        // Если есть подсказка контекста — добавляем в начало сообщения пользователя
        const fullMessage = contextHint
            ? `[КОНТЕКСТ ДЛЯ AI: ${contextHint}]\n\nСообщение клиента: ${userMessage}`
            : userMessage;

        const result = await chat.sendMessage(fullMessage);
        const response = result.response.text();
        return response;
    } catch (error) {
        console.error('[Gemini] Error:', error.message);
        throw error;
    }
}

/**
 * Быстрый ответ без истории (для простых случаев)
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function quickAnswer(prompt) {
    try {
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        console.error('[Gemini] QuickAnswer Error:', error.message);
        throw error;
    }
}

module.exports = { askGemini, quickAnswer };
