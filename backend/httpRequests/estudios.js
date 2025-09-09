const db = require('../connectionDb');
const ENDPOINT = '/estudios';

console.log('🗂 estudios.js cargado');

module.exports = (app) => {
    console.log('  → Registrando rutas de', ENDPOINT);

    //Obtener todos los estudios p/ el reporte gral
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

    // Obtner un todos los estudios de un paciente por NSS para su reporte
    app.get(ENDPOINT + '/:nss', (req, res) => {
        const { nss } = req.params; // Extraer el parámetro de la URL
        if (!nss) {
            return res.status(400).send('Falta el NSS del paciente');
        }
        const query = 'SELECT * FROM estudio WHERE nss_expediente = ?';
        db.query(query, [nss], (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Error al buscar el estudio');
            }
            if (results.length === 0) {
                return res.status(404).send('Estudio no encontrado');
            }
            res.json(results); // Devolver el estudio encontrado
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