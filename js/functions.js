import { Color } from "../node_modules/three";
import { IfcViewerAPI } from "../node_modules/web-ifc-viewer";
import { createSideMenuButton } from "../js/gui-creator/gui-creator";
import {
  IFCBUILDINGELEMENTPROXY,
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
  IFCFURNISHINGELEMENT,
  IFCFURNISHINGELEMENTTYPE,
  IFCFURNITURE,
  IFCFURNITURETYPE,
  IFCSYSTEMFURNITUREELEMENT,
  IFCCOVERING,
  IFCRAILING,
  IFCROOF,
  IFCFLOWFITTING,
  IFCFLOWSEGMENT,
  IFCFLOWTERMINAL,
} from "web-ifc";
import {
  MeshLambertMaterial,
  LineBasicMaterial,
  MeshBasicMaterial,
} from "../node_modules/three";
import Drawing from "dxf-writer";
import { Dexie } from "dexie";

/////////////////////////////////////////////////////////////////////////////////////////////
// If the db exists, it opens; if not, dexie creates it automatically
function createOrOpenDatabase() {
  const db = new Dexie("ModelDatabase");
  // DB with single table "bimModels" with primary key "name" and
  // an index on the property "id"
  db.version(1).stores({
    bimModels: `
        name,
        id,
        category,
        level`,
  });

  return db;
}

let properties;

async function loadIfc(url, viewer, ifcModels, allPlans, container, obj) {
  viewer.IFC.loader.ifcManager.parser.setupOptionalCategories({
    [IFCSPACE]: false,
    [IFCOPENINGELEMENT]: false,
  });

  // Create or open database with Dexie
  const db = createOrOpenDatabase();
  await db.bimModels.clear();

  // Load the model
  // Export to glTF and JSON
  const result = await viewer.GLTF.exportIfcFileAsGltf({
    ifcFileUrl: url,
    onprogress: true,
    splitByFloors: true,
    categories: {
      undefined: [IFCBUILDINGELEMENTPROXY],
      walls: [IFCWALL, IFCWALLSTANDARDCASE],
      slabs: [IFCSLAB],
      windows: [IFCWINDOW],
      curtainwalls: [IFCMEMBER, IFCPLATE, IFCCURTAINWALL],
      doors: [IFCDOOR],
      furniture: [IFCFURNISHINGELEMENT],
      systemFurniture: [
        IFCSYSTEMFURNITUREELEMENT,
        IFCFURNISHINGELEMENTTYPE,
        IFCFURNITURE,
        IFCFURNITURETYPE,
      ],
      covering: [IFCCOVERING],
      railing: [IFCRAILING],
      roof: [IFCROOF],
      pipes: [IFCFLOWFITTING, IFCFLOWSEGMENT, IFCFLOWTERMINAL],
      levels: [IFCBUILDINGSTOREY],
    },
    getProperties: true,
  });
  console.log(result);
  // Store the result in the browser memory
  const models = [];

  for (const categoryName in result.gltf) {
    const category = result.gltf[categoryName];
    for (const levelName in category) {
      const file = category[levelName].file;
      if (file) {
        // Serialize data for saving it
        const data = await file.arrayBuffer();
        models.push({
          name: result.id + categoryName + levelName,
          id: result.id,
          category: categoryName,
          level: levelName,
          file: data,
        });
      }
    }
  }
  console.log(models);
  // Now, store all the models in the database
  await db.bimModels.bulkPut(models);
  // Deserialize the data
  const savedModel = await db.bimModels.toArray();

  for (const [key, data] of Object.entries(savedModel)) {
    const dataFile = data.file;
    const file = new File([dataFile], "example");
    const urlFile = URL.createObjectURL(file);
    const model = await viewer.GLTF.loadModel(urlFile);
    ifcModels.push(model);
  }
}
///////////////////////////////////////////////////////////////////////////
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
