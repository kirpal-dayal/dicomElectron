const db = require('../connectionDb');
const ENDPOINT = '/estudios';

console.log('🗂 estudios.js cargado');

module.exports = (app) => {
    console.log('  → Registrando rutas de', ENDPOINT);

    //Obtener todos los estudios
    app.get(ENDPOINT, (req, res) => { // Dejar req por convencion de express
        const query = 'SELECT * FROM estudio';
        db.query(query, (err, results) => {
            if (err) {
                console.log(err);
                return res.status(500).send(err);
            }
            console.log(results);
            res.json(results); 
        });
    });

    // Modificar la descripcion de un estudio
    app.patch(ENDPOINT + '/descripcion', (req, res) => {
        console.log("llegue al patch");
        const { nss_expediente, fecha, descripcion } = req.body;
        if (!nss_expediente || !fecha) {
            return res.status(400).send('Faltan parámetros');
        }
        const query = 'UPDATE estudio SET descripcion = ? WHERE nss_expediente = ? AND fecha = ?';
        db.query(query, [descripcion, nss_expediente, fecha], (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Error al actualizar la descripción');
            }
            res.json({ ok: true });
        });
    });
};