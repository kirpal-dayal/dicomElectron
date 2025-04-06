// const mongoose = require('mongoose');

// const dicomFileSchema = new mongoose.Schema({
//   studyId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Study',
//     required: true,
//   },
//   filename: {
//     type: String,
//     required: true,
//   },
//   originalname: String,
//   fileId: mongoose.Schema.Types.ObjectId, // ID del archivo en GridFS
//   uploadDate: {
//     type: Date,
//     default: Date.now,
//   },
//   masks: [{
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Mask'
//   }],
// });

// module.exports = mongoose.model('DicomFile', dicomFileSchema);
// models/dicomFileModel.js
const mongoose = require('mongoose');

const dicomFileSchema = new mongoose.Schema({
  study: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Study',
    required: true,
  },
  filename: { type: String, required: true },
  originalname: String,
  fileId: mongoose.Schema.Types.ObjectId,
  uploadDate: { type: Date, default: Date.now },
  masks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mask'
  }]
});

module.exports = mongoose.model('DicomFile', dicomFileSchema);
