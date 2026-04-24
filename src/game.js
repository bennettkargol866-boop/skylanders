import * as THREE from "../node_modules/three/build/three.module.js";
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
const SAVE_KEY = "skylanders_arena_save_v3";

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
    this.camera.position.set(-18, 22, 24);
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
    this.progress = this.loadProgress();
    this.areaIndex = 0;
    this.currentLevel = null;
    this.selectedCharacter = null;
    this.player = null;
    this.enemies = [];
    this.pulses = [];
    this.projectiles = [];
    this.coinPickups = [];
    this.enemyMeshes = new Map();
    this.pendingButtonAction = null;

    this.playerVisual = null;
    this.attackPreview = null;
    this.aimReticle = null;
    this.levelVisuals = null;
    this.hasKey = false;
    this.gateOpen = false;
    this.exitActive = false;
    this.backWaveSpawned = false;
    this.currentStatusText = "Select a hero to begin";
    this.keyStatusText = "Missing";

    this.handleFrame = this.handleFrame.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.bindKeyboard();
    this.bindPointer();
  }

  init() {
    this.showMenu();
    this.handleResize();
    window.addEventListener("resize", this.handleResize);
    window.requestAnimationFrame(this.handleFrame);
  }

  loadProgress() {
    const fallback = {
      coins: 0,
      unlockedCharacters: ["dragon"],
      bestArea: 0,
      lastCharacterId: "dragon",
    };

    if (typeof window === "undefined" || !window.localStorage) {
      return fallback;
    }

    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) {
        return fallback;
      }

      const parsed = JSON.parse(raw);
      return {
        coins: Number.isFinite(parsed.coins) ? parsed.coins : fallback.coins,
        unlockedCharacters: Array.isArray(parsed.unlockedCharacters)
          ? parsed.unlockedCharacters.filter((value) => CHARACTER_DEFS[value])
          : fallback.unlockedCharacters,
        bestArea: Number.isFinite(parsed.bestArea) ? parsed.bestArea : fallback.bestArea,
        lastCharacterId: CHARACTER_DEFS[parsed.lastCharacterId]
          ? parsed.lastCharacterId
          : fallback.lastCharacterId,
      };
    } catch {
      return fallback;
    }
  }

  saveProgress() {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }

    window.localStorage.setItem(SAVE_KEY, JSON.stringify(this.progress));
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
      this.showMenu();
      return false;
    }

    this.progress.coins -= character.cost;
    this.progress.unlockedCharacters = [...this.progress.unlockedCharacters, characterId];
    this.progress.lastCharacterId = characterId;
    this.currentStatusText = `${character.name} unlocked. Progress auto-saved.`;
    this.saveProgress();
    this.showMenu();
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

  handleResize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || VIEWPORT.width));
    const height = Math.max(1, Math.round(rect.height || VIEWPORT.height));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  startRun(characterId) {
    if (!this.isCharacterUnlocked(characterId)) {
      return;
    }

    this.selectedCharacter = CHARACTER_DEFS[characterId];
    this.progress.lastCharacterId = characterId;
    this.saveProgress();
    this.player = new Player(this.selectedCharacter);
    this.areaIndex = 0;
    this.time = 0;
    this.startArea();
  }

  startArea() {
    this.currentLevel = getAreaConfig(this.areaIndex);
    this.resetAreaState();
    this.buildLevelScene();
    this.spawnPlayerVisual();
    this.spawnFrontWave();

    const { start } = this.currentLevel.layout;
    this.player.place(start.x, start.z);
    if (this.areaIndex === 0) {
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

    this.backWaveSpawned = true;
  }

  spawnEnemy(spawn, side) {
    const spawnPoint = this.findEnemySpawnPosition(spawn, side, 1);
    const enemy = new Enemy({
      x: spawnPoint.x,
      z: spawnPoint.z,
      health: this.currentLevel.enemyHealth,
      speed: this.currentLevel.enemySpeed,
      damage: this.currentLevel.enemyDamage,
      attackRange: this.currentLevel.enemyAttackRange,
      aggroRange: this.currentLevel.enemyAggroRange,
      side,
    });

    this.enemies.push(enemy);
    const mesh = this.buildEnemyModel(enemy);
    this.enemyMeshes.set(enemy.id, mesh);
    this.characterGroup.add(mesh);
  }

  showMenu() {
    this.state = "menu";
    if (!this.currentStatusText || this.currentStatusText === "Select a hero to begin") {
      this.currentStatusText = "Choose a hero to enter the floating islands.";
    }
    this.keyStatusText = "Missing";
    this.pendingButtonAction = null;
    populateCharacterButtons(this.ui.characterGrid, {
      progress: this.progress,
      onPlay: (characterId) => this.startRun(characterId),
      onUnlock: (characterId) => this.unlockCharacter(characterId),
    });
    this.showOverlay({
      kicker: "Sky Gate",
      title: "Choose a Hero",
      text: `Coins: ${this.progress.coins}. Clear the front half, find the key, unlock the gate, and use coin drops to unlock more heroes. Progress auto-saves locally.`,
      showCharacters: true,
      actionLabel: null,
    });
    this.updateUi();
  }

  showClearScreen() {
    const reward = this.applyAreaReward();
    this.progress.bestArea = Math.max(this.progress.bestArea, this.areaIndex + 1);
    this.saveProgress();
    const isFinalArea = this.areaIndex >= TOTAL_AREAS - 1;

    if (isFinalArea) {
      this.state = "victory";
      this.currentStatusText = reward;
      this.showOverlay({
        kicker: "Victory",
        title: "Portal Complete",
        text: `${reward} You cleared all ${TOTAL_AREAS} island gates. Press the button or Enter to run it again.`,
        showCharacters: false,
        actionLabel: "Play Again",
        action: () => this.startRun(this.selectedCharacter.id),
      });
      return;
    }

    this.state = "clear";
    this.currentStatusText = reward;
    this.showOverlay({
      kicker: "Gate Cleared",
      title: "Next Island Unlocked",
      text: `${reward} Press the button or Enter to fly to the next area.`,
      showCharacters: false,
      actionLabel: "Next Area",
      action: () => {
        this.areaIndex += 1;
        this.startArea();
      },
    });
  }

  applyAreaReward() {
    if (this.selectedCharacter.id === "dragon") {
      this.player.basicAttack.damage += 1;
      this.player.speed += 0.03;
      return "Dragon reward: +1 basic damage and +0.03 movement speed.";
    }

    if (this.selectedCharacter.id === "reef") {
      this.player.maxHealth += 2;
      this.player.special.damage += 1;
      this.player.heal(8);
      return "Lagoon reward: +2 max health and +1 special damage.";
    }

    this.player.maxHealth += 3;
    this.player.special.damage += 1;
    this.player.heal(10);
    return "Magma reward: +3 max health and +1 special damage.";
  }

  showDefeatScreen() {
    this.state = "defeat";
    this.currentStatusText = "The island repelled your hero.";
    this.showOverlay({
      kicker: "Defeat",
      title: "The Gate Stays Shut",
      text: "Press R or use the button below to restart the current run with the same hero.",
      showCharacters: false,
      actionLabel: "Restart Run",
      action: () => this.startRun(this.selectedCharacter.id),
    });
  }

  showOverlay({ kicker, title, text, showCharacters, actionLabel, action }) {
    this.ui.overlay.classList.add("is-visible");
    this.ui.overlayKicker.textContent = kicker;
    this.ui.overlayTitle.textContent = title;
    this.ui.overlayText.textContent = text;
    this.ui.characterGrid.classList.toggle("hidden", !showCharacters);

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
  }

  hideOverlay() {
    this.pendingButtonAction = null;
    this.ui.overlay.classList.remove("is-visible");
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
      this.enemyMeshes.delete(enemy.id);
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
    this.updateAttackPreview();
    this.updateAimReticle();
    this.updatePlayerVisual(dt);
    this.updateEnemyVisuals(dt);
    this.updateLevelVisuals(dt);
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(dt) {
    if (!this.player) {
      this.camera.lookAt(0, 2, 0);
      return;
    }

    const targetPosition = new THREE.Vector3(this.player.x - 17, 22 + this.player.y * 0.18, this.player.z + 22);
    this.camera.position.lerp(targetPosition, 1 - Math.exp(-dt * 4));
    this.cameraTarget.set(this.player.x + 5, WORLD_Y + 1.8 + this.player.y * 0.22, this.player.z);
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
      this.currentStatusText = "Find the key on the side platform to unlock the back half.";
      return;
    }

    if (!this.gateOpen) {
      this.currentStatusText = "Take the key to the main gate.";
      return;
    }

    if (!this.exitActive) {
      this.currentStatusText = `Back half unlocked. ${this.enemies.length} enemies remain.`;
      return;
    }

    this.currentStatusText = "Portal active. Step into it to clear the area.";
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

  spawnAttackPreview() {
    if (this.attackPreview) {
      this.effectsGroup.remove(this.attackPreview);
      this.attackPreview = null;
    }

    if (!this.player) {
      return;
    }

    const reach = this.player.basicAttack.range + this.player.basicAttack.radius;
    const thetaLength = THREE.MathUtils.degToRad(this.player.basicAttack.arcDegrees ?? 360);
    const thetaStart = Math.PI / 2 - thetaLength / 2;
    const innerRadius = Math.max(this.player.radius * 0.34, reach * 0.08);
    const material = new THREE.MeshBasicMaterial({
      color: this.player.basicAttack.color,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.attackPreview = new THREE.Mesh(
      new THREE.RingGeometry(innerRadius, reach, 40, 1, thetaStart, thetaLength),
      material
    );
    this.attackPreview.rotation.x = -Math.PI / 2;
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
    this.attackPreview.material.opacity =
      0.08 + cooldownRatio * 0.08 + attackFocus * 0.16 + (Math.sin(this.time * 5.2) + 1) * 0.015;
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
      const maxDistance = projectile.radius + enemy.radius;
      if (distanceBetween(projectile, enemy) <= maxDistance) {
        const hitDirection = normalizeVector(enemy.x - projectile.x, enemy.z - projectile.z);
        enemy.takeDamage(projectile.damage, hitDirection, this.time);
        projectile.alive = false;
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
    this.scene.fog = new THREE.Fog(theme.fog, 40, 135);
    this.hemiLight.color.set(theme.fog);
    this.hemiLight.groundColor.set(theme.cliffDark);

    const visuals = {};
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
        opacity: 0.78,
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
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    waterShimmer.rotation.x = -Math.PI / 2;
    waterShimmer.position.y = 0.22;
    this.levelGroup.add(waterShimmer);
    visuals.waterShimmer = waterShimmer;

    for (const cloud of [
      { x: -20, y: 18, z: -32, scale: 1.2 },
      { x: 10, y: 22, z: -40, scale: 1.4 },
      { x: 32, y: 17, z: -20, scale: 1.05 },
    ]) {
      this.levelGroup.add(this.buildCloud(theme, cloud));
    }

    for (const island of [
      { x: -6, z: -30, width: 12, depth: 8, scale: 0.9 },
      { x: 24, z: -32, width: 14, depth: 10, scale: 1 },
      { x: 55, z: 30, width: 16, depth: 11, scale: 1.05 },
    ]) {
      this.levelGroup.add(this.buildBackdropIsland(theme, island));
    }

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

    const gate = this.buildGate(theme, layout.gate);
    this.levelGroup.add(gate.group);
    visuals.gateBars = gate.bars;

    const portal = this.buildPortal(theme, layout.exit);
    this.levelGroup.add(portal.group);
    visuals.portal = portal.group;
    visuals.portalCore = portal.core;
    visuals.portalLight = portal.light;

    visuals.foamRings = [];
    for (const foam of [
      { x: 30, z: -20, scale: 1.1, spin: 0.2 },
      { x: 45, z: 13, scale: 0.95, spin: -0.16 },
      { x: 57, z: -19, scale: 1.3, spin: 0.12 },
    ]) {
      const ring = this.buildFoamRing(foam);
      visuals.foamRings.push(ring);
      this.levelGroup.add(ring);
    }

    for (const position of [
      { x: -31, z: -12 },
      { x: -13, z: 13 },
      { x: 18, z: -13 },
      { x: 34, z: 15 },
      { x: 58, z: 15 },
    ]) {
      this.levelGroup.add(this.buildCrystal(theme, position.x, position.z));
    }

    for (const tower of [
      { x: 0.8, z: -4.6 },
      { x: 0.8, z: 4.6 },
      { x: 6.2, z: -4.6 },
      { x: 6.2, z: 4.6 },
    ]) {
      this.levelGroup.add(this.buildTorch(theme, tower.x, tower.z));
    }

    for (const palm of [
      { x: -40, z: -7, scale: 1.1 },
      { x: -35, z: 10, scale: 0.9 },
      { x: -2, z: -10, scale: 1.05 },
      { x: 8, z: 11, scale: 0.88 },
      { x: 19, z: 14, scale: 0.94 },
      { x: 25, z: 21, scale: 1.08 },
      { x: 33, z: 9, scale: 0.98 },
      { x: 57, z: 12, scale: 1.02 },
      { x: 66, z: -10, scale: 1.14 },
    ]) {
      this.levelGroup.add(this.buildPalmTree(theme, palm));
    }

    for (const rock of [
      { x: -5, z: 24, scale: 1.05 },
      { x: 30, z: -20, scale: 1.35 },
      { x: 45, z: 13, scale: 1.15 },
      { x: 57, z: -19, scale: 1.55 },
    ]) {
      this.levelGroup.add(this.buildLagoonRock(theme, rock));
    }

    for (const patch of [
      { x: -36, z: -8 },
      { x: -2, z: 10 },
      { x: 19, z: 18 },
      { x: 55, z: -11 },
    ]) {
      this.levelGroup.add(this.buildFlowerPatch(theme, patch.x, patch.z));
    }
  }

  getRectPlatformStyle(rect, theme) {
    if (rect.surfaceType === "wood") {
      return {
        surface: theme.wood,
        side: theme.woodDark,
        under: theme.stoneDark,
        accent: theme.gate,
        depth: rect.depth ?? 3.8,
      };
    }

    return {
      surface: theme.grass,
      sand: theme.sand ?? theme.stone,
      side: theme.cliff,
      under: theme.cliffDark,
      depth: rect.depth ?? 5.8,
    };
  }

  createPlatform(rect, theme, options = {}) {
    if (rect.surfaceType === "wood") {
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

    const support = createBox(
      alongX ? width * 0.94 : width * 0.68,
      depthSize,
      alongX ? depth * 0.68 : depth * 0.94,
      makeMaterial(options.under ?? theme.stoneDark)
    );
    support.position.set(centerX, -depthSize / 2 + 0.05, centerZ);
    group.add(support);

    const deck = createBox(
      alongX ? width * 0.98 : width * 0.84,
      0.34,
      alongX ? depth * 0.84 : depth * 0.98,
      makeMaterial(deckColor)
    );
    deck.position.set(centerX, 0.78, centerZ);
    group.add(deck);

    const plankCount = Math.max(4, Math.floor(length / 1.5));
    const plankLength = length / plankCount;
    for (let index = 0; index < plankCount; index += 1) {
      const offset = -length / 2 + plankLength * (index + 0.5);
      const plank = createBox(
        alongX ? plankLength * 0.84 : lane * 0.84,
        0.2,
        alongX ? lane * 0.82 : plankLength * 0.84,
        makeMaterial(index % 2 === 0 ? deckColor : options.side ?? theme.woodDark)
      );
      plank.position.set(centerX + (alongX ? offset : 0), 1, centerZ + (alongX ? 0 : offset));
      group.add(plank);
    }

    const railOffset = lane * 0.34;
    for (let index = 0; index <= plankCount; index += 2) {
      const offset = -length / 2 + Math.min(index, plankCount) * plankLength;
      const leftPost = createCylinder(0.12, 0.14, 1.15, makeMaterial(options.side ?? theme.woodDark), 6);
      const rightPost = createCylinder(0.12, 0.14, 1.15, makeMaterial(options.side ?? theme.woodDark), 6);
      leftPost.position.set(
        centerX + (alongX ? offset : -railOffset),
        WORLD_Y + 0.55,
        centerZ + (alongX ? -railOffset : offset)
      );
      rightPost.position.set(
        centerX + (alongX ? offset : railOffset),
        WORLD_Y + 0.55,
        centerZ + (alongX ? railOffset : offset)
      );
      group.add(leftPost, rightPost);
    }

    const upperRail = createCylinder(0.06, 0.06, length * 0.94, makeMaterial(railColor), 6);
    const lowerRail = createCylinder(0.05, 0.05, length * 0.94, makeMaterial(railColor), 6);
    if (alongX) {
      upperRail.rotation.z = Math.PI / 2;
      lowerRail.rotation.z = Math.PI / 2;
      upperRail.position.set(centerX, WORLD_Y + 1.1, centerZ - railOffset);
      lowerRail.position.set(centerX, WORLD_Y + 1.1, centerZ + railOffset);
    } else {
      upperRail.rotation.x = Math.PI / 2;
      lowerRail.rotation.x = Math.PI / 2;
      upperRail.position.set(centerX - railOffset, WORLD_Y + 1.1, centerZ);
      lowerRail.position.set(centerX + railOffset, WORLD_Y + 1.1, centerZ);
    }
    group.add(upperRail, lowerRail);

    return group;
  }

  buildBackdropIsland(theme, island) {
    const rect = {
      minX: island.x - island.width / 2,
      maxX: island.x + island.width / 2,
      minZ: island.z - island.depth / 2,
      maxZ: island.z + island.depth / 2,
    };
    const group = this.createPlatform(rect, theme, {
      surface: theme.grass,
      side: theme.cliff,
      under: theme.cliffDark,
      depth: 4.2,
    });
    group.scale.setScalar(island.scale);
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
    const material = makeMaterial(theme.stone);

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
        color: "#ecffff",
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(foam.x, 0.24, foam.z);
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
      opacity: 0.72,
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

  buildGate(theme, position) {
    const group = new THREE.Group();
    const stone = makeMaterial(theme.gate);
    const dark = makeMaterial(theme.stoneDark);

    const leftBase = createBox(1.8, 5.2, 1.8, dark);
    leftBase.position.set(-1.5, WORLD_Y + 2.6, -3.6);
    const rightBase = createBox(1.8, 5.2, 1.8, dark);
    rightBase.position.set(-1.5, WORLD_Y + 2.6, 3.6);
    const leftCap = createBox(1.4, 4.6, 1.4, stone);
    leftCap.position.set(-1.5, WORLD_Y + 2.6, -3.6);
    const rightCap = createBox(1.4, 4.6, 1.4, stone);
    rightCap.position.set(-1.5, WORLD_Y + 2.6, 3.6);
    group.add(leftBase, rightBase, leftCap, rightCap);

    const arch = createBox(2.2, 1.2, 9.2, stone);
    arch.position.set(-1.5, WORLD_Y + 5.2, 0);
    group.add(arch);

    const bars = new THREE.Group();
    for (let index = 0; index < 5; index += 1) {
      const bar = createBox(0.32, 3.8, 0.28, makeMaterial(theme.gate));
      bar.position.set(0, WORLD_Y + 2.2, -2.4 + index * 1.2);
      bars.add(bar);
    }
    const crossbar = createBox(0.32, 0.5, 6.5, makeMaterial(theme.gate));
    crossbar.position.set(0, WORLD_Y + 3.8, 0);
    bars.add(crossbar);
    bars.position.x = -0.1;
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

  buildCrystal(theme, x, z) {
    const group = new THREE.Group();
    const crystal = createCone(
      0.7,
      2.6,
      makeMaterial(theme.crystal, {
        emissive: theme.crystal,
        emissiveIntensity: 0.18,
      }),
      6
    );
    crystal.position.y = WORLD_Y + 1.9;
    group.add(crystal);

    const base = createCylinder(0.8, 1.1, 0.8, makeMaterial(theme.stoneDark));
    base.position.y = WORLD_Y + 0.4;
    group.add(base);

    group.position.set(x, 0, z);
    group.rotation.y = (x + z) * 0.18;
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

  spawnPlayerVisual() {
    if (!this.player) {
      return;
    }

    this.playerVisual = this.buildHeroModel(this.selectedCharacter);
    this.characterGroup.add(this.playerVisual);
    this.spawnAttackPreview();
    this.spawnAimReticle();
  }

  buildHeroModel(character) {
    if (character.form === "dragon") {
      return this.buildDragonHero(character);
    }

    if (character.form === "shark") {
      return this.buildSharkHero(character);
    }

    return this.buildBruteHero(character);
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

  buildEnemyModel() {
    const group = new THREE.Group();
    const theme = this.currentLevel.theme;
    const bodyMat = makeMaterial(theme.enemy);
    const darkMat = makeMaterial(theme.enemyDark);
    const toothMat = makeMaterial("#fffbe0");

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

    group.userData = { body, head, jaw, bobSeed: Math.random() * 10 };
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

      const attackMix = Math.max(0, enemy.attackAnimUntil - this.time) / 0.2;
      mesh.userData.jaw.rotation.x = -attackMix * 0.5;

      const flash = this.time < enemy.hitFlashUntil ? 1.14 : 1;
      mesh.scale.setScalar(flash);
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
      this.levelVisuals.waterShimmer.material.opacity = 0.12 + (Math.sin(this.time * 0.9) + 1) * 0.025;
      this.levelVisuals.waterShimmer.rotation.z = Math.sin(this.time * 0.18) * 0.06;
    }

    if (this.levelVisuals.foamRings) {
      for (const ring of this.levelVisuals.foamRings) {
        ring.rotation.z += dt * ring.userData.spin;
        ring.scale.setScalar(ring.userData.baseScale + Math.sin(this.time * 1.7 + ring.userData.phase) * 0.04);
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
