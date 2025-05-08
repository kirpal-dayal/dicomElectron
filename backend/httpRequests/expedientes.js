const db = require('../connectionDb');
const ENDPOINT = '/expedientes';

module.exports = (app) => {
  // Crear un nuevo expediente
  app.post(ENDPOINT, (req, res) => {
    /**
     * El cuerpo de la solicitud debe tener la estructura:
     * {
          "nss": "222222222222223",
          "sexo": 1,
          "fechaNacimiento": "2023-12-31 14:30:00",
          "idDocCreador": "1111111113"
        }
      * NOTA: la hora no la captura bien (la cambia ej: "2023-12-31T20:30:00.000Z") 
      * NOTA: deben de coincidir las claves del json con los nombres de las siguiente constantes
     */
    const { nss, sexo, fechaNacimiento, idDocCreador } = req.body;
    
    // Validar que se reciban todos los campos necesarios
    if (!nss || !sexo || !fechaNacimiento || !idDocCreador) {
      return res.status(400).send('Faltan datos requeridos');
    }
    // falta: validar que el nss no exista en la bd, que tengan el formato adecuado, etc

    // NOTA: los nombre de los campos deben de coicidir con los de la bd
    const query = 'INSERT INTO expediente (nss, sexo, fecha_nacimiento, id_docCreador, fecha_creacion) VALUES (?, ?, ?, ?, now())';
    db.query(query, [nss, sexo, fechaNacimiento, idDocCreador], (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error al crear el expediente del paciente');
      }
      res.status(201).send('Expediente creado exitosamente');
    });
  });
  
  // Obtener todos los expedientes
  app.get(ENDPOINT, (req, res) => {
    db.query('SELECT * FROM expediente', (err, results) => {
      if (err) {
        console.log(err);
        return res.status(500).send(err);
      }
      res.json(results);
    });
  });
  
  // Buscar un expediente por NSS
  app.get(`${ENDPOINT}/:nss`, (req, res) => {
    const { nss } = req.params; // Extraer el parámetro de la URL
    if (!nss) {
      return res.status(400).send('Falta el NSS del expediente');
    }
    const query = 'SELECT * FROM expediente WHERE nss = ?';
    db.query(query, [nss], (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error al buscar el expediente');
      }
      if (results.length === 0) {
        return res.status(404).send('Expediente no encontrado');
      }
      res.json(results[0]); // Devolver el expediente encontrado
    });
  });

  // Eliminar un expediente por NSS
};