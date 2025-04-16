const db = require('../connectionDb');
const { nameDirectoryDicom } = require('../configConst');
const path = require('path');
const fs = require('fs');
const unzipper = require('unzipper'); // descomprimir folder con las imagenes de los estudios

//prueba de visualizacion de imagenes
module.exports = (app) => {
  //se entregan las urls de las imagenes (si copias esa url en el navegador, se puede visualizar)
  app.get('/imagenes', (req, res) => {
    db.query('SELECT * FROM imagen', (err, results) => {
      if (err) {
        console.log(err);
        return res.status(500).send(err);
      }
      // Convertir los blobs a data URLs
      const images = results.map(row => {
        if (row.imagen) { // Verificar que row.imagen no sea null
          return {
            id: row.num_tomo, // Suponiendo que tienes un campo 'id'
            imagen: `data:image/jpeg;base64,${row.imagen.toString('base64')}` // Cambia 'image/jpeg' si es otro tipo de imagen
          };
        } else {
          return {
            id: row.num_tomo,
            imagen: null // O puedes manejarlo de otra manera, como una URL de imagen por defecto
          };
        }
      });

      res.json(images);
    });
  });

  // Ruta para subir el archivo ZIP
  app.post('/uploadDicom', (req, res) => {
    if (!req.files || !req.files.zipFile) {
        return res.status(400).send('No se ha subido ningún archivo.');
    }

    const zipFile = req.files.zipFile;

    // Crear la carpeta si no existe
    const dicomPath = path.join(__dirname, nameDirectoryDicom);
    if (!fs.existsSync(dicomPath)) {
      fs.mkdirSync(dicomPath, { recursive: true });
    }

    // Guardar el archivo ZIP en el servidor
    const uploadPath = path.join(dicomPath, zipFile.name);
    zipFile.mv(uploadPath, (err) => {
        if (err) {
            return res.status(500).send(err);
        }

        // Descomprimir el archivo ZIP
        fs.createReadStream(uploadPath)
            .pipe(unzipper.Extract({ path: nameDirectoryDicom + '/' })) // Extraer en la carpeta
            .on('close', () => {
                res.send('Archivo ZIP subido y descomprimido exitosamente.');
            })
            .on('error', (err) => {
                res.status(500).send('Error al descomprimir el archivo: ' + err.message);
            });
    });
  });
};