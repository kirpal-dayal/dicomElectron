// backend/routes/dicomUploadRoutes.js
const express   = require('express');
const path      = require('path');
const fs        = require('fs');
const unzipper  = require('unzipper');
const db        = require('../connectionDb');
const { nameDirectoryDicom } = require('../configConst');

const router = express.Router();

/**
 * POST /api/image/upload-zip
 * - Recibe un .zip con DICOMs, más campos nss y fecha (YYYY-MM-DD HH:mm:ss)
 * - Descomprime en temp/{nss}_{fecha_safe}
 * - Inserta un registro en estudio (nss_expediente, fecha)
 */
router.post('/upload-zip', async (req, res) => {
  try {
    // 1) Validar que venga el ZIP y los parámetros
    const zipFile = req.files?.zipFile;
    const { nss, fecha } = req.body;
    if (!zipFile) return res.status(400).send('No se ha subido ningún archivo ZIP.');
    if (!nss || !fecha)  return res.status(400).send('Faltan nss o fecha.');

    // 2) Crear carpeta específica para este estudio
    const safeFecha = fecha.replace(/[: ]/g, '_'); 
    const studyDir  = path.join(__dirname, '..', nameDirectoryDicom, `${nss}_${safeFecha}`);
    await fs.promises.mkdir(studyDir, { recursive: true });

    // 3) Mover el ZIP
    const zipPath = path.join(studyDir, zipFile.name);
    await new Promise((resolve, reject) =>
      zipFile.mv(zipPath, err => (err ? reject(err) : resolve()))
    );

    // 4) Descomprimir
    await new Promise((resolve, reject) => {
      fs.createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: studyDir }))
        .on('close', resolve)
        .on('error', reject);
    });

    // 5) Insertar registro en tabla `estudio`
    db.query(
      `INSERT INTO estudio (nss_expediente, fecha) VALUES (?, ?)`,
      [nss, fecha],
      err => {
        if (err) {
          console.error('Error al registrar estudio en BD:', err);
          return res.status(500).send('Error al registrar estudio');
        }
        return res.json({
          success: true,
          message: 'ZIP subido, descomprimido y estudio registrado'
        });
      }
    );
  } catch (err) {
    console.error('Error al procesar ZIP:', err);
    return res.status(500).send('Error al subir y procesar ZIP');
  }
});

module.exports = router;
