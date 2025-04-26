const express = require('express');
const router = express.Router();
const multer = require('multer');
const controller = require('../db/image');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload', upload.array('dicomFiles', 500), controller.uploadDicom);
router.get('/study', controller.getStudyImages);
router.get('/blob/:id', controller.getImageById);

module.exports = router;
