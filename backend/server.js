const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
const port = 5000; // Puedes elegir otro puerto

app.use(cors());
app.use(express.json()); // Para poder recibir JSON en las solicitudes

// Configura la conexión a la base de datos MySQL local de prueba
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '12345678',
  database: 'fibrosis_v05'
});

// Conectar a la base de datos
db.connect(err => {
  if (err) {
    console.error('Error conectando a la base de datos:', err);
    return;
  }
  console.log('Conectado a la base de datos MySQL');
});

// Rutas para el CRUD
app.get('/doctores', (req, res) => {
  db.query('SELECT * FROM doctor', (err, results) => {
    if (err){
      console.log(err);
      return res.status(500).send(err);
    }
    res.json(results);
  });
});

//prueba de visualizacion de imagenes
app.get('/imagenes', (req, res) => {
  //db.query('SELECT * FROM imagen where num_tomo = 0', (err, results) => {
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

app.get('/api/items', (req, res) => {
  db.query('SELECT * FROM items', (err, results) => {
    if (err) return res.status(500).send(err);
    res.json(results);
  });
});

app.post('/api/items', (req, res) => {
  const newItem = req.body;
  db.query('INSERT INTO items SET ?', newItem, (err, result) => {
    if (err) return res.status(500).send(err);
    res.status(201).json({ id: result.insertId, ...newItem });
  });
});

// Implementa las rutas para actualizar y eliminar (PUT y DELETE) de manera similar

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});

//cuando se cierra la conexion?
