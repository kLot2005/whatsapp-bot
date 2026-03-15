const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');

const logDirectory = path.join(process.cwd(), 'logs');

// Формат для консоли (читаемый)
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
    })
);

// Формат для файлов (JSON)
const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
);

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    transports: [
        // Консоль
        new winston.transports.Console({
            format: consoleFormat,
        }),
        // Обычные логи (ротация)
        new winston.transports.DailyRotateFile({
            dirname: logDirectory,
            filename: 'combined-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxFiles: '14d',
            format: fileFormat,
        }),
        // Только логи ошибок (ротация)
        new winston.transports.DailyRotateFile({
            dirname: logDirectory,
            filename: 'error-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxFiles: '30d',
            level: 'error',
            format: fileFormat,
        }),
    ],
});

module.exports = logger;
