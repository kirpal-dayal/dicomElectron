/**
 * backend/routes/segmentRoutes.js
 */
const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const db = require('../connectionDb'); // conexión MySQL

// ===== Utils =====
function parseFolder(folder) {
  // NSS_YYYY-MM-DD_HH_mm_ss
  const m = folder.match(/^(\d+)_((\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2}))$/);
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
        VALUES (?, ?, ?, ?, ?, ?)`
      ;
      db.query(ins, [nss, fechaSQL, num_tomo, tipo, clase, jsonStr], cb);
    }
  });
}

function pickPreferManual(rows) {
  // rows: [{tipo:'manual'|'automatica', clase:'pulmon'|'fibrosis', coordenadas}]
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
    // admite varias formas
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

// ====== POST /api/segment/run ======
router.post('/run', (req, res) => {
  const folder = req.body.folder;
  if (!folder) return res.status(400).json({ error: 'Falta folder.' });

  const parsed = parseFolder(folder);
  if (!parsed) return res.status(400).json({ error: 'Folder inválido.' });

  const scriptPath = path.join(__dirname, '../segmentation/main.py');
  const folderPath = path.join(__dirname, '../temp', folder);
  if (!fs.existsSync(folderPath)) {
    return res.status(400).json({ error: `No existe la carpeta: ${folder}` });
  }

  const command = `python "${scriptPath}" "${folderPath}"`;
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('Error al ejecutar el modelo:', error);
      return res.status(500).json({ error: 'Error al ejecutar el modelo', details: stderr });
    }

    console.log('Segmentación completada automáticamente.');
    console.log('stdout:', stdout);

    // Guardar a BD (pulmón/fibrosis) preferentemente
    guardarMascarasEnBD(folder, parsed.nss, parsed.fechaSQL);

    res.json({ message: 'Segmentación completada', output: stdout });
  });
});

// ====== GET /api/segment/mask-json/:folder/:index ======
router.get('/mask-json/:folder/:index', async (req, res) => {
  const { folder, index } = req.params;
  const paddedIndex = String(index).padStart(3, '0');
  const jsonPath = path.join(__dirname, '..', 'temp', folder, 'segmentaciones_por_dicom', `mask_${paddedIndex}.json`);
  try {
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: "Archivo no encontrado" });
    }
    const jsonData = await fs.promises.readFile(jsonPath, 'utf8');
    res.json(JSON.parse(jsonData));
  } catch (err) {
    console.error("Error al leer JSON:", err);
    res.status(500).json({ error: "Error interno al leer el archivo JSON." });
  }
});

// ====== GET /api/segment/volumen/:folder (opcional) ======
router.get('/volumen/:folder', async (req, res) => {
  const { folder } = req.params;
  const volumenPath = path.join(__dirname, '..', 'temp', folder, 'segmentaciones_por_dicom', 'volumenes.json');
  try {
    if (!fs.existsSync(volumenPath)) {
      return res.status(404).json({ error: "Archivo de volúmenes no encontrado" });
    }
    const data = await fs.promises.readFile(volumenPath, 'utf8');
    res.setHeader('Content-Type', 'application/json');
    res.send(data);
  } catch (err) {
    console.error("Error al leer volumenes.json:", err);
    res.status(500).json({ error: "Error interno al leer volúmenes." });
  }
});

// ====== POST /api/segment/save-edit/:folder/:index ======
// Front manda index 0-based; BD guarda num_tomo 1-based
router.post("/save-edit/:folder/:index", async (req, res) => {
  const { folder, index } = req.params;
  const { lung_editable = [], fibrosis_editable = [] } = req.body || {};
  const parsed = parseFolder(folder);
  if (!parsed) return res.status(400).json({ error: "Nombre de carpeta inválido" });

  const indexZero = Number(index);
  const num_tomo  = Number.isFinite(indexZero) ? indexZero + 1 : NaN;
  if (!Number.isFinite(num_tomo)) return res.status(400).json({ error: "index inválido" });

  // upsert manual/pulmon y manual/fibrosis
  upsertMascara(
    { nss: parsed.nss, fechaSQL: parsed.fechaSQL, num_tomo, tipo: 'manual', clase: 'pulmon',  payload: { lung_editable } },
    (e1) => {
      if (e1) {
        console.error('[save-edit] pulmon', e1.message);
        return res.status(500).json({ error: 'DB error pulmon' });
      }
      upsertMascara(
        { nss: parsed.nss, fechaSQL: parsed.fechaSQL, num_tomo, tipo: 'manual', clase: 'fibrosis', payload: { fibrosis_editable } },
        (e2) => {
          if (e2) {
            console.error('[save-edit] fibrosis', e2.message);
            return res.status(500).json({ error: 'DB error fibrosis' });
          }
          res.json({ ok: true });
        }
      );
    }
  );
});

// ====== Carga de máscaras generadas a BD (pulmón y fibrosis) ======
function guardarMascarasEnBD(folder, nss, fechaSQL) {
  const segmentDir = path.join(__dirname, "..", "temp", folder, "segmentaciones_por_dicom");

  let i = 0; // i es 0-based en disco
  const loop = () => {
    const padded = String(i).padStart(3, "0");
    const autoPath   = path.join(segmentDir, `mask_${padded}.json`);
    const manualPath = path.join(segmentDir, `mask_${padded}_simplified.json`);

    const hasAuto   = fs.existsSync(autoPath);
    const hasManual = fs.existsSync(manualPath);

    if (!hasAuto && !hasManual) {
      // Asumimos archivos contiguos; si no, se podría escanear directorio
      console.log('[BD] Finalizó en tomo (0-based)', i);
      return;
    }

    const num_tomo = i + 1; // BD 1-based
    const next = () => { i += 1; loop(); };

    // Procesa primero automática, luego manual (manual tendrá prioridad en consulta)
    const doAuto = (cb) => {
      if (!hasAuto) return cb();
      const j = readJSONMaybe(autoPath) || {};
      const lung = j?.lung ?? [];
      const fib  = j?.fibrosis ?? [];
      upsertMascara({ nss, fechaSQL, num_tomo, tipo: 'automatica', clase: 'pulmon',  payload: { lung } }, (eA) => {
        if (eA) console.error('[DB] auto/pulmon', eA.message);
        upsertMascara({ nss, fechaSQL, num_tomo, tipo: 'automatica', clase: 'fibrosis', payload: { fibrosis: fib } }, (eB) => {
          if (eB) console.error('[DB] auto/fibrosis', eB.message);
          cb();
        });
      });
    };

    const doManual = (cb) => {
      if (!hasManual) return cb();
      const j = readJSONMaybe(manualPath) || {};
      const lung = j?.lung_editable ?? [];
      const fib  = j?.fibrosis_editable ?? [];
      upsertMascara({ nss, fechaSQL, num_tomo, tipo: 'manual', clase: 'pulmon',  payload: { lung_editable: lung } }, (eA) => {
        if (eA) console.error('[DB] manual/pulmon', eA.message);
        upsertMascara({ nss, fechaSQL, num_tomo, tipo: 'manual', clase: 'fibrosis', payload: { fibrosis_editable: fib } }, (eB) => {
          if (eB) console.error('[DB] manual/fibrosis', eB.message);
          cb();
        });
      });
    };

    doAuto(() => doManual(next));
  };

  loop();
}

// ====== GET /api/segment/valid-indices/:folder (opcional legacy) ======
router.get("/valid-indices/:folder", async (req, res) => {
  const folder = req.params.folder;
  const filePath = path.join(__dirname, "..", "temp", folder, "segmentaciones_por_dicom", "valid_indices.json");
  try {
    const txt = fs.readFileSync(filePath, "utf-8");
    res.json(JSON.parse(txt));
  } catch (err) {
    res.status(404).json({ error: "Archivo valid_indices.json no encontrado." });
  }
});

// ====== GET /api/segment/mask-db/:nss/:fecha/:index ======
// Front manda :index 0-based; BD usa num_tomo 1-based
router.get('/mask-db/:nss/:fecha/:index', (req, res) => {
  const nss = req.params.nss;
  const fecha = decodeURIComponent(req.params.fecha);
  const indexZero = Number(req.params.index);
  if (!Number.isFinite(indexZero)) return res.status(400).json({ error: 'index inválido' });
  const num_tomo = indexZero + 1;

  const sql = `
    SELECT tipo, clase, coordenadas
      FROM mascara
     WHERE nss_exp=? AND fecha_estudio=? AND num_tomo=?
       AND clase IN ('pulmon','fibrosis')
       AND tipo IN ('manual','automatica')
  `;
  db.query(sql, [nss, fecha, num_tomo], (err, rows) => {
    if (err) {
      console.error('[mask-db] DB error:', err.message);
      return res.status(500).json({ error: 'DB error' });
    }
    if (!rows || !rows.length) return res.json({ lung: [], fibrosis: [] });
    const byClase = pickPreferManual(rows);
    const payload = normalizeCoords(byClase.pulmon, byClase.fibrosis);
    res.json(payload);
  });
});

// ====== GET /api/segment/mask-db-by-folder/:folder/:index ======
// Front manda :index 0-based; BD usa num_tomo 1-based
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
       AND tipo IN ('manual','automatica')
  `;
  db.query(sql, [parsed.nss, parsed.fechaSQL, num_tomo], (err, rows) => {
    if (err) {
      console.error('[mask-db-by-folder] DB error:', err.message);
      return res.status(500).json({ error: 'DB error' });
    }
    if (!rows || !rows.length) return res.json({ lung: [], fibrosis: [] });
    const byClase = pickPreferManual(rows);
    const payload = normalizeCoords(byClase.pulmon, byClase.fibrosis);
    res.json(payload);
  });
});

// ====== GET /api/segment/mask-stack-by-folder/:folder ======
// Devuelve todas las slices (0-based en la respuesta) con preferencia por máscaras "manual"
router.get('/mask-stack-by-folder/:folder', (req, res) => {
  const parsed = parseFolder(req.params.folder);
  if (!parsed) return res.status(400).json({ error: 'folder inválido' });

  const sql = `
    SELECT num_tomo, tipo, clase, coordenadas
      FROM mascara
     WHERE nss_exp=? AND fecha_estudio=?
       AND clase IN ('pulmon','fibrosis')
       AND tipo IN ('manual','automatica')
     ORDER BY num_tomo ASC
  `;
  db.query(sql, [parsed.nss, parsed.fechaSQL], (err, rows) => {
    if (err) {
      console.error('[mask-stack-by-folder] DB error:', err.message);
      return res.status(500).json({ error: 'DB error' });
    }
    if (!rows || !rows.length) return res.json({ bySlice: [] });

    // agrupa por num_tomo y aplica "prefer manual"
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.num_tomo)) map.set(r.num_tomo, []);
      map.get(r.num_tomo).push(r);
    }

    const maxSlice = Math.max(...Array.from(map.keys()));
    const bySlice = Array.from({ length: maxSlice }, () => ({ lung: [], fibrosis: [] }));

    for (const [num_tomo, group] of map.entries()) {
      const pref = pickPreferManual(group);
      const payload = normalizeCoords(pref.pulmon, pref.fibrosis);
      // num_tomo es 1-based en BD, lo colocamos 0-based en respuesta
      bySlice[num_tomo - 1] = payload;
    }

    res.json({ bySlice });
  });
});

module.exports = {
  router,
  guardarMascarasEnBD,
};
