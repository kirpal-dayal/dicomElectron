// backend/index.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

const doctorRoutes = require('./routes/doctorRoutes'); // <- Importa tu doctorRoutes
const imageRoutes = require('./routes/imageRoutes');   // <- Importa tus rutas de imagen si ya las tenías

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

doctorRoutes(app);                 // <- Activa las rutas de doctores
app.use('/api/image', imageRoutes); // <- Monta las rutas de imágenes en /api/image
const loginRoutes = require('./routes/loginRoutes');
app.use('/api', loginRoutes);
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
