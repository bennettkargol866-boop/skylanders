import * as THREE from "../three.module.js";
//import * as THREE from "../node_modules/three/build/three.module.js";
import {
  CHARACTER_DEFS,
  CHARACTER_LIST,
  TOTAL_AREAS,
  VIEWPORT,
  getAreaConfig,
} from "./config.js";
import {
  AttackPulse,
  Enemy,
  Player,
  Projectile,
  clamp,
  distanceBetween,
  isInsideAnyRect,
  normalizeVector,
} from "./entities.js";

const WORLD_Y = 1.1;
const SAVE_KEY = "skylanders_arena_save_v4";
const LEGACY_SAVE_KEY = "skylanders_arena_save_v3";
const SAVE_SLOT_IDS = Object.freeze(["slot-1", "slot-2", "slot-3"]);
const GOOFY_MUSIC_BPM = 132;
const GOOFY_MELODY = Object.freeze([
  { note: "C5", beats: 0.5 },
  { note: "E5", beats: 0.5 },
  { note: "G5", beats: 0.5 },
  { note: "A5", beats: 0.5 },
  { note: "G5", beats: 0.5 },
  { note: "E5", beats: 0.5 },
  { note: "D5", beats: 0.5 },
  { note: "G4", beats: 0.5 },
  { note: "C5", beats: 0.75 },
  { note: "rest", beats: 0.25 },
  { note: "E5", beats: 0.5 },
  { note: "F5", beats: 0.5 },
  { note: "G5", beats: 0.5 },
  { note: "rest", beats: 0.25 },
  { note: "C6", beats: 0.25 },
  { note: "B5", beats: 0.5 },
  { note: "G5", beats: 0.5 },
  { note: "E5", beats: 0.5 },
  { note: "C5", beats: 0.5 },
]);
const NOTE_FREQUENCIES = Object.freeze({
  C3: 130.81,
  F3: 174.61,
  G3: 196,
  C4: 261.63,
  E4: 329.63,
  G4: 392,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  A5: 880,
  B5: 987.77,
  C6: 1046.5,
});

function createDefaultProgress() {
  return {
    coins: 0,
    unlockedCharacters: ["dragon"],
    bestArea: 0,
    lastCharacterId: "dragon",
    lastLevelIndex: 0,
    hasStarted: false,
  };
}

function normalizeProgress(progress) {
  const fallback = createDefaultProgress();
  const unlockedCharacters = Array.isArray(progress?.unlockedCharacters)
    ? progress.unlockedCharacters.filter((value) => CHARACTER_DEFS[value])
    : fallback.unlockedCharacters;

  return {
    coins: Number.isFinite(progress?.coins) ? progress.coins : fallback.coins,
    unlockedCharacters: unlockedCharacters.length ? unlockedCharacters : fallback.unlockedCharacters,
    bestArea: Number.isFinite(progress?.bestArea) ? clamp(progress.bestArea, 0, TOTAL_AREAS) : fallback.bestArea,
    lastCharacterId: CHARACTER_DEFS[progress?.lastCharacterId] ? progress.lastCharacterId : fallback.lastCharacterId,
    lastLevelIndex: Number.isFinite(progress?.lastLevelIndex)
      ? clamp(progress.lastLevelIndex, 0, TOTAL_AREAS - 1)
      : fallback.lastLevelIndex,
    hasStarted: Boolean(progress?.hasStarted),
  };
}

function makeMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.88,
    metalness: 0.08,
    flatShading: true,
    ...options,
  });
}

function configureShadow(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function setGroupShadows(group, cast = true, receive = true) {
  group.traverse((child) => {
    if (child.isMesh) {
      configureShadow(child, cast, receive);
    }
  });
  return group;
}

function createBox(width, height, depth, material) {
  return configureShadow(new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material));
}

function createSphere(radius, material, widthSegments = 18, heightSegments = 14) {
  return configureShadow(
    new THREE.Mesh(new THREE.SphereGeometry(radius, widthSegments, heightSegments), material)
  );
}

function createCylinder(radiusTop, radiusBottom, height, material, radialSegments = 8) {
  return configureShadow(
    new THREE.Mesh(
      new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments),
      material
    )
  );
}

function createCone(radius, height, material, radialSegments = 8) {
  return configureShadow(new THREE.Mesh(new THREE.ConeGeometry(radius, height, radialSegments), material));
}

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ui = ui;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(VIEWPORT.width, VIEWPORT.height, false);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, VIEWPORT.width / VIEWPORT.height, 0.1, 220);
    this.camera.position.set(0, 24, 28);
    this.cameraTarget = new THREE.Vector3();

    this.sceneRoot = new THREE.Group();
    this.levelGroup = new THREE.Group();
    this.characterGroup = new THREE.Group();
    this.effectsGroup = new THREE.Group();
    this.scene.add(this.sceneRoot);
    this.sceneRoot.add(this.levelGroup);
    this.sceneRoot.add(this.characterGroup);
    this.sceneRoot.add(this.effectsGroup);

    this.hemiLight = new THREE.HemisphereLight(0xeef8ff, 0x4f3a22, 1.15);
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
    this.sunLight.position.set(18, 28, 12);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 120;
    this.sunLight.shadow.camera.left = -45;
    this.sunLight.shadow.camera.right = 45;
    this.sunLight.shadow.camera.top = 45;
    this.sunLight.shadow.camera.bottom = -45;
    this.scene.add(this.hemiLight, this.sunLight);

    this.input = {
      up: false,
      down: false,
      left: false,
      right: false,
    };
    this.mouse = {
      active: false,
      overCanvas: false,
      hasWorld: false,
      primaryDown: false,
      secondaryDown: false,
      ndcX: 0,
      ndcY: 0,
      worldX: 0,
      worldZ: 0,
    };
    this.raycaster = new THREE.Raycaster();
    this.aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WORLD_Y);
    this.pointerNdc = new THREE.Vector2();
    this.pointerWorld = new THREE.Vector3();

    this.state = "menu";
    this.time = 0;
    this.lastFrame = 0;
    this.saveState = this.loadSaveState();
    this.activeSlotId = this.saveState.activeSlotId;
    this.progress = this.getProgressForSlot(this.activeSlotId);
    this.areaIndex = 0;
    this.runStartAreaIndex = 0;
    this.selectedLevelIndex = this.progress.lastLevelIndex ?? 0;
    this.currentLevel = null;
    this.selectedCharacter = null;
    this.player = null;
    this.enemies = [];
    this.pulses = [];
    this.projectiles = [];
    this.coinPickups = [];
    this.enemyMeshes = new Map();
    this.enemyTelegraphs = new Map();
    this.pendingButtonAction = null;
    this.audioContext = null;
    this.musicGain = null;
    this.musicTimer = null;
    this.musicStarted = false;
    this.musicStep = 0;
    this.musicNextTime = 0;

    this.playerVisual = null;
    this.attackPreview = null;
    this.aimReticle = null;
    this.levelVisuals = null;
    this.hasKey = false;
    this.gateOpen = false;
    this.exitActive = false;
    this.backWaveSpawned = false;
    this.currentStatusText = "Choose Start Game, Continue Game, or a save slot.";
    this.keyStatusText = "Missing";

    this.handleFrame = this.handleFrame.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.bindKeyboard();
    this.bindPointer();
  }

  init() {
    this.showMenu();
    this.bindInterface();
    this.handleResize();
    window.addEventListener("resize", this.handleResize);
    window.requestAnimationFrame(this.handleFrame);
  }

  bindInterface() {
    const toggle = () => this.toggleFullscreen();
    this.ui.overlayFullscreen?.addEventListener("click", toggle);
    this.ui.frameFullscreen?.addEventListener("click", toggle);
    document.addEventListener("fullscreenchange", () => {
      this.updateFullscreenUi();
      window.requestAnimationFrame(this.handleResize);
    });
    window.addEventListener("pointerdown", () => this.startBackgroundMusic(), { once: true });
    window.addEventListener("keydown", () => this.startBackgroundMusic(), { once: true });
    this.updateFullscreenUi();
  }

  startBackgroundMusic() {
    if (this.musicStarted || typeof window === "undefined") {
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    this.audioContext = new AudioContextClass();
    this.musicGain = this.audioContext.createGain();
    this.musicGain.gain.value = 0.045;
    this.musicGain.connect(this.audioContext.destination);
    this.musicStarted = true;
    this.musicNextTime = this.audioContext.currentTime + 0.04;
    this.musicTimer = window.setInterval(() => this.scheduleBackgroundMusic(), 120);
    this.scheduleBackgroundMusic();
  }

  scheduleBackgroundMusic() {
    if (!this.audioContext || !this.musicGain) {
      return;
    }

    const beat = 60 / GOOFY_MUSIC_BPM;
    while (this.musicNextTime < this.audioContext.currentTime + 0.9) {
      const melody = GOOFY_MELODY[this.musicStep % GOOFY_MELODY.length];
      const barStep = this.musicStep % 8;
      const bassNote = barStep < 4 ? "C3" : barStep < 6 ? "F3" : "G3";

      this.playSynthNote(bassNote, this.musicNextTime, beat * 0.42, "triangle", 0.55);
      if (barStep % 2 === 1) {
        this.playSynthNote(barStep < 4 ? "E4" : "C4", this.musicNextTime, beat * 0.22, "square", 0.22);
      }

      if (melody.note !== "rest") {
        this.playSynthNote(melody.note, this.musicNextTime, beat * melody.beats * 0.72, "square", 0.5);
      }

      this.musicNextTime += beat * melody.beats;
      this.musicStep += 1;
    }
  }

  playSynthNote(note, startTime, duration, type, volume) {
    const frequency = NOTE_FREQUENCIES[note];
    if (!frequency || !this.audioContext || !this.musicGain) {
      return;
    }

    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.012, startTime + Math.min(duration, 0.12));
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(gain);
    gain.connect(this.musicGain);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.03);
  }

  loadSaveState() {
    const fallback = {
      activeSlotId: SAVE_SLOT_IDS[0],
      slots: Object.fromEntries(SAVE_SLOT_IDS.map((slotId) => [slotId, createDefaultProgress()])),
    };

    if (typeof window === "undefined" || !window.localStorage) {
      return fallback;
    }

    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const slots = {};
        for (const slotId of SAVE_SLOT_IDS) {
          slots[slotId] = normalizeProgress(parsed?.slots?.[slotId]);
        }

        return {
          activeSlotId: SAVE_SLOT_IDS.includes(parsed?.activeSlotId) ? parsed.activeSlotId : SAVE_SLOT_IDS[0],
          slots,
        };
      }

      const legacyRaw = window.localStorage.getItem(LEGACY_SAVE_KEY);
      if (legacyRaw) {
        const legacyProgress = normalizeProgress(JSON.parse(legacyRaw));
        return {
          activeSlotId: SAVE_SLOT_IDS[0],
          slots: {
            [SAVE_SLOT_IDS[0]]: legacyProgress,
            [SAVE_SLOT_IDS[1]]: createDefaultProgress(),
            [SAVE_SLOT_IDS[2]]: createDefaultProgress(),
          },
        };
      }
    } catch {
      return fallback;
    }

    return fallback;
  }

  getProgressForSlot(slotId) {
    if (!this.saveState.slots[slotId]) {
      this.saveState.slots[slotId] = createDefaultProgress();
    }
    return this.saveState.slots[slotId];
  }

  saveProgress() {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }

    this.saveState.activeSlotId = this.activeSlotId;
    this.saveState.slots[this.activeSlotId] = normalizeProgress(this.progress);
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(this.saveState));
  }

  setActiveSaveSlot(slotId) {
    if (!SAVE_SLOT_IDS.includes(slotId)) {
      return;
    }

    this.activeSlotId = slotId;
    this.progress = this.getProgressForSlot(slotId);
    this.selectedLevelIndex = this.progress.lastLevelIndex ?? 0;
    this.currentStatusText = `Active save file: ${slotId.replace("slot-", "File ")}.`;
    this.saveProgress();
  }

  canContinueGame() {
    return this.progress.hasStarted;
  }

  getUnlockedLevelCount() {
    return clamp(this.progress.bestArea + 1, 1, TOTAL_AREAS);
  }

  isCharacterUnlocked(characterId) {
    return this.progress.unlockedCharacters.includes(characterId);
  }

  unlockCharacter(characterId) {
    if (this.isCharacterUnlocked(characterId)) {
      return true;
    }

    const character = CHARACTER_DEFS[characterId];
    if (!character || this.progress.coins < character.cost) {
      this.currentStatusText = `${character?.name ?? "That hero"} costs ${character?.cost ?? 0} coins.`;
      return false;
    }

    this.progress.coins -= character.cost;
    this.progress.unlockedCharacters = [...this.progress.unlockedCharacters, characterId];
    this.progress.lastCharacterId = characterId;
    this.currentStatusText = `${character.name} unlocked. Progress auto-saved.`;
    this.saveProgress();
    return true;
  }

  bindKeyboard() {
    const keyMap = {
      ArrowUp: "up",
      KeyW: "up",
      ArrowDown: "down",
      KeyS: "down",
      ArrowLeft: "left",
      KeyA: "left",
      ArrowRight: "right",
      KeyD: "right",
    };

    window.addEventListener("keydown", (event) => {
      const mapped = keyMap[event.code];
      if (mapped) {
        event.preventDefault();
        this.input[mapped] = true;
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat) {
          this.tryJump();
        }
        return;
      }

      if (event.code === "KeyE") {
        event.preventDefault();
        if (!event.repeat) {
          this.trySpecialAttack();
        }
        return;
      }

      if (event.code === "Enter" && this.pendingButtonAction) {
        event.preventDefault();
        this.pendingButtonAction();
        return;
      }

      if (event.code === "KeyR" && this.state === "defeat" && this.selectedCharacter) {
        event.preventDefault();
        this.startRun(this.selectedCharacter.id);
      }
    });

    window.addEventListener("keyup", (event) => {
      const mapped = keyMap[event.code];
      if (mapped) {
        event.preventDefault();
        this.input[mapped] = false;
      }
    });

    window.addEventListener("blur", () => {
      this.input.up = false;
      this.input.down = false;
      this.input.left = false;
      this.input.right = false;
      this.mouse.primaryDown = false;
      this.mouse.secondaryDown = false;
    });
  }

  bindPointer() {
    const updatePointerFromEvent = (event) => {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }

      this.mouse.active = true;
      this.mouse.overCanvas = true;
      this.mouse.ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    this.canvas.addEventListener("pointermove", (event) => {
      updatePointerFromEvent(event);
    });

    this.canvas.addEventListener("pointerdown", (event) => {
      if (this.state !== "playing") {
        return;
      }

      updatePointerFromEvent(event);
      event.preventDefault();

      if (event.button === 0) {
        this.mouse.primaryDown = true;
        this.tryBasicAttack();
      } else if (event.button === 2) {
        this.mouse.secondaryDown = true;
        this.trySpecialAttack();
      }
    });

    this.canvas.addEventListener("pointerleave", () => {
      this.mouse.overCanvas = false;
      this.mouse.hasWorld = false;
    });

    this.canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });

    window.addEventListener("pointerup", (event) => {
      if (event.button === 0) {
        this.mouse.primaryDown = false;
      } else if (event.button === 2) {
        this.mouse.secondaryDown = false;
      }
    });
  }

  refreshMouseAimWorld() {
    if (!this.mouse.active || (!this.mouse.overCanvas && !this.mouse.primaryDown && !this.mouse.secondaryDown)) {
      this.mouse.hasWorld = false;
      return;
    }

    this.pointerNdc.set(this.mouse.ndcX, this.mouse.ndcY);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    if (this.raycaster.ray.intersectPlane(this.aimPlane, this.pointerWorld)) {
      this.mouse.worldX = this.pointerWorld.x;
      this.mouse.worldZ = this.pointerWorld.z;
      this.mouse.hasWorld = true;
      return;
    }

    this.mouse.hasWorld = false;
  }

  getAimDirection() {
    if (!this.player || !this.mouse.hasWorld) {
      return null;
    }

    const aimDirection = normalizeVector(this.mouse.worldX - this.player.x, this.mouse.worldZ - this.player.z);
    return aimDirection.x || aimDirection.z ? aimDirection : null;
  }

  getMovementBasis() {
    const forward = normalizeVector(
      this.cameraTarget.x - this.camera.position.x,
      this.cameraTarget.z - this.camera.position.z
    );
    const safeForward = forward.x || forward.z ? forward : { x: 0, z: -1 };

    return {
      forward: safeForward,
      right: {
        x: -safeForward.z,
        z: safeForward.x,
      },
    };
  }

  handleResize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || VIEWPORT.width));
    const height = Math.max(1, Math.round(rect.height || VIEWPORT.height));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  async toggleFullscreen() {
    if (typeof document === "undefined") {
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await this.ui.canvasFrame?.requestFullscreen?.();
      }
    } catch {
      this.currentStatusText = "Fullscreen mode is not available here.";
    }
    this.updateFullscreenUi();
  }

  updateFullscreenUi() {
    const fullscreenText =
      typeof document !== "undefined" && document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen";

    if (this.ui.overlayFullscreen) {
      this.ui.overlayFullscreen.textContent = fullscreenText;
    }

    if (this.ui.frameFullscreen) {
      this.ui.frameFullscreen.textContent = fullscreenText;
    }
  }

  startRun(characterId, levelIndex = this.selectedLevelIndex ?? this.progress.lastLevelIndex ?? 0) {
    if (!this.isCharacterUnlocked(characterId)) {
      return;
    }

    this.selectedCharacter = CHARACTER_DEFS[characterId];
    this.progress.lastCharacterId = characterId;
    this.selectedLevelIndex = clamp(levelIndex, 0, TOTAL_AREAS - 1);
    this.progress.lastLevelIndex = this.selectedLevelIndex;
    this.progress.hasStarted = true;
    this.runStartAreaIndex = this.selectedLevelIndex;
    this.saveProgress();
    this.player = new Player(this.selectedCharacter);
    this.areaIndex = this.selectedLevelIndex;
    this.time = 0;
    this.startArea();
  }

  startArea() {
    this.currentLevel = getAreaConfig(this.areaIndex);
    this.progress.lastLevelIndex = this.areaIndex;
    this.progress.hasStarted = true;
    this.saveProgress();
    this.resetAreaState();
    this.buildLevelScene();
    this.spawnPlayerVisual();
    this.spawnFrontWave();

    const { start } = this.currentLevel.layout;
    this.player.place(start.x, start.z);
    if (this.areaIndex === this.runStartAreaIndex) {
      this.player.restoreFull();
    } else {
      this.player.heal(22);
    }

    this.state = "playing";
    this.hideOverlay();
    this.updateObjectiveStatus();
    this.updateUi();
  }

  resetAreaState() {
    this.hasKey = false;
    this.gateOpen = false;
    this.exitActive = false;
    this.backWaveSpawned = false;
    this.keyStatusText = "Missing";
    this.enemies = [];
    this.pulses = [];
    this.projectiles = [];
    this.coinPickups = [];
    this.enemyMeshes.clear();
    this.enemyTelegraphs.clear();
    this.clearGroup(this.levelGroup);
    this.clearGroup(this.characterGroup);
    this.clearGroup(this.effectsGroup);
    this.playerVisual = null;
    this.attackPreview = null;
    this.aimReticle = null;
    this.levelVisuals = null;
  }

  clearGroup(group) {
    while (group.children.length) {
      group.remove(group.children[0]);
    }
  }

  spawnFrontWave() {
    for (const spawn of this.currentLevel.frontEnemySpawns) {
      this.spawnEnemy(spawn, "front");
    }
  }

  spawnBackWave() {
    if (this.backWaveSpawned) {
      return;
    }

    for (const spawn of this.currentLevel.backEnemySpawns) {
      this.spawnEnemy(spawn, "back");
    }

    if (this.areaIndex === 2 || this.areaIndex === 4) {
      this.spawnBoss();
    }

    this.backWaveSpawned = true;
  }

  spawnEnemy(spawn, side) {
    const radius = spawn.boss ? 2.15 : 1;
    const spawnPoint = this.findEnemySpawnPosition(spawn, side, radius);
    const enemy = new Enemy({
      x: spawnPoint.x,
      z: spawnPoint.z,
      health: spawn.health ?? this.currentLevel.enemyHealth,
      speed: spawn.speed ?? this.currentLevel.enemySpeed,
      damage: spawn.damage ?? this.currentLevel.enemyDamage,
      attackRange: spawn.attackRange ?? this.currentLevel.enemyAttackRange,
      aggroRange: spawn.aggroRange ?? this.currentLevel.enemyAggroRange,
      radius,
      boss: Boolean(spawn.boss),
      attackCooldown: spawn.attackCooldown ?? 1,
      windupDuration: spawn.windupDuration ?? 0.2,
      slamRadius: spawn.slamRadius ?? 0,
      side,
    });

    this.enemies.push(enemy);
    const mesh = this.buildEnemyModel(enemy);
    this.enemyMeshes.set(enemy.id, mesh);
    this.characterGroup.add(mesh);
    if (enemy.boss) {
      const telegraph = this.createBossTelegraph(enemy);
      telegraph.visible = false;
      this.enemyTelegraphs.set(enemy.id, telegraph);
      this.effectsGroup.add(telegraph);
    }
  }

  spawnBoss() {
    const bossSpawn = {
      x: this.currentLevel.layout.exit.x,
      z: this.currentLevel.layout.exit.z + 8,
      boss: true,
      health: this.currentLevel.enemyHealth * (this.areaIndex === 4 ? 6 : 4.6),
      speed: this.currentLevel.enemySpeed * 0.62,
      damage: this.currentLevel.enemyDamage * (this.areaIndex === 4 ? 2.2 : 1.8),
      attackRange: this.areaIndex === 4 ? 5.4 : 4.8,
      aggroRange: 34,
      attackCooldown: this.areaIndex === 4 ? 2.2 : 2.5,
      windupDuration: this.areaIndex === 4 ? 1.05 : 1.15,
      slamRadius: this.areaIndex === 4 ? 4.8 : 4.25,
    };
    this.spawnEnemy(bossSpawn, "back");
  }

  showMenu() {
    this.showMainMenu();
  }

  showMainMenu() {
    this.state = "menu";
    this.keyStatusText = "Missing";
    this.player = null;
    this.selectedCharacter = null;
    this.enemies = [];
    this.pulses = [];
    this.projectiles = [];
    this.coinPickups = [];
    this.enemyMeshes.clear();
    this.enemyTelegraphs.clear();
    this.clearGroup(this.characterGroup);
    this.clearGroup(this.effectsGroup);
    if (!this.currentStatusText || this.currentStatusText === "Choose Start Game, Continue Game, or a save slot.") {
      this.currentStatusText = "Choose Start Game, Continue Game, or a save slot.";
    }

    this.showOverlayFrame({
      kicker: "Sky Gate",
      title: "Main Menu",
      text: "Start a new run by picking a level, continue from your save, or swap to another save file.",
      meta: [
        { label: "Active Save", value: this.activeSlotId.replace("slot-", "File ") },
        { label: "Coins", value: String(this.progress.coins) },
        { label: "Unlocked Heroes", value: String(this.progress.unlockedCharacters.length) },
        { label: "Unlocked Levels", value: `${this.getUnlockedLevelCount()} / ${TOTAL_AREAS}` },
      ],
    });

    populateActionButtons(this.ui.menuGrid, [
      {
        label: "Start Game",
        meta: "New Run",
        description: "Choose a level, then pick one of the ten heroes.",
        onClick: () => this.showLevelSelect(),
      },
      {
        label: "Continue Game",
        meta: this.canContinueGame() ? "Resume Run" : "No Saved Run",
        description: this.canContinueGame()
          ? `Resume from ${getAreaConfig(this.progress.lastLevelIndex).label}.`
          : "Start a run first to enable continue.",
        disabled: !this.canContinueGame(),
        onClick: () => this.continueGame(),
      },
      {
        label: "Select Save File",
        meta: "3 Slots",
        description: "Switch between three local save files.",
        onClick: () => this.showSaveSlotMenu(),
      },
    ]);
    this.ui.menuGrid.classList.remove("hidden");
    this.updateUi();
  }

  showSaveSlotMenu() {
    this.state = "menu";
    this.showOverlayFrame({
      kicker: "Save Files",
      title: "Select Save File",
      text: "Each save file keeps its own coins, unlocked heroes, and unlocked levels.",
      backLabel: "Back",
      backAction: () => this.showMainMenu(),
    });

    populateSaveSlotButtons(this.ui.saveGrid, SAVE_SLOT_IDS.map((slotId) => {
      const progress = this.getProgressForSlot(slotId);
      return {
        slotId,
        active: slotId === this.activeSlotId,
        title: slotId.replace("slot-", "File "),
        meta: progress.hasStarted ? "Used" : "Empty",
        description: `Coins ${progress.coins} • Heroes ${progress.unlockedCharacters.length} • Levels ${clamp(
          progress.bestArea + 1,
          1,
          TOTAL_AREAS
        )}/${TOTAL_AREAS}`,
        onClick: () => {
          this.setActiveSaveSlot(slotId);
          this.showMainMenu();
        },
      };
    }));
    this.ui.saveGrid.classList.remove("hidden");
  }

  showLevelSelect() {
    this.state = "menu";
    const unlockedLevelCount = this.getUnlockedLevelCount();

    this.showOverlayFrame({
      kicker: "Realm Select",
      title: "Choose a Level",
      text: "Pick an unlocked realm first, then choose which hero you want to bring into it.",
      meta: [
        { label: "Save File", value: this.activeSlotId.replace("slot-", "File ") },
        { label: "Unlocked Levels", value: `${unlockedLevelCount} / ${TOTAL_AREAS}` },
      ],
      backLabel: "Back",
      backAction: () => this.showMainMenu(),
    });

    const levels = [];
    for (let index = 0; index < TOTAL_AREAS; index += 1) {
      const level = getAreaConfig(index);
      const unlocked = index < unlockedLevelCount;
      levels.push({
        label: level.label,
        meta: unlocked ? `Level ${index + 1}` : "Locked",
        description: level.description,
        selected: index === this.selectedLevelIndex,
        locked: !unlocked,
        onClick: () => {
          if (!unlocked) {
            return;
          }
          this.selectedLevelIndex = index;
          this.showCharacterSelect(index);
        },
      });
    }

    populateLevelButtons(this.ui.levelGrid, levels);
    this.ui.levelGrid.classList.remove("hidden");
  }

  showCharacterSelect(levelIndex = this.selectedLevelIndex ?? 0) {
    this.state = "menu";
    this.selectedLevelIndex = clamp(levelIndex, 0, TOTAL_AREAS - 1);
    const level = getAreaConfig(this.selectedLevelIndex);

    this.showOverlayFrame({
      kicker: "Hero Select",
      title: `Choose a Hero for ${level.label}`,
      text: `Pick from ten heroes. Every hero has its own basic and special attack. Coins available: ${this.progress.coins}.`,
      meta: [
        { label: "Selected Level", value: level.label },
        { label: "Last Hero", value: CHARACTER_DEFS[this.progress.lastCharacterId]?.name ?? "None" },
      ],
      backLabel: "Levels",
      backAction: () => this.showLevelSelect(),
    });

    populateCharacterButtons(this.ui.characterGrid, {
      progress: this.progress,
      onPlay: (characterId) => this.startRun(characterId, this.selectedLevelIndex),
      onUnlock: (characterId) => {
        this.unlockCharacter(characterId);
        this.showCharacterSelect(this.selectedLevelIndex);
      },
    });
    this.ui.characterGrid.classList.remove("hidden");
  }

  continueGame() {
    if (!this.canContinueGame()) {
      this.currentStatusText = "No saved run yet. Choose Start Game first.";
      this.showMainMenu();
      return;
    }

    this.startRun(this.progress.lastCharacterId, this.progress.lastLevelIndex);
  }

  showClearScreen() {
    const heroReward = this.applyAreaReward();
    const areaReward = this.currentLevel.rewardText ?? `${this.currentLevel.label} cleared.`;
    const summary = `${areaReward} ${heroReward}`;
    this.progress.bestArea = Math.max(this.progress.bestArea, this.areaIndex + 1);
    this.saveProgress();
    const isFinalArea = this.areaIndex >= TOTAL_AREAS - 1;

    if (isFinalArea) {
      this.state = "victory";
      this.currentStatusText = summary;
      this.showOverlayFrame({
        kicker: "Victory",
        title: "Portal Complete",
        text: `${summary} You cleared all ${TOTAL_AREAS} realms. Press the button or Enter to run it again.`,
        actionLabel: "Play Again",
        action: () => this.startRun(this.selectedCharacter.id, this.runStartAreaIndex),
        backLabel: "Main Menu",
        backAction: () => this.showMainMenu(),
      });
      return;
    }

    this.state = "clear";
    this.currentStatusText = summary;
    this.showOverlayFrame({
      kicker: "Gate Cleared",
      title: "Next Island Unlocked",
      text: `${summary} Press the button or Enter to fly to the next area.`,
      actionLabel: "Next Area",
      action: () => {
        this.areaIndex += 1;
        this.startArea();
      },
      backLabel: "Main Menu",
      backAction: () => this.showMainMenu(),
    });
  }

  applyAreaReward() {
    const reward = this.selectedCharacter.areaReward ?? {};

    if (reward.basicDamage) {
      this.player.basicAttack.damage += reward.basicDamage;
    }

    if (reward.specialDamage) {
      this.player.special.damage += reward.specialDamage;
    }

    if (reward.maxHealth) {
      this.player.maxHealth += reward.maxHealth;
    }

    if (reward.speed) {
      this.player.speed += reward.speed;
    }

    if (reward.heal) {
      this.player.heal(reward.heal);
    }

    return this.selectedCharacter.rewardText ?? "Your hero grows stronger.";
  }

  showDefeatScreen() {
    this.state = "defeat";
    this.currentStatusText = "The island repelled your hero.";
    this.showOverlayFrame({
      kicker: "Defeat",
      title: "The Gate Stays Shut",
      text: "Press R or use the button below to restart the current run with the same hero.",
      actionLabel: "Restart Run",
      action: () => this.startRun(this.selectedCharacter.id, this.runStartAreaIndex),
      backLabel: "Main Menu",
      backAction: () => this.showMainMenu(),
    });
  }

  resetOverlayPanels() {
    for (const panel of [this.ui.menuGrid, this.ui.saveGrid, this.ui.levelGrid, this.ui.characterGrid]) {
      panel.innerHTML = "";
      panel.classList.add("hidden");
    }
    this.ui.overlayMeta.innerHTML = "";
    this.ui.overlayMeta.classList.add("hidden");
  }

  populateOverlayMeta(meta) {
    if (!meta?.length) {
      this.ui.overlayMeta.classList.add("hidden");
      this.ui.overlayMeta.innerHTML = "";
      return;
    }

    this.ui.overlayMeta.innerHTML = meta
      .map(
        (item) => `
          <div class="overlay-meta-item">
            <span>${item.label}</span>
            <strong>${item.value}</strong>
          </div>
        `
      )
      .join("");
    this.ui.overlayMeta.classList.remove("hidden");
  }

  showOverlayFrame({ kicker, title, text, actionLabel, action, backLabel, backAction, meta = [] }) {
    this.ui.overlay.classList.add("is-visible");
    this.ui.overlayKicker.textContent = kicker;
    this.ui.overlayTitle.textContent = title;
    this.ui.overlayText.textContent = text;
    this.resetOverlayPanels();
    this.populateOverlayMeta(meta);
    this.updateFullscreenUi();

    if (actionLabel && action) {
      this.pendingButtonAction = action;
      this.ui.overlayAction.textContent = actionLabel;
      this.ui.overlayAction.classList.remove("hidden");
      this.ui.overlayAction.onclick = action;
    } else {
      this.pendingButtonAction = null;
      this.ui.overlayAction.classList.add("hidden");
      this.ui.overlayAction.onclick = null;
    }

    if (backLabel && backAction) {
      this.ui.overlayBack.textContent = backLabel;
      this.ui.overlayBack.classList.remove("hidden");
      this.ui.overlayBack.onclick = backAction;
    } else {
      this.ui.overlayBack.classList.add("hidden");
      this.ui.overlayBack.onclick = null;
    }

    this.updateUi();
  }

  hideOverlay() {
    this.pendingButtonAction = null;
    this.ui.overlay.classList.remove("is-visible");
    this.resetOverlayPanels();
    this.ui.overlayBack.classList.add("hidden");
    this.ui.overlayBack.onclick = null;
    this.ui.overlayAction.classList.add("hidden");
    this.ui.overlayAction.onclick = null;
  }

  tryBasicAttack() {
    if (this.state !== "playing" || !this.player) {
      return;
    }

    this.refreshMouseAimWorld();
    const aimDirection = this.getAimDirection();
    if (aimDirection) {
      this.player.facing = aimDirection;
    }

    this.player.tryBasicAttack(this, this.time);
  }

  tryJump() {
    if (this.state !== "playing" || !this.player) {
      return;
    }

    this.player.tryJump(this.time);
  }

  trySpecialAttack() {
    if (this.state !== "playing" || !this.player) {
      return;
    }

    this.refreshMouseAimWorld();
    const aimDirection = this.getAimDirection();
    if (aimDirection) {
      this.player.facing = aimDirection;
    }

    this.player.trySpecial(this, this.time);
  }

  handleFrame(timestamp) {
    if (!this.lastFrame) {
      this.lastFrame = timestamp;
    }

    const dt = Math.min((timestamp - this.lastFrame) / 1000, 0.033);
    this.lastFrame = timestamp;
    this.time += dt;

    this.update(dt);
    this.render(dt);
    this.updateUi();

    window.requestAnimationFrame(this.handleFrame);
  }

  update(dt) {
    if (this.state !== "playing" || !this.player) {
      return;
    }

    this.refreshMouseAimWorld();
    this.player.update(dt, this.input, this, this.getAimDirection());

    if (this.mouse.primaryDown) {
      this.tryBasicAttack();
    }

    this.updateCoinPickups(dt);

    if (!this.hasKey && distanceBetween(this.player, this.currentLevel.layout.key) < 2.4) {
      this.collectKey();
    }

    if (this.hasKey && !this.gateOpen && distanceBetween(this.player, this.currentLevel.layout.gate) < 4.4) {
      this.openGate();
    }

    for (const enemy of this.enemies) {
      enemy.update(dt, this.player, this, this.time);
    }

    this.resolveEnemySeparation();

    for (const pulse of this.pulses) {
      pulse.update(dt);
      this.handlePulseHits(pulse);
      this.updatePulseVisual(pulse);
    }

    for (const projectile of this.projectiles) {
      projectile.update(dt);
      this.handleProjectileHits(projectile);
      this.updateProjectileVisual(projectile);
    }

    this.pulses = this.pulses.filter((pulse) => {
      if (!pulse.alive && pulse.mesh) {
        this.effectsGroup.remove(pulse.mesh);
      }
      return pulse.alive;
    });

    this.projectiles = this.projectiles.filter((projectile) => {
      if (!projectile.alive && projectile.mesh) {
        this.effectsGroup.remove(projectile.mesh);
      }
      return projectile.alive;
    });

    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.alive) {
        return true;
      }

      this.spawnCoinBurst(enemy.x, enemy.z, 3 + this.areaIndex);

      const mesh = this.enemyMeshes.get(enemy.id);
      if (mesh) {
        this.characterGroup.remove(mesh);
      }
      const telegraph = this.enemyTelegraphs.get(enemy.id);
      if (telegraph) {
        this.effectsGroup.remove(telegraph);
      }
      this.enemyMeshes.delete(enemy.id);
      this.enemyTelegraphs.delete(enemy.id);
      return false;
    });

    if (!this.player.alive) {
      this.showDefeatScreen();
      return;
    }

    if (this.gateOpen && !this.enemies.length && !this.exitActive) {
      this.activateExit();
    }

    if (this.exitActive && distanceBetween(this.player, this.currentLevel.layout.exit) < 3.1) {
      this.showClearScreen();
      return;
    }

    this.updateObjectiveStatus();
  }

  render(dt) {
    this.updateCamera(dt);
    this.refreshMouseAimWorld();
    this.updateAimReticle();
    this.updatePlayerVisual(dt);
    this.updateEnemyVisuals(dt);
    this.updateBossTelegraphs();
    this.updateLevelVisuals(dt);
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(dt) {
    if (!this.player) {
      this.camera.lookAt(0, 2, 0);
      return;
    }

    const targetPosition = new THREE.Vector3(this.player.x, 23 + this.player.y * 0.18, this.player.z + 24);
    this.camera.position.lerp(targetPosition, 1 - Math.exp(-dt * 4));
    this.cameraTarget.set(this.player.x, WORLD_Y + 1.8 + this.player.y * 0.22, this.player.z - 4);
    this.camera.lookAt(this.cameraTarget);
  }

  collectKey() {
    this.hasKey = true;
    this.keyStatusText = "Found";
    if (this.levelVisuals?.keyGroup) {
      this.levelVisuals.keyGroup.visible = false;
    }
  }

  openGate() {
    this.gateOpen = true;
    this.keyStatusText = "Unlocked";
    this.spawnBackWave();
  }

  activateExit() {
    this.exitActive = true;
  }

  updateObjectiveStatus() {
    if (this.state !== "playing") {
      return;
    }

    if (!this.hasKey) {
      this.currentStatusText = `${this.currentLevel.label}: ${this.currentLevel.keyHint}`;
      return;
    }

    if (!this.gateOpen) {
      this.currentStatusText = `${this.currentLevel.label}: ${this.currentLevel.gateHint}`;
      return;
    }

    if (!this.exitActive) {
      this.currentStatusText = `${this.currentLevel.label}: ${this.enemies.length} enemies remain in the back half.`;
      return;
    }

    this.currentStatusText = `${this.currentLevel.label}: ${this.currentLevel.clearHint}`;
  }

  spawnCoinBurst(x, z, count) {
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count;
      const coin = {
        id: `coin-${x}-${z}-${index}-${this.time}`,
        x: x + Math.cos(angle) * 0.8,
        z: z + Math.sin(angle) * 0.8,
        value: 5,
        phase: Math.random() * Math.PI * 2,
      };
      coin.mesh = this.createCoinMesh();
      coin.mesh.position.set(coin.x, WORLD_Y + 0.9, coin.z);
      this.effectsGroup.add(coin.mesh);
      this.coinPickups.push(coin);
    }
  }

  createCoinMesh() {
    const group = new THREE.Group();
    const rim = createCylinder(
      0.42,
      0.42,
      0.16,
      makeMaterial("#f4ca52", { emissive: "#f4ca52", emissiveIntensity: 0.25 }),
      18
    );
    rim.rotation.z = Math.PI / 2;
    group.add(rim);

    const face = createCylinder(0.34, 0.34, 0.18, makeMaterial("#ffe89a"), 18);
    face.rotation.z = Math.PI / 2;
    face.position.x = 0.01;
    group.add(face);

    return group;
  }

  updateCoinPickups(dt) {
    if (!this.coinPickups.length || !this.player) {
      return;
    }

    this.coinPickups = this.coinPickups.filter((coin) => {
      coin.phase += dt * 4.8;
      coin.mesh.rotation.y += dt * 5.6;
      coin.mesh.position.y = WORLD_Y + 0.95 + Math.sin(coin.phase) * 0.16;

      if (distanceBetween(this.player, coin) < 1.7) {
        this.progress.coins += coin.value;
        this.currentStatusText = `Collected ${coin.value} coins. Total: ${this.progress.coins}.`;
        this.saveProgress();
        this.effectsGroup.remove(coin.mesh);
        return false;
      }

      return true;
    });
  }

  spawnPulse(definition) {
    const pulse = new AttackPulse(definition);
    pulse.mesh = this.createPulseMesh(pulse);
    this.pulses.push(pulse);
    this.effectsGroup.add(pulse.mesh);
  }

  spawnProjectile(definition) {
    const projectile = new Projectile(definition);
    projectile.mesh = this.createProjectileMesh(projectile);
    this.projectiles.push(projectile);
    this.effectsGroup.add(projectile.mesh);
  }

  createPulseMesh(pulse) {
    const isArcPulse = Boolean(pulse.direction && pulse.arcDegrees < 360);
    const thetaLength = THREE.MathUtils.degToRad(pulse.arcDegrees ?? 360);
    const thetaStart = isArcPulse ? Math.PI / 2 - thetaLength / 2 : 0;
    const outerRadius = isArcPulse ? pulse.maxReach ?? pulse.radius : pulse.radius;
    const innerRadius = isArcPulse ? Math.max(0.38, outerRadius * 0.08) : pulse.radius * 0.58;
    const material = new THREE.MeshBasicMaterial({
      color: pulse.color,
      transparent: true,
      opacity: isArcPulse ? 0.34 : 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(innerRadius, outerRadius, 40, 1, thetaStart, thetaLength),
      material
    );
    mesh.userData.isArcPulse = isArcPulse;
    mesh.rotation.x = -Math.PI / 2;
    if (pulse.direction) {
      mesh.rotation.z = Math.atan2(pulse.direction.x, pulse.direction.z);
    }
    mesh.position.set(
      isArcPulse ? pulse.originX ?? pulse.x : pulse.x,
      WORLD_Y + 0.06,
      isArcPulse ? pulse.originZ ?? pulse.z : pulse.z
    );
    return mesh;
  }

  updatePulseVisual(pulse) {
    if (!pulse.mesh) {
      return;
    }

    const alpha = Math.max(0, pulse.remaining / pulse.lifetime);
    const isArcPulse = Boolean(pulse.mesh.userData.isArcPulse);
    pulse.mesh.position.set(
      isArcPulse ? pulse.originX ?? pulse.x : pulse.x,
      WORLD_Y + 0.06,
      isArcPulse ? pulse.originZ ?? pulse.z : pulse.z
    );
    if (pulse.direction) {
      pulse.mesh.rotation.z = Math.atan2(pulse.direction.x, pulse.direction.z);
    }
    pulse.mesh.scale.setScalar(1 + (1 - alpha) * (isArcPulse ? 0.06 : 0.2));
    pulse.mesh.material.opacity = alpha * (isArcPulse ? 0.44 : 0.78);
  }

  createBossTelegraph(enemy) {
    const group = new THREE.Group();
    const fill = new THREE.Mesh(
      new THREE.CircleGeometry(enemy.slamRadius, 48),
      new THREE.MeshBasicMaterial({
        color: "#ff3b30",
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    fill.rotation.x = -Math.PI / 2;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(enemy.slamRadius * 0.86, enemy.slamRadius, 48),
      new THREE.MeshBasicMaterial({
        color: "#ffdb4d",
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(fill, ring);
    group.renderOrder = 4;
    group.userData = { fill, ring };
    return group;
  }

  updateBossTelegraphs() {
    for (const enemy of this.enemies) {
      const telegraph = this.enemyTelegraphs.get(enemy.id);
      if (!telegraph) {
        continue;
      }

      const active = enemy.pendingSlam && this.time < enemy.telegraphUntil;
      telegraph.visible = active;
      if (!active) {
        continue;
      }

      const progress = clamp(
        (this.time - enemy.telegraphStartedAt) / Math.max(0.001, enemy.windupDuration),
        0,
        1
      );
      telegraph.position.set(enemy.telegraphX, WORLD_Y + 0.09, enemy.telegraphZ);
      telegraph.scale.setScalar(0.7 + progress * 0.3);
      telegraph.userData.fill.material.opacity = 0.1 + progress * 0.24;
      telegraph.userData.ring.material.opacity = 0.42 + Math.sin(this.time * 18) * 0.18 + progress * 0.32;
    }
  }

  spawnAttackPreview() {
    if (this.attackPreview) {
      this.effectsGroup.remove(this.attackPreview);
      this.attackPreview = null;
    }

    if (!this.player) {
      return;
    }

    const makePreviewArc = (reach, arcDegrees, rotationOffset = 0) => {
      const thetaLength = THREE.MathUtils.degToRad(arcDegrees ?? 360);
      const thetaStart = Math.PI / 2 - thetaLength / 2;
      const innerRadius = Math.max(this.player.radius * 0.34, reach * 0.08);
      const material = new THREE.MeshBasicMaterial({
        color: this.player.basicAttack.color,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.RingGeometry(innerRadius, reach, 40, 1, thetaStart, thetaLength), material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = THREE.MathUtils.degToRad(rotationOffset);
      return mesh;
    };

    const group = new THREE.Group();
    const attack = this.player.basicAttack;
    if (attack.pattern === "spin") {
      group.add(makePreviewArc(attack.radius + attack.range * 0.45, 360));
    } else if (attack.pattern === "double") {
      const spread = attack.spreadDegrees ?? 34;
      const reach = attack.range + attack.radius;
      group.add(makePreviewArc(reach, attack.arcDegrees ?? 360, -spread / 2));
      group.add(makePreviewArc(reach, attack.arcDegrees ?? 360, spread / 2));
    } else if (attack.pattern === "stab") {
      group.add(makePreviewArc(attack.range + 0.65 + attack.radius * 0.72, attack.arcDegrees ?? 42));
    } else {
      group.add(makePreviewArc(attack.range + attack.radius, attack.arcDegrees ?? 360));
    }

    this.attackPreview = group;
    this.attackPreview.renderOrder = 2;
    this.effectsGroup.add(this.attackPreview);
  }

  spawnAimReticle() {
    if (this.aimReticle) {
      this.effectsGroup.remove(this.aimReticle);
      this.aimReticle = null;
    }

    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.54, 24),
      new THREE.MeshBasicMaterial({
        color: "#f6fff7",
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = WORLD_Y + 0.02;
    group.add(ring);

    const crossA = createBox(0.82, 0.02, 0.08, makeMaterial("#8ff6de", { emissive: "#8ff6de", emissiveIntensity: 0.35 }));
    crossA.position.y = WORLD_Y + 0.02;
    const crossB = createBox(0.08, 0.02, 0.82, makeMaterial("#8ff6de", { emissive: "#8ff6de", emissiveIntensity: 0.35 }));
    crossB.position.y = WORLD_Y + 0.02;
    group.add(crossA, crossB);

    group.renderOrder = 3;
    this.aimReticle = group;
    this.effectsGroup.add(group);
  }

  updateAttackPreview() {
    if (!this.attackPreview) {
      return;
    }

    if (!this.player || this.state !== "playing") {
      this.attackPreview.visible = false;
      return;
    }

    this.attackPreview.visible = true;
    this.attackPreview.position.set(this.player.x, WORLD_Y + 0.07, this.player.z);
    this.attackPreview.rotation.z = Math.atan2(this.player.facing.x, this.player.facing.z);

    const cooldownRatio =
      this.player.basicAttack.cooldown > 0
        ? 1 - clamp(this.player.basicCooldownRemaining(this.time) / this.player.basicAttack.cooldown, 0, 1)
        : 1;
    const attackDuration = this.player.attackAnimDuration ?? 0.26;
    const attackFocus = Math.max(0, this.player.attackAnimUntil - this.time) / attackDuration;
    this.attackPreview.scale.setScalar(1 + attackFocus * 0.08);
    const opacity = 0.08 + cooldownRatio * 0.08 + attackFocus * 0.16 + (Math.sin(this.time * 5.2) + 1) * 0.015;
    this.attackPreview.traverse((child) => {
      if (child.material) {
        child.material.opacity = opacity;
      }
    });
  }

  updateAimReticle() {
    if (!this.aimReticle) {
      return;
    }

    if (!this.player || this.state !== "playing" || !this.mouse.hasWorld) {
      this.aimReticle.visible = false;
      return;
    }

    this.aimReticle.visible = true;
    this.aimReticle.position.set(this.mouse.worldX, 0, this.mouse.worldZ);
    this.aimReticle.rotation.y = this.time * 1.2;
    const scale = 1 + (Math.sin(this.time * 4.8) + 1) * 0.05;
    this.aimReticle.scale.set(scale, 1, scale);
  }

  createProjectileMesh(projectile) {
    const group = new THREE.Group();
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(projectile.radius, 18, 14),
      new THREE.MeshStandardMaterial({
        color: projectile.color,
        emissive: projectile.color,
        emissiveIntensity: 1.1,
        roughness: 0.25,
        metalness: 0.05,
      })
    );
    const trail = new THREE.Mesh(
      new THREE.CylinderGeometry(projectile.radius * 0.35, projectile.radius * 0.7, 1.8, 8),
      new THREE.MeshBasicMaterial({
        color: projectile.color,
        transparent: true,
        opacity: 0.5,
      })
    );
    trail.rotation.z = Math.PI / 2;
    trail.position.x = -0.8;
    group.add(glow, trail);
    group.position.set(projectile.x, WORLD_Y + 1.5, projectile.z);
    return group;
  }

  updateProjectileVisual(projectile) {
    if (!projectile.mesh) {
      return;
    }

    projectile.mesh.position.set(projectile.x, WORLD_Y + 1.5, projectile.z);
    projectile.mesh.rotation.y = Math.atan2(projectile.direction.x, projectile.direction.z);
  }

  handlePulseHits(pulse) {
    if (pulse.source !== "player") {
      return;
    }

    const originX = pulse.originX ?? pulse.x;
    const originZ = pulse.originZ ?? pulse.z;
    const reach = pulse.maxReach ?? pulse.radius;

    for (const enemy of this.enemies) {
      if (!enemy.alive || pulse.hasHit(enemy.id)) {
        continue;
      }

      const distanceFromOrigin = Math.hypot(enemy.x - originX, enemy.z - originZ);
      if (distanceFromOrigin > reach + enemy.radius) {
        continue;
      }

      if (pulse.direction && pulse.arcDegrees < 360) {
        const toTarget = normalizeVector(enemy.x - originX, enemy.z - originZ);
        const dot = pulse.direction.x * toTarget.x + pulse.direction.z * toTarget.z;
        const minDot = Math.cos(THREE.MathUtils.degToRad(pulse.arcDegrees / 2));
        if (dot < minDot) {
          continue;
        }
      }

      const hitDirection = normalizeVector(enemy.x - originX, enemy.z - originZ);
      enemy.takeDamage(pulse.damage, hitDirection, this.time);
      pulse.markHit(enemy.id);
    }
  }

  handleProjectileHits(projectile) {
    if (projectile.source !== "player" || !projectile.alive) {
      return;
    }

    const playerZones = this.getPlayerZones();
    if (!isInsideAnyRect(projectile.x, projectile.z, playerZones, 0)) {
      projectile.alive = false;
      return;
    }

    for (const enemy of this.enemies) {
      if (projectile.hasHit(enemy.id)) {
        continue;
      }

      const maxDistance = projectile.radius + enemy.radius;
      if (distanceBetween(projectile, enemy) <= maxDistance) {
        const hitDirection = normalizeVector(enemy.x - projectile.x, enemy.z - projectile.z);
        enemy.takeDamage(projectile.damage, hitDirection, this.time);
        projectile.markHit(enemy.id);
        if (projectile.hitTargets.size > projectile.pierce) {
          projectile.alive = false;
        }
        break;
      }
    }
  }

  moveActor(actor, dx, dz) {
    const zones = this.getPlayerZones();
    this.moveWithinZones(actor, dx, dz, zones);
  }

  moveEnemy(enemy, dx, dz) {
    const zones = this.getEnemyZonesForSide(enemy.side);
    this.moveWithinZones(enemy, dx, dz, zones);
  }

  moveWithinZones(actor, dx, dz, zones) {
    const padding = this.getZonePadding(actor);
    const tryX = actor.x + dx;
    if (isInsideAnyRect(tryX, actor.z, zones, padding)) {
      actor.x = tryX;
    }

    const tryZ = actor.z + dz;
    if (isInsideAnyRect(actor.x, tryZ, zones, padding)) {
      actor.z = tryZ;
    }
  }

  getPlayerZones() {
    const { frontZones, backZones, gateZone } = this.currentLevel.layout;
    const zones = [...frontZones, gateZone];
    if (this.gateOpen) {
      zones.push(...backZones);
    }
    return zones;
  }

  getEnemyZones(enemy) {
    return this.getEnemyZonesForSide(enemy.side);
  }

  getEnemyZonesForSide(side) {
    const { frontZones, backZones, gateZone } = this.currentLevel.layout;

    if (side === "front") {
      return [...frontZones, gateZone];
    }

    return this.gateOpen ? [gateZone, ...backZones] : [...backZones];
  }

  getZonePadding(actorOrRadius) {
    const radius = typeof actorOrRadius === "number" ? actorOrRadius : actorOrRadius?.radius ?? 0;
    return Math.min(radius * 0.24, 0.34);
  }

  getSpawnZonePadding(radius) {
    return Math.min(radius * 0.72, 0.92);
  }

  clampPointToRect(x, z, rect, padding = 0) {
    const minX = rect.minX + padding;
    const maxX = rect.maxX - padding;
    const minZ = rect.minZ + padding;
    const maxZ = rect.maxZ - padding;
    const safeMinX = minX <= maxX ? minX : (rect.minX + rect.maxX) / 2;
    const safeMaxX = minX <= maxX ? maxX : safeMinX;
    const safeMinZ = minZ <= maxZ ? minZ : (rect.minZ + rect.maxZ) / 2;
    const safeMaxZ = minZ <= maxZ ? maxZ : safeMinZ;

    return {
      x: clamp(x, safeMinX, safeMaxX),
      z: clamp(z, safeMinZ, safeMaxZ),
    };
  }

  findEnemySpawnPosition(spawn, side, radius) {
    const zones = this.getEnemyZonesForSide(side);
    const padding = this.getSpawnZonePadding(radius);

    if (!zones.length) {
      return { x: spawn.x, z: spawn.z };
    }

    let bestCandidate = null;
    let bestScore = Infinity;

    for (const zone of zones) {
      const candidate = this.clampPointToRect(spawn.x, spawn.z, zone, padding);
      let score = (candidate.x - spawn.x) ** 2 + (candidate.z - spawn.z) ** 2;

      for (const enemy of this.enemies) {
        const desiredSpacing = radius + enemy.radius + 1.1;
        const distance = Math.hypot(candidate.x - enemy.x, candidate.z - enemy.z);
        if (distance < desiredSpacing) {
          score += (desiredSpacing - distance) ** 2 * 25;
        }
      }

      if (score < bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    return bestCandidate ?? this.clampPointToRect(spawn.x, spawn.z, zones[0], padding);
  }

  resolveEnemySeparation() {
    for (let i = 0; i < this.enemies.length; i += 1) {
      for (let j = i + 1; j < this.enemies.length; j += 1) {
        const first = this.enemies[i];
        const second = this.enemies[j];
        const deltaX = second.x - first.x;
        const deltaZ = second.z - first.z;
        const distance = Math.hypot(deltaX, deltaZ) || 1;
        const overlap = first.radius + second.radius - distance;

        if (overlap > 0) {
          const normalX = deltaX / distance;
          const normalZ = deltaZ / distance;
          const push = overlap / 2;
          this.moveEnemy(first, -normalX * push, -normalZ * push);
          this.moveEnemy(second, normalX * push, normalZ * push);
        }
      }
    }
  }

  buildLevelScene() {
    const { theme, layout } = this.currentLevel;
    this.scene.background = new THREE.Color(theme.sky);
    this.scene.fog = new THREE.Fog(theme.fog, theme.fogNear ?? 40, theme.fogFar ?? 135);
    this.hemiLight.color.set(theme.fog);
    this.hemiLight.groundColor.set(theme.cliffDark);
    this.hemiLight.intensity = theme.hemiIntensity ?? 1.15;
    this.sunLight.color.set(theme.sun ?? "#ffffff");
    this.sunLight.intensity = theme.sunIntensity ?? 1.4;

    const visuals = {
      foamRings: [],
      rotatingProps: [],
    };
    this.levelVisuals = visuals;

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 180),
      new THREE.MeshStandardMaterial({
        color: theme.water,
        emissive: theme.water,
        emissiveIntensity: 0.12,
        roughness: 0.2,
        metalness: 0.04,
        transparent: true,
        opacity: theme.waterOpacity ?? 0.78,
      })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.16;
    water.receiveShadow = true;
    this.levelGroup.add(water);
    visuals.water = water;

    const waterShimmer = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 180),
      new THREE.MeshBasicMaterial({
        color: theme.fog,
        transparent: true,
        opacity: theme.shimmerOpacity ?? 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    waterShimmer.rotation.x = -Math.PI / 2;
    waterShimmer.position.y = 0.22;
    waterShimmer.userData.baseOpacity = theme.shimmerOpacity ?? 0.14;
    this.levelGroup.add(waterShimmer);
    visuals.waterShimmer = waterShimmer;

    this.addBackdropScenery(theme);

    for (const rect of layout.frontZones) {
      this.levelGroup.add(this.createPlatform(rect, theme, this.getRectPlatformStyle(rect, theme)));
    }

    this.levelGroup.add(this.createPlatform(layout.gateZone, theme, this.getRectPlatformStyle(layout.gateZone, theme)));

    for (const rect of layout.backZones) {
      this.levelGroup.add(this.createPlatform(rect, theme, this.getRectPlatformStyle(rect, theme)));
    }

    const startPad = this.buildPortalPad(layout.start, theme.crystal, theme.stone, theme.stoneDark);
    startPad.position.x -= 3;
    this.levelGroup.add(startPad);

    const keyPedestal = this.buildPedestal(layout.key, theme);
    this.levelGroup.add(keyPedestal);

    const keyGroup = this.buildKeyMesh(layout.key, theme);
    this.levelGroup.add(keyGroup);
    visuals.keyGroup = keyGroup;

    const gate = this.buildGate(theme, layout.gate, layout.gateZone);
    this.levelGroup.add(gate.group);
    visuals.gateBars = gate.bars;

    const portal = this.buildPortal(theme, layout.exit);
    this.levelGroup.add(portal.group);
    visuals.portal = portal.group;
    visuals.portalCore = portal.core;
    visuals.portalLight = portal.light;

    this.decorateBiome(theme, layout, visuals);
  }

  addBackdropScenery(theme) {
    const cloudSets = {
      crystal: [
        { x: -14, y: 15, z: -34, scale: 1.05, opacity: 0.48 },
        { x: 22, y: 18, z: -40, scale: 1.2, opacity: 0.42 },
      ],
      volcano: [
        { x: -18, y: 16, z: -34, scale: 1.1, opacity: 0.38 },
        { x: 16, y: 21, z: -42, scale: 1.35, opacity: 0.34 },
        { x: 38, y: 18, z: -24, scale: 1.1, opacity: 0.3 },
      ],
      skyfort: [
        { x: -24, y: 19, z: -30, scale: 1.35, opacity: 0.78 },
        { x: 8, y: 23, z: -42, scale: 1.5, opacity: 0.76 },
        { x: 36, y: 18, z: -18, scale: 1.12, opacity: 0.72 },
      ],
      haunted: [
        { x: -18, y: 17, z: -34, scale: 1.08, opacity: 0.42 },
        { x: 12, y: 20, z: -38, scale: 1.22, opacity: 0.36 },
        { x: 36, y: 16, z: -20, scale: 0.96, opacity: 0.32 },
      ],
      frozen: [
        { x: -22, y: 18, z: -34, scale: 1.15, opacity: 0.74 },
        { x: 10, y: 22, z: -40, scale: 1.3, opacity: 0.72 },
        { x: 34, y: 18, z: -22, scale: 1.04, opacity: 0.68 },
      ],
    };

    const islandSets = {
      crystal: [
        { x: -10, z: -31, width: 12, depth: 8, scale: 0.95 },
        { x: 24, z: -34, width: 15, depth: 10, scale: 1 },
        { x: 57, z: 29, width: 16, depth: 12, scale: 1.06 },
      ],
      volcano: [
        { x: -8, z: -31, width: 14, depth: 9, scale: 0.94 },
        { x: 30, z: -34, width: 16, depth: 11, scale: 1.02 },
        { x: 56, z: 31, width: 17, depth: 11, scale: 1.08 },
      ],
      skyfort: [
        { x: -6, z: -29, width: 11, depth: 8, scale: 0.82 },
        { x: 24, z: -33, width: 12, depth: 8, scale: 0.86 },
        { x: 56, z: 28, width: 13, depth: 9, scale: 0.88 },
      ],
      haunted: [
        { x: -9, z: -30, width: 12, depth: 8, scale: 0.9 },
        { x: 24, z: -33, width: 14, depth: 9, scale: 0.96 },
        { x: 58, z: 30, width: 16, depth: 11, scale: 1.02 },
      ],
      frozen: [
        { x: -12, z: -31, width: 12, depth: 8, scale: 0.96 },
        { x: 24, z: -34, width: 15, depth: 10, scale: 1 },
        { x: 58, z: 30, width: 16, depth: 11, scale: 1.04 },
      ],
    };

    for (const cloud of cloudSets[theme.biome] ?? cloudSets.skyfort) {
      this.levelGroup.add(this.buildCloud(theme, cloud));
    }

    for (const island of islandSets[theme.biome] ?? islandSets.crystal) {
      this.levelGroup.add(this.buildBackdropIsland(theme, island));
    }

    if (theme.biome === "skyfort") {
      for (const ship of [
        { x: -30, y: 13, z: -18, scale: 0.9, yaw: -0.32 },
        { x: 42, y: 16, z: -28, scale: 1.08, yaw: 0.24 },
      ]) {
        this.levelGroup.add(this.buildAirship(theme, ship));
      }
    }
  }

  decorateBiome(theme, layout, visuals) {
    const gateTorchOffsets = [
      { x: -5.4, z: -4.4 },
      { x: -5.4, z: 4.4 },
      { x: 5.4, z: -4.4 },
      { x: 5.4, z: 4.4 },
    ];

    switch (theme.biome) {
      case "crystal":
        for (const foam of [
          { x: 30, z: -19, scale: 1.05, spin: 0.18, color: theme.portal },
          { x: 45, z: 14, scale: 0.94, spin: -0.14, color: theme.crystal },
        ]) {
          const ring = this.buildFoamRing(foam);
          visuals.foamRings.push(ring);
          this.levelGroup.add(ring);
        }

        for (const position of [
          { x: -31, z: -12, scale: 1.1 },
          { x: -13, z: 13, scale: 0.95 },
          { x: 18, z: -13, scale: 1.05 },
          { x: 24, z: 21, scale: 0.88 },
          { x: 58, z: 15, scale: 1.18 },
        ]) {
          this.levelGroup.add(this.buildCrystal(theme, position.x, position.z, position));
        }

        for (const rock of [
          { x: -4, z: 24, scale: 1.08, color: theme.stone },
          { x: 30, z: -20, scale: 1.32, color: theme.stoneDark },
          { x: 56, z: -18, scale: 1.5, color: theme.stoneDark },
        ]) {
          this.levelGroup.add(this.buildLagoonRock(theme, rock));
        }

        for (const offset of gateTorchOffsets) {
          this.levelGroup.add(this.buildTorch(theme, layout.gate.x + offset.x, layout.gate.z + offset.z));
        }
        break;
      case "volcano":
        for (const foam of [
          { x: 25, z: -18, scale: 1.1, spin: 0.22, color: "#ffd08a" },
          { x: 53, z: 14, scale: 1.24, spin: -0.18, color: "#ff914a" },
        ]) {
          const ring = this.buildFoamRing(foam);
          visuals.foamRings.push(ring);
          this.levelGroup.add(ring);
        }

        for (const spire of [
          { x: -41, z: -8, scale: 1.08 },
          { x: -5, z: 13, scale: 0.96 },
          { x: 20, z: 20, scale: 1.1 },
          { x: 34, z: -14, scale: 1.2 },
          { x: 60, z: 12, scale: 1.28 },
        ]) {
          this.levelGroup.add(this.buildBasaltSpire(theme, spire));
        }

        for (const rock of [
          { x: -10, z: -20, scale: 1.2, color: theme.stoneDark },
          { x: 44, z: 14, scale: 1.22, color: theme.stoneDark },
        ]) {
          this.levelGroup.add(this.buildLagoonRock(theme, rock));
        }

        for (const offset of gateTorchOffsets) {
          this.levelGroup.add(this.buildTorch(theme, layout.gate.x + offset.x, layout.gate.z + offset.z));
        }
        break;
      case "skyfort":
        for (const cannon of [
          { x: -43, z: -7, scale: 0.95, yaw: -0.4 },
          { x: -4, z: -12, scale: 1, yaw: 0.3 },
          { x: 22, z: 19, scale: 1.04, yaw: -0.5 },
          { x: 59, z: 13, scale: 1.08, yaw: 0.28 },
        ]) {
          this.levelGroup.add(this.buildCannon(theme, cannon));
        }

        for (const post of [
          { x: -18, z: 14, scale: 1.1 },
          { x: 2, z: 14, scale: 0.96 },
          { x: 33, z: 8, scale: 1.02 },
          { x: 67, z: -9, scale: 1.14 },
        ]) {
          this.levelGroup.add(this.buildLanternPost(theme, post));
        }
        break;
      case "haunted":
        for (const post of [
          { x: -42, z: -6, scale: 0.96 },
          { x: -8, z: -2, scale: 1 },
          { x: 15, z: 16, scale: 1.06 },
          { x: 44, z: 12, scale: 1.12 },
        ]) {
          this.levelGroup.add(this.buildLanternPost(theme, post));
        }

        for (const gearDef of [
          { x: -20, z: -11, scale: 0.98, spin: 0.24 },
          { x: 10, z: 10, scale: 1.08, spin: -0.22 },
          { x: 47, z: -10, scale: 1.18, spin: 0.18 },
        ]) {
          const gear = this.buildClockGear(theme, gearDef);
          visuals.rotatingProps.push(gear);
          this.levelGroup.add(gear);
        }

        for (const crystal of [
          { x: 4, z: 18, scale: 0.85, color: theme.portal, baseColor: theme.stoneDark },
          { x: 55, z: 14, scale: 0.92, color: theme.crystal, baseColor: theme.stoneDark },
        ]) {
          this.levelGroup.add(this.buildCrystal(theme, crystal.x, crystal.z, crystal));
        }
        break;
      case "frozen":
        for (const foam of [
          { x: 28, z: -18, scale: 1, spin: 0.15, color: "#f6ffff" },
          { x: 58, z: 14, scale: 1.18, spin: -0.11, color: "#dff8ff" },
        ]) {
          const ring = this.buildFoamRing(foam);
          visuals.foamRings.push(ring);
          this.levelGroup.add(ring);
        }

        for (const tree of [
          { x: -44, z: -8, scale: 1.05 },
          { x: -37, z: 9, scale: 0.92 },
          { x: -5, z: -13, scale: 1.02 },
          { x: 23, z: 21, scale: 1.08 },
          { x: 62, z: -11, scale: 1.16 },
        ]) {
          this.levelGroup.add(this.buildPineTree(theme, tree));
        }

        for (const crystal of [
          { x: 5, z: 13, scale: 0.82, color: theme.ice, baseColor: theme.stoneDark },
          { x: 31, z: 11, scale: 0.95, color: theme.portal, baseColor: theme.stoneDark },
          { x: 57, z: 16, scale: 1.18, color: theme.crystal, baseColor: theme.stoneDark },
        ]) {
          this.levelGroup.add(this.buildCrystal(theme, crystal.x, crystal.z, crystal));
        }

        for (const rock of [
          { x: -8, z: 22, scale: 1.12, color: theme.stone },
          { x: 44, z: -19, scale: 1.26, color: theme.stoneDark },
        ]) {
          this.levelGroup.add(this.buildLagoonRock(theme, rock));
        }
        break;
      default:
        break;
    }
  }

  getRectPlatformStyle(rect, theme) {
    switch (rect.surfaceType) {
      case "wood":
      case "deck":
        return {
          surface: theme.wood,
          side: theme.woodDark,
          under: theme.stoneDark,
          accent: theme.gate,
          depth: rect.depth ?? 3.8,
          addRails: true,
        };
      case "metal":
        return {
          surface: theme.metal ?? theme.stone,
          side: theme.metalDark ?? theme.stoneDark,
          under: theme.stoneDark,
          accent: theme.portal,
          depth: rect.depth ?? 3.8,
          addRails: true,
        };
      case "stone":
        return {
          surface: theme.stone,
          side: theme.stoneDark,
          under: theme.cliffDark,
          accent: theme.gate,
          sand: theme.stone,
          depth: rect.depth ?? 4.2,
          addRails: false,
        };
      case "crystal":
        return {
          surface: theme.stone,
          sand: theme.crystal,
          side: theme.cliff,
          under: theme.cliffDark,
          depth: rect.depth ?? 6,
        };
      case "volcanic":
        return {
          surface: theme.stone,
          sand: theme.cliff,
          side: theme.cliff,
          under: theme.cliffDark,
          depth: rect.depth ?? 6,
        };
      case "haunted":
        return {
          surface: theme.stone,
          sand: theme.grass,
          side: theme.cliff,
          under: theme.cliffDark,
          depth: rect.depth ?? 6,
        };
      case "ice":
        return {
          surface: theme.ice ?? theme.stone,
          sand: theme.sand,
          side: theme.cliff,
          under: theme.cliffDark,
          accent: theme.portal,
          depth: rect.depth ?? 6,
          addRails: false,
        };
      default:
        return {
          surface: theme.grass,
          sand: theme.sand ?? theme.stone,
          side: theme.cliff,
          under: theme.cliffDark,
          depth: rect.depth ?? 5.8,
        };
    }
  }

  createPlatform(rect, theme, options = {}) {
    const platformKind = rect.kind ?? (rect.surfaceType === "wood" ? "bridge" : "island");
    if (platformKind === "bridge") {
      return this.createBridgePlatform(rect, theme, options);
    }

    return this.createIslandPlatform(rect, theme, options);
  }

  createIslandPlatform(rect, theme, options = {}) {
    const group = new THREE.Group();
    const width = rect.maxX - rect.minX;
    const depth = rect.maxZ - rect.minZ;
    const centerX = (rect.minX + rect.maxX) / 2;
    const centerZ = (rect.minZ + rect.maxZ) / 2;
    const surfaceColor = options.surface ?? theme.grass;
    const sandColor = options.sand ?? theme.sand ?? theme.stone;
    const sideColor = options.side ?? theme.cliff;
    const underColor = options.under ?? theme.cliffDark;
    const depthSize = options.depth ?? 5.8;

    const cliff = configureShadow(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.96, 1.14, depthSize, 24, 1),
        makeMaterial(sideColor)
      )
    );
    cliff.scale.set(width * 0.46, 1, depth * 0.46);
    cliff.position.set(centerX, -depthSize / 2 + 0.15, centerZ);
    group.add(cliff);

    const shore = configureShadow(
      new THREE.Mesh(
        new THREE.CylinderGeometry(1.08, 1.16, 1.1, 28, 1),
        makeMaterial(sandColor)
      )
    );
    shore.scale.set(width * 0.5, 1, depth * 0.5);
    shore.position.set(centerX, 0.52, centerZ);
    group.add(shore);

    const turf = configureShadow(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.94, 1.0, 0.62, 28, 1),
        makeMaterial(surfaceColor)
      )
    );
    turf.scale.set(width * 0.43, 1, depth * 0.43);
    turf.position.set(centerX, 0.88, centerZ);
    group.add(turf);

    for (const offset of [
      { x: -width * 0.24, z: -depth * 0.18, s: 0.9 },
      { x: width * 0.18, z: depth * 0.16, s: 1.1 },
      { x: width * 0.16, z: -depth * 0.22, s: 0.8 },
    ]) {
      const boulder = createSphere(0.78, makeMaterial(theme.stone), 14, 10);
      boulder.scale.set(offset.s * 1.15, offset.s, offset.s * 0.95);
      boulder.position.set(centerX + offset.x, WORLD_Y + 0.02, centerZ + offset.z);
      group.add(boulder);
    }

    for (const offset of [
      { x: -width * 0.28, z: -depth * 0.22 },
      { x: width * 0.21, z: depth * 0.18 },
      { x: width * 0.16, z: -depth * 0.26 },
    ]) {
      const rock = createCone(1.1, 3.2, makeMaterial(underColor), 5);
      rock.position.set(centerX + offset.x, -depthSize - 0.8, centerZ + offset.z);
      rock.rotation.x = Math.PI;
      group.add(rock);
    }

    return group;
  }

  createBridgePlatform(rect, theme, options = {}) {
    const group = new THREE.Group();
    const width = rect.maxX - rect.minX;
    const depth = rect.maxZ - rect.minZ;
    const centerX = (rect.minX + rect.maxX) / 2;
    const centerZ = (rect.minZ + rect.maxZ) / 2;
    const alongX = width >= depth;
    const length = alongX ? width : depth;
    const lane = alongX ? depth : width;
    const depthSize = options.depth ?? 3.8;
    const deckColor = options.surface ?? theme.wood;
    const railColor = options.accent ?? theme.gate;
    const addRails = options.addRails !== false;
    const overlap = 1.2;
    const extendedLength = length + overlap * 2;
    const supportLong = extendedLength * 0.94;
    const supportCross = lane * 0.72;
    const deckCross = lane * 0.92;
    const deckY = WORLD_Y + 0.22;
    const plankY = WORLD_Y + 0.42;
    const abutmentY = WORLD_Y + 0.28;
    const railPostY = WORLD_Y + 0.82;
    const railY = WORLD_Y + 1.36;

    const support = createBox(
      alongX ? supportLong : supportCross,
      depthSize,
      alongX ? supportCross : supportLong,
      makeMaterial(options.under ?? theme.stoneDark)
    );
    support.position.set(centerX, -depthSize / 2 + 0.34, centerZ);
    group.add(support);

    const deck = createBox(
      alongX ? extendedLength : deckCross,
      0.34,
      alongX ? deckCross : extendedLength,
      makeMaterial(deckColor)
    );
    deck.position.set(centerX, deckY, centerZ);
    group.add(deck);

    const plankCount = Math.max(5, Math.floor(extendedLength / 1.4));
    const plankLength = extendedLength / plankCount;
    for (let index = 0; index < plankCount; index += 1) {
      const offset = -extendedLength / 2 + plankLength * (index + 0.5);
      const plank = createBox(
        alongX ? plankLength * 0.86 : lane * 0.86,
        0.2,
        alongX ? lane * 0.86 : plankLength * 0.86,
        makeMaterial(index % 2 === 0 ? deckColor : options.side ?? theme.woodDark)
      );
      plank.position.set(centerX + (alongX ? offset : 0), plankY, centerZ + (alongX ? 0 : offset));
      group.add(plank);
    }

    for (const direction of [-1, 1]) {
      const abutment = createBox(
        alongX ? 1.4 : lane * 0.94,
        0.54,
        alongX ? lane * 0.98 : 1.4,
        makeMaterial(options.side ?? theme.stone)
      );
      abutment.position.set(
        centerX + (alongX ? direction * (extendedLength / 2 - 0.42) : 0),
        abutmentY,
        centerZ + (alongX ? 0 : direction * (extendedLength / 2 - 0.42))
      );
      group.add(abutment);
    }

    if (addRails) {
      const railOffset = lane * 0.34;
      for (let index = 0; index <= plankCount; index += 2) {
        const offset = -extendedLength / 2 + Math.min(index, plankCount) * plankLength;
        const leftPost = createCylinder(0.12, 0.14, 1.15, makeMaterial(options.side ?? theme.woodDark), 6);
        const rightPost = createCylinder(0.12, 0.14, 1.15, makeMaterial(options.side ?? theme.woodDark), 6);
        leftPost.position.set(
          centerX + (alongX ? offset : -railOffset),
          railPostY,
          centerZ + (alongX ? -railOffset : offset)
        );
        rightPost.position.set(
          centerX + (alongX ? offset : railOffset),
          railPostY,
          centerZ + (alongX ? railOffset : offset)
        );
        group.add(leftPost, rightPost);
      }

      const upperRail = createCylinder(0.06, 0.06, extendedLength * 0.95, makeMaterial(railColor), 6);
      const lowerRail = createCylinder(0.05, 0.05, extendedLength * 0.95, makeMaterial(railColor), 6);
      if (alongX) {
        upperRail.rotation.z = Math.PI / 2;
        lowerRail.rotation.z = Math.PI / 2;
        upperRail.position.set(centerX, railY, centerZ - railOffset);
        lowerRail.position.set(centerX, railY, centerZ + railOffset);
      } else {
        upperRail.rotation.x = Math.PI / 2;
        lowerRail.rotation.x = Math.PI / 2;
        upperRail.position.set(centerX - railOffset, railY, centerZ);
        lowerRail.position.set(centerX + railOffset, railY, centerZ);
      }
      group.add(upperRail, lowerRail);
    }

    return group;
  }

  buildBackdropIsland(theme, island) {
    const rect = {
      minX: island.x - island.width / 2,
      maxX: island.x + island.width / 2,
      minZ: island.z - island.depth / 2,
      maxZ: island.z + island.depth / 2,
      surfaceType: island.surfaceType ?? theme.backdropSurfaceType ?? "grass",
      depth: island.depthSize ?? 4.2,
      kind: island.kind ?? "island",
    };
    const group = this.createPlatform(rect, theme, this.getRectPlatformStyle(rect, theme));
    group.scale.setScalar(island.scale);
    group.position.y += island.y ?? 0;
    return group;
  }

  buildPalmTree(theme, palm) {
    const group = new THREE.Group();
    const trunkMat = makeMaterial(theme.wood);
    const barkMat = makeMaterial(theme.woodDark);
    const leafMat = makeMaterial("#6ebd55");
    const frondMat = makeMaterial("#3f7e2f");

    for (let index = 0; index < 6; index += 1) {
      const segment = createCylinder(0.2, 0.24, 0.55, index % 2 === 0 ? trunkMat : barkMat, 7);
      segment.position.set(Math.sin(index * 0.32) * 0.18, WORLD_Y + 0.35 + index * 0.46, 0);
      segment.rotation.z = -0.1 - index * 0.03;
      group.add(segment);
    }

    const crownY = WORLD_Y + 3.25;
    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI * 2 * index) / 6;
      const frond = createBox(0.16, 0.12, 1.9, index % 2 === 0 ? leafMat : frondMat);
      frond.position.set(Math.sin(angle) * 0.2, crownY, Math.cos(angle) * 0.2);
      frond.rotation.x = -0.38;
      frond.rotation.y = angle;
      frond.rotation.z = Math.sin(angle) * 0.35;
      group.add(frond);
    }

    const coconutA = createSphere(0.12, makeMaterial("#7a5128"), 8, 6);
    coconutA.position.set(0.12, crownY - 0.18, 0.18);
    const coconutB = createSphere(0.11, makeMaterial("#7a5128"), 8, 6);
    coconutB.position.set(-0.14, crownY - 0.1, 0.04);
    group.add(coconutA, coconutB);

    group.position.set(palm.x, 0, palm.z);
    group.scale.setScalar(palm.scale ?? 1);
    return group;
  }

  buildLagoonRock(theme, rock) {
    const group = new THREE.Group();
    const material = makeMaterial(rock.color ?? theme.stone);

    for (const piece of [
      { x: -0.5, y: 0.55, z: 0.18, s: 0.8 },
      { x: 0.1, y: 0.78, z: -0.2, s: 1 },
      { x: 0.6, y: 0.42, z: 0.12, s: 0.72 },
    ]) {
      const boulder = createSphere(0.9 * piece.s, material, 12, 10);
      boulder.scale.set(1.08, 0.92, 0.96);
      boulder.position.set(piece.x, piece.y, piece.z);
      group.add(boulder);
    }

    group.position.set(rock.x, -0.1, rock.z);
    group.scale.setScalar(rock.scale ?? 1);
    return group;
  }

  buildFoamRing(foam) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(foam.scale * 1.2, foam.scale * 0.08, 10, 28),
      new THREE.MeshBasicMaterial({
        color: foam.color ?? "#ecffff",
        transparent: true,
        opacity: foam.opacity ?? 0.3,
        depthWrite: false,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(foam.x, foam.y ?? 0.24, foam.z);
    ring.userData = {
      baseScale: 1,
      phase: foam.x * 0.07 + foam.z * 0.03,
      spin: foam.spin ?? 0.14,
    };
    return ring;
  }

  buildCloud(theme, cloud) {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({
      color: theme.fog,
      transparent: true,
      opacity: cloud.opacity ?? 0.72,
    });

    for (const puff of [
      { x: 0, y: 0, z: 0, s: 2.8 },
      { x: 2.2, y: 0.3, z: 0.4, s: 2.3 },
      { x: -2.3, y: 0.1, z: -0.5, s: 2.1 },
      { x: 0.8, y: 0.5, z: -1.1, s: 1.9 },
    ]) {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(puff.s, 14, 10), material);
      sphere.position.set(puff.x, puff.y, puff.z);
      group.add(sphere);
    }

    group.position.set(cloud.x, cloud.y, cloud.z);
    group.scale.setScalar(cloud.scale);
    return group;
  }

  buildPedestal(position, theme) {
    const group = new THREE.Group();
    const base = createCylinder(1.6, 1.9, 2.6, makeMaterial(theme.stoneDark));
    base.position.y = WORLD_Y + 0.8;
    group.add(base);

    const top = createCylinder(1.9, 1.7, 0.5, makeMaterial(theme.stone));
    top.position.y = WORLD_Y + 2;
    group.add(top);

    group.position.set(position.x, 0, position.z);
    return group;
  }

  buildKeyMesh(position, theme) {
    const group = new THREE.Group();
    const metal = makeMaterial(theme.portal, {
      emissive: theme.portal,
      emissiveIntensity: 0.2,
    });

    const ring = configureShadow(new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.16, 10, 18), metal));
    ring.rotation.y = Math.PI / 2;
    ring.position.x = -0.15;
    group.add(ring);

    const shaft = createBox(0.22, 0.22, 1.6, metal);
    shaft.position.z = 0.85;
    group.add(shaft);

    const toothA = createBox(0.18, 0.34, 0.28, metal);
    toothA.position.set(0, -0.15, 1.45);
    group.add(toothA);

    const toothB = createBox(0.18, 0.22, 0.24, metal);
    toothB.position.set(0, 0.2, 1.2);
    group.add(toothB);

    group.position.set(position.x, WORLD_Y + 3.2, position.z);
    return group;
  }

  buildGate(theme, position, gateZone) {
    const group = new THREE.Group();
    const stone = makeMaterial(theme.gate);
    const dark = makeMaterial(theme.stoneDark);
    const gateWidth = gateZone ? Math.max(7.2, gateZone.maxX - gateZone.minX + 1.2) : 8.4;
    const towerAOffset = { x: -gateWidth / 2, z: 0 };
    const towerBOffset = { x: gateWidth / 2, z: 0 };

    const leftBase = createBox(1.8, 5.2, 1.8, dark);
    leftBase.position.set(towerAOffset.x, WORLD_Y + 2.6, towerAOffset.z);
    const rightBase = createBox(1.8, 5.2, 1.8, dark);
    rightBase.position.set(towerBOffset.x, WORLD_Y + 2.6, towerBOffset.z);
    const leftCap = createBox(1.4, 4.6, 1.4, stone);
    leftCap.position.set(towerAOffset.x, WORLD_Y + 2.6, towerAOffset.z);
    const rightCap = createBox(1.4, 4.6, 1.4, stone);
    rightCap.position.set(towerBOffset.x, WORLD_Y + 2.6, towerBOffset.z);
    group.add(leftBase, rightBase, leftCap, rightCap);

    const arch = createBox(gateWidth + 1.2, 1.2, 2.2, stone);
    arch.position.set(0, WORLD_Y + 5.2, 0);
    group.add(arch);

    const bars = new THREE.Group();
    for (let index = 0; index < 5; index += 1) {
      const lateralOffset = -gateWidth * 0.32 + (gateWidth * 0.64 * index) / 4;
      const bar = createBox(0.28, 3.8, 0.32, makeMaterial(theme.gate));
      bar.position.set(lateralOffset, WORLD_Y + 2.2, 0);
      bars.add(bar);
    }
    const crossbar = createBox(gateWidth * 0.78, 0.5, 0.32, makeMaterial(theme.gate));
    crossbar.position.set(0, WORLD_Y + 3.8, 0);
    bars.add(crossbar);
    group.add(bars);

    group.position.set(position.x, 0, position.z);
    return { group, bars };
  }

  buildPortal(theme, position) {
    const group = new THREE.Group();
    const ringMaterial = makeMaterial(theme.portal, {
      emissive: theme.portal,
      emissiveIntensity: 0.55,
    });
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: theme.crystal,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
    });

    const base = createCylinder(2.6, 3.1, 0.8, makeMaterial(theme.stoneDark));
    base.position.y = WORLD_Y + 0.35;
    group.add(base);

    const ring = configureShadow(new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.35, 14, 36), ringMaterial));
    ring.rotation.y = Math.PI / 2;
    ring.position.y = WORLD_Y + 3.2;
    group.add(ring);

    const core = new THREE.Mesh(new THREE.CircleGeometry(2.05, 28), coreMaterial);
    core.rotation.y = Math.PI / 2;
    core.position.set(0, WORLD_Y + 3.2, 0);
    group.add(core);

    const light = new THREE.PointLight(theme.crystal, 0.1, 12, 2);
    light.position.set(0, WORLD_Y + 3.2, 0);
    group.add(light);

    group.position.set(position.x, 0, position.z);
    return { group, core, light };
  }

  buildPortalPad(position, accentColor, stoneColor, darkColor) {
    const group = new THREE.Group();
    const base = createCylinder(2.4, 2.8, 0.7, makeMaterial(darkColor));
    base.position.y = WORLD_Y + 0.3;
    group.add(base);

    const rim = configureShadow(
      new THREE.Mesh(
        new THREE.TorusGeometry(2.2, 0.18, 12, 26),
        makeMaterial(stoneColor, { emissive: accentColor, emissiveIntensity: 0.18 })
      )
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = WORLD_Y + 0.74;
    group.add(rim);

    group.position.set(position.x, 0, position.z);
    return group;
  }

  buildCrystal(theme, x, z, options = {}) {
    const group = new THREE.Group();
    const crystal = createCone(
      0.7,
      2.6,
      makeMaterial(options.color ?? theme.crystal, {
        emissive: options.color ?? theme.crystal,
        emissiveIntensity: 0.18,
      }),
      6
    );
    crystal.position.y = WORLD_Y + 1.9;
    group.add(crystal);

    const base = createCylinder(0.8, 1.1, 0.8, makeMaterial(options.baseColor ?? theme.stoneDark));
    base.position.y = WORLD_Y + 0.4;
    group.add(base);

    group.position.set(x, 0, z);
    group.rotation.y = (x + z) * 0.18;
    group.scale.setScalar(options.scale ?? 1);
    return group;
  }

  buildTorch(theme, x, z) {
    const group = new THREE.Group();
    const post = createCylinder(0.18, 0.22, 1.6, makeMaterial(theme.woodDark), 6);
    post.position.y = WORLD_Y + 0.8;
    group.add(post);

    const flame = createCone(
      0.45,
      1.1,
      makeMaterial(theme.portal, {
        emissive: theme.portal,
        emissiveIntensity: 0.7,
      }),
      8
    );
    flame.position.y = WORLD_Y + 1.95;
    group.add(flame);

    group.position.set(x, 0, z);
    return group;
  }

  buildFlowerPatch(theme, x, z) {
    const group = new THREE.Group();
    for (let index = 0; index < 4; index += 1) {
      const stem = createCylinder(0.03, 0.03, 0.45, makeMaterial(theme.grassDark), 5);
      stem.position.set((index - 1.5) * 0.22, WORLD_Y + 0.22, Math.sin(index) * 0.18);
      group.add(stem);

      const bloom = createSphere(0.13, makeMaterial(index % 2 === 0 ? "#ff6f8a" : "#ffd66f"), 10, 8);
      bloom.position.set((index - 1.5) * 0.22, WORLD_Y + 0.48, Math.sin(index) * 0.18);
      group.add(bloom);
    }

    group.position.set(x, 0, z);
    return group;
  }

  buildBasaltSpire(theme, spire) {
    const group = new THREE.Group();
    const darkMat = makeMaterial(theme.stoneDark);
    const emberMat = makeMaterial(theme.portal, {
      emissive: theme.portal,
      emissiveIntensity: 0.28,
    });

    for (const shard of [
      { x: -0.42, height: 2.2, z: -0.16, tilt: 0.12 },
      { x: 0.1, height: 2.9, z: 0.12, tilt: -0.08 },
      { x: 0.52, height: 1.9, z: -0.08, tilt: 0.16 },
    ]) {
      const spike = createCone(0.42, shard.height, darkMat, 5);
      spike.position.set(shard.x, WORLD_Y + shard.height / 2, shard.z);
      spike.rotation.z = shard.tilt;
      group.add(spike);
    }

    const ember = createCone(0.26, 1.18, emberMat, 5);
    ember.position.set(0.08, WORLD_Y + 3.4, 0.04);
    group.add(ember);

    group.position.set(spire.x, 0, spire.z);
    group.scale.setScalar(spire.scale ?? 1);
    return group;
  }

  buildCannon(theme, cannon) {
    const group = new THREE.Group();
    const woodMat = makeMaterial(theme.woodDark);
    const metalMat = makeMaterial(theme.metal ?? theme.stone);
    const trimMat = makeMaterial(theme.gate);

    const base = createBox(2.2, 0.52, 1.5, woodMat);
    base.position.y = WORLD_Y + 0.34;
    group.add(base);

    const barrel = createCylinder(0.44, 0.54, 2.6, metalMat, 10);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.35, WORLD_Y + 0.98, 0);
    group.add(barrel);

    const muzzle = createCylinder(0.58, 0.5, 0.34, trimMat, 10);
    muzzle.rotation.z = Math.PI / 2;
    muzzle.position.set(1.64, WORLD_Y + 0.98, 0);
    group.add(muzzle);

    for (const wheelOffset of [-0.72, 0.72]) {
      const wheel = createCylinder(0.46, 0.46, 0.2, woodMat, 12);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(-0.42, WORLD_Y + 0.42, wheelOffset);
      group.add(wheel);
    }

    group.position.set(cannon.x, 0, cannon.z);
    group.rotation.y = cannon.yaw ?? 0;
    group.scale.setScalar(cannon.scale ?? 1);
    return group;
  }

  buildLanternPost(theme, postDef) {
    const group = new THREE.Group();
    const postMat = makeMaterial(theme.woodDark);
    const lanternMat = makeMaterial(theme.portal, {
      emissive: theme.portal,
      emissiveIntensity: 0.36,
    });
    const trimMat = makeMaterial(theme.metalDark ?? theme.stoneDark);

    const post = createCylinder(0.12, 0.16, 2.8, postMat, 6);
    post.position.y = WORLD_Y + 1.4;
    group.add(post);

    const arm = createBox(0.8, 0.12, 0.12, trimMat);
    arm.position.set(0.26, WORLD_Y + 2.56, 0);
    group.add(arm);

    const lantern = createBox(0.42, 0.58, 0.42, lanternMat);
    lantern.position.set(0.56, WORLD_Y + 2.12, 0);
    group.add(lantern);

    group.position.set(postDef.x, 0, postDef.z);
    group.scale.setScalar(postDef.scale ?? 1);
    return group;
  }

  buildClockGear(theme, gearDef) {
    const group = new THREE.Group();
    const metalMat = makeMaterial(theme.metal ?? theme.stone);
    const glowMat = makeMaterial(theme.portal, {
      emissive: theme.portal,
      emissiveIntensity: 0.22,
    });

    const pillar = createCylinder(0.24, 0.3, 2.8, makeMaterial(theme.stoneDark), 8);
    pillar.position.y = WORLD_Y + 1.4;
    group.add(pillar);

    const outer = configureShadow(new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.16, 12, 18), metalMat));
    outer.rotation.y = Math.PI / 2;
    outer.position.y = WORLD_Y + 2.35;
    group.add(outer);

    for (let index = 0; index < 8; index += 1) {
      const tooth = createBox(0.2, 0.22, 0.44, metalMat);
      const angle = (Math.PI * 2 * index) / 8;
      tooth.position.set(Math.cos(angle) * 1.12, WORLD_Y + 2.35, Math.sin(angle) * 1.12);
      tooth.rotation.y = angle;
      group.add(tooth);
    }

    const hub = createCylinder(0.34, 0.34, 0.28, glowMat, 10);
    hub.rotation.x = Math.PI / 2;
    hub.position.y = WORLD_Y + 2.35;
    group.add(hub);

    group.position.set(gearDef.x, 0, gearDef.z);
    group.scale.setScalar(gearDef.scale ?? 1);
    group.userData.spin = gearDef.spin ?? 0.18;
    return group;
  }

  buildPineTree(theme, tree) {
    const group = new THREE.Group();
    const trunkMat = makeMaterial(theme.woodDark);
    const leafMat = makeMaterial("#77a9b8");
    const leafShadeMat = makeMaterial("#5e8597");

    const trunk = createCylinder(0.2, 0.28, 2, trunkMat, 7);
    trunk.position.y = WORLD_Y + 1;
    group.add(trunk);

    for (const layer of [
      { y: 1.8, radius: 0.9, height: 1.5, mat: leafShadeMat },
      { y: 2.5, radius: 0.72, height: 1.3, mat: leafMat },
      { y: 3.1, radius: 0.54, height: 1.05, mat: leafShadeMat },
    ]) {
      const cone = createCone(layer.radius, layer.height, layer.mat, 7);
      cone.position.y = WORLD_Y + layer.y;
      group.add(cone);
    }

    group.position.set(tree.x, 0, tree.z);
    group.scale.setScalar(tree.scale ?? 1);
    return group;
  }

  buildAirship(theme, ship) {
    const group = new THREE.Group();
    const balloonMat = makeMaterial(theme.portal, {
      emissive: theme.portal,
      emissiveIntensity: 0.16,
    });
    const hullMat = makeMaterial(theme.wood);
    const trimMat = makeMaterial(theme.metalDark ?? theme.stoneDark);

    const balloon = createSphere(2.6, balloonMat, 16, 12);
    balloon.scale.set(1.48, 1, 1.02);
    balloon.position.y = 2.8;
    group.add(balloon);

    const hull = createBox(3.2, 0.8, 1.2, hullMat);
    hull.position.y = 0.3;
    group.add(hull);

    const cabin = createBox(1.2, 0.6, 0.9, trimMat);
    cabin.position.set(-0.2, -0.32, 0);
    group.add(cabin);

    for (const ropeX of [-0.9, 0.9]) {
      const rope = createCylinder(0.04, 0.04, 2.1, trimMat, 5);
      rope.position.set(ropeX, 1.35, 0);
      group.add(rope);
    }

    group.position.set(ship.x, ship.y, ship.z);
    group.rotation.y = ship.yaw ?? 0;
    group.scale.setScalar(ship.scale ?? 1);
    return group;
  }

  spawnPlayerVisual() {
    if (!this.player) {
      return;
    }

    this.playerVisual = this.buildHeroModel(this.selectedCharacter);
    this.characterGroup.add(this.playerVisual);
    this.spawnAimReticle();
  }

  buildHeroModel(character) {
    if (character.form === "teacher") {
      return this.buildTeacherHero(character);
    }

    if (character.form === "dragon") {
      return this.buildDragonHero(character);
    }

    if (character.form === "shark") {
      return this.buildSharkHero(character);
    }

    return this.buildBruteHero(character);
  }

  buildKeyboardWeapon(keyMat, keycapMat, accentMat) {
    const group = new THREE.Group();
    const body = createBox(2.1, 0.18, 0.72, keyMat);
    group.add(body);

    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const key = createBox(0.16, 0.06, 0.12, (row + col) % 5 === 0 ? accentMat : keycapMat);
        key.position.set(-0.74 + col * 0.21, 0.13, -0.22 + row * 0.2);
        group.add(key);
      }
    }

    const spacebar = createBox(0.82, 0.06, 0.12, accentMat);
    spacebar.position.set(0.1, 0.14, 0.32);
    group.add(spacebar);

    group.rotation.x = Math.PI / 2;
    group.rotation.z = -0.18;
    return group;
  }

  buildTeacherHero(character) {
    const group = new THREE.Group();
    const shirtMat = makeMaterial(character.color);
    const pantsMat = makeMaterial(character.secondaryColor);
    const skinMat = makeMaterial(character.detailColor);
    const hairMat = makeMaterial("#7a4a2f");
    const beardMat = makeMaterial("#8d786c");
    const mustacheMat = makeMaterial("#6f4f3f");
    const shadowMat = makeMaterial("#6f7884");
    const undershirtMat = makeMaterial("#f4f4ef");
    const keyboardMat = makeMaterial("#20242d");
    const keycapMat = makeMaterial(character.accent);
    const eyeMat = makeMaterial(character.eyeColor, {
      emissive: character.eyeColor,
      emissiveIntensity: 0.18,
    });

    const torso = createBox(1.42, 1.82, 0.82, shirtMat);
    torso.position.set(0, WORLD_Y + 2.25, 0.04);
    group.add(torso);

    const undershirt = createBox(0.52, 0.78, 0.12, undershirtMat);
    undershirt.position.set(0, WORLD_Y + 2.82, 0.5);
    group.add(undershirt);

    const placket = createBox(0.18, 0.9, 0.08, shadowMat);
    placket.position.set(0, WORLD_Y + 2.74, 0.56);
    group.add(placket);

    const leftCollar = createBox(0.58, 0.14, 0.46, shirtMat);
    leftCollar.position.set(-0.28, WORLD_Y + 3.16, 0.36);
    leftCollar.rotation.z = -0.32;
    const rightCollar = createBox(0.58, 0.14, 0.46, shirtMat);
    rightCollar.position.set(0.28, WORLD_Y + 3.16, 0.36);
    rightCollar.rotation.z = 0.32;
    group.add(leftCollar, rightCollar);

    const head = createSphere(0.76, skinMat, 16, 12);
    head.position.set(0, WORLD_Y + 3.58, 0.08);
    head.scale.set(0.92, 1, 0.88);
    group.add(head);

    const hair = createSphere(0.78, hairMat, 14, 8);
    hair.position.set(0, WORLD_Y + 4.02, -0.04);
    hair.scale.set(0.96, 0.46, 0.88);
    group.add(hair);

    for (const tuft of [
      { x: -0.34, y: 4.2, z: 0.26, rz: 0.34, s: 0.9 },
      { x: -0.05, y: 4.28, z: 0.3, rz: 0.04, s: 1.05 },
      { x: 0.25, y: 4.2, z: 0.24, rz: -0.3, s: 0.86 },
    ]) {
      const hairTuft = createCone(0.22 * tuft.s, 0.72 * tuft.s, hairMat, 6);
      hairTuft.position.set(tuft.x, WORLD_Y + tuft.y, tuft.z);
      hairTuft.rotation.x = Math.PI * 0.42;
      hairTuft.rotation.z = tuft.rz;
      group.add(hairTuft);
    }

    const leftEar = createSphere(0.16, skinMat, 8, 6);
    leftEar.position.set(-0.72, WORLD_Y + 3.58, 0.08);
    leftEar.scale.set(0.55, 1, 0.42);
    const rightEar = createSphere(0.16, skinMat, 8, 6);
    rightEar.position.set(0.72, WORLD_Y + 3.58, 0.08);
    rightEar.scale.set(0.55, 1, 0.42);
    group.add(leftEar, rightEar);

    const nose = createSphere(0.13, skinMat, 8, 6);
    nose.position.set(0, WORLD_Y + 3.48, 0.76);
    nose.scale.set(0.78, 1, 0.82);
    group.add(nose);

    const beard = createSphere(0.48, beardMat, 12, 8);
    beard.position.set(0, WORLD_Y + 3.26, 0.6);
    beard.scale.set(1.18, 0.45, 0.34);
    group.add(beard);

    const mustache = createBox(0.58, 0.08, 0.16, mustacheMat);
    mustache.position.set(0, WORLD_Y + 3.38, 0.82);
    group.add(mustache);

    const smile = createBox(0.42, 0.04, 0.08, makeMaterial("#5f4037"));
    smile.position.set(0, WORLD_Y + 3.18, 0.84);
    group.add(smile);

    const leftEye = createSphere(0.08, eyeMat, 8, 6);
    leftEye.position.set(-0.22, WORLD_Y + 3.68, 0.72);
    const rightEye = createSphere(0.08, eyeMat, 8, 6);
    rightEye.position.set(0.22, WORLD_Y + 3.68, 0.72);
    group.add(leftEye, rightEye);

    const leftArmRig = new THREE.Group();
    leftArmRig.position.set(-0.92, WORLD_Y + 2.82, 0.18);
    leftArmRig.userData.baseZ = Math.PI * 0.08;
    leftArmRig.rotation.z = leftArmRig.userData.baseZ;
    const leftArm = createCylinder(0.18, 0.22, 1.35, shirtMat, 7);
    leftArm.position.set(0, -0.62, 0.04);
    leftArmRig.add(leftArm);
    const leftHand = createSphere(0.28, skinMat, 10, 8);
    leftHand.position.set(0, -1.28, 0.28);
    leftArmRig.add(leftHand);
    group.add(leftArmRig);

    const rightArmRig = new THREE.Group();
    rightArmRig.position.set(0.92, WORLD_Y + 2.82, 0.18);
    rightArmRig.userData.baseZ = -Math.PI * 0.08;
    rightArmRig.rotation.z = rightArmRig.userData.baseZ;
    const rightArm = createCylinder(0.18, 0.22, 1.35, shirtMat, 7);
    rightArm.position.set(0, -0.62, 0.04);
    rightArmRig.add(rightArm);
    const rightHand = createSphere(0.28, skinMat, 10, 8);
    rightHand.position.set(0, -1.28, 0.28);
    rightArmRig.add(rightHand);
    const keyboard = this.buildKeyboardWeapon(keyboardMat, keycapMat, eyeMat);
    keyboard.position.set(0.2, -1.54, 0.76);
    rightArmRig.add(keyboard);
    group.add(rightArmRig);

    const leftLegRig = new THREE.Group();
    leftLegRig.position.set(-0.34, WORLD_Y + 1.46, 0.04);
    leftLegRig.userData.baseZ = 0.02;
    const leftLeg = createCylinder(0.22, 0.26, 1.32, pantsMat, 7);
    leftLeg.position.set(0, -0.62, 0);
    leftLegRig.add(leftLeg);
    const leftFoot = createBox(0.54, 0.28, 0.86, keyboardMat);
    leftFoot.position.set(0, -1.32, 0.3);
    leftLegRig.add(leftFoot);
    group.add(leftLegRig);

    const rightLegRig = new THREE.Group();
    rightLegRig.position.set(0.34, WORLD_Y + 1.46, 0.04);
    rightLegRig.userData.baseZ = -0.02;
    const rightLeg = createCylinder(0.22, 0.26, 1.32, pantsMat, 7);
    rightLeg.position.set(0, -0.62, 0);
    rightLegRig.add(rightLeg);
    const rightFoot = createBox(0.54, 0.28, 0.86, keyboardMat);
    rightFoot.position.set(0, -1.32, 0.3);
    rightLegRig.add(rightFoot);
    group.add(rightLegRig);

    group.userData = {
      type: "teacher",
      torso,
      head,
      leftArmRig,
      rightArmRig,
      leftLegRig,
      rightLegRig,
      leftHand,
      rightHand,
      leftFoot,
      rightFoot,
      rightWeapon: keyboard,
      bobSeed: 3.4,
    };
    group.scale.setScalar(1.02);
    return setGroupShadows(group);
  }

  buildDragonHero(character) {
    const group = new THREE.Group();
    const bodyMat = makeMaterial(character.color);
    const secondaryMat = makeMaterial(character.secondaryColor);
    const detailMat = makeMaterial(character.detailColor);
    const accentMat = makeMaterial(character.accent);
    const eyeMat = makeMaterial(character.eyeColor, {
      emissive: character.eyeColor,
      emissiveIntensity: 0.3,
    });

    const torso = configureShadow(
      new THREE.Mesh(new THREE.CapsuleGeometry(1.02, 2.2, 6, 12), bodyMat)
    );
    torso.position.set(0, WORLD_Y + 2.1, 0.05);
    torso.scale.set(1, 1, 0.92);
    group.add(torso);

    const belly = createSphere(0.74, detailMat, 14, 10);
    belly.position.set(0, WORLD_Y + 1.92, 0.45);
    belly.scale.set(1.05, 0.95, 0.8);
    group.add(belly);

    const head = createSphere(1.16, bodyMat, 16, 12);
    head.position.set(0, WORLD_Y + 3.68, 0.26);
    head.scale.set(1, 1, 0.96);
    group.add(head);

    const snout = createBox(0.98, 0.72, 1.68, detailMat);
    snout.position.set(0, WORLD_Y + 3.42, 1.18);
    group.add(snout);

    const jaw = createBox(0.92, 0.28, 1.25, secondaryMat);
    jaw.position.set(0, WORLD_Y + 3.05, 1.12);
    group.add(jaw);

    const leftHorn = createCone(0.22, 1.05, accentMat, 6);
    leftHorn.position.set(-0.46, WORLD_Y + 4.7, -0.12);
    leftHorn.rotation.z = Math.PI * 0.18;
    leftHorn.rotation.x = -0.18;
    const rightHorn = leftHorn.clone();
    rightHorn.position.x = 0.46;
    rightHorn.rotation.z *= -1;
    group.add(leftHorn, rightHorn);

    const leftWing = createBox(0.16, 1.9, 3.2, secondaryMat);
    leftWing.position.set(-1.44, WORLD_Y + 2.72, -0.22);
    leftWing.rotation.z = Math.PI * 0.26;
    leftWing.rotation.x = 0.18;
    const rightWing = createBox(0.16, 1.9, 3.2, secondaryMat);
    rightWing.position.set(1.44, WORLD_Y + 2.72, -0.22);
    rightWing.rotation.z = -Math.PI * 0.26;
    rightWing.rotation.x = 0.18;
    group.add(leftWing, rightWing);

    const leftArmRig = new THREE.Group();
    leftArmRig.position.set(-1.1, WORLD_Y + 2.58, 0.35);
    leftArmRig.userData.baseZ = Math.PI * 0.12;
    leftArmRig.rotation.z = leftArmRig.userData.baseZ;
    const leftArm = createCylinder(0.22, 0.26, 1.35, secondaryMat, 6);
    leftArm.position.set(0, -0.68, 0.12);
    leftArmRig.add(leftArm);
    const leftHand = createSphere(0.42, detailMat, 12, 10);
    leftHand.position.set(0, -1.32, 0.44);
    leftArmRig.add(leftHand);
    group.add(leftArmRig);

    const rightArmRig = new THREE.Group();
    rightArmRig.position.set(1.1, WORLD_Y + 2.58, 0.35);
    rightArmRig.userData.baseZ = -Math.PI * 0.12;
    rightArmRig.rotation.z = rightArmRig.userData.baseZ;
    const rightArm = createCylinder(0.22, 0.26, 1.35, secondaryMat, 6);
    rightArm.position.set(0, -0.68, 0.12);
    rightArmRig.add(rightArm);
    const rightHand = createSphere(0.42, detailMat, 12, 10);
    rightHand.position.set(0, -1.32, 0.44);
    rightArmRig.add(rightHand);
    group.add(rightArmRig);

    const leftLegRig = new THREE.Group();
    leftLegRig.position.set(-0.58, WORLD_Y + 1.42, 0.14);
    leftLegRig.userData.baseZ = 0.04;
    leftLegRig.rotation.z = leftLegRig.userData.baseZ;
    const leftLeg = createCylinder(0.28, 0.33, 1.35, secondaryMat, 6);
    leftLeg.position.set(0, -0.64, 0.05);
    leftLegRig.add(leftLeg);
    const leftFoot = createSphere(0.5, detailMat, 12, 10);
    leftFoot.position.set(0, -1.34, 0.48);
    leftFoot.scale.set(1.5, 0.78, 1.9);
    leftLegRig.add(leftFoot);
    group.add(leftLegRig);

    const rightLegRig = new THREE.Group();
    rightLegRig.position.set(0.58, WORLD_Y + 1.42, 0.14);
    rightLegRig.userData.baseZ = -0.04;
    rightLegRig.rotation.z = rightLegRig.userData.baseZ;
    const rightLeg = createCylinder(0.28, 0.33, 1.35, secondaryMat, 6);
    rightLeg.position.set(0, -0.64, 0.05);
    rightLegRig.add(rightLeg);
    const rightFoot = createSphere(0.5, detailMat, 12, 10);
    rightFoot.position.set(0, -1.34, 0.48);
    rightFoot.scale.set(1.5, 0.78, 1.9);
    rightLegRig.add(rightFoot);
    group.add(rightLegRig);

    const tail = createCone(0.34, 2.15, secondaryMat, 6);
    tail.position.set(0, WORLD_Y + 1.88, -1.58);
    tail.rotation.x = Math.PI * 0.68;
    tail.userData.baseX = tail.rotation.x;
    group.add(tail);

    const leftEye = createSphere(0.13, eyeMat, 10, 8);
    leftEye.position.set(-0.3, WORLD_Y + 3.78, 1.05);
    const rightEye = createSphere(0.13, eyeMat, 10, 8);
    rightEye.position.set(0.3, WORLD_Y + 3.78, 1.05);
    group.add(leftEye, rightEye);

    group.userData = {
      type: "dragon",
      torso,
      head,
      leftWing,
      rightWing,
      leftArmRig,
      rightArmRig,
      leftLegRig,
      rightLegRig,
      leftHand,
      rightHand,
      leftFoot,
      rightFoot,
      tail,
      bobSeed: 0.8,
    };
    group.scale.setScalar(1.04);
    return setGroupShadows(group);
  }

  buildSharkHero(character) {
    const group = new THREE.Group();
    const bodyMat = makeMaterial(character.color);
    const secondaryMat = makeMaterial(character.secondaryColor);
    const detailMat = makeMaterial(character.detailColor);
    const accentMat = makeMaterial(character.accent);
    const eyeMat = makeMaterial(character.eyeColor, {
      emissive: character.eyeColor,
      emissiveIntensity: 0.26,
    });

    const torso = configureShadow(
      new THREE.Mesh(new THREE.CapsuleGeometry(1.02, 2.08, 6, 12), bodyMat)
    );
    torso.position.set(0, WORLD_Y + 2.08, 0.02);
    torso.scale.set(1.02, 1, 0.94);
    group.add(torso);

    const chest = createBox(1.34, 1.4, 0.82, secondaryMat);
    chest.position.set(0, WORLD_Y + 1.92, 0.52);
    group.add(chest);

    const head = createSphere(1.14, bodyMat, 16, 12);
    head.position.set(0, WORLD_Y + 3.58, 0.18);
    head.scale.set(1, 1, 0.96);
    group.add(head);

    const muzzle = createBox(1.16, 0.76, 1.76, secondaryMat);
    muzzle.position.set(0, WORLD_Y + 3.28, 1.2);
    group.add(muzzle);

    const fin = createCone(0.38, 1.18, detailMat, 6);
    fin.position.set(0, WORLD_Y + 4.78, -0.12);
    fin.rotation.x = Math.PI;
    group.add(fin);

    const leftArmRig = new THREE.Group();
    leftArmRig.position.set(-1.18, WORLD_Y + 2.46, 0.34);
    leftArmRig.userData.baseZ = Math.PI * 0.12;
    leftArmRig.rotation.z = leftArmRig.userData.baseZ;
    const leftArm = createCylinder(0.26, 0.3, 1.42, secondaryMat, 6);
    leftArm.position.set(0, -0.72, 0.12);
    leftArmRig.add(leftArm);
    const leftHand = createBox(0.72, 0.52, 0.9, accentMat);
    leftHand.position.set(0, -1.38, 0.42);
    leftArmRig.add(leftHand);
    group.add(leftArmRig);

    const rightArmRig = new THREE.Group();
    rightArmRig.position.set(1.18, WORLD_Y + 2.46, 0.34);
    rightArmRig.userData.baseZ = -Math.PI * 0.12;
    rightArmRig.rotation.z = rightArmRig.userData.baseZ;
    const rightArm = createCylinder(0.26, 0.3, 1.42, secondaryMat, 6);
    rightArm.position.set(0, -0.72, 0.12);
    rightArmRig.add(rightArm);
    const rightHand = createBox(0.82, 0.58, 1.08, accentMat);
    rightHand.position.set(0, -1.36, 0.42);
    rightArmRig.add(rightHand);
    const harpoon = createCone(0.28, 2.4, accentMat, 6);
    harpoon.position.set(0, -1.42, 1.62);
    harpoon.rotation.x = Math.PI / 2;
    rightArmRig.add(harpoon);
    group.add(rightArmRig);

    const leftLegRig = new THREE.Group();
    leftLegRig.position.set(-0.5, WORLD_Y + 1.28, 0.05);
    leftLegRig.userData.baseZ = 0.03;
    leftLegRig.rotation.z = leftLegRig.userData.baseZ;
    const leftLeg = createCylinder(0.32, 0.34, 1.48, bodyMat, 6);
    leftLeg.position.set(0, -0.7, 0.04);
    leftLegRig.add(leftLeg);
    const leftFoot = createBox(0.9, 0.44, 1.28, secondaryMat);
    leftFoot.position.set(0, -1.42, 0.4);
    leftLegRig.add(leftFoot);
    group.add(leftLegRig);

    const rightLegRig = new THREE.Group();
    rightLegRig.position.set(0.5, WORLD_Y + 1.28, 0.05);
    rightLegRig.userData.baseZ = -0.03;
    rightLegRig.rotation.z = rightLegRig.userData.baseZ;
    const rightLeg = createCylinder(0.32, 0.34, 1.48, bodyMat, 6);
    rightLeg.position.set(0, -0.7, 0.04);
    rightLegRig.add(rightLeg);
    const rightFoot = createBox(0.9, 0.44, 1.28, secondaryMat);
    rightFoot.position.set(0, -1.42, 0.4);
    rightLegRig.add(rightFoot);
    group.add(rightLegRig);

    const leftEye = createSphere(0.14, eyeMat, 10, 8);
    leftEye.position.set(-0.31, WORLD_Y + 3.68, 1.04);
    const rightEye = createSphere(0.14, eyeMat, 10, 8);
    rightEye.position.set(0.31, WORLD_Y + 3.68, 1.04);
    group.add(leftEye, rightEye);

    group.userData = {
      type: "shark",
      torso,
      head,
      leftArmRig,
      rightArmRig,
      leftLegRig,
      rightLegRig,
      leftHand,
      rightHand,
      leftFoot,
      rightFoot,
      rightWeapon: harpoon,
      bobSeed: 1.7,
    };
    group.scale.setScalar(1.03);
    return setGroupShadows(group);
  }

  buildBruteHero(character) {
    const group = new THREE.Group();
    const bodyMat = makeMaterial(character.color);
    const secondaryMat = makeMaterial(character.secondaryColor);
    const detailMat = makeMaterial(character.detailColor);
    const accentMat = makeMaterial(character.accent, {
      emissive: character.accent,
      emissiveIntensity: 0.16,
    });
    const eyeMat = makeMaterial(character.eyeColor, {
      emissive: character.eyeColor,
      emissiveIntensity: 0.22,
    });

    const torso = createBox(2.18, 2.58, 1.55, bodyMat);
    torso.position.set(0, WORLD_Y + 2.08, 0.02);
    group.add(torso);

    const belly = createBox(1.34, 1.5, 0.72, detailMat);
    belly.position.set(0, WORLD_Y + 1.8, 0.78);
    group.add(belly);

    const head = createBox(1.56, 1.44, 1.28, bodyMat);
    head.position.set(0, WORLD_Y + 3.82, 0.08);
    group.add(head);

    const snout = createBox(0.84, 0.46, 1.02, detailMat);
    snout.position.set(0, WORLD_Y + 3.5, 0.88);
    group.add(snout);

    const leftHorn = createCone(0.28, 1.18, detailMat, 6);
    leftHorn.position.set(-0.58, WORLD_Y + 4.92, -0.1);
    leftHorn.rotation.z = Math.PI * 0.22;
    leftHorn.rotation.x = -0.14;
    const rightHorn = leftHorn.clone();
    rightHorn.position.x = 0.58;
    rightHorn.rotation.z *= -1;
    group.add(leftHorn, rightHorn);

    const leftArmRig = new THREE.Group();
    leftArmRig.position.set(-1.55, WORLD_Y + 2.52, 0.12);
    leftArmRig.userData.baseZ = Math.PI * 0.07;
    leftArmRig.rotation.z = leftArmRig.userData.baseZ;
    const leftArm = createBox(0.86, 1.7, 0.9, secondaryMat);
    leftArm.position.set(0, -0.82, 0.06);
    leftArmRig.add(leftArm);
    const leftFist = createBox(1.18, 1.02, 1.12, bodyMat);
    leftFist.position.set(0, -1.78, 0.48);
    leftArmRig.add(leftFist);
    group.add(leftArmRig);

    const rightArmRig = new THREE.Group();
    rightArmRig.position.set(1.55, WORLD_Y + 2.52, 0.12);
    rightArmRig.userData.baseZ = -Math.PI * 0.07;
    rightArmRig.rotation.z = rightArmRig.userData.baseZ;
    const rightArm = createBox(0.86, 1.7, 0.9, secondaryMat);
    rightArm.position.set(0, -0.82, 0.06);
    rightArmRig.add(rightArm);
    const rightFist = createBox(1.18, 1.02, 1.12, bodyMat);
    rightFist.position.set(0, -1.78, 0.48);
    rightArmRig.add(rightFist);
    group.add(rightArmRig);

    const leftLegRig = new THREE.Group();
    leftLegRig.position.set(-0.62, WORLD_Y + 1.2, 0.02);
    leftLegRig.userData.baseZ = 0.02;
    leftLegRig.rotation.z = leftLegRig.userData.baseZ;
    const leftLeg = createBox(0.78, 1.46, 0.88, secondaryMat);
    leftLeg.position.set(0, -0.72, 0.04);
    leftLegRig.add(leftLeg);
    const leftFoot = createBox(1.08, 0.56, 1.38, detailMat);
    leftFoot.position.set(0, -1.52, 0.36);
    leftLegRig.add(leftFoot);
    group.add(leftLegRig);

    const rightLegRig = new THREE.Group();
    rightLegRig.position.set(0.62, WORLD_Y + 1.2, 0.02);
    rightLegRig.userData.baseZ = -0.02;
    rightLegRig.rotation.z = rightLegRig.userData.baseZ;
    const rightLeg = createBox(0.78, 1.46, 0.88, secondaryMat);
    rightLeg.position.set(0, -0.72, 0.04);
    rightLegRig.add(rightLeg);
    const rightFoot = createBox(1.08, 0.56, 1.38, detailMat);
    rightFoot.position.set(0, -1.52, 0.36);
    rightLegRig.add(rightFoot);
    group.add(rightLegRig);

    const shoulderCrystal = createCone(0.24, 0.9, accentMat, 5);
    shoulderCrystal.position.set(-0.9, WORLD_Y + 3.24, -0.18);
    shoulderCrystal.rotation.z = Math.PI * 0.56;
    const shoulderCrystalB = shoulderCrystal.clone();
    shoulderCrystalB.position.x = 0.9;
    shoulderCrystalB.rotation.z *= -1;
    group.add(shoulderCrystal, shoulderCrystalB);

    const leftEye = createSphere(0.12, eyeMat, 10, 8);
    leftEye.position.set(-0.28, WORLD_Y + 3.82, 0.76);
    const rightEye = createSphere(0.12, eyeMat, 10, 8);
    rightEye.position.set(0.28, WORLD_Y + 3.82, 0.76);
    group.add(leftEye, rightEye);

    group.userData = {
      type: "brute",
      torso,
      head,
      leftArmRig,
      rightArmRig,
      leftLegRig,
      rightLegRig,
      leftHand: leftFist,
      rightHand: rightFist,
      leftFoot,
      rightFoot,
      bobSeed: 2.6,
    };
    group.scale.setScalar(1.02);
    return setGroupShadows(group);
  }

  buildEnemyModel(enemy = null) {
    const group = new THREE.Group();
    const theme = this.currentLevel.theme;
    const bodyMat = makeMaterial(theme.enemy, {
      emissive: theme.enemy,
      emissiveIntensity: 0.16,
    });
    const darkMat = makeMaterial(theme.enemyDark, {
      emissive: theme.enemyDark,
      emissiveIntensity: 0.08,
    });
    const toothMat = makeMaterial("#fffbe0");

    const bossScale = enemy?.boss ? (this.areaIndex === 4 ? 2.55 : 2.25) : 1;
    const body = createSphere(0.92, bodyMat);
    body.position.set(0, WORLD_Y + 1.15, 0);
    group.add(body);

    const jaw = createBox(1.25, 0.5, 0.95, darkMat);
    jaw.position.set(0, WORLD_Y + 0.8, 0.82);
    group.add(jaw);

    const head = createSphere(0.76, bodyMat);
    head.position.set(0, WORLD_Y + 1.8, 0.24);
    group.add(head);

    const leftSpike = createCone(0.18, 0.7, darkMat, 5);
    leftSpike.position.set(-0.36, WORLD_Y + 2.55, -0.08);
    leftSpike.rotation.z = Math.PI * 0.2;
    const rightSpike = createCone(0.18, 0.7, darkMat, 5);
    rightSpike.position.set(0.36, WORLD_Y + 2.55, -0.08);
    rightSpike.rotation.z = -Math.PI * 0.2;
    group.add(leftSpike, rightSpike);

    const leftEye = createSphere(0.09, makeMaterial("#fff7b5"));
    leftEye.position.set(-0.18, WORLD_Y + 1.95, 0.78);
    const rightEye = createSphere(0.09, makeMaterial("#fff7b5"));
    rightEye.position.set(0.18, WORLD_Y + 1.95, 0.78);
    group.add(leftEye, rightEye);

    for (const tooth of [-0.32, 0, 0.32]) {
      const mesh = createCone(0.08, 0.22, toothMat, 4);
      mesh.position.set(tooth, WORLD_Y + 0.68, 1.18);
      mesh.rotation.x = Math.PI;
      group.add(mesh);
    }

    if (enemy?.boss) {
      const crownMat = makeMaterial(theme.portal, {
        emissive: theme.portal,
        emissiveIntensity: 0.32,
      });
      for (const offset of [-0.42, 0, 0.42]) {
        const crownSpike = createCone(0.14, 0.62, crownMat, 5);
        crownSpike.position.set(offset, WORLD_Y + 2.92 + Math.abs(offset) * 0.18, -0.06);
        group.add(crownSpike);
      }
    }

    group.userData = { body, head, jaw, bobSeed: Math.random() * 10, baseScale: bossScale };
    group.scale.setScalar(bossScale);
    return setGroupShadows(group);
  }

  updatePlayerVisual(dt) {
    if (!this.playerVisual || !this.player) {
      return;
    }

    const refs = this.playerVisual.userData;
    const moveAmount = this.player.moveAmount ?? 0;
    const forwardMove = this.player.moveForward ?? 0;
    const strafeMove = this.player.moveStrafe ?? 0;
    const gaitStrength = Math.min(1, Math.max(Math.abs(forwardMove), Math.abs(strafeMove) * 0.78));
    const walkSpeed = 3.8 + gaitStrength * 7.4;
    const walkCycle = this.time * walkSpeed + refs.bobSeed;
    const swing = Math.sin(walkCycle);
    const bounce = Math.abs(Math.cos(walkCycle));
    const bob = Math.sin(this.time * 3.4 + refs.bobSeed) * 0.018 * (0.35 + gaitStrength);
    const airborne = this.player.isGrounded
      ? 0
      : clamp((this.player.y + Math.max(0, this.player.verticalVelocity) * 0.04) / 1.8, 0, 1);
    const landingMix =
      this.player.landedAt > -Infinity ? clamp(1 - (this.time - this.player.landedAt) / 0.16, 0, 1) : 0;
    this.playerVisual.position.set(this.player.x, 0, this.player.z);
    this.playerVisual.rotation.y = Math.atan2(this.player.facing.x, this.player.facing.z);
    this.playerVisual.position.y = this.player.y + bob + bounce * gaitStrength * 0.05 - landingMix * 0.14;

    const attackDuration = this.player.attackAnimDuration ?? 0.26;
    const specialDuration = this.player.specialAnimDuration ?? 0.36;
    const attackRemaining = Math.max(0, this.player.attackAnimUntil - this.time);
    const specialRemaining = Math.max(0, this.player.specialAnimUntil - this.time);
    const attackProgress = attackRemaining > 0 ? 1 - attackRemaining / attackDuration : 0;
    const specialProgress = specialRemaining > 0 ? 1 - specialRemaining / specialDuration : 0;
    const attackWindup = attackRemaining > 0 ? Math.max(0, 1 - attackProgress / 0.34) : 0;
    const attackStrike =
      attackRemaining > 0 ? Math.sin(Math.max(0, (attackProgress - 0.18) / 0.82) * Math.PI) : 0;
    const specialMix = specialRemaining > 0 ? Math.sin(specialProgress * Math.PI) : 0;
    const attackLunge = attackStrike * (1 - airborne * 0.75) * 0.28;
    this.playerVisual.position.x += this.player.facing.x * attackLunge;
    this.playerVisual.position.z += this.player.facing.z * attackLunge;
    this.playerVisual.position.y += attackStrike * 0.04;

    if (refs.leftWing && refs.rightWing) {
      const wingFlap = 0.14 + gaitStrength * 0.08 + airborne * 0.2 + specialMix * 0.24;
      refs.leftWing.rotation.z = Math.PI * 0.22 + Math.sin(this.time * 7.2) * wingFlap + attackStrike * 0.12;
      refs.rightWing.rotation.z =
        -Math.PI * 0.22 - Math.sin(this.time * 7.2) * wingFlap - attackStrike * 0.2 + attackWindup * 0.14;
      refs.leftWing.rotation.x = 0.18 + airborne * 0.18 + attackWindup * 0.04;
      refs.rightWing.rotation.x = 0.18 + airborne * 0.18 + attackStrike * 0.08;
    }

    if (refs.leftArmRig && refs.rightArmRig) {
      refs.leftArmRig.rotation.z =
        (refs.leftArmRig.userData.baseZ ?? 0) + strafeMove * 0.16 - swing * forwardMove * 0.04 + attackWindup * 0.08;
      refs.rightArmRig.rotation.z =
        (refs.rightArmRig.userData.baseZ ?? 0) +
        strafeMove * 0.16 +
        swing * forwardMove * 0.04 -
        attackStrike * 0.24 +
        attackWindup * 0.14;
      refs.leftArmRig.rotation.x =
        -swing * forwardMove * 0.42 -
        airborne * 0.36 +
        specialMix * 0.34 -
        attackWindup * 0.22 -
        attackStrike * 0.18 -
        strafeMove * 0.18;
      refs.rightArmRig.rotation.x =
        swing * forwardMove * 0.42 +
        attackStrike * 1.75 -
        attackWindup * 0.72 +
        specialMix * 0.72 -
        airborne * 0.12 +
        strafeMove * 0.18;
    }

    if (refs.rightWeapon) {
      refs.rightWeapon.rotation.x = Math.PI / 2 + attackStrike * 0.82 - attackWindup * 0.26 + specialMix * 0.52;
    }

    if (refs.leftLegRig && refs.rightLegRig) {
      const airLegPose = airborne * 0.8;
      refs.leftLegRig.rotation.z =
        (refs.leftLegRig.userData.baseZ ?? 0) - strafeMove * 0.14 + swing * forwardMove * 0.04;
      refs.rightLegRig.rotation.z =
        (refs.rightLegRig.userData.baseZ ?? 0) - strafeMove * 0.14 - swing * forwardMove * 0.04;
      refs.leftLegRig.rotation.x =
        airLegPose + swing * forwardMove * 0.58 + bounce * Math.abs(strafeMove) * 0.18 - attackStrike * 0.18;
      refs.rightLegRig.rotation.x =
        airLegPose - swing * forwardMove * 0.58 + bounce * Math.abs(strafeMove) * 0.18 - attackStrike * 0.18;
    }

    if (refs.leftFoot && refs.rightFoot) {
      refs.leftFoot.rotation.x = -swing * forwardMove * 0.18 + airborne * 0.26;
      refs.rightFoot.rotation.x = swing * forwardMove * 0.18 + airborne * 0.26 - attackStrike * 0.12;
      refs.leftFoot.rotation.z = strafeMove * 0.12;
      refs.rightFoot.rotation.z = strafeMove * 0.12;
    }

    if (refs.tail) {
      refs.tail.rotation.x = (refs.tail.userData.baseX ?? Math.PI * 0.62) + Math.sin(this.time * 5.6) * 0.18;
      refs.tail.rotation.y = strafeMove * 0.12 + swing * forwardMove * 0.08;
    }

    if (refs.torso) {
      refs.torso.rotation.z = -strafeMove * 0.12 + swing * forwardMove * 0.04 + attackStrike * 0.1 - attackWindup * 0.08;
      refs.torso.rotation.x =
        -Math.abs(forwardMove) * 0.03 - airborne * 0.1 + specialMix * 0.08 - attackStrike * 0.24 + attackWindup * 0.14;
      refs.torso.rotation.y = attackWindup * 0.12 - attackStrike * 0.16;
    }

    if (refs.head) {
      refs.head.rotation.x = -airborne * 0.12 + attackWindup * 0.1 - attackStrike * 0.06;
      refs.head.rotation.z = -strafeMove * 0.03 + swing * forwardMove * 0.02 - attackStrike * 0.04;
    }

    const flash = this.time < this.player.hurtUntil ? 1.12 : 1;
    this.playerVisual.scale.set(
      (1 + landingMix * 0.04 - airborne * 0.02) * flash,
      (1 - landingMix * 0.05 + airborne * 0.03) * flash,
      (1 + landingMix * 0.04 - airborne * 0.02) * flash
    );
  }

  updateEnemyVisuals() {
    for (const enemy of this.enemies) {
      const mesh = this.enemyMeshes.get(enemy.id);
      if (!mesh) {
        continue;
      }

      mesh.position.set(enemy.x, 0, enemy.z);
      mesh.rotation.y = Math.atan2(enemy.facing.x, enemy.facing.z);
      mesh.position.y = Math.sin(this.time * 4 + mesh.userData.bobSeed) * 0.06;

      const attackDuration = enemy.boss ? 0.34 : 0.2;
      const attackMix = Math.max(0, enemy.attackAnimUntil - this.time) / attackDuration;
      mesh.userData.jaw.rotation.x = -attackMix * (enemy.boss ? 0.75 : 0.5);

      const flash = this.time < enemy.hitFlashUntil ? 1.14 : 1;
      mesh.scale.setScalar((mesh.userData.baseScale ?? 1) * flash);
    }
  }

  updateLevelVisuals(dt) {
    if (!this.levelVisuals) {
      return;
    }

    if (this.levelVisuals.keyGroup?.visible) {
      this.levelVisuals.keyGroup.rotation.y += dt * 2.2;
      this.levelVisuals.keyGroup.position.y = WORLD_Y + 3.2 + Math.sin(this.time * 2.6) * 0.24;
    }

    if (this.levelVisuals.gateBars) {
      const targetY = this.gateOpen ? 6.2 : 0;
      this.levelVisuals.gateBars.position.y += (targetY - this.levelVisuals.gateBars.position.y) * 0.1;
    }

    if (this.levelVisuals.portal) {
      this.levelVisuals.portal.rotation.y += dt * 0.4;
    }

    if (this.levelVisuals.portalCore) {
      this.levelVisuals.portalCore.material.opacity = this.exitActive ? 0.68 : 0.2;
    }

    if (this.levelVisuals.portalLight) {
      this.levelVisuals.portalLight.intensity = this.exitActive ? 1.8 : 0.18;
    }

    if (this.levelVisuals.water) {
      this.levelVisuals.water.material.emissiveIntensity = 0.12 + Math.sin(this.time * 1.1) * 0.03;
    }

    if (this.levelVisuals.waterShimmer) {
      const baseOpacity = this.levelVisuals.waterShimmer.userData.baseOpacity ?? 0.14;
      this.levelVisuals.waterShimmer.material.opacity =
        baseOpacity * 0.75 + (Math.sin(this.time * 0.9) + 1) * 0.02;
      this.levelVisuals.waterShimmer.rotation.z = Math.sin(this.time * 0.18) * 0.06;
    }

    if (this.levelVisuals.foamRings) {
      for (const ring of this.levelVisuals.foamRings) {
        ring.rotation.z += dt * ring.userData.spin;
        ring.scale.setScalar(ring.userData.baseScale + Math.sin(this.time * 1.7 + ring.userData.phase) * 0.04);
      }
    }

    if (this.levelVisuals.rotatingProps) {
      for (const prop of this.levelVisuals.rotatingProps) {
        prop.rotation.y += dt * (prop.userData.spin ?? 0.18);
        prop.position.y = Math.sin(this.time * 1.8 + (prop.userData.spin ?? 0.18) * 10) * 0.06;
      }
    }
  }

  updateUi() {
    this.ui.state.textContent = this.state[0].toUpperCase() + this.state.slice(1);
    this.ui.character.textContent = this.player
      ? `${this.player.name} - ${this.player.title}`
      : "None";
    this.ui.area.textContent = this.player
      ? `${Math.min(this.areaIndex + 1, TOTAL_AREAS)} / ${TOTAL_AREAS}`
      : `0 / ${TOTAL_AREAS}`;
    this.ui.enemies.textContent = String(this.enemies.length);
    this.ui.coins.textContent = String(this.progress.coins);
    this.ui.key.textContent = this.keyStatusText;
    this.ui.reward.textContent = this.currentStatusText;

    if (!this.player) {
      this.ui.healthText.textContent = "0 / 0";
      this.ui.healthFill.style.width = "0%";
      this.setCooldownMeter(this.ui.basicFill, this.ui.basicText, 1, 1, true);
      this.setCooldownMeter(this.ui.specialFill, this.ui.specialText, 1, 1, true);
      return;
    }

    const healthRatio = this.player.health / this.player.maxHealth;
    this.ui.healthText.textContent = `${Math.ceil(this.player.health)} / ${this.player.maxHealth}`;
    this.ui.healthFill.style.width = `${healthRatio * 100}%`;

    const basicRemaining = this.player.basicCooldownRemaining(this.time);
    this.setCooldownMeter(
      this.ui.basicFill,
      this.ui.basicText,
      basicRemaining,
      this.player.basicAttack.cooldown
    );

    const specialRemaining = this.player.specialCooldownRemaining(this.time);
    this.setCooldownMeter(
      this.ui.specialFill,
      this.ui.specialText,
      specialRemaining,
      this.player.special.cooldown
    );
  }

  setCooldownMeter(fillElement, textElement, remaining, total, forceReady = false) {
    if (forceReady || remaining <= 0) {
      fillElement.style.width = "100%";
      textElement.textContent = "Ready";
      return;
    }

    const progress = 1 - remaining / total;
    fillElement.style.width = `${progress * 100}%`;
    textElement.textContent = `${remaining.toFixed(1)}s`;
  }
}

function populateInfoButtons(container, items, className) {
  container.innerHTML = "";

  for (const item of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `${className}${item.disabled ? " is-disabled" : ""}${item.active ? " is-active" : ""}${
      item.selected ? " is-selected" : ""
    }${item.locked ? " is-locked" : ""}`;
    button.disabled = Boolean(item.disabled);
    button.innerHTML = `
      <span class="character-meta">${item.meta ?? ""}</span>
      <strong>${item.label}</strong>
      <span>${item.description ?? ""}</span>
    `;
    button.addEventListener("click", () => {
      if (!item.disabled) {
        item.onClick?.();
      }
    });
    container.appendChild(button);
  }
}

export function populateActionButtons(container, items) {
  populateInfoButtons(container, items, "menu-button");
}

export function populateSaveSlotButtons(container, items) {
  populateInfoButtons(
    container,
    items.map((item) => ({
      label: item.title,
      meta: item.meta,
      description: item.description,
      active: item.active,
      disabled: item.disabled,
      onClick: item.onClick,
    })),
    "save-button"
  );
}

export function populateLevelButtons(container, items) {
  populateInfoButtons(
    container,
    items.map((item) => ({
      label: item.label,
      meta: item.meta,
      description: item.description,
      selected: item.selected,
      locked: item.locked,
      disabled: item.locked,
      onClick: item.onClick,
    })),
    "level-button"
  );
}

export function populateCharacterButtons(container, options) {
  container.innerHTML = "";
  const { progress, onPlay, onUnlock } = options;

  for (const character of CHARACTER_LIST) {
    const unlocked = progress.unlockedCharacters.includes(character.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `character-button${unlocked ? "" : " is-locked"}`;
    button.style.borderColor = `${character.accent}44`;
    button.style.background = `linear-gradient(180deg, ${character.color}26, rgba(255,255,255,0.04))`;
    button.innerHTML = `
      <span class="character-chip" style="background: linear-gradient(135deg, ${character.color}, ${character.secondaryColor});"></span>
      <span class="character-meta">${unlocked ? "Unlocked" : `${character.cost} Coins`}</span>
      <strong>${character.name}</strong>
      <span>${character.title}</span>
      <span>${character.description}</span>
      <span>${character.basicAttack.name} + ${character.special.name}</span>
    `;
    button.addEventListener("click", () => {
      if (unlocked) {
        onPlay(character.id);
      } else {
        onUnlock(character.id);
      }
    });
    container.appendChild(button);
  }
}
