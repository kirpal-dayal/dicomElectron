const db = require('../connectionDb');
const ENDPOINT = '/estudios';

console.log('🗂 estudios.js cargado');

module.exports = (app) => {
    console.log('  → Registrando rutas de', ENDPOINT);

<<<<<<< HEAD
    //Obtener todos los estudios
    app.get(ENDPOINT, (res) => {
        const query = 'SELECT * FROM estudio';
        db.query(query, (err, res) => {
=======
    //Obtener todos los estudios p/ el reporte gral con conteo de imagenes
    app.get(ENDPOINT, (req, res) => { // Dejar req por convencion de express
        const query = `SELECT 
            e.fecha,
            e.nss_expediente,
            e.descripcion,
            e.volumen_automatico,
            e.volumen_manual,
            COUNT(i.nss_exp) AS num_imgs
            FROM 
                estudio AS e
            RIGHT JOIN 
                imagen AS i ON e.nss_expediente = i.nss_exp AND e.fecha = i.fecha_estudio
            GROUP BY
            e.fecha,
            e.nss_expediente,
            e.descripcion,
            e.volumen_automatico,
            e.volumen_manual;
        `;
        db.query(query, (err, results) => {
>>>>>>> origin/reportes
            if (err) {
                console.log(err);
                return res.status(500).send(err);
            }
<<<<<<< HEAD
            res.json(res);
=======
            console.log(results);
            res.json(results);
        });
    });

    // Obtner un todos los estudios de un paciente por NSS para su reporte con conteo de imagenes
    app.get(ENDPOINT + '/:nss', (req, res) => {
        const { nss } = req.params; // Extraer el parámetro de la URL
        if (!nss) {
            return res.status(400).send('Falta el NSS del paciente');
        }
        const query = `
            SELECT 
                e.fecha, 
                e.nss_expediente, 
                e.descripcion, 
                e.volumen_automatico, 
                e.volumen_manual, 
                COUNT(i.nss_exp) AS num_imgs
            FROM 
                estudio AS e
            RIGHT JOIN 
                imagen AS i ON e.nss_expediente = i.nss_exp AND e.fecha = i.fecha_estudio
            WHERE 
                i.nss_exp = ?  
            GROUP BY 
                e.fecha, 
                e.nss_expediente, 
                e.descripcion, 
                e.volumen_automatico, 
                e.volumen_manual;
        `;
        db.query(query, [nss], (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Error al buscar el estudio');
            }
            if (results.length === 0) {
                return res.status(404).send('Estudio no encontrado');
            }
            res.json(results); // Devolver el estudio encontrado
>>>>>>> origin/reportes
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