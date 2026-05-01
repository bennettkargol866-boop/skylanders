import { Game } from "./game.js";

const ui = {
  overlay: document.getElementById("overlay"),
  overlayKicker: document.getElementById("overlay-kicker"),
  overlayTitle: document.getElementById("overlay-title"),
  overlayText: document.getElementById("overlay-text"),
  overlayMeta: document.getElementById("overlay-meta"),
  overlayBack: document.getElementById("overlay-back"),
  overlayAction: document.getElementById("overlay-action"),
  overlayFullscreen: document.getElementById("overlay-fullscreen"),
  menuGrid: document.getElementById("menu-grid"),
  saveGrid: document.getElementById("save-grid"),
  levelGrid: document.getElementById("level-grid"),
  characterGrid: document.getElementById("character-grid"),
  canvasFrame: document.querySelector(".canvas-frame"),
  frameFullscreen: document.getElementById("frame-fullscreen"),
  state: document.getElementById("hud-state"),
  character: document.getElementById("hud-character"),
  area: document.getElementById("hud-area"),
  enemies: document.getElementById("hud-enemies"),
  coins: document.getElementById("hud-coins"),
  key: document.getElementById("hud-key"),
  reward: document.getElementById("hud-reward"),
  healthText: document.getElementById("hud-health-text"),
  healthFill: document.getElementById("health-fill"),
  basicText: document.getElementById("basic-text"),
  basicFill: document.getElementById("basic-fill"),
  specialText: document.getElementById("special-text"),
  specialFill: document.getElementById("special-fill"),
};

const canvas = document.getElementById("game");
const game = new Game(canvas, ui);

game.init();
