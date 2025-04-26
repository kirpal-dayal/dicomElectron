const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const pool = require('./db');

//  Crear carpeta temporal si no existe
const tempDir = path.join(__dirname, '../../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
  console.log('Carpeta "temp" creada');
}

// Detectar comando correcto de Python (python o python3)
const PYTHON_COMMAND = process.platform === 'win32' ? 'python' : 'python3';

// SUBIDA Y CONVERSIÓN DE ARCHIVOS DICOM
exports.uploadDicom = async (req, res) => {
  const { nss, fecha } = req.body;
  const dicomFiles = req.files;

  console.log('Archivos recibidos:', dicomFiles?.length);
  console.log(' Parámetros => NSS:', nss, '| Fecha:', fecha);

  if (!dicomFiles || dicomFiles.length === 0) {
    return res.status(400).json({ error: 'No se subieron archivos' });
  }

  try {
    for (let i = 0; i < dicomFiles.length; i++) {
        const file = dicomFiles[i]; 
        const timestamp = Date.now();
        const mysqlFecha = new Date(fecha).toISOString().slice(0, 19).replace("T", " ");      
        const extension = path.extname(file.originalname).toLowerCase();
        const baseName = path.basename(file.originalname, extension || undefined);
        const dicomPath = path.join(tempDir, `${timestamp}-${baseName}.dcm`);
        const jpgPath = path.join(tempDir, `${timestamp}-${baseName}.jpg`);
      
        console.log(` Procesando archivo #${i + 1}: ${file.originalname}`);
        console.log(' Ruta DICOM:', dicomPath);
        console.log(' Ruta JPG:', jpgPath);
      
        fs.writeFileSync(dicomPath, file.buffer);
      
        await new Promise((resolve, reject) => {
          const command = `${PYTHON_COMMAND} src/db/convertDicom.py "${dicomPath}" "${jpgPath}"`;
      
          console.log(' Ejecutando comando:', command);
      
          exec(command, async (error, stdout, stderr) => {
            if (error) {
              console.error(' Error al ejecutar script Python:', error.message);
              console.error(' STDERR:', stderr);
              return reject(new Error(`Error ejecutando Python: ${error.message}`));
            }
      
            try {
              const jpgBuffer = fs.readFileSync(jpgPath);
      
              const sql = `INSERT INTO imagen (nss_exp, fecha_estudio, num_tomo, imagen) VALUES (?, ?, ?, ?)`;
              await pool.execute(sql, [nss, mysqlFecha, i + 1, jpgBuffer]);
      
              fs.unlinkSync(dicomPath);
              fs.unlinkSync(jpgPath);
              console.log(` Archivo ${file.originalname} procesado correctamente`);
              resolve();
            } catch (err) {
              console.error(' Error interno al guardar imagen JPG:', err.message);
              reject(err);
            }
          });
        });
      }
        

    res.status(200).json({ message: ' Todos los archivos DICOM fueron procesados correctamente' });
  } catch (err) {
    console.error(' Detalles del error:', err.message, err.stack);
    res.status(500).json({
      error: 'Fallo al procesar uno o más archivos DICOM',
      details: err.message
    });
  }
};
exports.getImageById = async (req, res) => {
    const { id } = req.params;
  
    try {
      const [rows] = await pool.execute(
        'SELECT imagen FROM imagen WHERE id = ?',
        [id]
      );
  
      if (rows.length === 0) {
        return res.status(404).send('Imagen no encontrada');
      }
  
      res.setHeader('Content-Type', 'image/jpeg');
      res.send(rows[0].imagen);
    } catch (err) {
      console.error('Error al recuperar imagen:', err.message);
      res.status(500).send('Error al recuperar imagen');
    }
  };
  
//  CONSULTA DE IMÁGENES POR ESTUDIO
exports.getStudyImages = async (req, res) => {
    const { nss, fecha } = req.query;
  
    if (!nss || !fecha) {
      return res.status(400).json({ error: 'Faltan parámetros nss o fecha' });
    }
  
    try {
        const [rows] = await pool.execute(
            `SELECT id FROM imagen WHERE nss_exp = ? AND DATE(fecha_estudio) = DATE(?) ORDER BY num_tomo ASC`,
            [nss, fecha]
          );
      console.log(" Query a imágenes con:", nss, fecha);
      console.log(" Resultado crudo de MySQL:", rows);
  
      const images = rows.map(row => ({ id: row.id }));
  
      console.log(`Se enviaron ${images.length} IDs de imágenes`);
      res.json(images);
    } catch (err) {
      console.error(' Error al obtener IDs de imágenes:', err.message);
      res.status(500).json({ error: 'No se pudieron obtener las imágenes' });
    }
  };
  
