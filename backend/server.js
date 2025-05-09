// backend/server.js
const express    = require('express');
const cors       = require('cors');
const fs         = require('fs');
const path       = require('path');
const fileUpload = require('express-fileupload');

const {
  port,
  nameDirectoryRequests,
  nameDirectoryDicom
} = require('./configConst');

const app = express();

// — Middlewares básicos —
app.use(cors());
app.use(express.json());
app.use(fileUpload());
app.use(express.static(nameDirectoryDicom));

// — Auto-carga de rutas desde la carpeta httpRequests —
const routesPath = path.join(__dirname, nameDirectoryRequests);
console.log(`🔍 Buscando rutas en: ${routesPath}`);

fs.readdirSync(routesPath).forEach((file) => {
  if (file.endsWith('.js')) {
    console.log(`   ↳ Cargando ruta: ${file}`);
    const route = require(path.join(routesPath, file));
    if (typeof route === 'function') {
      route(app);
      console.log(`     ✅ Ruta ${file} registrada.`);
    } else {
      console.warn(`     ⚠️ ${file} no exporta una función.`);
    }
  }
});

// — Levantar servidor —
app.listen(port, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${port}`);
});
