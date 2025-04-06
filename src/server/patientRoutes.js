const express = require('express');
const router = express.Router();
const Patient = require('./patientModel');
const Study = require('./models/studyModel'); // asegúrate de que esté bien importado
const { verifyToken } = require('./middleware/authMiddleware');

// POST → Crear paciente
router.post('/patient', verifyToken, async (req, res) => {
  try {
    const newPatient = new Patient({
      ...req.body,
      createdBy: req.user.userId
    });
    await newPatient.save();
    res.status(201).json({ message: 'Paciente creado', patient: newPatient });
  } catch (err) {
    console.error('❌ Error al crear paciente:', err);
    res.status(500).json({ error: 'Error al crear paciente' });
  }
});

// PUT → Actualizar paciente
router.put('/patient/:id', verifyToken, async (req, res) => {
  try {
    const updated = await Patient.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user.userId },
      req.body,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    res.json({ message: 'Paciente actualizado', patient: updated });
  } catch (err) {
    console.error('❌ Error al actualizar paciente:', err);
    res.status(500).json({ error: 'Error al actualizar paciente' });
  }
});

// GET → Obtener todos los pacientes del doctor autenticado
router.get('/patients', verifyToken, async (req, res) => {
  try {
    const patients = await Patient.find({ createdBy: req.user.userId });
    res.json(patients);
  } catch (err) {
    console.error('❌ Error al obtener pacientes:', err);
    res.status(500).json({ error: 'Error al obtener pacientes' });
  }
});

// GET → Obtener un paciente por ID (incluyendo estudios)
router.get('/patient/:id', verifyToken, async (req, res) => {
  try {
    console.log('🧪 Buscando paciente con ID:', req.params.id);
    console.log('🔐 Doctor autenticado:', req.user.userId);
    console.log('🧪 Param ID:', req.params.id);
    console.log('🔐 Usuario autenticado:', req.user);


    const patient = await Patient.findOne({
      _id: req.params.id,
      createdBy: req.user.userId
    });

    if (!patient) {
      console.log('❌ Paciente no encontrado o no pertenece al doctor');
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    const studies = await Study.find({ patient: patient._id });
    res.json({ ...patient.toObject(), studies });

  } catch (err) {
    console.error('❌ Error al obtener paciente:', err);
    res.status(500).json({ error: 'Error al obtener paciente' });
  }
});


module.exports = router;
