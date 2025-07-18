// volumenCalculator.js

const DEFAULT_PIXEL_SPACING = [0.75, 0.75]; // mm
const DEFAULT_RESOLUTION = 512;
const MODEL_RESOLUTION = 256;
const DEFAULT_SLICE_THICKNESS = 10;
export function extractSpacingFromImage(image, override = null) {
  // Si el modelo envía datos, se priorizan
  if (override?.pixelSpacing && override?.sliceThickness) {
    console.log("===[INFO] Usando override recibido del modelo===");
    return {
      pixelSpacing: override.pixelSpacing,
      sliceThickness: Math.abs(override.sliceThickness),
    };
  }

  const spacingStr = image.data.string('x00280030'); // PixelSpacing
  const thicknessStr = image.data.string('x00180050'); // SliceThickness
  const rows = image.rows || DEFAULT_RESOLUTION;
  const cols = image.columns || DEFAULT_RESOLUTION;

  const pixelSpacing = spacingStr
    ? spacingStr.split('\\').map(parseFloat)
    : DEFAULT_PIXEL_SPACING;

    let sliceThickness = thicknessStr ? parseFloat(thicknessStr) : DEFAULT_SLICE_THICKNESS;

    // Si no hay override explícito y el valor es muy pequeño, lo forzamos a 10
    if (!override && sliceThickness < 2) {
      console.warn("[WARNING] SliceThickness demasiado pequeño, se usará 10mm por default.");
      sliceThickness = 10;
    }

  // Aplicar factor de escalado
  const scaleFactor = rows / MODEL_RESOLUTION;
  const scaledPixelSpacing = {
    row: pixelSpacing[0],
    col: pixelSpacing[1]
  };

  sliceThickness = Math.abs(sliceThickness);

  console.log("========== [INFO] Parámetros de cálculo de volumen ==========");
  console.log("Resolución original:", rows, "x", cols);
  console.log("Resolución modelo (resize):", MODEL_RESOLUTION, "x", MODEL_RESOLUTION);
  console.log("PixelSpacing original (mm):", pixelSpacing);
  console.log("Factor de escalado aplicado:", scaleFactor.toFixed(4));
  console.log("PixelSpacing escalado (mm/pixel):", scaledPixelSpacing);
  console.log("Área por píxel (mm²):", (scaledPixelSpacing.row * scaledPixelSpacing.col).toFixed(4));
  console.log("Grosor de corte (SliceThickness) (mm):", sliceThickness);
  console.log("==============================================================");

  return {
    pixelSpacing: scaledPixelSpacing,
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
  return pixelArea * pixelSpacing.row * pixelSpacing.col;
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

export function calcularVolumenEditableDesdeImage(image, layers, override = null) {
  const { pixelSpacing, sliceThickness } = extractSpacingFromImage(image, override);
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
