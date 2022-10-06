import { Color } from "../node_modules/three";
import { IfcViewerAPI } from "../node_modules/web-ifc-viewer";
import { createSideMenuButton } from "../js/gui-creator/gui-creator";
import {
  MeshLambertMaterial,
  LineBasicMaterial,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
} from "../node_modules/three";
import Drawing from "dxf-writer";
import { loadIfc, browserPanel } from "./functions";
import { BufferGeometry } from "three";
import { mergeBufferGeometries } from "three/examples/jsm/utils/BufferGeometryUtils";

import {
  Group,
  Mesh,
  OrthographicCamera,
  Vector3,
  WebGLRenderTarget,
  MeshDepthMaterial,
} from "three";
import { HorizontalBlurShader } from "three/examples/jsm/shaders/HorizontalBlurShader";
import { VerticalBlurShader } from "three/examples/jsm/shaders/VerticalBlurShader";

// import { MeshShadowDropper } from "web-ifc-viewer/dist/components/display/mesh-shadow-dropper";

///// Create Viewer
// Creates subset materials
const preselectMat = new MeshLambertMaterial({
  transparent: true,
  opacity: 0.8,
  color: 0x4ccb4c,
  depthTest: false,
});

const selectMat = new MeshLambertMaterial({
  transparent: true,
  opacity: 0.6,
  color: 0x4ccb4c,
  depthTest: false,
});

const container = document.getElementById("viewer-container");
const viewer = new IfcViewerAPI({
  container,
});
viewer.IFC.selector.preselection.material = preselectMat;
viewer.IFC.selector.highlight.material = preselectMat;
viewer.IFC.selector.selection.material = selectMat;

const scene = viewer.context.getScene();
const camera = viewer.context.getCamera();
const renderer = viewer.context.getRenderer();
const shadows = viewer.shadowDropper.shadows;

///// Create grid and axes
viewer.grid.setGrid({
  colorCenterLine: 0x444444,
  colorGrid: 0x888888,
});
viewer.axes.setAxes();
// viewer.context.scene.scene.background = new Color("grey");

///// Load IFC Model
const ifcModels = [];
const allPlans = [];
let obj = {};
/////////////////////////////////////////////////////////////////////////////////////////////////////

// viewer.IFC.loader.ifcManager.useWebWorkers(
//   true,
//   "../docs/assets/worker/IFCWorker.js"
// );

viewer.IFC.setWasmPath(
  "https://giovanniconsiglio.github.io/ifc.js-viewer/docs/assets/wasm/"
);

viewer.IFC.loader.ifcManager.applyWebIfcConfig({
  USE_FAST_BOOLS: true,
  COORDINATE_TO_ORIGIN: false,
});

// Load file button
const inputElement = document.createElement("input");
inputElement.setAttribute("type", "file");
inputElement.setAttribute("multiple", "multiple");
inputElement.classList.add("hidden");
inputElement.addEventListener(
  "change",
  async (changed) => {
    const ifcURL = URL.createObjectURL(changed.target.files[0]);
    const container = document.getElementById("button-container");
    await loadIfc(ifcURL, viewer, ifcModels, allPlans, container, obj);
    const modelMeshes = [];
    for (const [key, model] of Object.entries(ifcModels)) {
      // model.castShadow = true;
      // model.updateMatrix();
      modelMeshes.push(model.geometry);
      // modelMesh.merge(model.geometry, model.matrix);
      // viewer.shadowDropper.renderShadow(model.modelID);
    }
    console.log(modelMeshes);
    const mergedMesh = mergeBufferGeometries(modelMeshes);
    mergedMesh.computeBoundingBox();
    mergedMesh.computeBoundingSphere();
    console.log(mergedMesh);

    console.log(viewer.shadowDropper);
    console.log(viewer.meshShadowDropper);
    viewer.meshShadowDropper.renderShadowOfMeshGeometry(mergedMesh);

    // renderShadowOfMeshCustom(mergedMesh, 0, scene);

    // viewer.shadowDropper.renderShadowOfMesh(mergedMesh);
    // viewer.context.renderer.postProduction.active = true;
    viewer.context.fitToFrame();
    // browserPanel(viewer, obj, container);
  },
  false
);

///// Handle events

// Get properties of selected item
window.ondblclick = async () => {
  const result = await viewer.IFC.selector.pickIfcItem(true);

  if (result) {
    console.log(result);
    const foundProperties = properties[result.id];
    getPropertySets(foundProperties);
    createPropertiesMenu(foundProperties);
    console.log(foundProperties);
  } else {
    removeAllChildren(propsGUI);
    viewer.IFC.selector.unpickIfcItems();
    return;
  }
};

// On mouse move => prePickIfcItem
window.onmousemove = () => viewer.IFC.selector.prePickIfcItem();

// Key down
const handleKeyDown = async (event) => {
  if (event.code === "Delete") {
    viewer.clipper.deletePlane();
    viewer.dimensions.delete();
  }
  if (event.code === "Escape") {
    viewer.IFC.selector.unHighlightIfcItems();
  }
  if (event.code === "KeyC") {
    viewer.context.ifcCamera.toggleProjection();
  }
};

window.onkeydown = handleKeyDown;

// On click => pickIfcItem
document.addEventListener("click", (event) => {
  const modelId = viewer.IFC.getModelID();
  // console.log(modelId>=0);
  if (modelId !== null) {
    if (event.shiftKhiseey) {
      viewer.IFC.selector.pickIfcItem(false, false);
    } else {
      viewer.IFC.selector.pickIfcItem();
    }
  } else {
    viewer.IFC.selector.unpickIfcItems();
  }
});

// On double click => getProperties
window.ondblclick = async () => {
  if (viewer.clipper.active) {
    cameraControls.enabled = false; ////////TO BE FIXED
    viewer.clipper.createPlane();
  } else {
    const result = await viewer.IFC.selector.highlightIfcItem(true);

    if (!result) {
      removeAllChildren(propsGUI);
      viewer.IFC.selector.unHighlightIfcItems();
      return;
    }
    const { modelID, id } = result;
    const props = await viewer.IFC.getProperties(modelID, id, true, false);
    createPropertiesMenu(props);
  }
};

///// Setup UI
const loadButton = createSideMenuButton(
  "https://giovanniconsiglio.github.io/ifc.js-viewer/docs/assets/resources/folder-icon.svg"
);
loadButton.addEventListener("click", () => {
  loadButton.blur();
  inputElement.click();
});

const sectionButton = createSideMenuButton(
  "https://giovanniconsiglio.github.io/ifc.js-viewer/docs/assets/resources/section-plane-down.svg"
);
sectionButton.addEventListener("click", () => {
  sectionButton.blur();
  viewer.clipper.toggle();
});

const zoomAllButton = createSideMenuButton(
  "https://giovanniconsiglio.github.io/ifc.js-viewer/docs/assets/resources/zoom-fit-gray.svg"
);

zoomAllButton.addEventListener("click", () => {
  zoomAllButton.blur();
  viewer.context.fitToFrame();
});

const dimensionButton = createSideMenuButton(
  "https://giovanniconsiglio.github.io/ifc.js-viewer/docs/assets/resources/dimensions.svg"
);

dimensionButton.addEventListener("click", () => {
  dimensionButton.blur();
  viewer.dimensions.active = true;
  viewer.dimensions.previewActive = true;
  window.ondblclick = () => {
    viewer.dimensions.create();
  };

  window.onkeydown = (event) => {
    if (event.code === "Delete") {
      viewer.dimensions.delete();
    }
  };
  window.onkeydown = (event) => {
    if (event.code === "Escape") {
      viewer.dimensions.active = false;
      viewer.dimensions.previewActive = false;
    }
  };
});

// const serializeProperties = createSideMenuButton(
//   "https://giovanniconsiglio.github.io/ifc.js-viewer/docs/assets/resources/json.svg"
// );

// serializeProperties.addEventListener("click", async () => {
//   serializeProperties.blur();
//   let jsonProps = [];
//   // console.log(jsonProps);
//   // console.log(ifcModels);
//   // Serialize properties
//   if (ifcModels.length > 1) {
//     for (let model of ifcModels) {
//       const result = await viewer.IFC.properties.serializeAllProperties(model);
//       // console.log(result);
//       jsonProps.push(result);
//     }
//   } else {
//     const result = await viewer.IFC.properties.serializeAllProperties(
//       ifcModels[0]
//     );
//     // console.log(result);
//     jsonProps = result;
//   }
//   // Download the properties as JSON file
//   const file = new File(jsonProps, "properties");
//   // console.log(jsonProps);
//   // console.log(file);
//   const link = document.createElement("a");
//   link.href = URL.createObjectURL(file);
//   link.download = "properties.json";
//   link.click();
//   link.remove();
// });

///// Create properties menu
const propsGUI = document.getElementById("ifc-property-menu-root");

function createPropertiesMenu(properties) {
  console.log(properties);

  removeAllChildren(propsGUI);

  delete properties.psets;
  delete properties.mats;
  delete properties.type;

  for (let key in properties) {
    createPropertyEntry(key, properties[key]);
  }
}

function createPropertyEntry(key, value) {
  const propContainer = document.createElement("div");
  propContainer.classList.add("ifc-property-item");

  if (value === null || value === undefined) value = "undefined";
  else if (value.value) value = value.value;

  const keyElement = document.createElement("div");
  keyElement.textContent = key;
  propContainer.appendChild(keyElement);

  const valueElement = document.createElement("div");
  valueElement.classList.add("ifc-property-value");
  valueElement.textContent = value;
  propContainer.appendChild(valueElement);

  propsGUI.appendChild(propContainer);
}

function removeAllChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}
