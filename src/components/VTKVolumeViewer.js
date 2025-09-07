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
const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

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
  let k = 0;
  for (let z = 0; z < nz2; z++) {
    const z0 = z * sz;
    for (let y = 0; y < ny2; y++) {
      const y0 = y * sy;
      for (let x = 0; x < nx2; x++) {
        const x0 = x * sx;
        const idx = x0 + y0 * nx + z0 * nx * ny;
        out[k++] = values[idx] ? 1 : 0;
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
  quality = 'full',     // 'full' | 'half' | 'quarter'
  onProgress,
  showHud = false,      //  por defecto oculto
}) {
  const containerRef = useRef(null);
  const ctx = useRef(null);
  const ro = useRef(null);
  const hudRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !volumeArray || !fibrosisVolArr || !dims) return;

    // ---------- HUD opcional ----------
    if (showHud) {
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
    }

    const report = (msg) => { if (hudRef.current) hudRef.current.textContent = msg; onProgress?.(msg); };

    // ---------- preparar datos ----------
    const [nx, ny, nz] = dims;
    let sp = [...spacing]; // spacing efectivo (se ajusta si hay submuestreo)

    let vLung = ArrayBuffer.isView(volumeArray) ? volumeArray : new Uint8Array(volumeArray);
    let vFib  = ArrayBuffer.isView(fibrosisVolArr) ? fibrosisVolArr : new Uint8Array(fibrosisVolArr);
    let dimsUsed = [nx, ny, nz];

    const t0 = performance.now();
    if (quality === 'half') {
      ({ values: vLung, dims: dimsUsed } = subSampleBinary(vLung, dimsUsed, 2, 1));
      ({ values: vFib,  dims: dimsUsed } = subSampleBinary(vFib,  dimsUsed, 2, 1));
      sp = [sp[0]*2, sp[1]*2, sp[2]];
    } else if (quality === 'quarter') {
      ({ values: vLung, dims: dimsUsed } = subSampleBinary(vLung, dimsUsed, 4, 2));
      ({ values: vFib,  dims: dimsUsed } = subSampleBinary(vFib,  dimsUsed, 4, 2));
      sp = [sp[0]*4, sp[1]*4, sp[2]*2];
    }
    const t1 = performance.now(); // (por si quieres medir)

    // ---------- VTK ----------
    const fsr = vtkFullScreenRenderWindow.newInstance({
      rootContainer: containerRef.current,
      containerStyle: { width: '100%', height: '100%', position: 'relative' },
      background: [0.08, 0.08, 0.08],
    });
    const renderer = fsr.getRenderer();
    const renderWindow = fsr.getRenderWindow();
    const interactor = fsr.getInteractor();

    // MSAA off (menos coste en WebGL)
    try { fsr.getApiSpecificRenderWindow()?.setMultiSamples?.(0); } catch {}

    // Resize con debounce
    const onResized = debounce(() => { fsr.resize(); renderWindow.render(); }, 120);
    ro.current = new ResizeObserver(onResized);
    ro.current.observe(containerRef.current);

    const createIsoActor = (values, color, targetOpacity) => {
      const imageData = vtkImageData.newInstance();
      imageData.setDimensions(...dimsUsed);
      imageData.setSpacing(...sp);
      imageData.setOrigin(...origin);

      const scalars = vtkDataArray.newInstance({ numberOfComponents: 1, values });
      imageData.getPointData().setScalars(scalars);

      const mc = vtkMarchingCubes.newInstance({
        contourValue: 0.49,  // binario
        computeNormals: false,
        mergePoints: false,
      });
      mc.setInputData(imageData);

      const mapper = vtkMapper.newInstance();
      mapper.setInputConnection(mc.getOutputPort());
      mapper.setScalarVisibility(false);

      const actor = vtkActor.newInstance();
      actor.setMapper(mapper);
      const prop = actor.getProperty();
      if (color === 'r') prop.setColor(1, 0, 0); else prop.setColor(0, 1, 0);

      // Primer frame opaco (rápido)
      prop.setOpacity(1.0);
      prop.setInterpolationToFlat();

      return { actor, mapper, mc, imageData, scalars, targetOpacity };
    };

    (async () => {
      try {
        const lung = createIsoActor(vLung, 'g', 0.30);
        lung.mc.update();
        renderer.addActor(lung.actor);
        await nextFrame();

        const fibro = createIsoActor(vFib, 'r', 0.60);
        fibro.mc.update();
        renderer.addActor(fibro.actor);
        await nextFrame();

        renderer.resetCamera();
        renderer.resetCameraClippingRange();

        renderWindow.render(); // primer render opaco
        lung.actor.getProperty().setOpacity(lung.targetOpacity);
        fibro.actor.getProperty().setOpacity(fibro.targetOpacity);
        renderWindow.render();

        ctx.current = { fsr, renderer, renderWindow, interactor, lung, fibro };
      } catch (e) {
        report(`Error: ${e?.message || e}`);
      }
    })();

    return () => {
      try { ro.current?.disconnect(); } catch {}
      ro.current = null;
      const c = ctx.current;
      if (c) {
        const { fsr, renderer, renderWindow, interactor, lung, fibro } = c;
        try { interactor.unbindEvents?.(); } catch {}
        try { interactor.setView?.(null); } catch {}
        try { renderer.removeAllActors?.(); } catch {}
        try { renderWindow.removeRenderer?.(renderer); } catch {}
        ;[lung, fibro].forEach(o => {
          try { o.actor?.delete?.(); } catch {}
          try { o.mapper?.delete?.(); } catch {}
          try { o.mc?.delete?.(); } catch {}
          try { o.scalars?.delete?.(); } catch {}
          try { o.imageData?.delete?.(); } catch {}
        });
        try { fsr.delete?.(); } catch {}
        ctx.current = null;
      }
      if (hudRef.current?.parentNode) {
        hudRef.current.parentNode.removeChild(hudRef.current);
        hudRef.current = null;
      }
    };
  }, [volumeArray, fibrosisVolArr, dims, spacing, origin, quality, onProgress, showHud]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', background: '#111' }}
    />
  );
}
