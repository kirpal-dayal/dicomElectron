/**
 * backend/routes/segmentRoutes.js
 *
 * INTEGRACIÓN DEL MODELO DE SEGMENTACIÓN CON CARPETAS DICOM DESDE /temp
 * ------------------------------------------------------------------------------
 * Este endpoint permite ejecutar el modelo de segmentación U-net directamente
 * sobre las carpetas de archivos DICOM que se encuentran en /temp (después de
 * ser descomprimidas por el frontend).
 *
 * FLUJO:
 * 1. El frontend hace POST a /api/segment/run con el nombre de la carpeta dentro de /temp.
 * 2. Este endpoint verifica si existe.
 * 3. Llama al script `main.py` con la ruta absoluta a esa carpeta como argumento.
 * 4. El script Python procesa la carpeta y guarda la salida (mascaras_pred.tif, etc.)
 *    en la misma ruta o donde esté configurado.
 *
 * DEPENDENCIAS:
 * - Python 3.x y librerías (según `tensor_flow.yml`)
 * - El script `main.py` en /segmentation debe aceptar como entrada una carpeta con DICOM.
 *
 * EJEMPLO DE USO:
 *  POST /api/segment/run
 *  {
 *    "folder": "1234_2025-05-09_12_38_40"
 *  }
 *
 *  La carpeta debe existir en: /backend/temp/1234_2025-05-09_12_38_40/
 */

const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const db       = require('../connectionDb'); // esto es la conexión a la base de datos MySQL
const { nameDirectoryDicom } = require('../configConst');

// POST /api/segment/run
router.post('/run', (req, res) => {
  const folder = req.body.folder;

  if (!folder) {
    return res.status(400).json({ error: 'Falta el nombre de la carpeta en la solicitud.' });
  }

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

    const match = folder.match(/^(\d+)_([\d_]+)$/);
    if (match) {
      const nss = match[1];
      const fecha_str = match[2].replace(/_/g, ":").replace(/:(\d\d)$/, " $1");
      const fecha_estudio = new Date(fecha_str);

      // ⚠️ Aquí llamamos sin `await`, y lo dejamos correr en segundo plano
      guardarMascarasEnBD(folder, nss, fecha_estudio);
    } else {
      console.warn("[WARN] No se pudo parsear NSS y fecha del folder:", folder);
    }

    // Respondemos al frontend de inmediato
    res.json({ message: 'Segmentación completada', output: stdout });
  });
});


// GET /api/segment/mask-json/:folder/:index
router.get('/mask-json/:folder/:index', async (req, res) => {
  const { folder, index } = req.params;
  const paddedIndex = String(index).padStart(3, '0'); // esto es para que el índice tenga 3 dígitos, ej: 001, 002, etc. y la ruta coincida con el nombre del archivo JSON esperado
  // const jsonPath = path.join(__dirname, `../temp/${folder}/segmentaciones_por_dicom/mask_${paddedIndex}.json`);
  // const jsonPath = path.join(__dirname, 'temp', folder, 'segmentaciones_por_dicom', `mask_${paddedIndex}.json`);
  const jsonPath = path.join(__dirname, '..', 'temp', folder, 'segmentaciones_por_dicom', `mask_${paddedIndex}.json`); //.. es esencial para salir de la carpeta routes/

  try {
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: "Archivo no encontrado" });
    }

    const jsonData = await fs.promises.readFile(jsonPath, 'utf8');
    console.log("[DEBUGgggggggg] Entró a GET /mask-json/", jsonPath); // verifica rutas de api en server
    res.json(JSON.parse(jsonData));
  } catch (err) {
    console.error("Error al leer JSON:", err);
    res.status(500).json({ error: "Error interno al leer el archivo JSON." });
  }
});

// GET /api/segment/volumen/:folder
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

router.post("/save-edit/:folder/:index", async (req, res) => {
  const { folder, index } = req.params;
  const { lung_editable, fibrosis_editable } = req.body;

  console.log(`[INFO] Guardando edición para: ${folder} índice ${index}`);

  // === PARSEAR NSS Y FECHA DEL FOLDER ===
  const match = folder.match(/^(\d+)_([\d_]+)$/);
  if (!match) {
    return res.status(400).json({ error: "Nombre de carpeta inválido" });
  }

});

function guardarMascarasEnBD(folder, nss, fecha_estudio) {
  const segmentDir = path.join(__dirname, "..", "temp", folder, "segmentaciones_por_dicom");

  let i = 0;
  function procesarTomo() {
    const paddedIndex = String(i).padStart(3, "0");
    const autoPath = path.join(segmentDir, `mask_${paddedIndex}.json`);
    const manualPath = path.join(segmentDir, `mask_${paddedIndex}_simplified.json`);

    if (!fs.existsSync(autoPath) && !fs.existsSync(manualPath)) {
      console.log('[BD] Todos los tomos procesados');
      return;
    }

    const procesarArchivo = (tipo, clase, ruta, siguiente) => {
      fs.readFile(ruta, 'utf8', (err, data) => {
        if (err) {
          console.error(`[ERROR] Al leer ${ruta}:`, err.message);
          return siguiente();
        }

        let json;
        try {
          json = JSON.parse(data);
        } catch (e) {
          console.error(`[ERROR] JSON inválido en ${ruta}:`, e.message);
          return siguiente();
        }

        const sqlSelect = `
          SELECT 1 FROM mascara 
          WHERE nss_exp = ? AND fecha_estudio = ? AND num_tomo = ? AND tipo = ? AND clase = ?
        `;
        const valores = [nss, fecha_estudio, i, tipo, clase];

        db.query(sqlSelect, valores, (errSel, rows) => {
          if (errSel) {
            console.error(`[DB ERROR SELECT] Tomo ${i}`, errSel.message);
            return siguiente();
          }

          const jsonStr = JSON.stringify(json);
          if (rows.length > 0) {
            const sqlUpdate = `
              UPDATE mascara
              SET coordenadas = ?
              WHERE nss_exp = ? AND fecha_estudio = ? AND num_tomo = ? AND tipo = ? AND clase = ?
            `;
            db.query(sqlUpdate, [jsonStr, ...valores], (errUp) => {
              if (errUp) {
                console.error(`[DB ERROR UPDATE] Tomo ${i}`, errUp.message);
              } else {
                console.log(`[BD] Actualizado ${tipo} tomo ${i}`);
              }
              siguiente();
            });
          } else {
            const sqlInsert = `
              INSERT INTO mascara (nss_exp, fecha_estudio, num_tomo, tipo, clase, coordenadas)
              VALUES (?, ?, ?, ?, ?, ?)
            `;
            db.query(sqlInsert, [...valores, jsonStr], (errIn) => {
              if (errIn) {
                console.error(`[DB ERROR INSERT] Tomo ${i}`, errIn.message);
              } else {
                console.log(`[BD] Insertado ${tipo} tomo ${i}`);
              }
              siguiente();
            });
          }
        });
      });
    };

    const siguienteTomo = () => {
      i++;
      procesarTomo();  // Recursivo
    };

    // Procesar primero automático, luego manual
    if (fs.existsSync(autoPath)) {
      procesarArchivo("automatica", "pulmon", autoPath, () => {
        if (fs.existsSync(manualPath)) {
          procesarArchivo("manual", "pulmon", manualPath, siguienteTomo);
        } else {
          siguienteTomo();
        }
      });
    } else if (fs.existsSync(manualPath)) {
      procesarArchivo("manual", "pulmon", manualPath, siguienteTomo);
    } else {
      siguienteTomo();
    }
  }

  procesarTomo();  // Comienza el procesamiento
}


module.exports = {
  router,
  guardarMascarasEnBD
};

