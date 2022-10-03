import { Color } from "../node_modules/three";
import { IfcViewerAPI } from "../node_modules/web-ifc-viewer";
import { createSideMenuButton } from "../js/gui-creator/gui-creator";
import {
  IFCSPACE,
  IFCOPENINGELEMENT,
  IFCWALL,
  IFCWALLSTANDARDCASE,
  IFCSLAB,
  IFCWINDOW,
  IFCMEMBER,
  IFCPLATE,
  IFCCURTAINWALL,
  IFCDOOR,
  IFCBUILDINGSTOREY,
} from "web-ifc";
import {
  MeshLambertMaterial,
  LineBasicMaterial,
  MeshBasicMaterial,
} from "../node_modules/three";
import Drawing from "dxf-writer";
import { Dexie } from "dexie";

/////////////////////////////////////////////////////////////////////////////////////////////
let properties;
async function loadIfc(url, viewer, ifcModels, allPlans, container, obj) {
  // Create progress bar
  const overlay = document.getElementById("loading-overlay");
  const progressText = document.getElementById("loading-progress");

  overlay.classList.remove("hidden");
  progressText.innerText = `Loading`;

  viewer.IFC.loader.ifcManager.setOnProgress((event) => {
    const percentage = Math.floor((event.loaded * 100) / event.total);
    progressText.innerText = `Loaded ${percentage}%`;
  });

  viewer.IFC.loader.ifcManager.parser.setupOptionalCategories({
    [IFCSPACE]: false,
    [IFCOPENINGELEMENT]: false,
  });

  // Load the model
  // Export to glTF and JSON
  const result = await viewer.GLTF.exportIfcFileAsGltf({
    ifcFileUrl: url,
    onprogress: true,
    splitByFloors: true,
    categories: {
      walls: [IFCWALL, IFCWALLSTANDARDCASE],
      slabs: [IFCSLAB],
      windows: [IFCWINDOW],
      curtainwalls: [IFCMEMBER, IFCPLATE, IFCCURTAINWALL],
      doors: [IFCDOOR],
      levels: [IFCBUILDINGSTOREY],
    },
    getProperties: true,
  });
  console.log(result);
  // Download result
  const link = document.createElement("a");
  document.body.appendChild(link);

  for (const categoryName in result.gltf) {
    const category = result.gltf[categoryName];
    for (const levelName in category) {
      const file = category[levelName].file;
      if (file) {
        console.log(file);
        console.log(category);
        console.log(categoryName);
        console.log(levelName);
        console.log(`${file.name}_${categoryName}_${levelName}.gltf`);
        link.download = `${categoryName}_${levelName}.gltf`;
        link.href = URL.createObjectURL(file);
        link.click();
      }
    }
  }

  for (let jsonFile of result.json) {
    link.download = `${jsonFile.name}`;
    link.href = URL.createObjectURL(jsonFile);
    link.click();
  }

  link.remove();

  // Load geometry
  await viewer.GLTF.loadModel("https://github.com/giovanniconsiglio/ifc.js-viewer/blob/gh-pages/docs/assets/gltf/01/doors_Nivel 1.gltf");
  await viewer.GLTF.loadModel("https://github.com/giovanniconsiglio/ifc.js-viewer/blob/gh-pages/docs/assets/gltf/01/slabs_Nivel 1.gltf");
  await viewer.GLTF.loadModel("https://github.com/giovanniconsiglio/ifc.js-viewer/blob/gh-pages/docs/assets/gltf/01/slabs_Nivel 2.gltf");
  await viewer.GLTF.loadModel("https://github.com/giovanniconsiglio/ifc.js-viewer/blob/gh-pages/docs/assets/gltf/01/walls_Nivel 1.gltf");
  await viewer.GLTF.loadModel("https://github.com/giovanniconsiglio/ifc.js-viewer/blob/gh-pages/docs/assets/gltf/01/windows_Nivel 1.gltf");
  await viewer.GLTF.loadModel("https://github.com/giovanniconsiglio/ifc.js-viewer/blob/gh-pages/docs/assets/gltf/01/curtainwalls_Nivel 1.gltf");
  // Load properties
  const rawProperties = await fetch("https://github.com/giovanniconsiglio/ifc.js-viewer/blob/gh-pages/docs/assets/gltf/01/properties.json");
  properties = await rawProperties.json();
  // Get spatial tree
  const tree = await constructSpatialTree();
  console.log(tree);

  overlay.classList.add("hidden");
}

// Utils functions
function getFirstItemOfType(type) {
  return Object.values(properties).find((item) => item.type === type);
}

function getAllItemsOfType(type) {
  return Object.values(properties).filter((item) => item.type === type);
}

// Get spatial tree
async function constructSpatialTree() {
  const ifcProject = getFirstItemOfType("IFCPROJECT");

  const ifcProjectNode = {
    expressID: ifcProject.expressID,
    type: "IFCPROJECT",
    children: [],
  };

  const relContained = getAllItemsOfType("IFCRELAGGREGATES");
  const relSpatial = getAllItemsOfType("IFCRELCONTAINEDINSPATIALSTRUCTURE");

  await constructSpatialTreeNode(ifcProjectNode, relContained, relSpatial);

  return ifcProjectNode;
}

// Recursively constructs the spatial tree
async function constructSpatialTreeNode(item, contains, spatials) {
  const spatialRels = spatials.filter(
    (rel) => rel.RelatingStructure === item.expressID
  );
  const containsRels = contains.filter(
    (rel) => rel.RelatingObject === item.expressID
  );

  const spatialRelsIDs = [];
  spatialRels.forEach((rel) => spatialRelsIDs.push(...rel.RelatedElements));

  const containsRelsIDs = [];
  containsRels.forEach((rel) => containsRelsIDs.push(...rel.RelatedObjects));

  const childrenIDs = [...spatialRelsIDs, ...containsRelsIDs];

  const children = [];
  for (let i = 0; i < childrenIDs.length; i++) {
    const childID = childrenIDs[i];
    const props = properties[childID];
    const child = {
      expressID: props.expressID,
      type: props.type,
      children: [],
    };

    await constructSpatialTreeNode(child, contains, spatials);
    children.push(child);
  }

  item.children = children;
}

// Gets the property sets

function getPropertySets(props) {
  const id = props.expressID;
  const propertyValues = Object.values(properties);
  const allPsetsRels = propertyValues.filter(
    (item) => item.type === "IFCRELDEFINESBYPROPERTIES"
  );
  const relatedPsetsRels = allPsetsRels.filter((item) =>
    item.RelatedObjects.includes(id)
  );
  const psets = relatedPsetsRels.map(
    (item) => properties[item.RelatingPropertyDefinition]
  );
  for (let pset of psets) {
    pset.HasProperty = pset.HasProperties.map((id) => properties[id]);
  }
  props.psets = psets;
}

///////////////////////////////////////////////////////////////////////////////////////
function browserPanel(viewer, obj, container) {
  let children = container.children;
  let childrenArray = [...children];
  for (let child of childrenArray) {
    if (child.id != "Export" && child.id != "Exit") {
      container.removeChild(child);
    }
  }
  //   removeAllChildNodes(container);
  //   console.log(obj);

  for (const [modelID, plans] of Object.entries(obj)) {
    for (const plan of plans) {
      const currentPlan = viewer.plans.planLists[modelID][plan];
      console.log(currentPlan);

      const button = document.createElement("button");
      container.appendChild(button);
      button.textContent = currentPlan.name;
      button.onclick = () => {
        viewer.context.renderer.postProduction.active = false;
        viewer.plans.goTo(modelID, plan);
        viewer.edges.toggle("example", true);
        console.log(viewer.edges.getAll());
        console.log(viewer.edges.get("example"));
      };
    }
  }

  let exitChildren = childrenArray.filter((a) => {
    if (a.id == "Exit") {
      return a;
    }
  });
  if (exitChildren.length === 0) {
    const button = document.createElement("button");
    container.appendChild(button);
    button.textContent = "Exit";
    button.id = "Exit";
    button.onclick = () => {
      viewer.plans.exitPlanView();
      viewer.edges.toggle("example", false);
      viewer.context.renderer.postProduction.active = true;
    };
  }
}
export { loadIfc, browserPanel, getPropertySets, properties };
