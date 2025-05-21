// backend/server.js
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

// Middlewares
app.use(cors());
app.use(express.json());
app.use(fileUpload());

// Archivos estáticos (ej: /temp)
app.use(`/${nameDirectoryDicom}`, express.static(path.join(__dirname, nameDirectoryDicom)));

// Auto-cargar todas las rutas de la carpeta /routes
const routesDir = path.join(__dirname, 'routes');
if (fs.existsSync(routesDir)) {
  fs.readdirSync(routesDir).forEach((file) => {
    if (file.endsWith('.js')) {
      const route = require(path.join(routesDir, file));
      if (file === "imageRoutes.js") {
        app.use('/api/image', route);
        console.log('  Ruta /api/image montada');
        console.log('Rutas de imágenes montadas');
      } else {
        app.use('/api', route);
        console.log(`  Ruta /api/${file.replace('.js','')} registrada como Router.`);
      }
    }
  });
}

// Unir todo en un momento dado httpRequestsPath, autocargar todas las rutas de la carpeta /httpRequests
const httpRequestsPath = path.join(__dirname, nameDirectoryRequests);
if (fs.existsSync(httpRequestsPath)) {
  fs.readdirSync(httpRequestsPath).forEach((file) => {
    if (file.endsWith('.js')) {
      const route = require(path.join(httpRequestsPath, file));
      if (typeof route === 'function') {
        route(app);
        console.log(` Ruta de httpRequests ${file} registrada.`);
      }
    }
  });
}

const PORT = process.env.PORT || port;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
