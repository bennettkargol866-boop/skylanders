export const VIEWPORT = Object.freeze({
  width: 1280,
  height: 720,
});

export const TOTAL_AREAS = 100;

export const CHARACTER_DEFS = Object.freeze({
  dragon: {
    id: "dragon",
    name: "Spyro-Style Drake",
    title: "Purple Flame Dragon",
    cost: 0,
    form: "dragon",
    color: "#6d46c7",
    secondaryColor: "#cf7b2e",
    accent: "#f1c85d",
    detailColor: "#efb24d",
    eyeColor: "#8ff6a7",
    description: "A fast purple dragon hero with broad wing slashes and a fiery orb.",
    rewardText: "Dragon reward: +3 basic damage and +0.2 movement speed.",
    maxHealth: 96,
    speed: 8.6,
    jumpStrength: 11.6,
    basicAttack: {
      name: "Wing Slash",
      cooldown: 0.34,
      damage: 18,
      range: 3.5,
      radius: 2.9,
      arcDegrees: 75,
      color: "#9ceeff",
    },
    special: {
      name: "Flame Orb",
      type: "projectile",
      cooldown: 3.2,
      damage: 32,
      radius: 0.5,
      speed: 18,
      distance: 20,
      color: "#ff9554",
    },
  },
  reef: {
    id: "reef",
    name: "Lagoon Lancer",
    title: "Harpoon Scout",
    cost: 35,
    form: "shark",
    color: "#3c97aa",
    secondaryColor: "#c6e7f1",
    accent: "#5a6570",
    detailColor: "#f0cf6a",
    eyeColor: "#ffd45d",
    description: "A sturdy lagoon raider with a harpoon sweep and a pressurized water shot.",
    rewardText: "Reef reward: +10 max health and +3 special damage.",
    maxHealth: 112,
    speed: 7.8,
    jumpStrength: 10.9,
    basicAttack: {
      name: "Harpoon Sweep",
      cooldown: 0.4,
      damage: 20,
      range: 3.8,
      radius: 3.2,
      arcDegrees: 75,
      color: "#8fe8ff",
    },
    special: {
      name: "Tidal Shot",
      type: "projectile",
      cooldown: 3.6,
      damage: 36,
      radius: 0.6,
      speed: 16,
      distance: 18,
      color: "#73efff",
    },
  },
  titan: {
    id: "titan",
    name: "Magma Mauler",
    title: "Lava Bruiser",
    cost: 80,
    form: "brute",
    color: "#cf5031",
    secondaryColor: "#7b291d",
    accent: "#ffbf55",
    detailColor: "#ffd26a",
    eyeColor: "#fff3c0",
    description: "A heavy magma bruiser with oversized gauntlet hits and a fiery ground slam.",
    rewardText: "Titan reward: +14 max health and +4 slam damage.",
    maxHealth: 132,
    speed: 7.1,
    jumpStrength: 10.2,
    basicAttack: {
      name: "Gauntlet Crush",
      cooldown: 0.52,
      damage: 24,
      range: 3.2,
      radius: 3.3,
      arcDegrees: 75,
      color: "#ffe099",
    },
    special: {
      name: "Rune Slam",
      type: "slam",
      cooldown: 4.4,
      damage: 42,
      radius: 5.4,
      color: "#8ff6de",
    },
  },
});

export const CHARACTER_LIST = Object.values(CHARACTER_DEFS);

export const BASE_LAYOUT = Object.freeze({
  start: { x: -34, z: 0 },
  key: { x: 21, z: 18 },
  gate: { x: 18, z: 0 },
  exit: { x: 62, z: -1 },
  frontZones: [
    { minX: -46, maxX: -26, minZ: -13, maxZ: 13, surfaceType: "grass", depth: 6.1 },
    { minX: -27, maxX: -9, minZ: -4.8, maxZ: 4.8, surfaceType: "wood", depth: 3.6 },
    { minX: -12, maxX: 15, minZ: -16, maxZ: 16, surfaceType: "grass", depth: 6.4 },
    { minX: 8, maxX: 16, minZ: 8, maxZ: 18, surfaceType: "wood", depth: 3.5 },
    { minX: 14, maxX: 29, minZ: 11, maxZ: 25, surfaceType: "grass", depth: 5.4 },
  ],
  backZones: [
    { minX: 22, maxX: 43, minZ: -13, maxZ: 13, surfaceType: "grass", depth: 6 },
    { minX: 41, maxX: 51, minZ: -4.4, maxZ: 4.4, surfaceType: "wood", depth: 3.5 },
    { minX: 49, maxX: 72, minZ: -17, maxZ: 17, surfaceType: "grass", depth: 6.7 },
  ],
  gateZone: { minX: 11, maxX: 24, minZ: -5.2, maxZ: 5.2, surfaceType: "wood", depth: 3.8 },
});

const CRESCENT_LAYOUT = Object.freeze({
  start: { x: -35, z: 1 },
  key: { x: 24, z: 18 },
  gate: { x: 18, z: 1 },
  exit: { x: 64, z: 1 },
  frontZones: [
    { minX: -47, maxX: -29, minZ: -12, maxZ: 14, surfaceType: "grass", depth: 6.2 },
    { minX: -30, maxX: -8, minZ: -6, maxZ: 4.8, surfaceType: "wood", depth: 3.6 },
    { minX: -10, maxX: 17, minZ: -16, maxZ: 15, surfaceType: "grass", depth: 6.3 },
    { minX: 8, maxX: 18, minZ: 8, maxZ: 19, surfaceType: "wood", depth: 3.5 },
    { minX: 15, maxX: 32, minZ: 11, maxZ: 25, surfaceType: "grass", depth: 5.5 },
  ],
  backZones: [
    { minX: 23, maxX: 45, minZ: -14, maxZ: 14, surfaceType: "grass", depth: 6.1 },
    { minX: 43, maxX: 54, minZ: -3.8, maxZ: 4.8, surfaceType: "wood", depth: 3.5 },
    { minX: 51, maxX: 75, minZ: -16, maxZ: 17, surfaceType: "grass", depth: 6.7 },
  ],
  gateZone: { minX: 11, maxX: 24, minZ: -4.8, maxZ: 5.8, surfaceType: "wood", depth: 3.8 },
});

const LOCKSTEP_LAYOUT = Object.freeze({
  start: { x: -35, z: -2 },
  key: { x: 21, z: 20 },
  gate: { x: 18, z: 0 },
  exit: { x: 63, z: -2 },
  frontZones: [
    { minX: -46, maxX: -28, minZ: -14, maxZ: 12, surfaceType: "grass", depth: 6.1 },
    { minX: -29, maxX: -8, minZ: -6.4, maxZ: 3.8, surfaceType: "wood", depth: 3.6 },
    { minX: -11, maxX: 15, minZ: -18, maxZ: 14, surfaceType: "grass", depth: 6.5 },
    { minX: 8, maxX: 18, minZ: 10, maxZ: 21, surfaceType: "wood", depth: 3.5 },
    { minX: 14, maxX: 30, minZ: 12, maxZ: 27, surfaceType: "grass", depth: 5.5 },
  ],
  backZones: [
    { minX: 22, maxX: 43, minZ: -13, maxZ: 13, surfaceType: "grass", depth: 6.1 },
    { minX: 41, maxX: 53, minZ: -6, maxZ: 3.2, surfaceType: "wood", depth: 3.5 },
    { minX: 49, maxX: 73, minZ: -18, maxZ: 14, surfaceType: "grass", depth: 6.8 },
  ],
  gateZone: { minX: 11, maxX: 24, minZ: -5.6, maxZ: 5, surfaceType: "wood", depth: 3.8 },
});

export const LEVEL_THEMES = Object.freeze([
  {
    id: "cloudbreak",
    label: "Cloudbreak Causeway",
    sky: "#87beff",
    fog: "#dff7ff",
    grass: "#69d45c",
    grassDark: "#33843d",
    sand: "#ecd9ac",
    cliff: "#7e5b3f",
    cliffDark: "#4f311d",
    stone: "#cdb89e",
    stoneDark: "#7f6a50",
    wood: "#8a592e",
    woodDark: "#593212",
    water: "#7ceaff",
    portal: "#ffd67e",
    crystal: "#9ff8ff",
    gate: "#d8c597",
    enemy: "#7fce48",
    enemyDark: "#3e6f22",
    rewardText: "Causeway clear. The next floating gate shimmers alive.",
  },
  {
    id: "sunvault",
    label: "Sunvault Span",
    sky: "#7ac9ff",
    fog: "#e8ffff",
    grass: "#63c957",
    grassDark: "#2f7a32",
    sand: "#f0d7a0",
    cliff: "#8b6744",
    cliffDark: "#55331d",
    stone: "#d9c58e",
    stoneDark: "#85704e",
    wood: "#94663d",
    woodDark: "#5a3618",
    water: "#74e7ff",
    portal: "#ffe48a",
    crystal: "#98efff",
    gate: "#dec48b",
    enemy: "#8dd552",
    enemyDark: "#427327",
    rewardText: "Vault clear. The sun bridge to the next island powers up.",
  },
  {
    id: "emberkeep",
    label: "Emberkeep Lock",
    sky: "#7c62d4",
    fog: "#ffccad",
    grass: "#80c953",
    grassDark: "#3c6f2a",
    sand: "#e0c096",
    cliff: "#7e5738",
    cliffDark: "#4f2d18",
    stone: "#c28f72",
    stoneDark: "#784938",
    wood: "#8e522f",
    woodDark: "#572a14",
    water: "#7be1ff",
    portal: "#ffce79",
    crystal: "#ffc894",
    gate: "#d7a56c",
    enemy: "#98de57",
    enemyDark: "#487225",
    rewardText: "Keep clear. The final portal ring answers your champion.",
  },
  {
    id: "tidewild",
    label: "Tidewild Crossing",
    sky: "#78d8ff",
    fog: "#e6fffd",
    grass: "#61d468",
    grassDark: "#2f8547",
    sand: "#efe2ad",
    cliff: "#7a5e40",
    cliffDark: "#4c311d",
    stone: "#d2c2a4",
    stoneDark: "#75624c",
    wood: "#8d6033",
    woodDark: "#573517",
    water: "#65f0ff",
    portal: "#ffe08b",
    crystal: "#8bfef7",
    gate: "#e5c78f",
    enemy: "#6fd25b",
    enemyDark: "#2d722a",
    rewardText: "Tidewild clear. Another island chain rolls into view.",
  },
  {
    id: "moonreef",
    label: "Moonreef Run",
    sky: "#5d7ae0",
    fog: "#d9f0ff",
    grass: "#5dca7a",
    grassDark: "#2f6f4d",
    sand: "#d8d1ab",
    cliff: "#6e607a",
    cliffDark: "#423550",
    stone: "#c9c4da",
    stoneDark: "#6a617d",
    wood: "#8c6843",
    woodDark: "#563a22",
    water: "#78d9ff",
    portal: "#cfe8ff",
    crystal: "#98fff1",
    gate: "#dfd7c3",
    enemy: "#7adf83",
    enemyDark: "#345f37",
    rewardText: "Moonreef clear. The reef path brightens beneath the clouds.",
  },
  {
    id: "stormspire",
    label: "Stormspire Bastion",
    sky: "#6077c9",
    fog: "#f1d8c3",
    grass: "#7ecc58",
    grassDark: "#446e2e",
    sand: "#d9bc8a",
    cliff: "#7d5844",
    cliffDark: "#4f311d",
    stone: "#c8a07d",
    stoneDark: "#77543a",
    wood: "#8e522f",
    woodDark: "#552814",
    water: "#72dffb",
    portal: "#ffd384",
    crystal: "#ffd3a2",
    gate: "#e0b37c",
    enemy: "#a8e05e",
    enemyDark: "#4d7528",
    rewardText: "Stormspire clear. The final storm gate crackles open.",
  },
]);

const LAYOUT_TEMPLATES = Object.freeze([BASE_LAYOUT, CRESCENT_LAYOUT, LOCKSTEP_LAYOUT]);
const STAGE_PREFIXES = Object.freeze([
  "Shifting",
  "Bright",
  "Hidden",
  "Stormlit",
  "Ancient",
  "Echoing",
  "Wild",
  "Broken",
  "Crystal",
  "Sunken",
]);
const STAGE_SUFFIXES = Object.freeze([
  "Causeway",
  "Atoll",
  "Reef",
  "Span",
  "Lock",
  "Crossing",
  "Cove",
  "Reach",
  "Rise",
  "Run",
]);

function seededUnit(stage, salt) {
  const value = Math.sin(stage * 127.1 + salt * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function seededRange(stage, salt, min, max) {
  return min + seededUnit(stage, salt) * (max - min);
}

function roundTenth(value) {
  return Math.round(value * 10) / 10;
}

function rectWidth(rect) {
  return rect.maxX - rect.minX;
}

function rectDepth(rect) {
  return rect.maxZ - rect.minZ;
}

function rectCenterX(rect) {
  return (rect.minX + rect.maxX) / 2;
}

function rectCenterZ(rect) {
  return (rect.minZ + rect.maxZ) / 2;
}

function makeRect(centerX, width, centerZ, depth, surfaceType, undersideDepth) {
  const safeWidth = Math.max(6, roundTenth(width));
  const safeDepth = Math.max(6, roundTenth(depth));
  return {
    minX: roundTenth(centerX - safeWidth / 2),
    maxX: roundTenth(centerX + safeWidth / 2),
    minZ: roundTenth(centerZ - safeDepth / 2),
    maxZ: roundTenth(centerZ + safeDepth / 2),
    surfaceType,
    depth: roundTenth(undersideDepth),
  };
}

function pointInRect(rect, xRatio, zRatio) {
  return {
    x: roundTenth(rect.minX + rectWidth(rect) * xRatio),
    z: roundTenth(rect.minZ + rectDepth(rect) * zRatio),
  };
}

function buildLayoutForStage(areaIndex) {
  const stage = areaIndex + 1;
  const template = LAYOUT_TEMPLATES[areaIndex % LAYOUT_TEMPLATES.length];
  const [startBase, frontBridgeBase, mainBase, keyBridgeBase, keyBase] = template.frontZones;
  const [backBase, exitBridgeBase, exitBase] = template.backZones;
  const gateBase = template.gateZone;

  const startCenterZ = rectCenterZ(startBase) + seededRange(stage, 1, -1.8, 1.8);
  const mainCenterZ = rectCenterZ(mainBase) + seededRange(stage, 2, -2.4, 2.4);
  const keyBridgeCenterZ = rectCenterZ(keyBridgeBase) + seededRange(stage, 3, -1.5, 2.5);
  const keyCenterZ = rectCenterZ(keyBase) + seededRange(stage, 4, -2.1, 3.4);
  const backCenterZ = rectCenterZ(backBase) + seededRange(stage, 5, -2.6, 2.6);
  const exitCenterZ = rectCenterZ(exitBase) + seededRange(stage, 6, -2.8, 2.8);
  const gateCenterZ = rectCenterZ(gateBase) + seededRange(stage, 7, -1.2, 1.2);

  const startRect = makeRect(
    rectCenterX(startBase) + seededRange(stage, 8, -1.4, 1.4),
    rectWidth(startBase) + seededRange(stage, 9, -2.6, 4.2),
    startCenterZ,
    rectDepth(startBase) + seededRange(stage, 10, -3.6, 5.2),
    startBase.surfaceType,
    startBase.depth
  );

  const frontBridgeOverlap = roundTenth(seededRange(stage, 11, 1.4, 2.8));
  const frontBridgeRect = makeRect(
    startRect.maxX - frontBridgeOverlap + (rectWidth(frontBridgeBase) + seededRange(stage, 12, -1.4, 2.6)) / 2,
    rectWidth(frontBridgeBase) + seededRange(stage, 12, -1.4, 2.6),
    startCenterZ + (mainCenterZ - startCenterZ) * 0.45 + seededRange(stage, 13, -0.9, 0.9),
    rectDepth(frontBridgeBase) + seededRange(stage, 14, -1.2, 1.8),
    frontBridgeBase.surfaceType,
    frontBridgeBase.depth
  );

  const mainOverlap = roundTenth(seededRange(stage, 15, 1.8, 3.5));
  const mainRect = makeRect(
    frontBridgeRect.maxX - mainOverlap + (rectWidth(mainBase) + seededRange(stage, 16, -3.4, 5.8)) / 2,
    rectWidth(mainBase) + seededRange(stage, 16, -3.4, 5.8),
    mainCenterZ,
    rectDepth(mainBase) + seededRange(stage, 17, -4.2, 6.4),
    mainBase.surfaceType,
    mainBase.depth
  );

  const keyBridgeOverlap = roundTenth(seededRange(stage, 18, 6.2, 8.8));
  const keyBridgeRect = makeRect(
    mainRect.maxX - keyBridgeOverlap + (rectWidth(keyBridgeBase) + seededRange(stage, 19, -1.1, 2.1)) / 2,
    rectWidth(keyBridgeBase) + seededRange(stage, 19, -1.1, 2.1),
    keyBridgeCenterZ,
    rectDepth(keyBridgeBase) + seededRange(stage, 20, -0.8, 2.0),
    keyBridgeBase.surfaceType,
    keyBridgeBase.depth
  );

  const keyOverlap = roundTenth(seededRange(stage, 21, 1.2, 2.6));
  const keyRect = makeRect(
    keyBridgeRect.maxX - keyOverlap + (rectWidth(keyBase) + seededRange(stage, 22, -1.8, 4.6)) / 2,
    rectWidth(keyBase) + seededRange(stage, 22, -1.8, 4.6),
    keyCenterZ,
    rectDepth(keyBase) + seededRange(stage, 23, -2.2, 4.6),
    keyBase.surfaceType,
    keyBase.depth
  );

  const gateOverlap = roundTenth(seededRange(stage, 24, 2.4, 4.8));
  const gateRect = makeRect(
    mainRect.maxX - gateOverlap + (rectWidth(gateBase) + seededRange(stage, 25, -1.6, 2.8)) / 2,
    rectWidth(gateBase) + seededRange(stage, 25, -1.6, 2.8),
    gateCenterZ,
    rectDepth(gateBase) + seededRange(stage, 26, -1.2, 2.2),
    gateBase.surfaceType,
    gateBase.depth
  );

  const backOverlap = roundTenth(seededRange(stage, 27, 1.9, 3.3));
  const backRect = makeRect(
    gateRect.maxX - backOverlap + (rectWidth(backBase) + seededRange(stage, 28, -2.6, 5.2)) / 2,
    rectWidth(backBase) + seededRange(stage, 28, -2.6, 5.2),
    backCenterZ,
    rectDepth(backBase) + seededRange(stage, 29, -3.6, 5.4),
    backBase.surfaceType,
    backBase.depth
  );

  const exitBridgeOverlap = roundTenth(seededRange(stage, 30, 1.6, 2.8));
  const exitBridgeRect = makeRect(
    backRect.maxX - exitBridgeOverlap + (rectWidth(exitBridgeBase) + seededRange(stage, 31, -1.4, 2.6)) / 2,
    rectWidth(exitBridgeBase) + seededRange(stage, 31, -1.4, 2.6),
    backCenterZ + (exitCenterZ - backCenterZ) * 0.55 + seededRange(stage, 32, -0.9, 0.9),
    rectDepth(exitBridgeBase) + seededRange(stage, 33, -1.1, 2.0),
    exitBridgeBase.surfaceType,
    exitBridgeBase.depth
  );

  const exitOverlap = roundTenth(seededRange(stage, 34, 1.6, 2.8));
  const exitRect = makeRect(
    exitBridgeRect.maxX - exitOverlap + (rectWidth(exitBase) + seededRange(stage, 35, -2.8, 5.8)) / 2,
    rectWidth(exitBase) + seededRange(stage, 35, -2.8, 5.8),
    exitCenterZ,
    rectDepth(exitBase) + seededRange(stage, 36, -4.2, 6.2),
    exitBase.surfaceType,
    exitBase.depth
  );

  return {
    start: {
      x: roundTenth(startRect.minX + 4.4 + seededRange(stage, 37, -0.8, 0.8)),
      z: roundTenth(startCenterZ + seededRange(stage, 38, -0.8, 0.8)),
    },
    key: {
      x: roundTenth(rectCenterX(keyRect) + seededRange(stage, 39, -1.2, 1.2)),
      z: roundTenth(keyCenterZ + seededRange(stage, 40, -1.1, 1.1)),
    },
    gate: {
      x: roundTenth(rectCenterX(gateRect) + seededRange(stage, 41, -0.6, 0.6)),
      z: roundTenth(gateCenterZ + seededRange(stage, 42, -0.8, 0.8)),
    },
    exit: {
      x: roundTenth(exitRect.maxX - 6.4 + seededRange(stage, 43, -1.0, 0.8)),
      z: roundTenth(exitCenterZ + seededRange(stage, 44, -1.0, 1.0)),
    },
    frontZones: [startRect, frontBridgeRect, mainRect, keyBridgeRect, keyRect],
    backZones: [backRect, exitBridgeRect, exitRect],
    gateZone: gateRect,
  };
}

function createSpawnPools(layout) {
  const [startRect, , mainRect, , keyRect] = layout.frontZones;
  const [backRect, bridgeRect, exitRect] = layout.backZones;
  const gateRect = layout.gateZone;

  return {
    front: [
      pointInRect(startRect, 0.35, 0.3),
      pointInRect(startRect, 0.7, 0.68),
      pointInRect(mainRect, 0.28, 0.72),
      pointInRect(mainRect, 0.68, 0.28),
      pointInRect(mainRect, 0.55, 0.52),
      pointInRect(keyRect, 0.5, 0.45),
      pointInRect(keyRect, 0.34, 0.76),
    ],
    back: [
      pointInRect(backRect, 0.28, 0.34),
      pointInRect(backRect, 0.68, 0.68),
      pointInRect(gateRect, 0.78, 0.5),
      pointInRect(bridgeRect, 0.5, 0.5),
      pointInRect(exitRect, 0.24, 0.3),
      pointInRect(exitRect, 0.72, 0.68),
      pointInRect(exitRect, 0.52, 0.5),
    ],
  };
}

function createAreaLabel(stage, theme) {
  const prefix = STAGE_PREFIXES[stage % STAGE_PREFIXES.length];
  const suffix = STAGE_SUFFIXES[(stage * 3) % STAGE_SUFFIXES.length];
  return `${theme.label} ${stage}: ${prefix} ${suffix}`;
}

export function getAreaConfig(areaIndex) {
  const stage = areaIndex + 1;
  const theme = LEVEL_THEMES[areaIndex % LEVEL_THEMES.length];
  const layout = buildLayoutForStage(areaIndex);
  const spawnPools = createSpawnPools(layout);
  const frontCount = Math.min(spawnPools.front.length, 2 + Math.floor((stage - 1) / 8));
  const backCount = Math.min(spawnPools.back.length, 2 + Math.floor((stage + 3) / 8));

  return {
    label: createAreaLabel(stage, theme),
    theme,
    layout,
    enemyHealth: Math.round(46 + stage * 3.2 + Math.floor(stage / 5) * 1.5),
    enemyDamage: 10 + Math.floor(stage / 4),
    enemySpeed: 4.7 + Math.min(2.8, stage * 0.03),
    enemyAggroRange: 18 + Math.min(6, Math.floor(stage / 18)),
    enemyAttackRange: 2.4 + Math.min(0.7, stage * 0.005),
    frontEnemySpawns: spawnPools.front.slice(0, frontCount),
    backEnemySpawns: spawnPools.back.slice(0, backCount),
    rewardText: `Island ${stage} cleared. Press Enter for the next island.`,
  };
}
