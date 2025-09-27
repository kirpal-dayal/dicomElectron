/**
 * server.js – Backend principal
 */
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const {
  port,
  nameDirectoryRequests,
  nameDirectoryDicom
} = require('./configConst');

const app = express();

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
      console.log('  Ruta /api/image montada');
      return;
    }

    if (file === 'segmentRoutes.js') {
      const { router: segmentRouter } = require(path.join(routesDir, file));
      app.use('/api/segment', segmentRouter);
      console.log('  Ruta /api/segment montada');
      return;
    }

    // Resto de routers exportados como Router por default
    const genericRouter = require(path.join(routesDir, file));
    app.use('/api', genericRouter);
    console.log(`  Ruta /api/${file.replace('.js','')} registrada como Router.`);
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
      console.log(`  Ruta de httpRequests ${file} registrada.`);
    }
  });
}

// servir build del front-end (DESPUÉS de montar /api/*)
app.use(express.static(path.join(__dirname, '..', 'build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'build', 'index.html'));
});

// -------- Arranque --------
const PORT = process.env.PORT || port || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor escuchando en http://0.0.0.0:${PORT}`);
});
