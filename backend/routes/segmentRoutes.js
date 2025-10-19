/**
 * backend/routes/segmentRoutes.js
 * Rutas para máscaras y volúmenes (lee preferentemente desde BD).
 * Incluye helpers robustos para volcar máscaras/volúmenes desde un dir temporal.
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const db = require('../connectionDb'); // conexión MySQL

// ========= Utils =========

function parseFolder(folder) {
  // NSS_YYYY-MM-DD_HH_mm_ss
  const m = folder.match(/^([A-Za-z0-9_-]+)_((\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2}))$/);
  if (!m) return null;
  const nss = m[1];
  const fechaSQL = `${m[3]} ${m[4]}:${m[5]}:${m[6]}`; // YYYY-MM-DD HH:mm:ss
  return { nss, fechaSQL };
}

function readJSONMaybe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const txt = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    console.error('[JSON] error leyendo', filePath, e.message);
    return null;
  }
}

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

// promesa con manejo de error real
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
    try { if (typeof data === 'string') data = JSON.parse(data); } catch {}
    const lung = data?.lung ?? data?.lung_editable ?? [];
    const fib  = data?.fibrosis ?? data?.fibrosis_editable ?? [];
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

// ========= Helpers de esquema dinámico =========

async function getColumns(table) {
  const cols = new Set();
  await new Promise((resolve, reject) => {
    db.query(`SHOW COLUMNS FROM \`${table}\``, (err, rows) => {
      if (err) return reject(err);
      for (const r of rows || []) cols.add(r.Field);
      resolve();
    });
  });
  return cols;
}

// ========= Endpoints públicos (leyendo BD) =========

// GET /api/segment/volumen/:folder
router.get('/volumen/:folder', async (req, res) => {
  const parsed = parseFolder(req.params.folder);
  if (!parsed) return res.status(400).json({ error: 'folder inválido' });

  try {
    const cols = await getColumns('estudio');

    // Construir SELECT dinámico según columnas disponibles
    const wanted = [];
    if (cols.has('volumen_automatico')) wanted.push('volumen_automatico');
    if (cols.has('volumen_manual')) wanted.push('volumen_manual');
    if (cols.has('volumen_pulmon_automatico')) wanted.push('volumen_pulmon_automatico');
    if (cols.has('volumen_fibrosis_automatico')) wanted.push('volumen_fibrosis_automatico');
    if (cols.has('volumen_json_automatico')) wanted.push('volumen_json_automatico');

    if (!wanted.length) {
      return res.status(404).json({ error: 'Volúmenes no disponibles en BD' });
    }

    const sql = `SELECT ${wanted.join(', ')} FROM estudio WHERE nss_expediente=? AND fecha=? LIMIT 1`;
    db.query(sql, [parsed.nss, parsed.fechaSQL], async (err, rows) => {
      if (err) {
        console.error('[volumen] DB error:', err.message);
        return res.status(500).json({ error: 'DB error' });
      }
      if (!rows || !rows.length) {
        return res.status(404).json({ error: 'Estudio no encontrado' });
      }
      const r = rows[0] || {};
      let lung = cols.has('volumen_pulmon_automatico') ? r.volumen_pulmon_automatico : null;
      let fibro = cols.has('volumen_fibrosis_automatico') ? r.volumen_fibrosis_automatico : null;
      let total = r.volumen_automatico ?? r.volumen_manual ?? null;

      // Si hay JSON de respaldo, úsalo para rellenar faltantes
      if (cols.has('volumen_json_automatico') && r.volumen_json_automatico && (lung == null || fibro == null || total == null)) {
        try {
          const j = typeof r.volumen_json_automatico === 'string'
            ? JSON.parse(r.volumen_json_automatico)
            : r.volumen_json_automatico;
          if (lung == null) lung = j?.lung_volume_ml ?? lung;
          if (fibro == null) fibro = j?.fibrosis_volume_ml ?? fibro;
          if (total == null) total = j?.total_volume_ml ?? total;
        } catch {}
      }

      if (total == null && lung != null && fibro != null) {
        total = Number(lung) + Number(fibro);
      }

      if (lung == null && fibro == null && total == null) {
        // Fallback a archivo (solo si existe)
        const volPathA = path.join(__dirname, '..', 'temp', req.params.folder, 'segmentaciones_por_dicom', 'volumenes.json');
        const volPathB = path.join(__dirname, '..', 'temp', req.params.folder, 'volumenes.json');
        const candidate = fs.existsSync(volPathA) ? volPathA : (fs.existsSync(volPathB) ? volPathB : null);
        if (!candidate) {
          console.warn('[volumen] No hay valor en BD ni archivo volumenes.json (aún).');
          return res.status(404).json({ error: "Volumen no disponible aún" });
        }
        try {
          const data = JSON.parse(await fsp.readFile(candidate, 'utf8'));
          return res.json({
            lung_volume_ml: data?.lung_volume_ml ?? null,
            fibrosis_volume_ml: data?.fibrosis_volume_ml ?? null,
            total_volume_ml: data?.total_volume_ml ?? null,
          });
        } catch (e) {
          console.error("[volumen] Error al leer", candidate, e.message);
          return res.status(500).json({ error: "Error interno al leer volúmenes." });
        }
      }

      return res.json({
        lung_volume_ml: lung ?? null,
        fibrosis_volume_ml: fibro ?? null,
        total_volume_ml: total ?? null,
      });
    });
  } catch (e) {
    console.error('[volumen] error:', e.message);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/segment/valid-indices/:folder
router.get("/valid-indices/:folder", (req, res) => {
  const parsed = parseFolder(req.params.folder);
  if (!parsed) return res.status(400).json({ error: "folder inválido" });

  const sql = `
    SELECT DISTINCT num_tomo
      FROM mascara
     WHERE nss_exp=? AND fecha_estudio=?
       AND clase IN ('pulmon','fibrosis')
       AND tipo IN ('manual','automatica')
     ORDER BY num_tomo ASC`;
  db.query(sql, [parsed.nss, parsed.fechaSQL], (err, rows) => {
    if (err) {
      console.error('[valid-indices] DB error:', err.message);
      return res.status(500).json({ error: 'DB error' });
    }
    const map = {};
    for (const r of rows) map[r.num_tomo - 1] = true; // front usa 0-based
    console.log('[valid-indices] total indices:', rows?.length || 0);
    res.json(map);
  });
});

// GET /api/segment/mask-db-by-folder/:folder/:index
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
      console.error('[mask-db-by-folder] DB error:', err.message);
      return res.status(500).json({ error: 'DB error' });
    }
    if (!rows || !rows.length) {
      console.warn('[mask-db-by-folder] No hay máscaras para tomo', num_tomo);
      return res.json({ lung: [], fibrosis: [] });
    }
    const byClase = pickPreferManual(rows);
    const payload = normalizeCoords(byClase.pulmon, byClase.fibrosis);
    res.json(payload);
  });
});

// ========= Helpers exportables (para imageRoutes) =========

// Busca recursivamente (profundidad 1) un directorio que contenga mask_*.json
async function findMaskBaseDir(absDir) {
  const candidates = [];
  const pushIfExists = (p) => { if (fs.existsSync(p)) candidates.push(p); };
  pushIfExists(absDir);
  pushIfExists(path.join(absDir, 'segmentaciones_por_dicom'));

  // subcarpetas nivel 1
  try {
    const entries = await fsp.readdir(absDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        const d = path.join(absDir, e.name);
        pushIfExists(d);
        pushIfExists(path.join(d, 'segmentaciones_por_dicom'));
      }
    }
  } catch {}

  for (const cand of candidates) {
    try {
      const files = await fsp.readdir(cand);
      const hasMask = files.some(f => /^mask_\d+(_simplified)?\.json$/i.test(f));
      if (hasMask) {
        console.log('[POST-SEG] mask base dir =', cand);
        return cand;
      }
    } catch {}
  }
  console.warn('[POST-SEG] No se encontró carpeta con mask_*.json bajo', absDir);
  return null;
}

/**
 * Escanea (de forma robusta) las máscaras en absDir (o subcarpetas típicas)
 * y las vuelca a la BD (auto + manual_simplified).
 */
async function guardarMascarasEnBDFromDir(absDir, nss, fechaSQL) {
  const segmentDir = await findMaskBaseDir(absDir);
  if (!segmentDir) {
    try {
      const sample = await fsp.readdir(absDir);
      console.warn('[POST-SEG] sample tmpDir:', sample.slice(0, 30));
    } catch {}
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
  const indices = Array.from(new Set(all.map(idxOf).filter(Number.isFinite))).sort((a,b)=>a-b);
  console.log('[POST-SEG] índices detectados:', indices.slice(0,20), indices.length>20?'...':'');

  const tryPath = (i, suffix='') => {
    const p3 = path.join(segmentDir, `mask_${String(i).padStart(3,'0')}${suffix}.json`);
    const p4 = path.join(segmentDir, `mask_${String(i).padStart(4,'0')}${suffix}.json`);
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
      const fib  = j?.fibrosis ?? [];
      await upsertMascaraAsync({ nss, fechaSQL, num_tomo, tipo: 'automatica', clase: 'pulmon',  payload: { lung } });
      await upsertMascaraAsync({ nss, fechaSQL, num_tomo, tipo: 'automatica', clase: 'fibrosis', payload: { fibrosis: fib } });
    }

    // manual (simplified)
    const mPath = tryPath(i, '_simplified');
    if (mPath) {
      const j = readJSONMaybe(mPath) || {};
      const lung = j?.lung_editable ?? [];
      const fib  = j?.fibrosis_editable ?? [];
      await upsertMascaraAsync({ nss, fechaSQL, num_tomo, tipo: 'manual', clase: 'pulmon',  payload: { lung_editable: lung } });
      await upsertMascaraAsync({ nss, fechaSQL, num_tomo, tipo: 'manual', clase: 'fibrosis', payload: { fibrosis_editable: fib } });
    }
  }

  console.log('[POST-SEG] Máscaras volcadas a BD desde', segmentDir);
}

/**
 * Lee volumenes.json (si existe) en absDir o subcarpetas típicas y
 * actualiza estudio.* con lo que haya disponible:
 * - volumen_automatico (total)
 * - volumen_pulmon_automatico (opcional)
 * - volumen_fibrosis_automatico (opcional)
 * - volumen_json_automatico (opcional, respaldo)
 */
async function updateEstudioVolumenFromDir(absDir, nss, fechaSQL) {
  const candidates = [];
  candidates.push(path.join(absDir, 'volumenes.json'));
  const segDir = path.join(absDir, 'segmentaciones_por_dicom');
  if (fs.existsSync(segDir)) candidates.push(path.join(segDir, 'volumenes.json'));

  // subcarpetas nivel 1
  try {
    const entries = await fsp.readdir(absDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        const d = path.join(absDir, e.name);
        candidates.push(path.join(d, 'volumenes.json'));
        candidates.push(path.join(d, 'segmentaciones_por_dicom', 'volumenes.json'));
      }
    }
  } catch {}

  let volFile = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) { volFile = c; break; }
  }
  if (!volFile) {
    console.warn('[POST-SEG] volumenes.json no encontrado en candidatos:', candidates.slice(0,6));
    return;
  }

  try {
    const raw = await fsp.readFile(volFile, 'utf8');
    const j = JSON.parse(raw);
    const lung  = Number(j?.lung_volume_ml);
    const fibro = Number(j?.fibrosis_volume_ml);
    const total = Number(j?.total_volume_ml);

    if (!Number.isFinite(total)) {
      console.warn('[POST-SEG] total_volume_ml inválido en', volFile, 'contenido:', j);
      return;
    }

    const cols = await getColumns('estudio');
    const sets = [];
    const vals = [];

    if (cols.has('volumen_automatico')) {
      sets.push('volumen_automatico=?'); vals.push(total);
    }
    if (Number.isFinite(lung) && cols.has('volumen_pulmon_automatico')) {
      sets.push('volumen_pulmon_automatico=?'); vals.push(lung);
    }
    if (Number.isFinite(fibro) && cols.has('volumen_fibrosis_automatico')) {
      sets.push('volumen_fibrosis_automatico=?'); vals.push(fibro);
    }
    if (cols.has('volumen_json_automatico')) {
      sets.push('volumen_json_automatico=?'); vals.push(JSON.stringify(j));
    }

    if (!sets.length) {
      console.warn('[POST-SEG] No hay columnas de volumen para actualizar en estudio; considera agregar columnas por-clase.');
      return;
    }

    const sql = `UPDATE estudio SET ${sets.join(', ')} WHERE nss_expediente=? AND fecha=?`;
    vals.push(nss, fechaSQL);

    await new Promise((resolve, reject) => {
      db.query(sql, vals, (err) => err ? reject(err) : resolve());
    });

    console.log('[POST-SEG] volúmenes (auto) actualizados →',
      { total, lung: Number.isFinite(lung) ? lung : null, fibrosis: Number.isFinite(fibro) ? fibro : null },
      'desde', volFile);
  } catch (e) {
    console.error('[POST-SEG] Error actualizando volúmenes:', e.message);
  }
}

// POST /api/segment/save-edit/:folder/:index  -> guarda edición manual en BD
router.post('/save-edit/:folder/:index', express.json(), async (req, res) => {
  try {
    const parsed = parseFolder(req.params.folder);
    if (!parsed) return res.status(400).json({ error: 'folder inválido' });

    // index 0-based del front (e.g. "079")
    const indexStr = String(req.params.index).replace(/\D+/g, '');
    if (indexStr === '') return res.status(400).json({ error: 'index inválido' });
    const indexZero = parseInt(indexStr, 10);
    if (!Number.isFinite(indexZero)) return res.status(400).json({ error: 'index inválido' });
    const num_tomo = indexZero + 1;

    const lung_editable = Array.isArray(req.body?.lung_editable) ? req.body.lung_editable : [];
    const fibrosis_editable = Array.isArray(req.body?.fibrosis_editable) ? req.body.fibrosis_editable : [];

    await upsertMascaraAsync({
      nss: parsed.nss,
      fechaSQL: parsed.fechaSQL,
      num_tomo,
      tipo: 'manual',
      clase: 'pulmon',
      payload: { lung_editable }
    });

    await upsertMascaraAsync({
      nss: parsed.nss,
      fechaSQL: parsed.fechaSQL,
      num_tomo,
      tipo: 'manual',
      clase: 'fibrosis',
      payload: { fibrosis_editable }
    });

    console.log('[SAVE-EDIT] ok → nss=%s fecha=%s num_tomo=%s lungPts=%d fibPts=%d',
      parsed.nss, parsed.fechaSQL, num_tomo, lung_editable?.length || 0, fibrosis_editable?.length || 0);

    return res.json({ ok: true, num_tomo, lung_points: lung_editable.length, fibrosis_points: fibrosis_editable.length });
  } catch (e) {
    console.error('[SAVE-EDIT] error:', e.message);
    return res.status(500).json({ error: 'Error guardando edición' });
  }
});

// GET /api/segment/mask-json/:folder/:name
//   - sin sufijo: devuelve {lung, fibrosis} desde tipo 'automatica'
//   - con _simplified: devuelve {lung_editable, fibrosis_editable} desde 'manual'
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
        console.error('[mask-json] DB error:', err.message);
        return res.status(500).json({ error: 'DB error' });
      }
      if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'no hay máscaras en BD' });
      }
      const out = wantSimplified
        ? { lung_editable: [], fibrosis_editable: [] }
        : { lung: [], fibrosis: [] };

      for (const r of rows) {
        let data = r.coordenadas;
        try { if (typeof data === 'string') data = JSON.parse(data); } catch {}
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

// Devuelve si el estudio ya tiene datos volcados en BD.
// GET /api/segment/status/:folder
router.get('/status/:folder', async (req, res) => {
  const parsed = parseFolder(req.params.folder);
  if (!parsed) return res.status(400).json({ error: 'folder inválido' });

  try {
    // 1) total de imágenes del estudio
    const totalImgs = await new Promise((resolve, reject) => {
      db.query(
        'SELECT COUNT(*) AS c FROM imagen WHERE nss_exp=? AND fecha_estudio=?',
        [parsed.nss, parsed.fechaSQL],
        (err, rows) => err ? reject(err) : resolve(Number(rows?.[0]?.c || 0))
      );
    });

    // 2) slices con máscaras ya volcadas
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

    // 3) volumen ya disponible en estudio (cualquiera de las variantes)
    const cols = await getColumns('estudio');
    const wants = [];
    if (cols.has('volumen_automatico')) wants.push('volumen_automatico');
    if (cols.has('volumen_pulmon_automatico')) wants.push('volumen_pulmon_automatico');
    if (cols.has('volumen_fibrosis_automatico')) wants.push('volumen_fibrosis_automatico');
    if (cols.has('volumen_json_automatico')) wants.push('volumen_json_automatico');

    let vol = {};
    if (wants.length) {
      const sql = `SELECT ${wants.join(', ')} FROM estudio WHERE nss_expediente=? AND fecha=? LIMIT 1`;
      vol = await new Promise((resolve, reject) => {
        db.query(sql, [parsed.nss, parsed.fechaSQL], (err, rows) =>
          err ? reject(err) : resolve(rows?.[0] || {})
        );
      });
    }

    let total = vol?.volumen_automatico ?? null;
    let pulm  = vol?.volumen_pulmon_automatico ?? null;
    let fib   = vol?.volumen_fibrosis_automatico ?? null;

    if ((pulm == null || fib == null || total == null) && vol?.volumen_json_automatico) {
      try {
        const j = typeof vol.volumen_json_automatico === 'string'
          ? JSON.parse(vol.volumen_json_automatico)
          : vol.volumen_json_automatico;
        if (pulm == null)  pulm  = j?.lung_volume_ml ?? pulm;
        if (fib == null)   fib   = j?.fibrosis_volume_ml ?? fib;
        if (total == null) total = j?.total_volume_ml ?? total;
      } catch {}
    }
    if (total == null && pulm != null && fib != null) total = Number(pulm) + Number(fib);

    const volumeAvailable = (total != null) || (pulm != null) || (fib != null);

    // 4) progreso + estado
    const progreso = totalImgs > 0
      ? Math.max(0, Math.min(100, Math.round((slicesConMascara / totalImgs) * 100)))
      : (slicesConMascara > 0 ? 100 : 0);

    let estado = 'segmenting';
    if (slicesConMascara > 0 && slicesConMascara < totalImgs) estado = 'dumping';
    if ((totalImgs > 0 && slicesConMascara >= totalImgs) || volumeAvailable) estado = 'ready';

    const ready = (estado === 'ready');

    res.json({
      ready,
      estado,               // 'segmenting' | 'dumping' | 'ready'
      progreso,             // 0..100
      totalImgs,
      slicesConMascara,
      volume: { total_auto: total ?? null, pulm_auto: pulm ?? null, fib_auto: fib ?? null },
      nss: parsed.nss,
      fecha: parsed.fechaSQL,
    });
  } catch (e) {
    console.error('[STATUS] error:', e.message);
    res.status(500).json({ error: 'Error consultando estado' });
  }
});

module.exports = {
  router,
  guardarMascarasEnBDFromDir,
  updateEstudioVolumenFromDir,
};
