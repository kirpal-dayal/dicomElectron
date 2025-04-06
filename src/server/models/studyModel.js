const mongoose = require('mongoose');

const studySchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  description: {
    type: String,
    default: 'Sin descripción'
  },
  date: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Study', studySchema);
