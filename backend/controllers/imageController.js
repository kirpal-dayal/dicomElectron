const fs = require('fs');
const path = require('path');

exports.uploadZip = async (req, res) => {
  const { nss, fecha } = req.body;
  const file = req.file;

  console.log('Petición recibida para subir ZIP');
  console.log('Parámetros recibidos:', { nss, fecha });

  if (!file) {
    console.warn(' No se recibió ningún archivo ZIP');
    return res.status(400).json({ error: 'No se recibió ningún archivo ZIP' });
  }

  try {
    const timestamp = Date.now();
    const folderPath = path.join(__dirname, '../../temp', `upload-${nss}-${timestamp}`);
    const zipPath = path.join(folderPath, `${nss}-${timestamp}.zip`);

    console.log('Creando carpeta temporal:', folderPath);
    fs.mkdirSync(folderPath, { recursive: true });

    console.log('Guardando archivo ZIP en:', zipPath);
    fs.writeFileSync(zipPath, file.buffer);

    console.log(' ZIP guardado correctamente');
    res.status(200).json({ message: 'ZIP cargado correctamente', path: zipPath });
  } catch (error) {
    console.error('Error al guardar el ZIP:', error.message);
    res.status(500).json({ error: 'Error al guardar el archivo ZIP' });
  }
};

exports.uploadZip = async (req, res) => {
    console.log('📩 Nueva solicitud de carga ZIP');
  
    const { nss, fecha } = req.body;
    const file = req.file;
  
    console.log('🧾 Body recibido:', { nss, fecha });
    console.log('📦 Archivo recibido:', file?.originalname);
  
    if (!file) {
      console.warn('⚠️ No se recibió el archivo');
      return res.status(400).json({ error: 'No se recibió ningún archivo ZIP' });
    }
  
    try {
      const timestamp = Date.now();
      const folderPath = path.join(__dirname, '../../temp', `upload-${nss}-${timestamp}`);
      const zipPath = path.join(folderPath, `${nss}-${timestamp}.zip`);
  
      fs.mkdirSync(folderPath, { recursive: true });
      fs.writeFileSync(zipPath, file.buffer);
  
      console.log('✅ Archivo ZIP guardado en:', zipPath);
      res.status(200).json({ message: 'ZIP guardado correctamente', path: zipPath });
    } catch (err) {
      console.error('❌ Error al guardar ZIP:', err.message);
      res.status(500).json({ error: 'Error interno al guardar ZIP' });
    }
  };
  
