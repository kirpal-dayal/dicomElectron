// src/components/VTKVolumeViewer.js
import { useEffect, useRef } from 'react';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkMarchingCubes from '@kitware/vtk.js/Filters/General/ImageMarchingCubes';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';

const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

function subSampleBinary(values, dims, factorXY = 1, factorZ = 1) {
  if (factorXY === 1 && factorZ === 1) return { values, dims };
  const [nx, ny, nz] = dims;
  const sx = Math.max(1, factorXY);
  const sy = Math.max(1, factorXY);
  const sz = Math.max(1, factorZ);
  const nx2 = Math.max(1, Math.floor(nx / sx));
  const ny2 = Math.max(1, Math.floor(ny / sy));
  const nz2 = Math.max(1, Math.floor(nz / sz));
  const out = new Uint8Array(nx2 * ny2 * nz2);
  let k2 = 0;
  for (let z = 0; z < nz2; z++) {
    const z0 = z * sz;
    for (let y = 0; y < ny2; y++) {
      const y0 = y * sy;
      for (let x = 0; x < nx2; x++) {
        const x0 = x * sx;
        const idx = x0 + y0 * nx + z0 * nx * ny;
        out[k2++] = values[idx] ? 1 : 0;
      }
    }
  }
  return { values: out, dims: [nx2, ny2, nz2] };
}

export default function VTKVolumeViewer({
  volumeArray,
  fibrosisVolArr,
  dims,
  spacing = [1, 1, 1],
  origin  = [0, 0, 0],
  quality = 'full',     // "full" | "half" | "quarter"
  onProgress,
}) {
  const containerRef = useRef(null);
  const ctx = useRef(null);
  const ro = useRef(null);
  const hudRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !volumeArray || !fibrosisVolArr || !dims) return;

    // ---------- HUD ----------
    const hud = document.createElement('div');
    hud.style.position = 'absolute';
    hud.style.top = '8px';
    hud.style.left = '8px';
    hud.style.padding = '6px 10px';
    hud.style.background = 'rgba(0,0,0,0.55)';
    hud.style.color = '#fff';
    hud.style.fontFamily = 'system-ui, sans-serif';
    hud.style.fontSize = '12px';
    hud.style.borderRadius = '8px';
    hud.style.pointerEvents = 'none';
    hud.textContent = 'Inicializando…';
    containerRef.current.appendChild(hud);
    hudRef.current = hud;

    const report = (msg) => {
      if (hudRef.current) hudRef.current.textContent = msg;
      onProgress?.(msg);
    };

    // ---------- Calidad / submuestreo ----------
    const [nx, ny, nz] = dims;
    let vLung = ArrayBuffer.isView(volumeArray) ? volumeArray : new Uint8Array(volumeArray);
    let vFib  = ArrayBuffer.isView(fibrosisVolArr) ? fibrosisVolArr : new Uint8Array(fibrosisVolArr);
    let dimsUsed = [nx, ny, nz];

    // Muestra info física desde el arranque
    report(
      `Dims: ${dims.join('×')} · spacing(mm): ${spacing.map(n=>+n.toFixed?.(3)||n).join(', ')} · ` +
      `origin(mm): ${origin.map(n=>+n.toFixed?.(1)||n).join(', ')}`
    );

    const t0 = performance.now();
    if (quality === 'half') {
      ({ values: vLung, dims: dimsUsed } = subSampleBinary(vLung, dimsUsed, 2, 1));
      ({ values: vFib,  dims: dimsUsed } = subSampleBinary(vFib,  dimsUsed, 2, 1));
      report('Calidad: 1/2 (submuestreo XY)…');
    } else if (quality === 'quarter') {
      ({ values: vLung, dims: dimsUsed } = subSampleBinary(vLung, dimsUsed, 4, 2));
      ({ values: vFib,  dims: dimsUsed } = subSampleBinary(vFib,  dimsUsed, 4, 2));
      report('Calidad: 1/4 (submuestreo XY y Z)…');
    } else {
      report('Calidad: completa…');
    }
    const t1 = performance.now();

    // 1) Render
    const fsr = vtkFullScreenRenderWindow.newInstance({
      rootContainer: containerRef.current,
      containerStyle: { width: '100%', height: '100%', position: 'relative' },
      background: [0.08, 0.08, 0.08],
    });
    const renderer = fsr.getRenderer();
    const renderWindow = fsr.getRenderWindow();
    const interactor = fsr.getInteractor();

    // 2) ResizeObserver
    ro.current = new ResizeObserver(() => {
      fsr.resize();
      renderWindow.render();
    });
    ro.current.observe(containerRef.current);

    const createIsoActor = (values, color, opacity, label) => {
      const imageData = vtkImageData.newInstance();
      imageData.setDimensions(...dimsUsed);
      imageData.setSpacing(...spacing);
      imageData.setOrigin(...origin);

      const scalars = vtkDataArray.newInstance({
        numberOfComponents: 1,
        values,
      });
      imageData.getPointData().setScalars(scalars);

      const mc = vtkMarchingCubes.newInstance({
        contourValue: 0.49,   // binario
        computeNormals: false,
        mergePoints: false,
      });
      mc.setInputData(imageData);

      const mapper = vtkMapper.newInstance();
      mapper.setInputConnection(mc.getOutputPort());

      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);
      const prop = actor.getProperty();
      if (color === 'r') prop.setColor(1, 0, 0);
      else prop.setColor(0, 1, 0);
      prop.setOpacity(opacity);

      return { actor, mapper, mc, imageData, scalars, label };
    };

    const work = async () => {
      try {
        report(`Creando pulmón (${dimsUsed.join('×')})…`);
        const tA0 = performance.now();
        const lung = createIsoActor(vLung, 'g', 0.3, 'pulmón');
        renderer.addActor(lung.actor);
        lung.mc.update();
        const tA1 = performance.now();
        report(`Pulmón OK (${(tA1 - tA0).toFixed(0)} ms). Generando fibrosis…`);
        await nextFrame();

        const tB0 = performance.now();
        const fibro = createIsoActor(vFib, 'r', 0.6, 'fibrosis');
        renderer.addActor(fibro.actor);
        fibro.mc.update();
        const tB1 = performance.now();
        report(`Fibrosis OK (${(tB1 - tB0).toFixed(0)} ms). Renderizando…`);
        await nextFrame();

        renderer.resetCamera();
        renderer.resetCameraClippingRange();
        const tR0 = performance.now();
        renderWindow.render();
        const tR1 = performance.now();

        report(
          `Listo. Submuestreo: ${(t1 - t0).toFixed(0)} ms · Pulmón: ${(tA1 - tA0).toFixed(0)} ms · ` +
          `Fibrosis: ${(tB1 - tB0).toFixed(0)} ms · Primer render: ${(tR1 - tR0).toFixed(0)} ms`
        );

        ctx.current = { fsr, renderer, renderWindow, interactor, lung, fibro };
      } catch (e) {
        report(`Error: ${e?.message || e}`);
      }
    };

    work();

    return () => {
      if (ro.current) { try { ro.current.disconnect(); } catch {} ro.current = null; }
      const c = ctx.current;
      if (c) {
        const { fsr, renderer, renderWindow, interactor, lung, fibro } = c;
        try { interactor.unbindEvents?.(); } catch {}
        try { interactor.setView?.(null); } catch {}
        try { renderer.removeAllActors?.(); } catch {}
        try { renderWindow.removeRenderer?.(renderer); } catch {}
        ;[lung, fibro].forEach(obj => {
          try { obj.actor?.delete?.(); } catch {}
          try { obj.mapper?.delete?.(); } catch {}
          try { obj.mc?.delete?.(); } catch {}
          try { obj.scalars?.delete?.(); } catch {}
          try { obj.imageData?.delete?.(); } catch {}
        });
        try { fsr.delete?.(); } catch {}
        ctx.current = null;
      }
      if (hudRef.current && hudRef.current.parentNode) {
        hudRef.current.parentNode.removeChild(hudRef.current);
        hudRef.current = null;
      }
    };
  }, [volumeArray, fibrosisVolArr, dims, spacing, origin, quality, onProgress]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', background: '#111' }}
    />
  );
}
