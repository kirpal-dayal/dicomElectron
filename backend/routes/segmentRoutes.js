/**
 * backend/routes/segmentRoutes.js
 * Rutas para máscaras y volúmenes (lee preferentemente desde BD).
 * Ajustado al esquema fibrosis_v06 actual (sin volumen_json_automatico).
 */

//se le agregaron logs pero se evitó el uso de next() para evitar problemas con el componente de react, que se cree, espera errores en json

const express = require('express');
const router = express.Router();
const path = require('path');
const logger = require(path.join(__dirname, '../../logging/logger'));
const fs = require('fs');
const fsp = require('fs/promises');
const db = require('../connectionDb'); // conexión MySQL

// ========= Utils ========= conviene moverlos a /src/utils ?
function parseFolder(folder) {
  // NSS_YYYY-MM-DD_HH_mm_ss
  const m = folder.match(/^([A-Za-z0-9_-]+)_((\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2}))$/);
  if (!m) return null;
  const nss = m[1];
  const fechaSQL = `${m[3]} ${m[4]}:${m[5]}:${m[6]}`; // YYYY-MM-DD HH:mm:ss
  return { nss, fechaSQL };
}
// lectura síncrona; se usa solo en post-proceso
function readJSONMaybe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const txt = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    logger.error('[JSON] error leyendo %s: %s', filePath, e.message);
    return null;
  }
}
// hace SELECT + UPDATE/INSERT (no atómico). Si hay concurrencia, conviene UNIQUE + ON DUPLICATE KEY.
function upsertMascara({ nss, fechaSQL, num_tomo, tipo, clase, payload }, cb) {
  const sel = `
    SELECT 1 FROM mascara
     WHERE nss_exp=? AND fecha_estudio=? AND num_tomo=? AND tipo=? AND clase=?`;
  const vals = [nss, fechaSQL, num_tomo, tipo, clase];
  db.query(sel, vals, (err, rows) => {
    if (err) return cb(err);
    const jsonStr = JSON.stringify(payload);
    if (rows && rows.length) {
      const upd = `
        UPDATE mascara SET coordenadas=?
         WHERE nss_exp=? AND fecha_estudio=? AND num_tomo=? AND tipo=? AND clase=?`;
      db.query(upd, [jsonStr, ...vals], cb);
    } else {
      const ins = `
        INSERT INTO mascara (nss_exp, fecha_estudio, num_tomo, tipo, clase, coordenadas)
        VALUES (?, ?, ?, ?, ?, ?)`;
      db.query(ins, [nss, fechaSQL, num_tomo, tipo, clase, jsonStr], cb);
    }
  });
}

function upsertMascaraAsync(args) {
  return new Promise((resolve, reject) =>
    upsertMascara(args, (err) => (err ? reject(err) : resolve()))
  );
}

function pickPreferManual(rows) {
  const pick = { pulmon: null, fibrosis: null };
  for (const r of rows || []) {
    if (!['pulmon', 'fibrosis'].includes(r.clase)) continue;
    const cur = pick[r.clase];
    if (!cur || (r.tipo === 'manual' && cur.tipo !== 'manual')) {
      pick[r.clase] = r;
    }
  }
  return pick;
}

function normalizeCoords(rowPulmon, rowFibrosis) {
  const out = { lung: [], fibrosis: [] };
  const use = (row, kind) => {
    if (!row) return;
    let data = row.coordenadas;
    try { if (typeof data === 'string') data = JSON.parse(data); }
    catch (e) {
      logger.error('[normalizeCoords] Error parsing JSON: %s', e.message);
      //return;
    }
    const lung = data?.lung ?? data?.lung_editable ?? [];
    const fib = data?.fibrosis ?? data?.fibrosis_editable ?? [];
    if (kind === 'pulmon') {
      if (Array.isArray(lung)) out.lung = lung;
      if (Array.isArray(fib) && out.fibrosis.length === 0) out.fibrosis = fib;
    } else if (kind === 'fibrosis') {
      if (Array.isArray(fib)) out.fibrosis = fib;
      if (Array.isArray(lung) && out.lung.length === 0) out.lung = lung;
    }
  };
  use(rowPulmon, 'pulmon');
  use(rowFibrosis, 'fibrosis');
  return out;
}

// ========= Endpoints públicos =========

// Volúmenes (prefiere manual; si no, automático; fallback a archivo)
router.get('/volumen/:folder', async (req, res, next) => {
  const parsed = parseFolder(req.params.folder);
  if (!parsed) {
    const err = new Error('folder inválido');
    err.status = 400;
    err.message = `HTTP ${err.status} - ${err.message || ''} - Error al parsear folder`;
    logger.warn('[volumen] %s', err.message);
    //return next(err);
    return res.status(400).json({ error: 'folder inválido' });
  }

  try {
    const sql = `
      SELECT volumen_automatico,
             volumen_pulmon_automatico,
             volumen_fibrosis_automatico,
             volumen_manual,
             volumen_pulmon_manual,
             volumen_fibrosis_manual
        FROM estudio
       WHERE nss_expediente=? AND fecha=?
       LIMIT 1`;
    db.query(sql, [parsed.nss, parsed.fechaSQL], async (err, rows) => {
      if (err) {
        logger.error('[volumen] DB error: %s', err.message);
        return res.status(500).json({ error: 'DB error' });
      }
      if (!rows || !rows.length) {
        // Fallback a archivo volumenes.json, si existe
        const volPathA = path.join(__dirname, '..', 'temp', req.params.folder, 'segmentaciones_por_dicom', 'volumenes.json');
        const volPathB = path.join(__dirname, '..', 'temp', req.params.folder, 'volumenes.json');
        const candidate = fs.existsSync(volPathA) ? volPathA : (fs.existsSync(volPathB) ? volPathB : null);
        if (!candidate) {
          err.status = 404;
          err.message = `HTTP ${err.status} - ${err.message || ''} Volumen no disponible aún`;
          //return next(err);
          logger.warn(`[volumen] volumenes.json no encontrado en ${volPathA} ni ${volPathB}: ${err.message}`);
          return res.status(404).json({ error: 'Volumen no disponible aún' });
        }
        try {
          const data = JSON.parse(await fsp.readFile(candidate, 'utf8'));
          return res.json({
            lung_volume_ml: Number(data?.lung_volume_ml) || null,
            fibrosis_volume_ml: Number(data?.fibrosis_volume_ml) || null,
            total_volume_ml: Number(data?.total_volume_ml) || null,
          });
        } catch (e) {
          e.status = 500;
          e.message = `HTTP ${e.status} - ${e.message || ''} - Error leyendo volumenes.json`;
          logger.error(e.message);
          return res.status(500).json({ error: 'Error interno al leer volúmenes.' });
        }
      }

      const r = rows[0] || {};
      const lung = r.volumen_pulmon_manual ?? r.volumen_pulmon_automatico ?? null;
      const fib = r.volumen_fibrosis_manual ?? r.volumen_fibrosis_automatico ?? null;
      let total = r.volumen_manual ?? r.volumen_automatico ?? null;
      if (total == null && lung != null && fib != null) total = Number(lung) + Number(fib);

      return res.json({
        lung_volume_ml: lung != null ? Number(lung) : null,
        fibrosis_volume_ml: fib != null ? Number(fib) : null,
        total_volume_ml: total != null ? Number(total) : null,
      });
    });
  } catch (e) {
    e.status = 500;
    e.message = `HTTP ${e.status} - ${e.message || ''} - Error procesando volumen`;
    logger.error(e.message);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// Indices válidos (slices) que tienen máscaras en BD
router.get("/valid-indices/:folder", (req, res, next) => {
  const parsed = parseFolder(req.params.folder);
  if (!parsed) {
    logger.warn('[volumen] folder inválido: %s', req.params.folder);
    return res.status(400).json({ error: 'folder inválido' });
  }
  const sql = `
    SELECT DISTINCT num_tomo
      FROM mascara
     WHERE nss_exp=? AND fecha_estudio=?
       AND clase IN ('pulmon','fibrosis')
       AND tipo IN ('manual','automatica')
     ORDER BY num_tomo ASC`;
  db.query(sql, [parsed.nss, parsed.fechaSQL], (err, rows) => {
    if (err) {
      err.status = 500;
      err.message = `HTTP ${err.status} - ${err.message || ''} - Error consultando índices válidos`;
      logger.error(err.message);
      return res.status(500).json({ error: 'DB error' });
    }
    const map = {};
    for (const r of rows || []) map[r.num_tomo - 1] = true; // front usa 0-based
    res.json(map);
  });
});

// Máscara por slice (prefiere manual)
router.get('/mask-db-by-folder/:folder/:index', (req, res) => {
  const parsed = parseFolder(req.params.folder);
  if (!parsed) return res.status(400).json({ error: 'folder inválido' });
  const indexZero = Number(req.params.index);
  if (!Number.isFinite(indexZero)) return res.status(400).json({ error: 'index inválido' });
  const num_tomo = indexZero + 1;

  const sql = `
    SELECT tipo, clase, coordenadas
      FROM mascara
     WHERE nss_exp=? AND fecha_estudio=? AND num_tomo=?
       AND clase IN ('pulmon','fibrosis')
       AND tipo IN ('manual','automatica')`;
  db.query(sql, [parsed.nss, parsed.fechaSQL, num_tomo], (err, rows) => {
    if (err) {
      err.status = 500;
      err.message = `HTTP ${err.status} - ${err.message || ''} - Error consultando máscara: [mask-db-by-folder] DB error`;
      logger.error(err.message);
      return res.status(500).json({ error: 'DB error' });
    }
    if (!rows || !rows.length) {
      return res.json({ lung: [], fibrosis: [] });
    }
    const byClase = pickPreferManual(rows);
    const payload = normalizeCoords(byClase.pulmon, byClase.fibrosis);
    res.json(payload);
  });
});

// ========= Helpers exportables =========
async function findMaskBaseDir(absDir) {
  const candidates = [];
  const pushIfExists = (p) => { if (fs.existsSync(p)) candidates.push(p); };
  pushIfExists(absDir);
  pushIfExists(path.join(absDir, 'segmentaciones_por_dicom'));

  try {
    const entries = await fsp.readdir(absDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        const d = path.join(absDir, e.name);
        pushIfExists(d);
        pushIfExists(path.join(d, 'segmentaciones_por_dicom'));
      }
    }
  } catch (e) {
    e.status = 500;
    e.message = `HTTP ${e.status} - ${e.message || ''} - Error buscando máscara base dir`;
    logger.error(e.message);
    //return res.status(500).json({ error: 'Error interno' });
  }

  for (const cand of candidates) {
    try {
      const files = await fsp.readdir(cand);
      const hasMask = files.some(f => /^mask_\d+(_simplified)?\.json$/i.test(f));
      if (hasMask) {
        console.log('[POST-SEG] mask base dir =', cand);
        return cand;
      }
    } catch (e) {
      e.status = 500;
      e.message = `HTTP ${e.status} - ${e.message || ''} - Error procesando volumen`;
      next(e);
    }
  }
  logger.warn('[POST-SEG] No se encontró carpeta con mask_*.json bajo', absDir);
  return null;
}

async function guardarMascarasEnBDFromDir(absDir, nss, fechaSQL) {
  const segmentDir = await findMaskBaseDir(absDir);
  if (!segmentDir) {
    try {
      const sample = await fsp.readdir(absDir);
      logger.info('[POST-SEG] sample tmpDir:', sample.slice(0, 30));
    } catch (err) {
      logger.error('[POST-SEG] Error leyendo tmpDir:', err.message);
    }
    return;
  }

  const files = await fsp.readdir(segmentDir).catch(() => []);
  const all = files.filter(f => /^mask_\d+(_simplified)?\.json$/i.test(f));
  if (!all.length) {
    console.warn('[POST-SEG] No hay máscaras en', segmentDir);
    return;
  }

  const idxOf = (name) => {
    const m = name.match(/^mask_(\d+)(?:_simplified)?\.json$/i);
    return m ? parseInt(m[1], 10) : NaN;
  };
  const indices = Array.from(new Set(all.map(idxOf).filter(Number.isFinite))).sort((a, b) => a - b);
  const tryPath = (i, suffix = '') => {
    const p3 = path.join(segmentDir, `mask_${String(i).padStart(3, '0')}${suffix}.json`);
    const p4 = path.join(segmentDir, `mask_${String(i).padStart(4, '0')}${suffix}.json`);
    if (fs.existsSync(p3)) return p3;
    if (fs.existsSync(p4)) return p4;
    return null;
  };

  for (const i of indices) {
    const num_tomo = i + 1;

    // automática
    const aPath = tryPath(i, '');
    if (aPath) {
      const j = readJSONMaybe(aPath) || {};
      const lung = j?.lung ?? [];
      const fib = j?.fibrosis ?? [];
      try {
        await upsertMascaraAsync({ nss, fechaSQL, num_tomo, tipo: 'automatica', clase: 'pulmon', payload: { lung } });
      }
      catch (e) {
        logger.error('[POST-SEG] Error guardando máscara automática pulmon %s/%s/%s: %s', nss, fechaSQL, num_tomo, e.message);
      }
      try {
        await upsertMascaraAsync({ nss, fechaSQL, num_tomo, tipo: 'automatica', clase: 'fibrosis', payload: { fibrosis: fib } });
      }
      catch (e) {
        logger.error('[POST-SEG] Error guardando máscara automática fibrosis %s/%s/%s: %s', nss, fechaSQL, num_tomo, e.message);
      }
    }

    // manual (simplified)
    const mPath = tryPath(i, '_simplified');
    if (mPath) {
      const j = readJSONMaybe(mPath) || {};
      const lung = j?.lung_editable ?? [];
      const fib = j?.fibrosis_editable ?? [];
      await upsertMascaraAsync({ nss, fechaSQL, num_tomo, tipo: 'manual', clase: 'pulmon', payload: { lung_editable: lung } });
      await upsertMascaraAsync({ nss, fechaSQL, num_tomo, tipo: 'manual', clase: 'fibrosis', payload: { fibrosis_editable: fib } });
    }
  }

  logger.info('[POST-SEG] Máscaras volcadas a BD desde', segmentDir);
}

/**
 * Lee volumenes.json (si existe) y actualiza estudio.*
 * - volumen_automatico, volumen_pulmon_automatico, volumen_fibrosis_automatico
 */
async function updateEstudioVolumenFromDir(absDir, nss, fechaSQL) {
  const candidates = [];
  candidates.push(path.join(absDir, 'volumenes.json'));
  const segDir = path.join(absDir, 'segmentaciones_por_dicom');
  if (fs.existsSync(segDir)) candidates.push(path.join(segDir, 'volumenes.json'));

  try {
    const entries = await fsp.readdir(absDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        const d = path.join(absDir, e.name);
        candidates.push(path.join(d, 'volumenes.json'));
        candidates.push(path.join(d, 'segmentaciones_por_dicom', 'volumenes.json'));
      }
    }
  } catch (err) { 
    logger.error('[POST-SEG] Error buscando volumenes.json:', err.message);
   }

  let volFile = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) { volFile = c; break; }
  }
  if (!volFile) {
    logger.warn('[POST-SEG] volumenes.json no encontrado');
    return;
  }

  try {
    const raw = await fsp.readFile(volFile, 'utf8');
    const j = JSON.parse(raw);
    const lung = Number(j?.lung_volume_ml);
    const fibro = Number(j?.fibrosis_volume_ml);
    const total = Number(j?.total_volume_ml);

    if (!Number.isFinite(total)) {
      logger.warn('[POST-SEG] total_volume_ml inválido en', volFile);
      return;
    }

    const sets = ['volumen_automatico=?'];
    const vals = [total];
    if (Number.isFinite(lung)) { sets.push('volumen_pulmon_automatico=?'); vals.push(lung); }
    if (Number.isFinite(fibro)) { sets.push('volumen_fibrosis_automatico=?'); vals.push(fibro); }

    const sql = `UPDATE estudio SET ${sets.join(', ')} WHERE nss_expediente=? AND fecha=?`;
    vals.push(nss, fechaSQL);

    await new Promise((resolve, reject) => {
      db.query(sql, vals, (err) => err ? reject(err) : resolve());
    });

    logger.info('[POST-SEG] volúmenes (auto) actualizados →',
      { total, lung: Number.isFinite(lung) ? lung : null, fibrosis: Number.isFinite(fibro) ? fibro : null },
      'desde', volFile);
  } catch (e) {
    logger.error('[POST-SEG] Error actualizando volúmenes:', e.message);
  }
}

// Guardar edición manual
router.post('/save-edit/:folder/:index', express.json(), async (req, res) => {
  try {
    const parsed = parseFolder(req.params.folder);
    if (!parsed) return res.status(400).json({ error: 'folder inválido' });

    const indexStr = String(req.params.index).replace(/\D+/g, '');
    if (indexStr === '') return res.status(400).json({ error: 'index inválido' });
    const indexZero = parseInt(indexStr, 10);
    if (!Number.isFinite(indexZero)) return res.status(400).json({ error: 'index inválido' });
    const num_tomo = indexZero + 1;

    const lung_editable = Array.isArray(req.body?.lung_editable) ? req.body.lung_editable : [];
    const fibrosis_editable = Array.isArray(req.body?.fibrosis_editable) ? req.body.fibrosis_editable : [];

    await upsertMascaraAsync({
      nss: parsed.nss, fechaSQL: parsed.fechaSQL, num_tomo,
      tipo: 'manual', clase: 'pulmon', payload: { lung_editable }
    });

    await upsertMascaraAsync({
      nss: parsed.nss, fechaSQL: parsed.fechaSQL, num_tomo,
      tipo: 'manual', clase: 'fibrosis', payload: { fibrosis_editable }
    });

    // Si se almacena como log es probable que genere demasiado tráfico en el logger
    console.log('[SAVE-EDIT] ok → nss=%s fecha=%s num_tomo=%s lungPts=%d fibPts=%d',
      parsed.nss, parsed.fechaSQL, num_tomo, lung_editable?.length || 0, fibrosis_editable?.length || 0);

    return res.json({ ok: true, num_tomo, lung_points: lung_editable.length, fibrosis_points: fibrosis_editable.length });
  } catch (e) {
    logger.error('[SAVE-EDIT] error:', e.message);
    return res.status(500).json({ error: 'Error guardando edición' });
  }
});

// Devolver máscaras (automática o manual_simplified) desde BD
router.get('/mask-json/:folder/:name', async (req, res) => {
  const parsed = parseFolder(req.params.folder);
  if (!parsed) return res.status(400).json({ error: 'folder inválido' });

  const m = String(req.params.name).match(/^(\d{3,4})(?:(_simplified))?$/i);
  if (!m) return res.status(400).json({ error: 'nombre inválido' });

  const indexZero = parseInt(m[1], 10);  // 0-based del front
  const num_tomo = indexZero + 1;
  const wantSimplified = !!m[2];
  const tipo = wantSimplified ? 'manual' : 'automatica';

  db.query(
    `SELECT clase, coordenadas
       FROM mascara
      WHERE nss_exp=? AND fecha_estudio=? AND num_tomo=? AND tipo=? AND clase IN ('pulmon','fibrosis')`,
    [parsed.nss, parsed.fechaSQL, num_tomo, tipo],
    (err, rows) => {
      if (err) {
        logger.error('[mask-json] DB error:', err);
        return res.status(500).json({ error: 'DB error' });
      }
      if (!rows || rows.length === 0) {
        logger.warn('[mask-json] No hay máscaras en BD para NSS: %s, Fecha: %s, num_tomo: %s', parsed.nss, parsed.fechaSQL, num_tomo);
        return res.status(404).json({ error: 'no hay máscaras en BD' });
      }
      const out = wantSimplified
        ? { lung_editable: [], fibrosis_editable: [] }
        : { lung: [], fibrosis: [] };

      for (const r of rows) {
        let data = r.coordenadas;
        try { if (typeof data === 'string') data = JSON.parse(data); } 
        catch (err) { 
            logger.error('[mask-json] Error parsing JSON:', err.message);  
            //return; 
          }
        if (wantSimplified) {
          if (r.clase === 'pulmon' && Array.isArray(data?.lung_editable)) out.lung_editable = data.lung_editable;
          if (r.clase === 'fibrosis' && Array.isArray(data?.fibrosis_editable)) out.fibrosis_editable = data.fibrosis_editable;
        } else {
          if (r.clase === 'pulmon' && Array.isArray(data?.lung)) out.lung = data.lung;
          if (r.clase === 'fibrosis' && Array.isArray(data?.fibrosis)) out.fibrosis = data.fibrosis;
        }
      }
      res.json(out);
    }
  );
});

// Estado / progreso de volcado/segmentación
router.get('/status/:folder', async (req, res) => {
  const parsed = parseFolder(req.params.folder);
  if (!parsed) return res.status(400).json({ error: 'folder inválido' });

  try {
    const totalImgs = await new Promise((resolve, reject) => {
      db.query(
        'SELECT COUNT(*) AS c FROM imagen WHERE nss_exp=? AND fecha_estudio=?',
        [parsed.nss, parsed.fechaSQL],
        (err, rows) => err ? reject(err) : resolve(Number(rows?.[0]?.c || 0))
      );
    });

    const slicesConMascara = await new Promise((resolve, reject) => {
      db.query(
        `SELECT COUNT(DISTINCT num_tomo) AS c
           FROM mascara
          WHERE nss_exp=? AND fecha_estudio=?
            AND clase IN ('pulmon','fibrosis')
            AND tipo IN ('automatica','manual')`,
        [parsed.nss, parsed.fechaSQL],
        (err, rows) => err ? reject(err) : resolve(Number(rows?.[0]?.c || 0))
      );
    });

    const sqlV = `
      SELECT volumen_automatico, volumen_pulmon_automatico, volumen_fibrosis_automatico,
             volumen_manual, volumen_pulmon_manual, volumen_fibrosis_manual
        FROM estudio
       WHERE nss_expediente=? AND fecha=?
       LIMIT 1`;
    const vols = await new Promise((resolve, reject) => {
      db.query(sqlV, [parsed.nss, parsed.fechaSQL],
        (err, rows) => err ? reject(err) : resolve(rows?.[0] || {}));
    });

    const lung = vols?.volumen_pulmon_manual ?? vols?.volumen_pulmon_automatico ?? null;
    const fib = vols?.volumen_fibrosis_manual ?? vols?.volumen_fibrosis_automatico ?? null;
    let total = vols?.volumen_manual ?? vols?.volumen_automatico ?? null;
    if (total == null && lung != null && fib != null) total = Number(lung) + Number(fib);

    const volumeAvailable = (total != null) || (lung != null) || (fib != null);

    let estado = 'segmenting';
    if (totalImgs > 0 && slicesConMascara > 0 && slicesConMascara < totalImgs) estado = 'dumping';
    if ((totalImgs > 0 && slicesConMascara >= totalImgs) || volumeAvailable) estado = 'ready';

    const ready = (estado === 'ready');
    const progreso = (totalImgs > 0)
      ? Math.max(0, Math.min(100, Math.round((slicesConMascara / totalImgs) * 100)))
      : (slicesConMascara > 0 ? 100 : null);

    res.json({
      ready,
      estado,               // 'segmenting' | 'dumping' | 'ready'
      progreso,             // 0..100 o null si no hay total
      totalImgs,
      slicesConMascara,
      volume: {
        total_auto: total != null ? Number(total) : null,
        pulm_auto: lung != null ? Number(lung) : null,
        fib_auto: fib != null ? Number(fib) : null
      },
      nss: parsed.nss,
      fecha: parsed.fechaSQL,
    });
  } catch (e) {
    e.status = 500;
    e.message = `HTTP ${e.status} - ${e.message || ''} - Error consultando estado / progreso de volcado/segmentación`;
    logger.error(e.message);
    return res.status(500).json({ error: 'Error consultando estado' });
  }
});

module.exports = {
  router,
  guardarMascarasEnBDFromDir,
  updateEstudioVolumenFromDir,
};
