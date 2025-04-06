const express = require('express');
const router = express.Router();
const multer = require('multer');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

const Study = require('./models/studyModel');
const DicomFile = require('./models/dicomFileModel');
const Mask = require('./models/maskModel');
const { verifyToken } = require('./middleware/authMiddleware');

//  Configurar multer (archivos en memoria)
const storage = multer.memoryStorage();
const upload = multer({ storage });

/**  Crear estudio y subir múltiples archivos DICOM */
router.post('/study/upload', verifyToken, upload.array('dicomFiles'), async (req, res) => {
  try {
    const { patientId, description } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se recibieron archivos' });
    }

    const db = mongoose.connection.db;
    if (!db) return res.status(500).json({ error: 'DB no conectada' });

    const gfs = new GridFSBucket(db, { bucketName: 'dicomfiles' });

    const study = new Study({
      patient: patientId,
      doctor: req.user.userId,
      description: description || 'Sin descripción'
    });

    await study.save();

    const savedFiles = [];

    for (const file of req.files) {
      if (!file.buffer || file.size === 0) continue;

      const uploadStream = gfs.openUploadStream(file.originalname, {
        contentType: file.mimetype || 'application/dicom'
      });

      uploadStream.end(file.buffer);

      await new Promise((resolve, reject) => {
        uploadStream.on('finish', async () => {
          const dicomFile = new DicomFile({
            study: study._id,
            filename: file.originalname,
            originalname: file.originalname,
            fileId: uploadStream.id
          });

          await dicomFile.save();
          savedFiles.push(dicomFile);
          resolve();
        });

        uploadStream.on('error', reject);
      });
    }

    res.status(201).json({
      message: 'Estudio creado y archivos DICOM subidos',
      study,
      dicomFiles: savedFiles
    });

  } catch (err) {
    console.error(' Error al crear estudio:', err);
    res.status(500).json({ error: 'Error al crear estudio' });
  }
});

/**  Obtener todos los DICOMs asociados a un estudio */
router.get('/dicom/:studyId', verifyToken, async (req, res) => {
  try {
    const files = await DicomFile.find({ study: req.params.studyId });
    res.json(files);
  } catch (err) {
    console.error(' Error al obtener DICOMs:', err);
    res.status(500).json({ error: 'Error al obtener archivos DICOM' });
  }
});

/** Descargar archivo DICOM desde GridFS */
router.get('/dicom/file/:fileId', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const gfs = new GridFSBucket(db, { bucketName: 'dicomfiles' });
    const fileId = new mongoose.Types.ObjectId(req.params.fileId);

    gfs.find({ _id: fileId }).toArray((err, files) => {
      if (!files || files.length === 0) {
        return res.status(404).json({ error: 'Archivo no encontrado' });
      }

      res.set('Content-Type', files[0].contentType || 'application/dicom');

      const readStream = gfs.openDownloadStream(fileId);
      readStream.pipe(res);
    });
  } catch (error) {
    console.error(' Error al servir archivo DICOM:', error);
    res.status(500).json({ error: 'Error al obtener archivo DICOM' });
  }
});

module.exports = router;
