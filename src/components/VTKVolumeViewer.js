import { useEffect, useRef } from 'react';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkMarchingCubes from '@kitware/vtk.js/Filters/General/ImageMarchingCubes';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkOpenGLRenderWindow from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import '@kitware/vtk.js/Rendering/Profiles/Geometry'; // Permite usar setScalars

import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';

export default function VTKVolumeViewer({ volumeArray, fibrosisVolArr, dims }) {
  const vtkContainerRef = useRef(null);
  const context = useRef(null);
  const containerRef = useRef();

  function controlActorStyle(actor, RGBcolor, opacity) {
    const propertyActor = actor.getProperty();
    if (RGBcolor === 'r') {
      propertyActor.setColor(1, 0, 0); //RGB
    }
    else {
      propertyActor.setColor(0, 1, 0); //Green
    }
    propertyActor.setOpacity(opacity);
  }

  useEffect(() => {
    if (!context.current) {
      const fullScreenRenderer = vtkFullScreenRenderWindow.newInstance({
        rootContainer: vtkContainerRef.current,
      });
      function createActor(data, RGBcolor, opacity) { //Declared inside useEffect to avoid "React Hook useEffect has a missing dependency", because doesn't need to be accesible outside
        const [width, height, depth] = dims;
        const imageData = vtkImageData.newInstance();
        imageData.setDimensions(width, height, depth);
        const scalars = vtkDataArray.newInstance({
          numberOfComponents: 1, // Indica cuántos valores forman cada elemento del array de datos. Si es 1, cada voxel/píxel tiene un solo valor (por ejemplo, intensidad o máscara binaria). Si es 3, cada voxel/píxel tiene tres valores (por ejemplo, un color RGB).
          values: data, // Asegúrate de que data sea un TypedArray (como Float32Array)
        });
        imageData.getPointData().setScalars(scalars);
        const mcFilter = vtkMarchingCubes.newInstance({
          contourValue: 127, //umbral que determina dónde se genera la superficie 3D en el volumen usando el algoritmo Marching Cubes. Solo los voxeles con valor igual (o mayor, según la implementación) a contourValue formarán parte de la superficie extraída (actualmente no se ve nada si este valor es 0)
          computeNormals: true,
          mergePoints: true,
        });
        mcFilter.setInputData(imageData);
        mcFilter.update();
        const mapper = vtkMapper.newInstance();
        mapper.setInputData(mcFilter.getOutputData()); //¿Similar a setInputConection pero p/vtkImageData?
        const actor = vtkActor.newInstance();
        actor.setMapper(mapper);
        controlActorStyle(actor, RGBcolor, opacity);
        return [actor, mapper];
      }
      const [lungActor, lungMapper] = createActor(volumeArray, 'g', 0.15);
      const [fibroActor, fibroMapper] = createActor(fibrosisVolArr, 'r', 0.4);

      const renderer = fullScreenRenderer.getRenderer();
      const renderWindow = fullScreenRenderer.getRenderWindow();
      renderer.addActor(lungActor);
      renderer.addActor(fibroActor);
      renderer.setBackground(0.1, 0.1, 0.1);
      renderer.resetCamera();
      renderWindow.render();

      const openGLRenderWindow = vtkOpenGLRenderWindow.newInstance();
      openGLRenderWindow.setContainer(containerRef.current);
      renderWindow.addView(openGLRenderWindow);

      renderWindow.addRenderer(renderer);
      //renderer.resetCamera();
      renderWindow.render();

      // Guarda todas las instancias en context.current
      context.current = {
        fullScreenRenderer,
        lungActor,
        lungMapper,
        fibroActor,
        fibroMapper,
        openGLRenderWindow,
        renderWindow,
        renderer,
      };
    }
    return () => {
      if (context.current) {
        const { fullScreenRenderer, lungActor, lungMapper, fibroActor, fibroMapper, openGLRenderWindow, renderWindow, renderer } = context.current;
        //liberar recursos de las instancias creadas
        lungActor.delete();
        lungMapper.delete();
        fibroActor.delete();
        fibroMapper.delete();
        fullScreenRenderer.delete();
        openGLRenderWindow.delete();
        renderWindow.delete();
        renderer.delete();
        context.current = null;
      }
    };
  }, [volumeArray, fibrosisVolArr, dims]);

  return <div ref={containerRef} style={{ width: '600px', height: '600px' }} />;
}
