/**
 * // backend/routes/imageRoutes.js
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
 * Cada imagen DICOM se guarda como LONGBLOB en la tabla imagen

El campo num_tomo se asigna en orden desde 1

El endpoint /dicom/:folder/:filename se conserva intacto para que siga sirviendo desde disco (para Cornerstone)

Se usa INSERT IGNORE para evitar error si ya existe un registro de estudio con la misma fecha y NSS
 */
const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const unzipper = require('unzipper');
const db       = require('../connectionDb');
const { nameDirectoryDicom } = require('../configConst');
<<<<<<< HEAD

=======
const { exec } = require('child_process'); // Para ejecutar scripts Python 
>>>>>>> origin/reportes
const router = express.Router();
const { guardarMascarasEnBD } = require('./segmentRoutes'); // Importa la función para guardar máscaras
/**
 * Utilidad: Recursivamente encuentra archivos DICOM válidos (.dcm o sin extensión)
 */
function findDicomFiles(dir, base = '') {
  let dicoms = [];
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (let f of files) {
    const relPath = path.join(base, f.name);
    const fullPath = path.join(dir, f.name);
    if (f.isDirectory()) {
      dicoms = dicoms.concat(findDicomFiles(fullPath, relPath));
    } else if (/\.dcm$/i.test(f.name) || !/\./.test(f.name)) {
      dicoms.push(relPath.replace(/\\/g, '/'));
    }
  }
  return dicoms;
}

/**
 * POST /upload-zip
 * Recibe un ZIP con archivos DICOM y:
 *  1. Lo guarda y extrae en carpeta `DICOM/nss_fecha/`
 *  2. Registra el estudio en la tabla `estudio`
 *  3. Guarda cada imagen en la tabla `imagen` con LONGBLOB
 */
router.post('/upload-zip', async (req, res) => {
  try {
    if (!req.files || !req.files.zipFile) return res.status(400).send('No ZIP');

    const zipFile = req.files.zipFile;
    let { nss, fecha } = req.body;
    if (!nss || !fecha) return res.status(400).send('Faltan parámetros');

    // Formato SQL de fecha y nombre seguro para carpeta
    fecha = fecha.replace('T', ' ').split('.')[0];
    const safeFecha = fecha.replace(/[: ]/g, '_');
    const studyDir = path.join(__dirname, '..', nameDirectoryDicom, `${nss}_${safeFecha}`);
    fs.mkdirSync(studyDir, { recursive: true });

    // Guardar y extraer ZIP
    const zipPath = path.join(studyDir, zipFile.name);
    await zipFile.mv(zipPath);
    await new Promise(resolve =>
      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: studyDir }))
        .on('close', resolve)
    );

    // Insertar estudio
    await new Promise((resolve, reject) => {
      db.query(
        'INSERT IGNORE INTO estudio (nss_expediente, fecha) VALUES (?, ?)',
        [nss, fecha],
        (err) => err ? reject(err) : resolve()
      );
    });

    // Leer y almacenar DICOMs en la BD
    const dicomFiles = findDicomFiles(studyDir);
    for (let i = 0; i < dicomFiles.length; i++) {
      const relativePath = dicomFiles[i];
      const fullPath = path.join(studyDir, relativePath);
      const buffer = fs.readFileSync(fullPath);
      await new Promise((resolve, reject) => {
        db.query(
          'INSERT INTO imagen (nss_exp, fecha_estudio, num_tomo, imagen) VALUES (?, ?, ?, ?)',
          [nss, fecha, i + 1, buffer],
          (err) => err ? reject(err) : resolve()
        );
      });
    }

//   EJECUTAR SEGMENTACIÓN AUTOMÁTICAMENTE (DENTRO DEL TRY)
const segmentationScript = path.join(__dirname, '../segmentation/main.py');
const command = `python "${segmentationScript}" "${studyDir}"`;

exec(command, async (error, stdout, stderr) => {
  if (error) {
    console.error(' Error al ejecutar la segmentación:', error);
    console.error('stderr:', stderr);
  } else {
    console.log('Segmentación completada automáticamente.');
    console.log('stdout:', stdout);

    // EXTRAER NSS Y FECHA
    try {
      await guardarMascarasEnBD(`${nss}_${safeFecha}`, nss, fecha);
    } catch (err) {
      console.error('❌ Error al guardar máscaras en BD:', err);
    }
  }
});


    //  Enviar respuesta al cliente
    res.json({
      success: true,
      message: `Subida exitosa. ${dicomFiles.length} imágenes registradas y segmentación lanzada.`,
    });
  } catch (err) {
    console.error('Error en subida ZIP:', err);
    res.status(500).send('Error al procesar ZIP');
  }
});

/**
 * GET /dicom-list/:folder
 * Devuelve lista de archivos extraídos para un estudio
 */
router.get('/dicom-list/:folder', (req, res) => {
  const folder = req.params.folder;
  const folderPath = path.join(__dirname, '..', nameDirectoryDicom, folder);
  if (!fs.existsSync(folderPath)) {
    return res.status(404).json({ error: 'Carpeta no encontrada' });
  }
  const files = findDicomFiles(folderPath);
  res.json(files);
});

/**
 * GET /dicom/:folder/:filename
 * Sirve un archivo DICOM específico desde disco
 */
router.get('/dicom/:folder/:filename(*)', (req, res) => {
  const { folder, filename } = req.params;
  const filePath = path.join(__dirname, '..', nameDirectoryDicom, folder, filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('No existe');
  res.sendFile(filePath);
});

module.exports = router;
