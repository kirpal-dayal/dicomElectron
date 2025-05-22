/**
 * imageRoutes.js
 * 
 * RUTAS BACKEND – API para manejo de imágenes DICOM en el sistema de visualización médica.

 * - Recibe y procesa archivos ZIP subidos con imágenes DICOM desde el frontend.
 * - Extrae y almacena los archivos en una estructura de carpetas por estudio (basado en NSS y fecha).
 * - Registra los estudios en la base de datos MySQL.
 * - Expone endpoints REST para:
 *    · Listar los archivos DICOM de un estudio (`/dicom-list/:folder`)
 *    · Servir los archivos DICOM individuales al frontend para su visualización (`/dicom/:folder/:filename`)

 * - Usado por el frontend React para cargar listas de imágenes y acceder a los archivos reales (integración directa con Cornerstone), -> studyview
 * - La subida de ZIP espera un form-data con los campos `nss`, `fecha` y `zipFile` -> doctorview
 * - Se integra con la base de datos a través del módulo db/connectionDb.js y la tabla `estudio`.

 * - El frontend debe enviar los archivos DICOM comprimidos (ZIP), tener cuidado con el formato de la fecha y el NSS
 * - Los archivos se extraen sin procesar para compatibilidad con visores médicos JS.
 * - Los endpoints asumen estructura consistente en la carpeta de imágenes.

 * - No se hace validación exhaustiva del contenido del ZIP (se asume origen confiable).
 * - Recomendable agregar autenticación/autorización para entornos productivos.
 */

// backend/routes/imageRoutes.js

const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const unzipper = require('unzipper');
const db       = require('../connectionDb');
const { nameDirectoryDicom } = require('../configConst');

const router = express.Router();

/**
 * Recibe un ZIP con archivos DICOM, los extrae a una carpeta única y registra el estudio en la base de datos.
 * NO convierte ni procesa los archivos; los deja tal cual para ser visualizados por el frontend con Cornerstone.
 */
router.post('/upload-zip', async (req, res) => {
  try {
    if (!req.files || !req.files.zipFile) return res.status(400).send('No ZIP');
    const zipFile = req.files.zipFile;
    let { nss, fecha } = req.body;
    if (!nss || !fecha) return res.status(400).send('Faltan parámetros');

    // Normaliza la fecha (formato compatible con la carpeta)
    fecha = fecha.replace('T', ' ').split('.')[0];
    const safeFecha = fecha.replace(/[: ]/g, '_');
    const studyDir  = path.join(__dirname, '..', nameDirectoryDicom, `${nss}_${safeFecha}`);
    fs.mkdirSync(studyDir, { recursive: true });

    // 1. Guarda y descomprime el ZIP en la carpeta del estudio
    const zipPath = path.join(studyDir, zipFile.name);
    await zipFile.mv(zipPath);
    await new Promise(r =>
      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: studyDir }))
        .on('close', r)
    );

    // 2. Inserta registro en la tabla estudio
    await new Promise((ok, ko) => {
      db.query(
        'INSERT INTO estudio (nss_expediente, fecha) VALUES (?,?)',
        [nss, fecha],
        err => err ? ko(err) : ok()
      );
    });

    res.json({ success: true });
  } catch(err) {
    console.error(err);
    res.status(500).send('Error al procesar ZIP');
  }
});

/**
 * Recursivamente busca archivos DICOM válidos en el estudio.
 * Incluye archivos .dcm, .DCM y SIN EXTENSIÓN (importante para IM0001L0, etc).
 */
function findDicomFiles(dir, base='') {
  let dicoms = [];
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (let f of files) {
    const relPath = path.join(base, f.name);
    const fullPath = path.join(dir, f.name);
    if (f.isDirectory()) {
      dicoms = dicoms.concat(findDicomFiles(fullPath, relPath));
    } else if (
      /\.dcm$/i.test(f.name) ||   // .dcm o .DCM
      !/\./.test(f.name)          // SIN EXTENSIÓN
    ) {
      dicoms.push(relPath.replace(/\\/g, '/'));
    }
  }
  return dicoms;
}

/**
 * Devuelve la lista de archivos DICOM (rutas relativas) de un estudio.
 * Ejemplo de respuesta: ["IM0001L0", "IM0002L0", ...]
 */
// Lista archivos DICOM en la carpeta de estudio
router.get('/dicom-list/:folder', (req, res) => {
  console.log("[BACKEND] Solicitud para carpeta DICOM:", req.params.folder);
  const folder = req.params.folder;
  const folderPath = path.join(__dirname, '..', nameDirectoryDicom, folder);
  console.log('Solicitando lista para carpeta:', folder);
  console.log('Ruta absoluta:', folderPath);
  if (!fs.existsSync(folderPath)) {
    console.log('No existe la carpeta:', folderPath);
    return res.status(404).json({ error: 'Folder not found' });
  }
  const files = fs.readdirSync(folderPath).filter(f =>
    !fs.statSync(path.join(folderPath, f)).isDirectory()
  );
  console.log('Archivos encontrados:', files);
  res.json(files);
});

/**
 * Sirve un archivo DICOM real, permitiendo rutas relativas (subcarpetas).
 */
router.get('/dicom/:folder/:filename(*)', (req, res) => {
  const { folder, filename } = req.params;
  const filePath = path.join(__dirname, '..', nameDirectoryDicom, folder, filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('No existe');
  res.sendFile(filePath);
});

module.exports = router;
