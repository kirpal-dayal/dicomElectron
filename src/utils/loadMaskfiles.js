export async function loadMaskFiles(pathFiles) { // para el futuro pasar argumento en lugar de definirlo abajo con req
    const req = require.context('../../public/mask02', false, /simplified\.json$/); //(directorio, se va a buscar en subdirs?, regExp, modo -def: sync-)
    const files = req.keys().map((key) => 'mask02/' + key.replace('./', ''));
    const layers = [];
    const fibrosisLayers = [];
    for (const path of files) {
        const res = await fetch(path);
        const json = await res.json();
        //layers.push(json.lung); // normal version
        layers.push(json.lung_editable); //simplified version
        fibrosisLayers.push(json.fibrosis_editable);
    }
    const lungVolArr = createVolumeFromContours(layers, 512, 512);
    const fibroVolArr = createVolumeFromContours(fibrosisLayers, 512, 512);
    const dims = [512, 512, layers.length];
    return lungVolArr, fibroVolArr, dims;
}