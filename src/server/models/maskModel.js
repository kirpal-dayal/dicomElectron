const mongoose = require('mongoose');

const maskSchema = new mongoose.Schema({
  dicomFileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DicomFile',
    required: true,
  },
  label: {
    type: String,
    required: true,
  },
  maskData: {
    type: mongoose.Schema.Types.Mixed, // puede ser base64, matriz, etc.
    required: true,
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Mask', maskSchema);
