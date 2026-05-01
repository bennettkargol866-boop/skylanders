# Skylanders Arena Prototype

A small browser prototype focused on a 3D Skylanders-inspired loop:

- Pick a chunky fantasy hero
- Choose from a growing roster of heroes
- Spawn into one of five handcrafted floating-island realms
- Clear the front half and find the key
- Bring the key to the gate to unlock the back half
- Collect coin drops from defeated enemies
- Use coins to unlock more heroes
- Defeat the remaining enemies and enter the portal

## Run It

Open the folder in VS Code and use either:

1. A simple static server such as the Live Server extension
2. `python -m http.server 8000`

Then open `http://localhost:8000`.

## Controls

- `WASD` or arrow keys: move
- `Space`: basic attack
- `E`: special ability
- find the key and bring it to the lock gate
- `Enter`: continue after clearing an area
- `R`: restart after defeat

## Progression

- Enemies drop coins when defeated
- Coins are saved locally in the browser
- New heroes unlock from the character-select overlay
- Each hero gains a level-up reward after every cleared realm
- Progress auto-saves between sessions

## Project Structure

- `index.html`: UI shell and canvas
- `styles.css`: layout, HUD, and overlay styling
- `src/config.js`: arena, areas, and character definitions
- `src/entities.js`: player, enemy, projectile, and hit pulse logic
- `src/game.js`: game loop, rendering, UI updates, and progression flow
- `src/main.js`: startup wiring
