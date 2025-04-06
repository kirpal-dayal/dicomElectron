const express = require('express');
const router = express.Router();
const authController = require('./controllers/authController');
const { verifyToken, isAdmin } = require('./middleware/authMiddleware');
const User = require('./userModel'); // Ajusta el path si tu modelo está en /models

// Registro de nuevo usuario (solo admin)
router.post('/register', verifyToken, isAdmin, authController.registerUser);

// Login
router.post('/login', authController.loginUser);

// Perfil autenticado
router.get('/me', verifyToken, authController.getUser);

// Obtener doctores (solo admin recomendado)
router.get('/doctors', verifyToken, isAdmin, async (req, res) => {
  try {
    const doctors = await User.find({ role: 'doctor' }, 'username role createdBy');
    res.json(doctors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener doctores' });
  }
});
// eliminar un doctor
router.delete('/doctor/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Doctor no encontrado' });
    }
    res.json({ message: 'Doctor eliminado correctamente' });
  } catch (err) {
    console.error("❌ Error al eliminar doctor:", err);
    res.status(500).json({ error: 'Error al eliminar doctor' });
  }
});

module.exports = router;
