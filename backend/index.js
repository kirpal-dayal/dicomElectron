// backend/index.js

const express = require('express');
const cors    = require('cors');
const dotenv  = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// — Importa tus rutas —
const doctorRoutes     = require('./routes/doctorRoutes');
const imageRoutes      = require('./routes/imageRoutes');
const loginRoutes      = require('./routes/loginRoutes');
const expedientesRoute = require('./httpRequests/expedientes');

// — Monta las rutas —
// Rutas de doctor
doctorRoutes(app);

// Rutas de imagen en /api/image
app.use('/api/image', imageRoutes);

// Ruta de login en /api/login
app.use('/api', loginRoutes);

// Rutas de expedientes en raíz: GET/POST/DELETE /expedientes
expedientesRoute(app);

// — Arranca el servidor —
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
