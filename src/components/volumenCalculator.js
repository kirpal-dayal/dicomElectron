// volumenCalculator.js

export function extractSpacingFromImage(image) {
  const spacingStr = image.data.string('x00280030'); // PixelSpacing
  const thicknessStr = image.data.string('x00180050'); // SliceThickness

  const pixelSpacing = spacingStr
    ? spacingStr.split('\\').map(parseFloat)
    : [null, null];

  const sliceThickness = thicknessStr ? parseFloat(thicknessStr) : null;

  return {
    pixelSpacing: { row: pixelSpacing[0], col: pixelSpacing[1] },
    sliceThickness
  };
}

export function calculatePolygonAreaMm(points, pixelSpacing) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += (points[i].x * points[j].y) - (points[j].x * points[i].y);
  }
  const pixelArea = Math.abs(area / 2);

  if (pixelSpacing?.row && pixelSpacing?.col) {
    return pixelArea * pixelSpacing.row * pixelSpacing.col;
  }
  return null;
}

export function calcularAreaTotal(polygons, pixelSpacing) {
  let total = 0;
  const all = Array.isArray(polygons[0]) ? polygons : [polygons];

  all.forEach(polygon => {
    if (polygon.length >= 3) {
      total += calculatePolygonAreaMm(polygon, pixelSpacing) || 0;
    }
  });

  return total;
}

export function calcularVolumenEditableDesdeImage(image, layers) {
  const { pixelSpacing, sliceThickness } = extractSpacingFromImage(image);
  return calcularVolumenEditable(layers, pixelSpacing, sliceThickness);
}

export function calcularVolumenEditable(layers, pixelSpacing, sliceThickness) {
  const editableLung = layers.find(l => l.name.includes("Pulmón") && l.editable);
  const editableFibrosis = layers.find(l => l.name.includes("Fibrosis") && l.editable);

  if (!editableLung || !editableFibrosis || !pixelSpacing || !sliceThickness) return null;

  const lungArea = calcularAreaTotal(editableLung.points, pixelSpacing);
  const fibrosisArea = calcularAreaTotal(editableFibrosis.points, pixelSpacing);

  const lungVol = lungArea * sliceThickness / 1000;
  const fibrosisVol = fibrosisArea * sliceThickness / 1000;

  return {
    editableLungVolume: parseFloat(lungVol.toFixed(2)),
    editableFibrosisVolume: parseFloat(fibrosisVol.toFixed(2)),
    editableTotalVolume: parseFloat((lungVol + fibrosisVol).toFixed(2))
  };
}
export function calcularVolumenEditableGlobal(layersPorSlice, pixelSpacing, sliceThickness) {
  let lungTotalArea = 0;
  let fibrosisTotalArea = 0;

  for (const layers of layersPorSlice) {
    const editableLung = layers.find(l => l.name.includes("Pulmón") && l.editable);
    const editableFibrosis = layers.find(l => l.name.includes("Fibrosis") && l.editable);

    if (editableLung) {
      lungTotalArea += calcularAreaTotal(editableLung.points, pixelSpacing);
    }
    if (editableFibrosis) {
      fibrosisTotalArea += calcularAreaTotal(editableFibrosis.points, pixelSpacing);
    }
  }

  const lungVol = lungTotalArea * sliceThickness / 1000;
  const fibrosisVol = fibrosisTotalArea * sliceThickness / 1000;

  return {
    editableLungVolume: parseFloat(lungVol.toFixed(2)),
    editableFibrosisVolume: parseFloat(fibrosisVol.toFixed(2)),
    editableTotalVolume: parseFloat((lungVol + fibrosisVol).toFixed(2))
  };
}
