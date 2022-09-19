import { Color } from "../node_modules/three";
import { IfcViewerAPI } from "../node_modules/web-ifc-viewer";
import { createSideMenuButton } from "../js/gui-creator/gui-creator";
import { IFCSPACE, IFCOPENINGELEMENT } from "web-ifc";
import {
  MeshLambertMaterial,
  LineBasicMaterial,
  MeshBasicMaterial,
} from "../node_modules/three";
import Drawing from "dxf-writer";

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
  const model = await viewer.IFC.loadIfcUrl(url);
  console.log(model);
  ifcModels.push(model);
  // Add dropped shadow and post-processing effect
  await viewer.shadowDropper.renderShadow(model.modelID);
  viewer.context.renderer.postProduction.active = true;
  const properties = await viewer.IFC.properties.serializeAllProperties(model);
  // if (firstModel) {
  //   const matrixArr = await loader.ifcManager.ifcAPI.GetCoordinationMatrix(
  //     ifcModel.modelID
  //   );
  //   const matrix = new Matrix4().fromArray(matrixArr);
  //   loader.ifcManager.setupCoordinationMatrix(matrix);
  // }

  // firstModel = false;

  overlay.classList.add("hidden");

  // Generate all plans
  await viewer.plans.computeAllPlanViews(model.modelID);

  const lineMaterial = new LineBasicMaterial({ color: "black" });
  const baseMaterial = new MeshBasicMaterial({
    polygonOffset: true,
    polygonOffsetFactor: 1, // positive value pushes polygon further away
    polygonOffsetUnits: 1,
  });
  await viewer.edges.create(
    "example",
    model.modelID,
    lineMaterial,
    baseMaterial
  );

  // Floor plan viewing

  const modelPlans = viewer.plans.getAll(model.modelID);
  allPlans.push(modelPlans);
  const key = String(model.modelID);
  obj[key] = modelPlans;

  ///// Floor plan export
  viewer.dxf.initializeJSDXF(Drawing);

  const ifcProject = await viewer.IFC.getSpatialStructure(model.modelID);
  const storeys = ifcProject.children[0].children[0].children;
  for (let storey of storeys) {
    for (let child of storey.children) {
      if (child.children.length) {
        storey.children.push(...child.children);
      }
    }
  }

  for (const plan of modelPlans) {
    const currentPlan = viewer.plans.planLists[model.modelID][plan];
    // console.log(currentPlan);

    const button = document.createElement("button");
    container.appendChild(button);
    button.textContent = "Export " + currentPlan.name;
    button.id = "Export";
    button.onclick = () => {
      const storey = storeys.find(
        (storey) => storey.expressID === currentPlan.expressID
      );
      drawProjectedItems(storey, currentPlan, model.modelID);
    };
  }

  const dummySubsetMat = new MeshBasicMaterial({ visible: false });

  async function drawProjectedItems(storey, plan, modelID) {
    // Create a new drawing (if it doesn't exist)
    if (!viewer.dxf.drawings[plan.name]) viewer.dxf.newDrawing(plan.name);

    // Get the IDs of all the items to draw
    const ids = storey.children.map((item) => item.expressID);

    // If no items to draw in this layer in this floor plan, let's continue
    if (!ids.length) return;

    // If there are items, extract its geometry
    const subset = viewer.IFC.loader.ifcManager.createSubset({
      modelID,
      ids,
      removePrevious: true,
      customID: "floor_plan_generation",
      material: dummySubsetMat,
    });

    // Get the projection of the items in this floor plan
    const filteredPoints = [];
    const edges = await viewer.edgesProjector.projectEdges(subset);
    const positions = edges.geometry.attributes.position.array;

    // Lines shorter than this won't be rendered
    const tolerance = 0.01;
    for (let i = 0; i < positions.length - 5; i += 6) {
      const a = positions[i] - positions[i + 3];
      // Z coords are multiplied by -1 to match DXF Y coordinate
      const b = -positions[i + 2] + positions[i + 5];

      const distance = Math.sqrt(a * a + b * b);

      if (distance > tolerance) {
        filteredPoints.push([
          positions[i],
          -positions[i + 2],
          positions[i + 3],
          -positions[i + 5],
        ]);
      }
    }

    // Draw the projection of the items
    viewer.dxf.drawEdges(
      plan.name,
      filteredPoints,
      "Projection",
      Drawing.ACI.BLUE,
      "CONTINUOUS"
    );

    // Clean up
    edges.geometry.dispose();

    // Draw all sectioned items. thick and thin are the default layers created by IFC.js
    viewer.dxf.drawNamedLayer(
      plan.name,
      plan,
      "thick",
      "Section",
      Drawing.ACI.RED,
      "CONTINUOUS"
    );
    viewer.dxf.drawNamedLayer(
      plan.name,
      plan,
      "thin",
      "Section_Secondary",
      Drawing.ACI.CYAN,
      "CONTINUOUS"
    );

    // Download the generated floorplan
    const result = viewer.dxf.exportDXF(plan.name);
    const link = document.createElement("a");
    link.download = "floorplan.dxf";
    link.href = URL.createObjectURL(result);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  return model;
}

function removeAllChildNodes(parent) {
  while (parent.firstChild) {
    parent.removeChild(parent.firstChild);
  }
}

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
export { loadIfc, browserPanel };
