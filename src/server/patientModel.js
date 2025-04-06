const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  nss: { type: String, required: true },
  birthDate: { type: String, required: true },
  sex: { type: String, enum: ['masculino', 'femenino'], required: true },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // doctor que creó este paciente
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Patient', patientSchema);
