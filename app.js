"use strict";

const CONFIG = {
  minWallDistance: 0.1,
  walkwayWidth: 0.8,
  walkwayGridStep: 0.2,
  minWalkwayCoverage: 0.2,
  roomOriginPadding: 0.28,
  doorClearanceDepth: 0.95,
  windowClearanceDepth: 0.4,
  openingPadding: 0.06,
  saRestarts: 28,
  saIterations: 650,
  saStartTemp: 2.4,
  saEndTemp: 0.02,
  maxSolutions: 10
};

const TYPE_COLORS = {
  sofa: "#7ccf8c",
  tv: "#67b6f7",
  desk: "#76d4de",
  bed: "#f2ac6d",
  table: "#9fbbff",
  chair: "#bba1ff",
  storage: "#c9a78b",
  furniture: "#90a5be"
};

const FALLBACK_SAMPLE_ROOM = {
  meta: {
    source: "embedded-simulated-roomplan",
    version: "0.1",
    createdAt: "2026-02-21",
    roomName: "Living Room"
  },
  room: {
    unit: "m",
    polygon: [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 4 },
      { x: 0, y: 4 }
    ],
    doors: [{ id: "door-main", wallIndex: 0, offset: 0.35, width: 0.9, swing: "inward-left" }],
    windows: [
      { id: "window-north", wallIndex: 2, offset: 0.8, width: 1.8 },
      { id: "window-east", wallIndex: 1, offset: 1.2, width: 1.4 }
    ]
  },
  furniture: [
    {
      id: "sofa-1",
      name: "3-seat Sofa",
      type: "sofa",
      width: 2.1,
      depth: 0.95,
      x: 2.75,
      y: 2.95,
      rotation: 180,
      existing: true,
      movable: true
    },
    {
      id: "tv-1",
      name: "TV Console",
      type: "tv",
      width: 1.8,
      depth: 0.45,
      x: 2.65,
      y: 0.72,
      rotation: 0,
      existing: true,
      movable: true
    },
    {
      id: "coffee-1",
      name: "Coffee Table",
      type: "table",
      width: 1.2,
      depth: 0.6,
      x: 2.7,
      y: 2.15,
      rotation: 0,
      existing: true,
      movable: true
    },
    {
      id: "desk-1",
      name: "Work Desk",
      type: "desk",
      width: 1.2,
      depth: 0.6,
      x: 4.15,
      y: 2.8,
      rotation: 270,
      existing: true,
      movable: true
    },
    {
      id: "bookshelf-1",
      name: "Bookshelf",
      type: "storage",
      width: 0.9,
      depth: 0.35,
      x: 0.6,
      y: 2.65,
      rotation: 90,
      existing: true,
      movable: true
    },
    {
      id: "armchair-1",
      name: "Armchair",
      type: "chair",
      width: 0.9,
      depth: 0.85,
      x: 1.15,
      y: 1.45,
      rotation: 90,
      existing: true,
      movable: true
    }
  ]
};

const appState = {
  meta: null,
  room: null,
  preparedRoom: null,
  baseFurniture: [],
  solutions: [],
  currentSolutionIndex: 0,
  isOptimizing: false
};

const ui = {};

window.addEventListener("DOMContentLoaded", () => {
  init().catch((error) => {
    console.error(error);
    setStatus("Initialization failed. Check console output.", "error");
  });
});

async function init() {
  cacheUi();
  bindEvents();
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  await loadSampleRoom();
}

function cacheUi() {
  ui.roomCanvas = document.getElementById("roomCanvas");
  ui.roomMeta = document.getElementById("roomMeta");
  ui.statusLine = document.getElementById("statusLine");
  ui.furnitureList = document.getElementById("furnitureList");
  ui.solutionInfo = document.getElementById("solutionInfo");

  ui.addFurnitureForm = document.getElementById("addFurnitureForm");
  ui.furnitureName = document.getElementById("furnitureName");
  ui.furnitureWidth = document.getElementById("furnitureWidth");
  ui.furnitureDepth = document.getElementById("furnitureDepth");

  ui.autoLayoutBtn = document.getElementById("autoLayoutBtn");
  ui.prevSolutionBtn = document.getElementById("prevSolutionBtn");
  ui.nextSolutionBtn = document.getElementById("nextSolutionBtn");
  ui.reloadSampleBtn = document.getElementById("reloadSampleBtn");
}

function bindEvents() {
  ui.addFurnitureForm.addEventListener("submit", onAddFurniture);
  ui.autoLayoutBtn.addEventListener("click", runAutoLayout);
  ui.prevSolutionBtn.addEventListener("click", () => switchSolution(-1));
  ui.nextSolutionBtn.addEventListener("click", () => switchSolution(1));
  ui.reloadSampleBtn.addEventListener("click", loadSampleRoom);
}

function resizeCanvas() {
  const rect = ui.roomCanvas.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) {
    return;
  }

  ui.roomCanvas.width = Math.floor(rect.width);
  ui.roomCanvas.height = Math.floor(rect.height);
  render();
}

async function loadSampleRoom() {
  const raw = await loadSampleRoomJson();
  const dataset = normalizeDataset(raw);

  appState.meta = dataset.meta;
  appState.room = dataset.room;
  appState.preparedRoom = prepareRoom(dataset.room);
  appState.baseFurniture = dataset.furniture.map((item) =>
    clampItemToRoom(item, dataset.room, appState.preparedRoom.bounds, appState.preparedRoom.centroid)
  );
  appState.solutions = [];
  appState.currentSolutionIndex = 0;

  updateRoomMeta();
  updateSolutionControls();
  setStatus("Sample room loaded.", "success");
  render();
}

async function loadSampleRoomJson() {
  try {
    const response = await fetch("data/sample-room.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.warn("Falling back to embedded sample room:", error);
    setStatus("Using embedded sample JSON (direct file mode fallback).", "warn");
    return FALLBACK_SAMPLE_ROOM;
  }
}

function normalizeDataset(raw) {
  const roomInput = raw.room || raw;
  const furnitureInput = Array.isArray(raw.furniture) ? raw.furniture : [];
  const room = normalizeRoom(roomInput);
  const furniture = furnitureInput.map((item, index) => normalizeFurniture(item, index));
  const aligned = alignDatasetToRoomAxis(room, furniture);

  return {
    meta: raw.meta || {},
    room: aligned.room,
    furniture: aligned.furniture
  };
}

function normalizeRoom(roomInput) {
  const polygon = Array.isArray(roomInput.polygon)
    ? roomInput.polygon
        .map((point) => ({ x: toNumber(point.x, 0), y: toNumber(point.y, 0) }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    : [];

  if (polygon.length < 3) {
    throw new Error("Room polygon needs at least 3 points.");
  }

  const wallsCount = polygon.length;
  const doors = Array.isArray(roomInput.doors)
    ? roomInput.doors.map((entry, index) => normalizeOpening(entry, index, wallsCount, "door"))
    : [];
  const windows = Array.isArray(roomInput.windows)
    ? roomInput.windows.map((entry, index) => normalizeOpening(entry, index, wallsCount, "window"))
    : [];

  return {
    unit: roomInput.unit || "m",
    polygon,
    doors,
    windows
  };
}

function normalizeOpening(opening, index, wallsCount, kind) {
  const width = Math.max(0.4, toNumber(opening.width, 0.8));
  return {
    id: opening.id || `${kind}-${index + 1}`,
    wallIndex: clamp(Math.floor(toNumber(opening.wallIndex, 0)), 0, wallsCount - 1),
    offset: Math.max(0, toNumber(opening.offset, 0)),
    width,
    swing: opening.swing || ""
  };
}

function normalizeFurniture(item, index) {
  const name = (item.name || `Furniture ${index + 1}`).trim();
  const width = Math.max(0.3, toNumber(item.width, 1));
  const depth = Math.max(0.3, toNumber(item.depth, 0.7));

  return {
    id: item.id || `furniture-${index + 1}`,
    name,
    type: (item.type || classifyFurnitureType(name)).toLowerCase(),
    width,
    depth,
    height: Math.max(0.1, toNumber(item.height, 0.7)),
    x: toNumber(item.x, 0),
    y: toNumber(item.y, 0),
    rotation: toNumber(item.rotation, 0),
    existing: item.existing !== false,
    movable: item.movable !== false
  };
}

function alignDatasetToRoomAxis(room, furniture) {
  const principal = getPrincipalRoomAxis(room.polygon);
  const roomRotationDegrees = (principal.angleRadians * 180) / Math.PI;
  const derotationRadians = -principal.angleRadians;

  const rotatedPolygon = room.polygon.map((point) => rotatePoint(point, derotationRadians));
  const rotatedBounds = getPolygonBounds(rotatedPolygon);
  const translateX = CONFIG.roomOriginPadding - rotatedBounds.minX;
  const translateY = CONFIG.roomOriginPadding - rotatedBounds.minY;

  const alignedRoom = {
    ...room,
    polygon: rotatedPolygon.map((point) => ({
      x: point.x + translateX,
      y: point.y + translateY
    }))
  };

  const alignedFurniture = furniture.map((item) => {
    const rotatedPosition = rotatePoint({ x: item.x, y: item.y }, derotationRadians);

    return {
      ...item,
      x: rotatedPosition.x + translateX,
      y: rotatedPosition.y + translateY,
      rotation: normalizeRotation(toNumber(item.rotation, 0) - roomRotationDegrees)
    };
  });

  return {
    room: alignedRoom,
    furniture: alignedFurniture
  };
}

function updateRoomMeta() {
  if (!appState.room) {
    ui.roomMeta.textContent = "No room loaded.";
    return;
  }

  const bounds = appState.preparedRoom.bounds;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const roomName = appState.meta && appState.meta.roomName ? appState.meta.roomName : "Sample Room";
  ui.roomMeta.textContent = `${roomName} · ${width.toFixed(1)}m × ${height.toFixed(1)}m · ${appState.baseFurniture.length} furniture items`;
}

function onAddFurniture(event) {
  event.preventDefault();

  if (!appState.room) {
    return;
  }

  const name = ui.furnitureName.value.trim();
  const width = toNumber(ui.furnitureWidth.value, NaN);
  const depth = toNumber(ui.furnitureDepth.value, NaN);

  if (!name || !Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0) {
    setStatus("Invalid furniture input.", "error");
    return;
  }

  const centroid = appState.preparedRoom.centroid;
  const newItem = {
    id: `new-${Date.now()}`,
    name,
    type: classifyFurnitureType(name),
    width,
    depth,
    height: 0.8,
    x: centroid.x + randomRange(-0.35, 0.35),
    y: centroid.y + randomRange(-0.35, 0.35),
    rotation: 0,
    existing: false,
    movable: true
  };

  appState.baseFurniture.push(
    clampItemToRoom(newItem, appState.room, appState.preparedRoom.bounds, appState.preparedRoom.centroid)
  );
  appState.solutions = [];
  appState.currentSolutionIndex = 0;

  ui.addFurnitureForm.reset();
  updateRoomMeta();
  updateSolutionControls();
  setStatus(`Added ${name}. Run Auto Layout to optimize.`, "success");
  render();
}

function switchSolution(direction) {
  if (!appState.solutions.length || appState.isOptimizing) {
    return;
  }

  const total = appState.solutions.length;
  appState.currentSolutionIndex = (appState.currentSolutionIndex + direction + total) % total;
  updateSolutionControls();
  render();
}

async function runAutoLayout() {
  if (!appState.room) {
    return;
  }

  appState.isOptimizing = true;
  updateSolutionControls();
  ui.autoLayoutBtn.disabled = true;
  setStatus("Running simulated annealing layout optimizer...", "warn");

  const baseline = cloneFurniture(appState.baseFurniture);
  const solutions = await generateLayoutSolutions(baseline, appState.room, appState.preparedRoom, (progress) => {
    setStatus(`Optimizing... restart ${progress.restart}/${progress.total}`, "warn");
  });

  appState.solutions = solutions;
  appState.currentSolutionIndex = 0;
  appState.isOptimizing = false;
  ui.autoLayoutBtn.disabled = false;

  if (solutions.length === 0) {
    setStatus("No layout candidates were generated.", "error");
  } else {
    const feasible = solutions.filter((entry) => entry.hardPenalty === 0).length;
    if (feasible > 0) {
      setStatus(`Generated ${solutions.length} layouts (${feasible} feasible).`, "success");
    } else {
      setStatus(`Generated ${solutions.length} candidates but none satisfy all hard constraints.`, "warn");
    }
  }

  updateSolutionControls();
  render();
}

async function generateLayoutSolutions(baseFurniture, room, prepared, progressCallback) {
  const candidatePool = [];

  for (let restart = 0; restart < CONFIG.saRestarts; restart += 1) {
    let current = createSeedState(baseFurniture, room, prepared);
    let currentEval = evaluateLayout(current, room, prepared);

    let bestItems = cloneFurniture(current);
    let bestEval = currentEval;

    for (let iter = 0; iter < CONFIG.saIterations; iter += 1) {
      const temperature = temperatureAt(iter, CONFIG.saIterations, CONFIG.saStartTemp, CONFIG.saEndTemp);
      const candidate = perturbState(current, room, prepared, temperature);
      const candidateEval = evaluateLayout(candidate, room, prepared);

      const delta = candidateEval.totalScore - currentEval.totalScore;
      const accept = delta >= 0 || Math.exp(delta / Math.max(temperature, 0.001)) > Math.random();

      if (accept) {
        current = candidate;
        currentEval = candidateEval;
      }

      if (currentEval.totalScore > bestEval.totalScore) {
        bestEval = currentEval;
        bestItems = cloneFurniture(current);
      }
    }

    candidatePool.push({ items: bestItems, eval: bestEval });

    if (progressCallback && (restart % 2 === 0 || restart === CONFIG.saRestarts - 1)) {
      progressCallback({ restart: restart + 1, total: CONFIG.saRestarts });
    }

    if (restart % 2 === 1) {
      await sleep(0);
    }
  }

  const sorted = candidatePool.slice().sort((a, b) => {
    const aFeasible = a.eval.hardPenalty === 0;
    const bFeasible = b.eval.hardPenalty === 0;
    if (aFeasible !== bFeasible) {
      return aFeasible ? -1 : 1;
    }
    if (a.eval.hardPenalty !== b.eval.hardPenalty) {
      return a.eval.hardPenalty - b.eval.hardPenalty;
    }
    return b.eval.totalScore - a.eval.totalScore;
  });

  const solutions = [];
  const seen = new Set();
  for (const entry of sorted) {
    const signature = layoutSignature(entry.items);
    if (seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    solutions.push({
      items: cloneFurniture(entry.items),
      totalScore: round2(entry.eval.totalScore),
      softScore: round2(entry.eval.softScore),
      hardPenalty: round2(entry.eval.hardPenalty),
      details: entry.eval.details
    });

    if (solutions.length >= CONFIG.maxSolutions) {
      break;
    }
  }

  return solutions;
}

function createSeedState(baseFurniture, room, prepared) {
  return baseFurniture.map((item) => {
    const seeded = { ...item };
    if (!seeded.movable) {
      return seeded;
    }

    if (Math.random() < 0.75) {
      seeded.rotation = randomChoice([0, 90, 180, 270]);
    }

    const spread = seeded.existing ? 0.7 : 1.1;
    seeded.x += randomRange(-spread, spread);
    seeded.y += randomRange(-spread, spread);

    if (Math.random() < 0.14) {
      const wall = randomChoice(prepared.walls);
      const footprint = getFootprint(seeded);
      if (Math.abs(wall.ux) >= Math.abs(wall.uy)) {
        seeded.y = wall.p1.y + wall.ny * (footprint.h / 2 + CONFIG.minWallDistance + randomRange(0, 0.2));
      } else {
        seeded.x = wall.p1.x + wall.nx * (footprint.w / 2 + CONFIG.minWallDistance + randomRange(0, 0.2));
      }
    }

    return clampItemToRoom(seeded, room, prepared.bounds, prepared.centroid);
  });
}

function perturbState(current, room, prepared, temperature) {
  const candidate = cloneFurniture(current);
  const movableIndices = [];

  for (let i = 0; i < candidate.length; i += 1) {
    if (candidate[i].movable) {
      movableIndices.push(i);
    }
  }

  if (!movableIndices.length) {
    return candidate;
  }

  const targetIndex = randomChoice(movableIndices);
  const item = candidate[targetIndex];

  const moveScale = 0.08 + temperature * 0.22;
  item.x += randomRange(-moveScale, moveScale);
  item.y += randomRange(-moveScale, moveScale);

  if (Math.random() < 0.3) {
    item.rotation = randomChoice([0, 90, 180, 270]);
  }

  if (Math.random() < 0.1) {
    const nearestWall = findNearestWall(item, prepared.walls);
    const fp = getFootprint(item);
    if (Math.abs(nearestWall.ux) >= Math.abs(nearestWall.uy)) {
      item.y = nearestWall.p1.y + nearestWall.ny * (fp.h / 2 + randomRange(0.02, 0.2));
    } else {
      item.x = nearestWall.p1.x + nearestWall.nx * (fp.w / 2 + randomRange(0.02, 0.2));
    }
  }

  if (item.type === "desk" && prepared.windowZones.length && Math.random() < 0.24) {
    const targetWindow = randomChoice(prepared.windowZones);
    item.x += (targetWindow.center.x - item.x) * 0.35;
    item.y += (targetWindow.center.y - item.y) * 0.35;
  }

  if (Math.random() < 0.06 && movableIndices.length > 1) {
    const otherIndex = randomChoice(movableIndices.filter((idx) => idx !== targetIndex));
    const other = candidate[otherIndex];
    const tempX = item.x;
    const tempY = item.y;
    item.x = other.x;
    item.y = other.y;
    other.x = tempX;
    other.y = tempY;
  }

  candidate[targetIndex] = clampItemToRoom(item, room, prepared.bounds, prepared.centroid);
  return candidate;
}

function evaluateLayout(items, room, prepared) {
  const rects = items.map((item) => getRect(item));
  let hardPenalty = 0;

  const details = {
    overlap: 0,
    wall: 0,
    openings: 0,
    walkway: 0,
    soft: null
  };

  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const overlapArea = rectOverlapArea(rects[i], rects[j]);
      if (overlapArea > 0) {
        const penalty = overlapArea * 2400;
        hardPenalty += penalty;
        details.overlap += penalty;
      }
    }
  }

  for (const rect of rects) {
    const corners = rectCorners(rect);
    const anyOutside = corners.some((corner) => !pointInPolygon(corner, room.polygon));
    if (anyOutside) {
      hardPenalty += 900;
      details.wall += 900;
    }

    const distanceToWalls = minDistanceToWallsForRect(rect, prepared.walls);
    if (distanceToWalls < CONFIG.minWallDistance) {
      const penalty = (CONFIG.minWallDistance - distanceToWalls) * 650;
      hardPenalty += penalty;
      details.wall += penalty;
    }
  }

  const allZones = prepared.doorZones.concat(prepared.windowZones);
  for (const zone of allZones) {
    for (const rect of rects) {
      const overlapArea = rectOverlapArea(zone, rect);
      if (overlapArea > 0) {
        const multiplier = zone.kind === "door" ? 3800 : 2100;
        const penalty = overlapArea * multiplier;
        hardPenalty += penalty;
        details.openings += penalty;
      }
    }
  }

  const walkwayResult = checkWalkway(items, room, prepared);
  if (!walkwayResult.ok) {
    hardPenalty += walkwayResult.penalty;
    details.walkway += walkwayResult.penalty;
  }

  const soft = evaluateSoftConstraints(items, prepared);
  details.soft = soft;

  const softScore = soft.total;
  const totalScore = softScore - hardPenalty;

  return {
    hardPenalty: round2(hardPenalty),
    softScore: round2(softScore),
    totalScore: round2(totalScore),
    details,
    walkway: walkwayResult
  };
}

function evaluateSoftConstraints(items, prepared) {
  const score = {
    total: 0,
    tvFacingSofa: 0,
    deskNearWindow: 0,
    bedAgainstWall: 0
  };

  const sofa = findItemByTypes(items, ["sofa", "couch"]);
  const tv = findItemByTypes(items, ["tv", "television"]);

  if (sofa && tv) {
    const dx = tv.x - sofa.x;
    const dy = tv.y - sofa.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1e-6) {
      const direction = frontVector(sofa.rotation);
      const facing = (direction.x * dx + direction.y * dy) / dist;
      const facingScore = clamp((facing - 0.15) / 0.85, 0, 1);
      const distanceScore = Math.exp(-Math.pow(dist - 2.5, 2) / 1.4);
      score.tvFacingSofa = 35 * facingScore * distanceScore;
      score.total += score.tvFacingSofa;
    }
  }

  const desks = items.filter((item) => item.type === "desk" || item.name.toLowerCase().includes("desk"));
  if (desks.length && prepared.windowZones.length) {
    for (const desk of desks) {
      let minDistance = Infinity;
      for (const zone of prepared.windowZones) {
        const distance = distancePointSegment({ x: desk.x, y: desk.y }, zone.lineStart, zone.lineEnd);
        minDistance = Math.min(minDistance, distance);
      }
      const closeness = clamp(1 - minDistance / 2.0, 0, 1);
      score.deskNearWindow += 16 * closeness;
    }
    score.total += score.deskNearWindow;
  }

  const beds = items.filter((item) => item.type === "bed" || item.name.toLowerCase().includes("bed"));
  if (beds.length) {
    for (const bed of beds) {
      const rect = getRect(bed);
      const distance = minDistanceToWallsForRect(rect, prepared.walls);
      const againstWall = clamp(1 - distance / 0.35, 0, 1);
      const parallelScore = bedWallParallelScore(bed, prepared.walls);
      score.bedAgainstWall += 18 * againstWall * (0.65 + 0.35 * parallelScore);
    }
    score.total += score.bedAgainstWall;
  }

  score.total = round2(score.total);
  score.tvFacingSofa = round2(score.tvFacingSofa);
  score.deskNearWindow = round2(score.deskNearWindow);
  score.bedAgainstWall = round2(score.bedAgainstWall);

  return score;
}

function checkWalkway(items, room, prepared) {
  const step = CONFIG.walkwayGridStep;
  const bounds = prepared.bounds;
  const cols = Math.max(4, Math.floor((bounds.maxX - bounds.minX) / step) + 1);
  const rows = Math.max(4, Math.floor((bounds.maxY - bounds.minY) / step) + 1);

  const inflatedRects = items.map((item) => getRect(item, CONFIG.walkwayWidth / 2));
  const free = new Uint8Array(cols * rows);

  let freeCount = 0;
  for (let row = 0; row < rows; row += 1) {
    const y = bounds.minY + row * step;
    for (let col = 0; col < cols; col += 1) {
      const x = bounds.minX + col * step;
      const idx = row * cols + col;

      if (!pointInPolygon({ x, y }, room.polygon)) {
        continue;
      }

      let blocked = false;
      for (const obstacle of inflatedRects) {
        if (pointInRect({ x, y }, obstacle)) {
          blocked = true;
          break;
        }
      }

      if (!blocked) {
        free[idx] = 1;
        freeCount += 1;
      }
    }
  }

  if (!freeCount) {
    return { ok: false, penalty: 2200, coverage: 0, targetSatisfied: false };
  }

  const sourceAnchors = prepared.doorAnchors.length ? prepared.doorAnchors : [prepared.centroid];
  const sourceIndices = [];
  for (const anchor of sourceAnchors) {
    const idx = nearestFreeCell(anchor, free, cols, rows, bounds, step, 3);
    if (idx >= 0 && !sourceIndices.includes(idx)) {
      sourceIndices.push(idx);
    }
  }

  if (!sourceIndices.length) {
    return { ok: false, penalty: 1800, coverage: 0, targetSatisfied: false };
  }

  const visited = new Uint8Array(cols * rows);
  const queue = new Int32Array(cols * rows);

  let head = 0;
  let tail = 0;
  for (const source of sourceIndices) {
    visited[source] = 1;
    queue[tail] = source;
    tail += 1;
  }

  while (head < tail) {
    const idx = queue[head];
    head += 1;

    const col = idx % cols;
    const row = (idx - col) / cols;

    const neighbors = [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1]
    ];

    for (const [nextRow, nextCol] of neighbors) {
      if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols) {
        continue;
      }

      const nextIdx = nextRow * cols + nextCol;
      if (!free[nextIdx] || visited[nextIdx]) {
        continue;
      }

      visited[nextIdx] = 1;
      queue[tail] = nextIdx;
      tail += 1;
    }
  }

  let visitedCount = 0;
  for (let i = 0; i < visited.length; i += 1) {
    if (visited[i]) {
      visitedCount += 1;
    }
  }

  const centroidIdx = nearestFreeCell(prepared.centroid, free, cols, rows, bounds, step, 4);
  let reachableTargets = 0;

  if (centroidIdx >= 0 && visited[centroidIdx]) {
    reachableTargets += 1;
  }

  for (const zone of prepared.windowZones) {
    const idx = nearestFreeCell(zone.center, free, cols, rows, bounds, step, 3);
    if (idx >= 0 && visited[idx]) {
      reachableTargets += 1;
    }
  }

  const targetRequirement = prepared.windowZones.length ? 2 : 1;
  const targetSatisfied = reachableTargets >= targetRequirement;

  const coverage = visitedCount / freeCount;
  const coverageSatisfied = coverage >= CONFIG.minWalkwayCoverage;

  let penalty = 0;
  if (!targetSatisfied) {
    penalty += 1200;
  }
  if (!coverageSatisfied) {
    penalty += (CONFIG.minWalkwayCoverage - coverage) * 2200;
  }

  return {
    ok: targetSatisfied && coverageSatisfied,
    penalty: round2(penalty),
    coverage: round2(coverage),
    targetSatisfied
  };
}

function render() {
  const ctx = ui.roomCanvas.getContext("2d");
  const width = ui.roomCanvas.width;
  const height = ui.roomCanvas.height;

  ctx.clearRect(0, 0, width, height);

  const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
  bgGradient.addColorStop(0, "#152433");
  bgGradient.addColorStop(1, "#0f1a26");
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  if (!appState.room) {
    return;
  }

  const transform = createTransform(appState.room.polygon, width, height, 44);
  drawGrid(ctx, transform);
  drawRoom(ctx, appState.room, appState.preparedRoom, transform);

  const furniture = getDisplayedFurniture();
  drawFurniture(ctx, furniture, transform);

  updateFurnitureList(furniture);
}

function drawGrid(ctx, transform) {
  const step = 0.5;
  const bounds = transform.bounds;

  ctx.strokeStyle = "rgba(155, 180, 205, 0.08)";
  ctx.lineWidth = 1;

  const minX = Math.ceil(bounds.minX / step) * step;
  const maxX = Math.floor(bounds.maxX / step) * step;
  const minY = Math.ceil(bounds.minY / step) * step;
  const maxY = Math.floor(bounds.maxY / step) * step;

  for (let x = minX; x <= maxX + 1e-6; x += step) {
    const from = transform.toCanvas({ x, y: bounds.minY });
    const to = transform.toCanvas({ x, y: bounds.maxY });
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  for (let y = minY; y <= maxY + 1e-6; y += step) {
    const from = transform.toCanvas({ x: bounds.minX, y });
    const to = transform.toCanvas({ x: bounds.maxX, y });
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
}

function drawRoom(ctx, room, prepared, transform) {
  const polygon = room.polygon;

  ctx.beginPath();
  polygon.forEach((point, index) => {
    const canvasPoint = transform.toCanvas(point);
    if (index === 0) {
      ctx.moveTo(canvasPoint.x, canvasPoint.y);
    } else {
      ctx.lineTo(canvasPoint.x, canvasPoint.y);
    }
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(34, 53, 74, 0.65)";
  ctx.fill();
  ctx.strokeStyle = "rgba(142, 171, 200, 0.96)";
  ctx.lineWidth = 3;
  ctx.stroke();

  for (const zone of prepared.doorZones) {
    drawZoneRect(ctx, zone, transform, "rgba(247, 165, 88, 0.22)");
    drawOpeningLine(ctx, zone, transform, "#f7a558", 5);
  }

  for (const zone of prepared.windowZones) {
    drawZoneRect(ctx, zone, transform, "rgba(123, 220, 255, 0.16)");
    drawOpeningLine(ctx, zone, transform, "#7bdcff", 4);
  }
}

function drawZoneRect(ctx, zone, transform, fillStyle) {
  const rect = transform.rectToCanvas(zone);
  ctx.fillStyle = fillStyle;
  ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
}

function drawOpeningLine(ctx, zone, transform, strokeStyle, width) {
  const start = transform.toCanvas(zone.lineStart);
  const end = transform.toCanvas(zone.lineEnd);

  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
}

function drawFurniture(ctx, furniture, transform) {
  for (const item of furniture) {
    const rect = getRect(item);
    const drawRect = transform.rectToCanvas(rect);

    ctx.fillStyle = colorForFurniture(item);
    ctx.strokeStyle = item.existing ? "rgba(225, 236, 248, 0.55)" : "rgba(255, 208, 112, 0.95)";
    ctx.lineWidth = 2;

    ctx.fillRect(drawRect.left, drawRect.top, drawRect.width, drawRect.height);

    if (!item.existing) {
      ctx.setLineDash([6, 4]);
    }
    ctx.strokeRect(drawRect.left, drawRect.top, drawRect.width, drawRect.height);
    ctx.setLineDash([]);

    const center = transform.toCanvas({ x: item.x, y: item.y });
    const fp = getFootprint(item);
    const front = frontVector(item.rotation);
    const arrowScale = Math.min(fp.w, fp.h) * 0.35;
    const arrowEnd = transform.toCanvas({
      x: item.x + front.x * arrowScale,
      y: item.y + front.y * arrowScale
    });

    ctx.strokeStyle = "rgba(6, 21, 31, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(arrowEnd.x, arrowEnd.y);
    ctx.stroke();

    ctx.fillStyle = "rgba(10, 22, 32, 0.86)";
    ctx.font = "12px Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = shortLabel(item.name, 18);
    ctx.fillText(label, center.x, center.y);
  }
}

function createTransform(polygon, canvasWidth, canvasHeight, padding) {
  const bounds = getPolygonBounds(polygon);
  const roomWidth = Math.max(0.01, bounds.maxX - bounds.minX);
  const roomHeight = Math.max(0.01, bounds.maxY - bounds.minY);

  const scale = Math.min((canvasWidth - padding * 2) / roomWidth, (canvasHeight - padding * 2) / roomHeight);

  return {
    bounds,
    scale,
    toCanvas(point) {
      return {
        x: padding + (point.x - bounds.minX) * scale,
        y: canvasHeight - padding - (point.y - bounds.minY) * scale
      };
    },
    rectToCanvas(rect) {
      const left = padding + (rect.left - bounds.minX) * scale;
      const right = padding + (rect.right - bounds.minX) * scale;
      const top = canvasHeight - padding - (rect.top - bounds.minY) * scale;
      const bottom = canvasHeight - padding - (rect.bottom - bounds.minY) * scale;

      return {
        left,
        right,
        top,
        bottom,
        width: right - left,
        height: bottom - top
      };
    }
  };
}

function getDisplayedFurniture() {
  if (appState.solutions.length) {
    return appState.solutions[appState.currentSolutionIndex].items;
  }
  return appState.baseFurniture;
}

function updateFurnitureList(furniture) {
  ui.furnitureList.innerHTML = "";

  for (const item of furniture) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${escapeHtml(item.name)}</strong><br>${item.width.toFixed(2)}m × ${item.depth.toFixed(2)}m · rot ${item.rotation}°<br>x ${item.x.toFixed(2)}, y ${item.y.toFixed(2)}`;
    ui.furnitureList.appendChild(li);
  }
}

function updateSolutionControls() {
  const hasSolutions = appState.solutions.length > 0;
  ui.prevSolutionBtn.disabled = !hasSolutions || appState.isOptimizing;
  ui.nextSolutionBtn.disabled = !hasSolutions || appState.isOptimizing;

  if (!hasSolutions) {
    ui.solutionInfo.textContent = appState.isOptimizing ? "Optimizing..." : "No solutions yet";
    return;
  }

  const current = appState.solutions[appState.currentSolutionIndex];
  const feasibleLabel = current.hardPenalty === 0 ? "feasible" : "hard violations";
  ui.solutionInfo.textContent = `${appState.currentSolutionIndex + 1}/${appState.solutions.length} · score ${current.totalScore.toFixed(1)} · ${feasibleLabel}`;
}

function setStatus(text, type = "info") {
  ui.statusLine.textContent = text;
  ui.statusLine.className = "status-line";
  if (type !== "info") {
    ui.statusLine.classList.add(type);
  }
}

function prepareRoom(room) {
  const bounds = getPolygonBounds(room.polygon);
  const centroid = polygonCentroid(room.polygon);
  const walls = getWalls(room.polygon);

  const doorZones = room.doors
    .map((door) => openingToZone(door, walls[door.wallIndex], CONFIG.doorClearanceDepth, CONFIG.openingPadding, "door"))
    .filter(Boolean);

  const windowZones = room.windows
    .map((windowEntry) =>
      openingToZone(windowEntry, walls[windowEntry.wallIndex], CONFIG.windowClearanceDepth, CONFIG.openingPadding, "window")
    )
    .filter(Boolean);

  const doorAnchors = doorZones.map((zone) => ({
    x: zone.lineCenter.x + zone.normal.x * (CONFIG.doorClearanceDepth * 0.66),
    y: zone.lineCenter.y + zone.normal.y * (CONFIG.doorClearanceDepth * 0.66)
  }));

  return {
    bounds,
    centroid,
    walls,
    doorZones,
    windowZones,
    doorAnchors
  };
}

function openingToZone(entry, wall, depth, padding, kind) {
  if (!wall) {
    return null;
  }

  const width = Math.max(0.2, entry.width);
  const maxOffset = Math.max(0, wall.length - width);
  const offset = clamp(entry.offset, 0, maxOffset);

  const lineStart = {
    x: wall.p1.x + wall.ux * offset,
    y: wall.p1.y + wall.uy * offset
  };
  const lineEnd = {
    x: lineStart.x + wall.ux * width,
    y: lineStart.y + wall.uy * width
  };

  const lineCenter = {
    x: (lineStart.x + lineEnd.x) / 2,
    y: (lineStart.y + lineEnd.y) / 2
  };

  const center = {
    x: lineCenter.x + wall.nx * (depth / 2),
    y: lineCenter.y + wall.ny * (depth / 2)
  };

  const alongHorizontal = Math.abs(wall.ux) >= Math.abs(wall.uy);
  let rect;

  if (alongHorizontal) {
    rect = {
      left: center.x - (width / 2 + padding),
      right: center.x + (width / 2 + padding),
      bottom: center.y - depth / 2,
      top: center.y + depth / 2
    };
  } else {
    rect = {
      left: center.x - depth / 2,
      right: center.x + depth / 2,
      bottom: center.y - (width / 2 + padding),
      top: center.y + (width / 2 + padding)
    };
  }

  return {
    ...rect,
    id: entry.id,
    kind,
    center,
    lineStart,
    lineEnd,
    lineCenter,
    normal: { x: wall.nx, y: wall.ny }
  };
}

function getWalls(polygon) {
  const area = polygonArea(polygon);
  const ccw = area >= 0;

  const walls = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.hypot(dx, dy);

    const ux = dx / length;
    const uy = dy / length;

    const nx = ccw ? -uy : uy;
    const ny = ccw ? ux : -ux;

    walls.push({ index: i, p1, p2, length, ux, uy, nx, ny });
  }

  return walls;
}

function getPrincipalRoomAxis(polygon) {
  let longestLength = -Infinity;
  let angleRadians = 0;

  for (let i = 0; i < polygon.length; i += 1) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.hypot(dx, dy);

    if (length > longestLength) {
      longestLength = length;
      angleRadians = Math.atan2(dy, dx);
    }
  }

  if (angleRadians > Math.PI / 2) {
    angleRadians -= Math.PI;
  } else if (angleRadians <= -Math.PI / 2) {
    angleRadians += Math.PI;
  }

  return {
    angleRadians,
    length: longestLength
  };
}

function getFootprint(item) {
  const rotation = normalizeRotation(item.rotation);
  if (rotation === 90 || rotation === 270) {
    return { w: item.depth, h: item.width };
  }
  return { w: item.width, h: item.depth };
}

function getRect(item, inflate = 0) {
  const footprint = getFootprint(item);
  const halfW = footprint.w / 2 + inflate;
  const halfH = footprint.h / 2 + inflate;

  return {
    left: item.x - halfW,
    right: item.x + halfW,
    bottom: item.y - halfH,
    top: item.y + halfH
  };
}

function rectCorners(rect) {
  return [
    { x: rect.left, y: rect.bottom },
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.right, y: rect.top }
  ];
}

function minDistanceToWallsForRect(rect, walls) {
  const points = [
    { x: rect.left, y: rect.bottom },
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.right, y: rect.top },
    { x: (rect.left + rect.right) / 2, y: rect.bottom },
    { x: (rect.left + rect.right) / 2, y: rect.top },
    { x: rect.left, y: (rect.bottom + rect.top) / 2 },
    { x: rect.right, y: (rect.bottom + rect.top) / 2 }
  ];

  let minDistance = Infinity;
  for (const point of points) {
    for (const wall of walls) {
      const distance = distancePointSegment(point, wall.p1, wall.p2);
      minDistance = Math.min(minDistance, distance);
    }
  }

  return minDistance;
}

function findNearestWall(item, walls) {
  let bestWall = walls[0];
  let bestDistance = Infinity;

  for (const wall of walls) {
    const distance = distancePointSegment({ x: item.x, y: item.y }, wall.p1, wall.p2);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestWall = wall;
    }
  }

  return bestWall;
}

function bedWallParallelScore(bed, walls) {
  const nearestWall = findNearestWall(bed, walls);
  const wallAxis = Math.abs(nearestWall.ux) >= Math.abs(nearestWall.uy) ? "x" : "y";
  const fp = getFootprint(bed);
  const longAxis = fp.w >= fp.h ? "x" : "y";
  return wallAxis === longAxis ? 1 : 0;
}

function clampItemToRoom(item, room, bounds, centroid) {
  const clamped = { ...item };
  const fp = getFootprint(clamped);

  clamped.x = clamp(clamped.x, bounds.minX + fp.w / 2, bounds.maxX - fp.w / 2);
  clamped.y = clamp(clamped.y, bounds.minY + fp.h / 2, bounds.maxY - fp.h / 2);

  for (let i = 0; i < 8; i += 1) {
    const corners = rectCorners(getRect(clamped));
    const allInside = corners.every((corner) => pointInPolygon(corner, room.polygon));
    if (allInside) {
      break;
    }

    clamped.x += (centroid.x - clamped.x) * 0.28;
    clamped.y += (centroid.y - clamped.y) * 0.28;

    clamped.x = clamp(clamped.x, bounds.minX + fp.w / 2, bounds.maxX - fp.w / 2);
    clamped.y = clamp(clamped.y, bounds.minY + fp.h / 2, bounds.maxY - fp.h / 2);
  }

  return clamped;
}

function layoutSignature(items) {
  return items
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((item) => `${item.id}:${item.x.toFixed(2)}:${item.y.toFixed(2)}:${item.rotation}`)
    .join("|");
}

function colorForFurniture(item) {
  const base = TYPE_COLORS[item.type] || TYPE_COLORS.furniture;
  if (item.existing) {
    return base;
  }

  return mixHex(base, "#ffd070", 0.5);
}

function frontVector(rotation) {
  const normalized = normalizeRotation(rotation);
  if (normalized === 90) {
    return { x: 1, y: 0 };
  }
  if (normalized === 180) {
    return { x: 0, y: -1 };
  }
  if (normalized === 270) {
    return { x: -1, y: 0 };
  }
  return { x: 0, y: 1 };
}

function findItemByTypes(items, typeKeywords) {
  for (const item of items) {
    const hay = `${item.type} ${item.name}`.toLowerCase();
    if (typeKeywords.some((keyword) => hay.includes(keyword))) {
      return item;
    }
  }
  return null;
}

function nearestFreeCell(point, free, cols, rows, bounds, step, radiusLimit) {
  const baseCol = clamp(Math.round((point.x - bounds.minX) / step), 0, cols - 1);
  const baseRow = clamp(Math.round((point.y - bounds.minY) / step), 0, rows - 1);

  for (let radius = 0; radius <= radiusLimit; radius += 1) {
    for (let row = baseRow - radius; row <= baseRow + radius; row += 1) {
      if (row < 0 || row >= rows) {
        continue;
      }
      for (let col = baseCol - radius; col <= baseCol + radius; col += 1) {
        if (col < 0 || col >= cols) {
          continue;
        }
        const idx = row * cols + col;
        if (free[idx]) {
          return idx;
        }
      }
    }
  }

  return -1;
}

function classifyFurnitureType(name) {
  const lower = name.toLowerCase();
  if (lower.includes("sofa") || lower.includes("couch")) {
    return "sofa";
  }
  if (lower.includes("tv") || lower.includes("television")) {
    return "tv";
  }
  if (lower.includes("desk")) {
    return "desk";
  }
  if (lower.includes("bed")) {
    return "bed";
  }
  if (lower.includes("chair") || lower.includes("stool")) {
    return "chair";
  }
  if (lower.includes("table")) {
    return "table";
  }
  if (lower.includes("shelf") || lower.includes("cabinet") || lower.includes("storage")) {
    return "storage";
  }
  return "furniture";
}

function pointInPolygon(point, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

function pointInRect(point, rect) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.bottom && point.y <= rect.top;
}

function rectOverlapArea(a, b) {
  const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const overlapY = Math.max(0, Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom));
  return overlapX * overlapY;
}

function distancePointSegment(point, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const ab2 = abx * abx + aby * aby;

  if (ab2 <= 1e-12) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }

  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const t = clamp((apx * abx + apy * aby) / ab2, 0, 1);

  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  return Math.hypot(point.x - cx, point.y - cy);
}

function rotatePoint(point, radians) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos
  };
}

function getPolygonBounds(polygon) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const point of polygon) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, maxX, minY, maxY };
}

function polygonCentroid(polygon) {
  let signedArea = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < polygon.length; i += 1) {
    const p0 = polygon[i];
    const p1 = polygon[(i + 1) % polygon.length];
    const cross = p0.x * p1.y - p1.x * p0.y;
    signedArea += cross;
    cx += (p0.x + p1.x) * cross;
    cy += (p0.y + p1.y) * cross;
  }

  if (Math.abs(signedArea) < 1e-12) {
    const bounds = getPolygonBounds(polygon);
    return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  }

  const area = signedArea / 2;
  return {
    x: cx / (6 * area),
    y: cy / (6 * area)
  };
}

function polygonArea(polygon) {
  let area = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const p0 = polygon[i];
    const p1 = polygon[(i + 1) % polygon.length];
    area += p0.x * p1.y - p1.x * p0.y;
  }
  return area / 2;
}

function normalizeRotation(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const snapped = Math.round(value / 90) * 90;
  return ((snapped % 360) + 360) % 360;
}

function cloneFurniture(items) {
  return items.map((item) => ({ ...item }));
}

function temperatureAt(step, totalSteps, start, end) {
  if (totalSteps <= 1) {
    return end;
  }
  const t = step / (totalSteps - 1);
  return start * Math.pow(end / start, t);
}

function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function shortLabel(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function escapeHtml(input) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mixHex(hexA, hexB, ratio) {
  const colorA = parseHex(hexA);
  const colorB = parseHex(hexB);
  const clampedRatio = clamp(ratio, 0, 1);

  const r = Math.round(colorA.r + (colorB.r - colorA.r) * clampedRatio);
  const g = Math.round(colorA.g + (colorB.g - colorA.g) * clampedRatio);
  const b = Math.round(colorA.b + (colorB.b - colorA.b) * clampedRatio);

  return `rgb(${r}, ${g}, ${b})`;
}

function parseHex(hex) {
  const trimmed = hex.replace("#", "");
  const normalized = trimmed.length === 3 ? trimmed.split("").map((ch) => ch + ch).join("") : trimmed;

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}
