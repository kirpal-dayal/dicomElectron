// general logger of the app using winston, controls where logs are stored and their format

const { createLogger, transports, format } = require("winston");

const logger = createLogger({
  level: "info", // Nivel de log (puedes cambiarlo a "debug", "error", etc.)
  format: format.combine(
    format.timestamp(),
    format.json() // Formato JSON para logs estructurados
  ),
  transports: [
    new transports.File({ filename: "logs/error.log", level: "error" }), // Logs de errores
    new transports.File({ filename: "logs/combined.log" }) // Todos los logs
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