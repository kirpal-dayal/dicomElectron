import React, { useEffect, useState } from 'react';
import VTKVolumeViewer from './VTKVolumeViewer';
import { createVolumeFromContours } from './../utils/rasterizeContours';

function RenderPulmon() {
  const [volume, setVolume] = useState(null);
  const [fibrosisVol, setFibrosisVol] = useState(null);
  const [dims, setDims] = useState([512, 512, 0]);

useEffect(() => {
  //Para leer dinamicamente los contenidos de cierto directorio sin hardcodearlos

  // 127 CAPAS SIMPLIFICADAS
  const req = require.context('../../public/mask02', false, /simplified\.json$/); //(directorio, se va a buscar en subdirs?, regExp, modo -def: sync-)
  const files = req.keys().map((key) => 'mask02/' + key.replace('./', ''));

  const loadFiles = async () => {
    const layers = [];
    const fibrosisLayers = [];
    for (const path of files) {
      const res = await fetch(path);
      const json = await res.json();
      //layers.push(json.lung); // normal version
      layers.push(json.lung_editable); //simplified version
      fibrosisLayers.push(json.fibrosis_editable);
    }
    const volumeArray = createVolumeFromContours(layers, 512, 512);
    const fibrosisVolArr = createVolumeFromContours(fibrosisLayers, 512, 512);
    setVolume(volumeArray);
    setFibrosisVol(fibrosisVolArr);
    setDims([512, 512, layers.length]);
  };

  loadFiles();
}, []);

  return (
    <div>
      <h1>Pulmón 3D con vtk.js</h1>
      {volume && <VTKVolumeViewer volumeArray={volume} fibrosisVolArr={fibrosisVol} dims={dims} />}
    </div>
  );
}

export default RenderPulmon;