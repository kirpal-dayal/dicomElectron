/**
 * server.js - Archivo principal del backend
 * Este archivo inicia y configura el servidor Express para el backend del sistema DICOMElectron.
 * Es responsable de servir archivos estáticos, aceptar peticiones API, cargar automáticamente rutas
 * y manejar archivos DICOM subidos por los usuarios.
 *
 * - Configura middlewares esenciales: CORS, JSON parsing y file upload.
 * - Sirve archivos estáticos desde la carpeta DICOM (usualmente /temp o /uploads).
 * - Carga automáticamente todos los archivos de rutas desde:
 *    - /routes → rutas API estándar (ej: expediente, login, estudios).
 *    - /httpRequests → funciones auxiliares que extienden `app` directamente.
 * - Monta rutas especiales como `/api/image` para la gestión de archivos DICOM.
 
 *  * VARIABLES DE ENTORNO Y CONFIG:
 * - Usa dotenv para cargar variables desde `.env` si existe.
 * - Toma configuraciones desde `configConst.js` como:
 *    - `port` → Puerto del servidor.
 *    - `nameDirectoryRequests` → Carpeta con módulos de funciones que se inyectan al servidor.
 *    - `nameDirectoryDicom` → Carpeta donde se almacenan temporalmente los archivos DICOM.

 * CONEXIONES:
 * - `/api/*` → Rutas cargadas automáticamente desde `/routes`.
 * - `/api/image/*` → Rutas específicas para subir, convertir y listar archivos DICOM.
 * - `/temp`, `/uploads`, etc. → Sirve archivos directamente desde el disco para ser consumidos por el frontend.

 * Se ejecuta con Node.js y escucha en el puerto definido por `.env` o el archivo de configuración.
 * node server.js, para correr el servidor.
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
      } else if (file === "segmentRoutes.js") {
        const { router } = require(path.join(routesDir, file)); // ✅ desestructuramos
        app.use('/api/segment', router); // ✅ usamos solo el router
        console.log('  Ruta /api/segment montada');
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
