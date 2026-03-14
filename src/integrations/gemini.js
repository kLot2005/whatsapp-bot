const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ─── Базовая конфигурация моделей ────────────────────────────────────────────

const consultantModel = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.65, topP: 0.95 },
});

const scriptModel = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.3, topP: 0.9 },
});

// ─── Вспомогательные функции ─────────────────────────────────────────────────

function formatHistory(history = []) {
    return history.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.text }],
    }));
}

async function chatWithHistory(model, systemPrompt, userMessage, history = []) {
    const modelWithSystem = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: model.generationConfig?.temperature ?? 0.5, topP: 0.95 },
        systemInstruction: systemPrompt,
    });
    const chat = modelWithSystem.startChat({ history: formatHistory(history) });
    const result = await chat.sendMessage(userMessage);
    return result.response.text();
}

// ─── Стадия 1: Сочувствие (empathy) ─────────────────────────────────────────

const EMPATHY_PROMPT = `РАЗГОВАРИВАЙ ВСЕГДА НА ВЫ
Ты — доброжелательный юридический консультант казахстанской компании YCG – Защита прав заёмщиков.
Клиент только что поделился своей финансовой проблемой.

Твоя задача:
1. Проявить искреннее сочувствие — покажи что понимаешь как это тяжело
2. Дать понять что такие ситуации решаемы, у вас есть опыт
3. Задать ОДИН уточняющий вопрос по ситуации — кратко и по делу
4. Попросить ответить одним сообщением

Стиль: человечный, тёплый, краткий. Максимум 200 символов.
Не называй себя AI. Ты — консультант YCG.`;

/**
 * Стадия 1: AI выражает сочувствие и задаёт уточняющий вопрос
 */
async function askEmpathy(userMessage, history = []) {
    try {
        return await chatWithHistory(consultantModel, EMPATHY_PROMPT, userMessage, history);
    } catch (error) {
        console.error('[Gemini/Empathy] Error:', error.message);
        throw error;
    }
}

// ─── Стадия 2: Углубление (dig deeper) ──────────────────────────────────────

const DIG_DEEPER_PROMPT = `РАЗГОВАРИВАЙ ВСЕГДА НА ВЫ
Ты — казахстанский юридический консультант YCG. Клиент рассказал о своей проблеме.

Твоя задача:
1. Опираясь на диалог — задай ОДИН конкретный уточняющий вопрос по делу
2. Вопрос должен быть полезен юристу: банк/МФО, наличие суда, сроки и т.д.
3. Не давай советов, только уточняй
4. Попроси ответить одним сообщением

Стиль: профессиональный, краткий. Максимум 200 символов.`;

/**
 * Стадия 2: AI уточняет детали проблемы
 */
async function askDigDeeper(userMessage, history = []) {
    try {
        return await chatWithHistory(consultantModel, DIG_DEEPER_PROMPT, userMessage, history);
    } catch (error) {
        console.error('[Gemini/DigDeeper] Error:', error.message);
        throw error;
    }
}

// ─── Стадия 3: Предложение консультации ─────────────────────────────────────

const OFFER_PROMPT = `Ты — ведущий казахстанский юрист-консультант YCG.

Твоя задача — написать убедительный ответ клиенту:
1. Кратко обозначь риски исходя из описанной ситуации (1-2 пункта)
2. Объясни что только после изучения документов можно предложить план
3. Предложи записаться на БЕСПЛАТНУЮ консультацию
4. НЕ задавай вопросов, только призыв к действию

Правила:
- Строго на ВЫ
- Жирный текст: *слово*
- Максимум 350 символов
- Акцент на бесплатность и срочность`;

/**
 * Стадия 3: AI убеждает и предлагает анкету
 * Postfix с вопросом "Да/Нет" добавляется автоматически
 */
async function askOfferConsultation(userMessage, history = []) {
    try {
        const reply = await chatWithHistory(consultantModel, OFFER_PROMPT, userMessage, history);
        return reply + '\n\n✅ Готовы заполнить краткую анкету для записи на *бесплатную* консультацию?\nНапишите *Да* или *Нет*';
    } catch (error) {
        console.error('[Gemini/Offer] Error:', error.message);
        throw error;
    }
}

// ─── Генерация описания проблемы для Bitrix24 ────────────────────────────────

const SUMMARY_PROMPT = `Создай краткое описание ситуации клиента для юристов.
Это сообщение пойдёт в Bitrix24 CRM.
Мы — казахстанская юридическая фирма YCG.

Требования:
- Используй ВСЕ предоставленные данные: и диалог, и заполненную анкету
- Структурированно: суть проблемы, кредиторы/типы долгов, суммы, просрочки, имущество, семейное положение, доход
- Без маркдауна (*), без звёздочек
- 4-6 предложений
- На русском языке`;

/**
 * Генерация структурированного описания проблемы на основе истории диалога
 * @param {Array} history - история AI-диалога [{role, text}]
 * @param {Object} formData - данные из анкеты (session.data)
 */
async function generateProblemSummary(history = [], formData = {}) {
    try {
        const historyText = history
            .map((m) => `${m.role === 'user' ? 'Клиент' : 'Консультант'}: ${m.text}`)
            .join('\n');

        // Форматируем данные анкеты в читаемый блок
        const formLines = [];
        if (formData.name) formLines.push(`ФИО: ${formData.name}`);
        if (formData.city) formLines.push(`Город: ${formData.city}`);
        if (formData.creditTypes) formLines.push(`Типы кредитов: ${formData.creditTypes}`);
        if (formData.debt != null) formLines.push(`Общий долг: ${Number(formData.debt).toLocaleString('ru-RU')} тг`);
        if (formData.monthlyPayment != null) formLines.push(`Ежемесячный платёж: ${Number(formData.monthlyPayment).toLocaleString('ru-RU')} тг`);
        if (formData.hasOverdue != null) {
            const overdue = formData.hasOverdue
                ? `Да${formData.overdueDays ? ` (${formData.overdueDays} дней)` : ''}`
                : 'Нет';
            formLines.push(`Просрочки: ${overdue}`);
        }
        if (formData.hasIncome != null) formLines.push(`Официальный доход: ${formData.hasIncome ? 'Да' : 'Нет'}`);
        if (formData.hasBusiness != null) formLines.push(`ТОО/ИП: ${formData.hasBusiness ? 'Да' : 'Нет'}`);
        if (formData.hasProperty != null) {
            const prop = formData.hasProperty
                ? `Да${formData.propertyTypes ? ` (${formData.propertyTypes})` : ''}`
                : 'Нет';
            formLines.push(`Имущество: ${prop}`);
        }
        if (formData.hasSpouse != null) formLines.push(`Супруг(а): ${formData.hasSpouse ? 'Да' : 'Нет'}`);
        if (formData.hasChildren != null) formLines.push(`Несовершеннолетние дети: ${formData.hasChildren ? 'Да' : 'Нет'}`);
        if (formData.socialStatus) formLines.push(`Социальный статус: ${formData.socialStatus}`);

        const formSection = formLines.length
            ? `\n\nДанные анкеты (заполнены клиентом):\n${formLines.join('\n')}`
            : '';

        const prompt = `${SUMMARY_PROMPT}\n\nДиалог с клиентом:\n${historyText}${formSection}\n\nОписание для юриста:`;
        const result = await scriptModel.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        console.error('[Gemini/Summary] Error:', error.message);
        return ''; // не критично — лид всё равно отправим
    }
}

// ─── Определение согласия на консультацию ────────────────────────────────────

/**
 * Проверяет по контексту согласился ли клиент на консультацию
 * Используется в AI_CONSULTANT как дополнительная проверка
 */
async function detectConsultationConsent(userMessage, history = []) {
    try {
        const historyText = history
            .slice(-6)
            .map((m) => `${m.role === 'user' ? 'Клиент' : 'Консультант'}: ${m.text}`)
            .join('\n');

        const prompt = `Определи: согласился ли клиент записаться на консультацию?

Диалог:
${historyText}
Клиент: ${userMessage}

YES — если клиент соглашается/просит записать/говорит да/жарайды/иә/ок/хорошо
NO — если отказывается, задаёт вопросы, описывает проблему

Ответ только YES или NO:`;

        const result = await scriptModel.generateContent(prompt);
        return result.response.text().trim().toUpperCase() === 'YES';
    } catch (error) {
        console.error('[Gemini/ConsentDetect] Error:', error.message);
        return false;
    }
}

// ─── Скрипт-бот (вспомогательные ответы во время анкеты) ────────────────────

const SCRIPT_SYSTEM = `Ты — AI-ассистент юридической фирмы YCG в Казахстане, работаешь через WhatsApp.
Ты помогаешь клиенту заполнить анкету. Отвечай на вопросы кратко (2-3 предложения) и возвращай к текущему шагу.
Строго на ВЫ. Не обещай записать — ты только собираешь данные.`;

async function askGemini(userMessage, history = [], contextHint = '') {
    try {
        const fullMessage = contextHint
            ? `[КОНТЕКСТ: ${contextHint}]\n\nСообщение клиента: ${userMessage}`
            : userMessage;
        return await chatWithHistory(scriptModel, SCRIPT_SYSTEM, fullMessage, history);
    } catch (error) {
        console.error('[Gemini] Error:', error.message);
        throw error;
    }
}

module.exports = {
    askEmpathy,
    askDigDeeper,
    askOfferConsultation,
    generateProblemSummary,
    detectConsultationConsent,
    askGemini,
};
