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

// POST /api/segment/run
router.post('/run', (req, res) => {
  const folder = req.body.folder;

  if (!folder) {
    return res.status(400).json({ error: 'Falta el nombre de la carpeta en la solicitud.' });
  }

  // Ruta al script de segmentación (Python)
  const scriptPath = path.join(__dirname, '../segmentation/main.py');

  // Ruta completa a la carpeta en /temp donde están los DICOM descomprimidos
  const folderPath = path.join(__dirname, '../temp', folder);

  // Verifica que exista la carpeta
  if (!fs.existsSync(folderPath)) {
    return res.status(400).json({ error: `No existe la carpeta: ${folder}` });
  }

  // Comando para ejecutar el script de segmentación
  const command = `python "${scriptPath}" "${folderPath}"`;

  // Ejecutar el script
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('Error al ejecutar el modelo:', error);
      console.error('stderr:', stderr);
      return res.status(500).json({ error: 'Error al ejecutar el modelo', details: stderr });
    }

    console.log('Segmentación completada.');
    console.log('stdout:', stdout);
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

module.exports = router;
