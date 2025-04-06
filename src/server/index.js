const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

// 🖨️ Mostrar variable secreta para verificar
console.log("🔐 JWT_SECRET:", process.env.JWT_SECRET);

// 📦 Importar rutas
const fileRoutes = require('./fileRoutes');
const authRoutes = require('./authRoutes');
const studyRoutes = require('./studyRoutes');
const patientRoutes = require('./patientRoutes');

// 🛠 Inicializar app y middlewares
const app = express();
app.use(cors());
app.use(express.json());

// 🔌 Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB conectado'))
  .catch(err => console.error('❌ Error de conexión:', err));

// 📍 Definir rutas
app.use('/api', fileRoutes);
app.use('/api', authRoutes);
app.use('/api', studyRoutes);
app.use('/api', patientRoutes);

// 🚀 Arrancar servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
