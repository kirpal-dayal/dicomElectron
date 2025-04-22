const db = require('../connectionDb');
const ENDPOINT = '/doctores';

module.exports = (app) => {
  // Crear un nuevo doctor
  app.post(ENDPOINT, (req, res) => {
    /**
     * El cuerpo de la solicitud debe tener la estructura:
     * {
          "id": "1111111112",
          "nombre": "Doc Post 01",
          "contrasena": "1111111112",
          "idAdminCreador": "0000000000"
        }
      * NOTA: deben de coincidir las claves del json con los nombres de las siguiente constantes
     */
    const { id, nombre, contrasena, idAdminCreador } = req.body;
    
    // Validar que se reciban todos los campos necesarios
    if (!id || !nombre || !contrasena || !idAdminCreador) {
      return res.status(400).send('Faltan datos requeridos');
    }
    // falta: validar que el id no exista en la bd, que tengan el formato adecuado, etc

    // NOTA: los nombre de los campos deben de coicidir con los de la bd
    const query = 'INSERT INTO doctor (id, nombre_doc, contrasena_doc, id_adminCreador, fecha_creacion) VALUES (?, ?, ?, ?, now())';
    db.query(query, [id, nombre, contrasena, idAdminCreador], (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error al crear el doctor');
      }
      res.status(201).send('Doctor creado exitosamente');
    });
  });

  // Obtener todos los doctores
  app.get(ENDPOINT, (req, res) => {
    db.query('SELECT * FROM doctor', (err, results) => {
      if (err) {
        console.log(err);
        return res.status(500).send(err);
      }
      res.json(results);
    });
  });
};