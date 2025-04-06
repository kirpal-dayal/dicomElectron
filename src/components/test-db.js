require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Conectado exitosamente a MongoDB');
    process.exit();
  })
  .catch((err) => {
    console.error('❌ Error de conexión:', err);
    process.exit(1);
  });
