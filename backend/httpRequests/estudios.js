const db = require('../connectionDb');

//prueba de visualizacion de imagenes
module.exports = (app) => {
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
};