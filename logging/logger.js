// general logger of the app using winston, controls where logs are stored and their format

const { createLogger, transports, format } = require("winston");
const path = require('path');
const logsPath = path.join(__dirname, '/logs');

//generic logger configuration
const logger = createLogger({
  level: "info", // "debug", "error", etc.
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.File({ filename: `${logsPath}/error.log`, level: "error" }), // Logs de errores
    new transports.File({ filename: `${logsPath}/combined.log` }) // Todos los logs
  ],
});

// Si estás en desarrollo, también muestra los logs en la consola
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple() // Logs más legibles en consola
      ),
    })
  );
}

module.exports = logger;