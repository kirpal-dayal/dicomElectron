/**
 * server.js – Backend principal
 */
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const logger = require(path.join(__dirname, '../logging/logger'));
const dotenv = require('dotenv');
dotenv.config();


const {
  port,
  nameDirectoryRequests,
  nameDirectoryDicom,
  host
} = require('./configConst');

const app = express();

const PORT = port || 5000;
const HOST = host || '0.0.0.0';

// -------- Middlewares base --------
app.use(cors());              // en prod: limita a origen del cliente
app.use(express.json());
app.use(fileUpload());

// Servir DICOMs/archivos (p.ej. /temp)
app.use(`/${nameDirectoryDicom}`, express.static(path.join(__dirname, nameDirectoryDicom)));

// -------- Auto-cargar rutas /routes --------
const routesDir = path.join(__dirname, 'routes');
if (fs.existsSync(routesDir)) {
  fs.readdirSync(routesDir).forEach((file) => {
    if (!file.endsWith('.js')) return;

    if (file === 'imageRoutes.js') {
      const imageRouter = require(path.join(routesDir, file));
      app.use('/api/image', imageRouter);
      logger.info('Ruta /api/image montada');
      return;
    }

    if (file === 'segmentRoutes.js') {
      const { router: segmentRouter } = require(path.join(routesDir, file));
      app.use('/api/segment', segmentRouter);
      logger.info('Ruta /api/segment montada');
      return;
    }

    // Resto de routers exportados como Router por default
    const genericRouter = require(path.join(routesDir, file));
    app.use('/api', genericRouter);
    logger.info(`Ruta /api/${file.replace('.js','')} registrada como Router.`);
  });
}

// -------- Auto-inyectar handlers de /httpRequests --------
const httpRequestsPath = path.join(__dirname, nameDirectoryRequests);
if (fs.existsSync(httpRequestsPath)) {
  fs.readdirSync(httpRequestsPath).forEach((file) => {
    if (!file.endsWith('.js')) return;
    const plug = require(path.join(httpRequestsPath, file));
    if (typeof plug === 'function') {
      plug(app);
      logger.info(`Ruta de httpRequests ${file} registrada.`);
    }
  });
}

// servir build del front-end (DESPUÉS de montar /api/*)
app.use(express.static(path.join(__dirname, '..', 'build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'build', 'index.html'));
});

// Global error handlers
process.on("uncaughtException", (error) => {
  logger.error({
    message: "Excepción no capturada",
    error: error.message,
    stack: error.stack,
  });
  process.exit(1); // Force exit, VERIFY HAVING AN AUTO-RESTART MECHANISM (E.g., PM2, docker)
});

process.on("unhandledRejection", (reason) => {
  logger.error({
    message: "Promesa rechazada no manejada",
    reason,
  });
});

// Global middleware (Express) error handler
app.use((err, req, res, next) => {
  logger.error(`HTTP ${err.status || 500} - ${err.message}`);
  res.status(err.status || 500).send(err.message || 'Error interno del servidor');
});

// -------- Arranque --------
app.listen(PORT, HOST, () => {
  logger.info(`Servidor backend arrancado en http://${HOST}:${PORT}`);
});