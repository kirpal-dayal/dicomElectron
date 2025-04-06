const express = require("express");
const router = express.Router();
const { gfs, upload } = require("./database");

// 📌 Subir archivos
router.post("/upload", upload.single("file"), (req, res) => {
  res.json({ file: req.file });
});

// 📌 Obtener lista de archivos
router.get("/files", async (req, res) => {
  gfs.files.find().toArray((err, files) => {
    if (!files || files.length === 0) {
      return res.status(404).json({ error: "No hay archivos" });
    }
    res.json(files);
  });
});

// 📌 Descargar archivos por ID
router.get("/files/:id", async (req, res) => {
  gfs.files.findOne({ _id: new mongoose.Types.ObjectId(req.params.id) }, (err, file) => {
    if (!file || file.length === 0) {
      return res.status(404).json({ error: "No encontrado" });
    }
    const readstream = gfs.createReadStream(file.filename);
    readstream.pipe(res);
  });
});

module.exports = router;
