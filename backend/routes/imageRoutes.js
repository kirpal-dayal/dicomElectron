const express = require('express');
const router = express.Router();
const multer = require('multer');
const controller = require('../controllers/imageController');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload-zip', upload.single('zipFile'), controller.uploadZip);

module.exports = router;
