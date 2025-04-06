// src/server/utils/gfs.js
const { GridFSBucket } = require('mongodb');
const mongoose = require('mongoose');

let gfs;

mongoose.connection.once('open', () => {
  gfs = new GridFSBucket(mongoose.connection.db, {
    bucketName: 'dicomfiles'
  });
  console.log('📦 GridFS inicializado');
});

const getGFS = () => gfs;

module.exports = getGFS;
