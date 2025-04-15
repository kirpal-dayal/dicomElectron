const db = require('../connectionDb');

module.exports = (app) => {
  app.get('/doctores', (req, res) => {
    db.query('SELECT * FROM doctor', (err, results) => {
      if (err) {
        console.log(err);
        return res.status(500).send(err);
      }
      res.json(results);
    });
  });
};