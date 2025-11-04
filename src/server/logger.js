const fs = require("fs");
const path = require("path");
const { createLogger, format, transports } = require("winston");
const { DEFAULT_CONFIG } = require("./config");

const LOG_DIR = path.join(DEFAULT_CONFIG.rootDir, "logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  transports: [
    new transports.File({ filename: LOG_FILE, maxsize: 5 * 1024 * 1024 }),
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ level, message, timestamp, ...rest }) => {
          const meta = Object.keys(rest).length ? JSON.stringify(rest) : "";
          return `[${timestamp}] ${level}: ${message} ${meta}`;
        })
      )
    })
  ]
});

const logRequest = (req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    logger.info("HTTP %s %s %d %dms", req.method, req.originalUrl, res.statusCode, durationMs, {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs,
      ip: req.ip
    });
  });
  next();
};

module.exports = {
  logger,
  logRequest,
  LOG_FILE
};
