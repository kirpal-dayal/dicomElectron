/**
 * backend/routes/imageRoutes.js
 *
 * Flujo:
 * 1) POST /api/image/upload-zip
 *    - Recibe ZIP (express-fileupload)
 *    - Upsert en estudio
 *    - Inserta DICOMs a BD (tabla imagen) con num_tomo consecutivo
 *    - Materializa imágenes de BD a directorio temporal
 *    - Ejecuta Python (segmentation.py)
 *    - Volca máscaras a BD y actualiza volumen (helpers de segmentRoutes)
 *    - Limpia el tmp al final (siempre)
 *
 * 2) GET /api/image/dicom-list/:folder  -> lista nombres "IM_XXXX.dcm" desde BD
 * 3) GET /api/image/dicom/:folder/:filename  -> devuelve el LONGBLOB del DICOM
 */

const express = require('express');
const fs = require('fs/promises');
const fscore = require('fs');
const path = require('path');
const logger = require(path.join(__dirname, '../../logging/logger'));
const os = require('os');
const unzipper = require('unzipper');
const { exec } = require('child_process');
const db = require('../connectionDb');

const router = express.Router();

// Helpers exportados desde segmentRoutes
const { guardarMascarasEnBDFromDir, updateEstudioVolumenFromDir } = require('./segmentRoutes');

// ========= Utilidades BD =========

function upsertEstudio(nss, fecha, descripcion = null) {
  return new Promise((resolve, reject) => {
    db.query(
      'INSERT IGNORE INTO estudio (nss_expediente, fecha, descripcion) VALUES (?, ?, ?)',
      [nss, fecha, descripcion],
      (err) => err ? reject(err) : resolve()
    );
  });
}

function insertImagen(nss, fecha, num_tomo, buffer) {
  return new Promise((resolve, reject) => {
    db.query(
      'INSERT INTO imagen (nss_exp, fecha_estudio, num_tomo, imagen) VALUES (?, ?, ?, ?)',
      [nss, fecha, num_tomo, buffer],
      (err) => err ? reject(err) : resolve()
    );
  });
}

function fetchImagenes(nss, fecha) {
  return new Promise((resolve, reject) => {
    db.query(
      'SELECT num_tomo, imagen FROM imagen WHERE nss_exp=? AND fecha_estudio=? ORDER BY num_tomo ASC',
      [nss, fecha],
      (err, rows) => err ? reject(err) : resolve(rows || []))
  });
}

// ========= Utilidades /tmp =========

async function mkTmp(prefix = 'study-') {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return base;
}

async function materializeStudyToTmp(nss, fecha) {
  const safeNss = String(nss).replace(/\W+/g, '_');
  const tmpDir = await mkTmp(`study-${safeNss}-`);
  const rows = await fetchImagenes(nss, fecha);
  if (!rows.length) throw new Error('Estudio sin imágenes en BD');

  let written = 0;
  for (const r of rows) {
    const fname = `IM_${String(r.num_tomo).padStart(4, '0')}.dcm`;
    await fs.writeFile(path.join(tmpDir, fname), r.imagen);
    written++;
  }
  logger.info('[MATERIALIZE] Escribió %d DICOMs en %s', written, tmpDir);
  return tmpDir;
}

// ========= Helpers locales =========

function parseFolder(folder) {
  const m = folder.match(/^([A-Za-z0-9_-]+)_((\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2}))$/);
  if (!m) return null;
  const nss = m[1];
  const fechaSQL = `${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
  return { nss, fechaSQL };
}

function isDicomCandidate(zipPath) {
  // Acepta *.dcm o archivos sin extensión (muchos PACS exportan así)
  return /\.dcm$/i.test(zipPath) || !/\.[^/]+$/.test(zipPath);
}

async function safeListDir(dir, label) {
  try {
    const list = await fs.readdir(dir);
    logger.info('[LIST] %s (%s) → %d items', label, dir, list.length);
    console.log('[LIST] %s sample:', label, list.slice(0, 50));
    return list;
  } catch (e) {
    console.warn('[LIST] No se pudo listar %s (%s): %s', label, dir, e.message);
    return [];
  }
}

// ========= Endpoints =========

// POST /api/image/upload-zip
router.post('/upload-zip', async (req, res, next) => {
  try {
    if (!req.files || !req.files.zipFile) {
      return res.status(400).send('No se recibió el archivo ZIP');
    }
    const zipFile = req.files.zipFile; // express-fileupload
    let { nss, fecha, descripcion } = req.body;
    if (!nss || !fecha) return res.status(400).send('Faltan parámetros: nss, fecha');

    // Normaliza fecha a "YYYY-MM-DD HH:MM:SS"
    fecha = fecha.replace('T', ' ').split('.')[0];

    console.log('[UPLOAD] NSS: %s Fecha: %s ZIP bytes: %s', nss, fecha, zipFile.data?.length ?? 0);

    await upsertEstudio(nss, fecha, descripcion || null);

    // Abrir ZIP en memoria
    const directory = await unzipper.Open.buffer(zipFile.data);
    let files = directory.files.filter(f => f.type === 'File');
    // Orden estable (por nombre de entrada en el ZIP)
    files.sort((a, b) => a.path.localeCompare(b.path, 'en'));

    console.log('[ZIP] Entradas en ZIP: %d', files.length);
    console.log('[ZIP] Muestra:', files.slice(0, 10).map(f => f.path));

    // Insertar DICOMs en BD
    let num_tomo = 1, inserted = 0, skipped = 0;
    for (const entry of files) {
      if (!isDicomCandidate(entry.path)) { skipped++; continue; }
      try {
        const buf = await entry.buffer();
        await insertImagen(nss, fecha, num_tomo, buf);
        inserted++; num_tomo++;
      } catch (e) {
        logger.error('[UPLOAD] Error insertando %s: %s', entry.path, e.message);
      }
    }
    logger.info('[UPLOAD] DICOMs insertados en BD: %d | ignorados (no dicom): %d', inserted, skipped);

    // Lanza segmentación
    try {
      const tmpDir = await materializeStudyToTmp(nss, fecha);
      logger.info('[SEG] Materializado en %s', tmpDir);
    } catch (e) {
      console.error('Error al materializar el estudio:', e.message);
    }

    // Lista del tmp antes de segmentar
    await safeListDir(tmpDir, 'tmpDir pre-segment');

    const segmentationScript = path.join(__dirname, '../segmentation/segmentation.py');
    const cmd = `python -u "${segmentationScript}" "${tmpDir}" --debug`;
    logger.info('[SEG] Ejecutando: %s', cmd);

    const child = exec(cmd, { env: { ...process.env } });

    child.stdout.on('data', d => process.stdout.write(String(d)));
    child.stderr.on('data', d => process.stderr.write(String(d)));

    child.on('error', (err) => {
      logger.error('[SEG] Error al lanzar proceso Python: %s', err.message);
    });

    child.on('close', async (code) => {
      try {
        logger.info('[SEG] exit code = %d', code);

        // DEBUG: lista dir temporal + subcarpeta de segmentación
        const listTop = await safeListDir(tmpDir, 'tmpDir post-segment');
        const segSub = path.join(tmpDir, 'segmentaciones_por_dicom');
        const segExists = fscore.existsSync(segSub);
        console.log('[SEG] segSub exists =', segExists, '→', segSub);
        let listSeg = [];
        if (segExists) listSeg = await safeListDir(segSub, 'segmentaciones_por_dicom');

        // Métricas de salida
        const masksAuto = listSeg.filter(f => /^mask_\d+\.json$/i.test(f)).length;
        const masksMan = listSeg.filter(f => /^mask_\d+_simplified\.json$/i.test(f)).length;
        const hasVol = listSeg.includes('volumenes.json') || listTop.includes('volumenes.json');

        console.log('[SEG] Conteo → auto:%d manual_simplified:%d volumenes:%s',
          masksAuto, masksMan, hasVol ? 'sí' : 'no');

        if (code !== 0) {
          console.error('[SEG] Segmentación terminó con código %d', code);
        } else {
          // IMPORTANTE: insertar en BD **antes** de borrar tmpDir
          console.log('[POST-SEG] Volcando máscaras a BD… nss=%s fecha=%s', nss, fecha);
          await guardarMascarasEnBDFromDir(tmpDir, nss, fecha);

          console.log('[POST-SEG] Actualizando volumen_automatico en estudio…');
          await updateEstudioVolumenFromDir(tmpDir, nss, fecha);

          logger.info('[POST-SEG] Finalizado volcado a BD.');
        }
      } catch (e) {
        logger.error('Error post-segmentación (guardado de máscaras/volumen):', e);
      } finally {
        // Borrar tmpDir SOLO al final
        try {
          await fs.rm(tmpDir, { recursive: true, force: true });
          logger.info('[SEG] tmpDir eliminado: %s', tmpDir);
        } catch (err) {
          logger.warn('[SEG] no se pudo eliminar tmpDir: %s', err.message);
        }
      }
    });

    // Responder YA, sin bloquear al cliente
    res.json({
      success: true,
      message: `ZIP recibido. Imágenes guardadas en BD. Segmentación lanzada.`,
      total_insertadas: inserted,
      ignoradas: skipped
    });

  } catch (err) {
    err.status = 500;
    err.message = `HTTP ${err.status} - ${err.message || ''} - Error en /upload-zip, al procesar el ZIP`;
    logger.error(err.message);
  }
});

// GET /api/image/dicom-list/:folder  -> nombres virtuales tipo IM_0001.dcm (desde BD)
router.get('/dicom-list/:folder', (req, res) => {
  const parsed = parseFolder(req.params.folder);
  if (!parsed) return res.status(400).json({ error: 'folder inválido' });

  db.query(
    'SELECT num_tomo FROM imagen WHERE nss_exp=? AND fecha_estudio=? ORDER BY num_tomo ASC',
    [parsed.nss, parsed.fechaSQL],
    (err, rows) => {
      if (err) {
        err.status = 500;
        err.message = `HTTP ${err.status} - ${err.message || ''} - Error en /dicom-list/${req.params.folder}, al consultar la BD`;
        logger.error('[DICOM-LIST] DB error: %s', err.message);
        return res.status(500).json({ error: 'DB error' });
      }
      const files = (rows || []).map(r => `IM_${String(r.num_tomo).padStart(4, '0')}.dcm`);
      //logger.info('[DICOM-LIST] count: %d', files.length);
      res.json(files);
    }
  );
});

// GET /api/image/dicom/:folder/:filename  -> sirve LONGBLOB del num_tomo
router.get('/dicom/:folder/:filename(*)', (req, res, next) => {
  const parsed = parseFolder(req.params.folder);
  if (!parsed) return res.status(400).send('folder inválido');

  const fn = req.params.filename;
  const m = fn.match(/IM_(\d+)\.dcm$/i);
  if (!m) return res.status(400).send('filename inválido');
  const num_tomo = Number(m[1]);

  db.query(
    'SELECT imagen FROM imagen WHERE nss_exp=? AND fecha_estudio=? AND num_tomo=? LIMIT 1',
    [parsed.nss, parsed.fechaSQL, num_tomo],
    (err, rows) => {
      if (err) {
        err.status = 500;
        err.message = `HTTP ${err.status} - ${err.message || ''} - Error en /dicom/${req.params.folder}/${fn}, al consultar la BD`;
        return next(err);
      }
      if (!rows || rows.length === 0) return res.status(404).send('No encontrado');

      res.setHeader('Content-Type', 'application/dicom');
      res.setHeader('Content-Disposition', `inline; filename="${fn}"`);
      res.send(rows[0].imagen);
    }
  );
});

module.exports = router;
