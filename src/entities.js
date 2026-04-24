let nextId = 1;

function makeId(prefix) {
  const value = `${prefix}-${nextId}`;
  nextId += 1;
  return value;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeVector(x, z) {
  const length = Math.hypot(x, z);
  if (!length) {
    return { x: 0, z: 0 };
  }

  return { x: x / length, z: z / length };
}

export function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function isInsideRect(x, z, rect, padding = 0) {
  return (
    x >= rect.minX + padding &&
    x <= rect.maxX - padding &&
    z >= rect.minZ + padding &&
    z <= rect.maxZ - padding
  );
}

export function isInsideAnyRect(x, z, rects, padding = 0) {
  return rects.some((rect) => isInsideRect(x, z, rect, padding));
}

export class AttackPulse {
  constructor({
    x,
    z,
    radius,
    damage,
    lifetime,
    color,
    source,
    direction = null,
    arcDegrees = 360,
    originX = x,
    originZ = z,
    maxReach = radius,
  }) {
    this.id = makeId("pulse");
    this.x = x;
    this.z = z;
    this.radius = radius;
    this.damage = damage;
    this.lifetime = lifetime;
    this.remaining = lifetime;
    this.color = color;
    this.source = source;
    this.direction = direction;
    this.arcDegrees = arcDegrees;
    this.originX = originX;
    this.originZ = originZ;
    this.maxReach = maxReach;
    this.hitTargets = new Set();
  }

  update(dt) {
    this.remaining -= dt;
  }

  markHit(targetId) {
    this.hitTargets.add(targetId);
  }

  hasHit(targetId) {
    return this.hitTargets.has(targetId);
  }

  get alive() {
    return this.remaining > 0;
  }
}

export class Projectile {
  constructor({ x, z, direction, speed, radius, damage, distance, color, source }) {
    this.id = makeId("projectile");
    this.x = x;
    this.z = z;
    this.direction = direction;
    this.speed = speed;
    this.radius = radius;
    this.damage = damage;
    this.maxDistance = distance;
    this.distanceTravelled = 0;
    this.color = color;
    this.source = source;
    this.alive = true;
  }

  update(dt) {
    const travel = this.speed * dt;
    this.x += this.direction.x * travel;
    this.z += this.direction.z * travel;
    this.distanceTravelled += travel;

    if (this.distanceTravelled >= this.maxDistance) {
      this.alive = false;
    }
  }
}

export class Player {
  constructor(characterDef) {
    this.radius = 1.15;
    this.name = characterDef.name;
    this.title = characterDef.title;
    this.form = characterDef.form;
    this.color = characterDef.color;
    this.secondaryColor = characterDef.secondaryColor;
    this.detailColor = characterDef.detailColor;
    this.eyeColor = characterDef.eyeColor;
    this.accent = characterDef.accent;
    this.basicAttack = structuredClone(characterDef.basicAttack);
    this.special = structuredClone(characterDef.special);
    this.maxHealth = characterDef.maxHealth;
    this.health = characterDef.maxHealth;
    this.speed = characterDef.speed;
    this.jumpStrength = characterDef.jumpStrength ?? 11;
    this.gravity = 28;
    this.velocity = { x: 0, z: 0 };
    this.x = 0;
    this.z = 0;
    this.y = 0;
    this.moveAmount = 0;
    this.moveForward = 0;
    this.moveStrafe = 0;
    this.facing = { x: 1, z: 0 };
    this.verticalVelocity = 0;
    this.isGrounded = true;
    this.lastBasicUsed = -Infinity;
    this.lastSpecialUsed = -Infinity;
    this.hurtUntil = 0;
    this.attackAnimUntil = 0;
    this.specialAnimUntil = 0;
    this.attackAnimDuration = 0.26;
    this.specialAnimDuration = 0.36;
    this.jumpStartedAt = -Infinity;
    this.landedAt = -Infinity;
  }

  place(x, z) {
    this.x = x;
    this.z = z;
    this.y = 0;
    this.verticalVelocity = 0;
    this.isGrounded = true;
    this.moveAmount = 0;
    this.moveForward = 0;
    this.moveStrafe = 0;
  }

  update(dt, input, game, aimDirection = null) {
    let moveX = 0;
    let moveZ = 0;

    if (input.left) {
      moveX -= 1;
    }
    if (input.right) {
      moveX += 1;
    }
    if (input.up) {
      moveZ -= 1;
    }
    if (input.down) {
      moveZ += 1;
    }

    const direction = normalizeVector(moveX, moveZ);
    const hasInput = direction.x || direction.z;
    const targetVelocity = {
      x: hasInput ? direction.x * this.speed : 0,
      z: hasInput ? direction.z * this.speed : 0,
    };
    const response = hasInput ? 11.5 : 8.5;
    const blend = Math.min(1, response * dt);

    this.velocity.x += (targetVelocity.x - this.velocity.x) * blend;
    this.velocity.z += (targetVelocity.z - this.velocity.z) * blend;
    this.moveAmount = clamp(Math.hypot(this.velocity.x, this.velocity.z) / Math.max(this.speed, 0.001), 0, 1);

    if (aimDirection?.x || aimDirection?.z) {
      this.facing = aimDirection;
    } else {
      const velocityDirection = normalizeVector(this.velocity.x, this.velocity.z);
      if (velocityDirection.x || velocityDirection.z) {
        this.facing = velocityDirection;
      } else if (hasInput) {
        this.facing = direction;
      }
    }

    if (Math.abs(this.velocity.x) > 0.001 || Math.abs(this.velocity.z) > 0.001) {
      game.moveActor(this, this.velocity.x * dt, this.velocity.z * dt);
    }

    const speedBase = Math.max(this.speed, 0.001);
    const right = { x: this.facing.z, z: -this.facing.x };
    this.moveForward = clamp(
      (this.velocity.x * this.facing.x + this.velocity.z * this.facing.z) / speedBase,
      -1,
      1
    );
    this.moveStrafe = clamp(
      (this.velocity.x * right.x + this.velocity.z * right.z) / speedBase,
      -1,
      1
    );

    if (!this.isGrounded || this.verticalVelocity > 0) {
      this.verticalVelocity -= this.gravity * dt;
      this.y += this.verticalVelocity * dt;

      if (this.y <= 0) {
        if (!this.isGrounded) {
          this.landedAt = game.time;
        }
        this.y = 0;
        this.verticalVelocity = 0;
        this.isGrounded = true;
      }
    }
  }

  tryJump(time) {
    if (!this.isGrounded) {
      return false;
    }

    this.isGrounded = false;
    this.verticalVelocity = this.jumpStrength;
    this.jumpStartedAt = time;
    return true;
  }

  tryBasicAttack(game, time) {
    if (time < this.lastBasicUsed + this.basicAttack.cooldown) {
      return false;
    }

    this.lastBasicUsed = time;
    this.attackAnimUntil = time + this.attackAnimDuration;
    game.spawnPulse({
      x: this.x + this.facing.x * this.basicAttack.range,
      z: this.z + this.facing.z * this.basicAttack.range,
      radius: this.basicAttack.radius,
      damage: this.basicAttack.damage,
      lifetime: this.attackAnimDuration,
      color: this.basicAttack.color,
      source: "player",
      direction: { ...this.facing },
      arcDegrees: this.basicAttack.arcDegrees ?? 360,
      originX: this.x,
      originZ: this.z,
      maxReach: this.basicAttack.range + this.basicAttack.radius,
    });
    return true;
  }

  trySpecial(game, time) {
    if (time < this.lastSpecialUsed + this.special.cooldown) {
      return false;
    }

    this.lastSpecialUsed = time;
    this.specialAnimUntil = time + this.specialAnimDuration;

    if (this.special.type === "projectile") {
      game.spawnProjectile({
        x: this.x + this.facing.x * 1.8,
        z: this.z + this.facing.z * 1.8,
        direction: { ...this.facing },
        speed: this.special.speed,
        radius: this.special.radius,
        damage: this.special.damage,
        distance: this.special.distance,
        color: this.special.color,
        source: "player",
      });
      return true;
    }

    if (this.special.type === "slam") {
      game.spawnPulse({
        x: this.x,
        z: this.z,
        radius: this.special.radius,
        damage: this.special.damage,
        lifetime: 0.24,
        color: this.special.color,
        source: "player",
        direction: { ...this.facing },
        arcDegrees: 360,
        originX: this.x,
        originZ: this.z,
        maxReach: this.special.radius,
      });
      return true;
    }

    return false;
  }

  takeDamage(amount, time) {
    if (time < this.hurtUntil) {
      return false;
    }

    this.health = Math.max(0, this.health - amount);
    this.hurtUntil = time + 0.55;
    return true;
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  restoreFull() {
    this.health = this.maxHealth;
  }

  basicCooldownRemaining(time) {
    return Math.max(0, this.lastBasicUsed + this.basicAttack.cooldown - time);
  }

  specialCooldownRemaining(time) {
    return Math.max(0, this.lastSpecialUsed + this.special.cooldown - time);
  }

  get alive() {
    return this.health > 0;
  }
}

export class Enemy {
  constructor({ x, z, health, speed, damage, attackRange, aggroRange, side }) {
    this.id = makeId("enemy");
    this.x = x;
    this.z = z;
    this.radius = 1;
    this.health = health;
    this.maxHealth = health;
    this.speed = speed;
    this.damage = damage;
    this.attackRange = attackRange;
    this.aggroRange = aggroRange;
    this.side = side;
    this.facing = { x: -1, z: 0 };
    this.attackCooldown = 1;
    this.lastAttackAt = -Infinity;
    this.hitFlashUntil = 0;
    this.attackAnimUntil = 0;
  }

  update(dt, player, game, time) {
    const distance = distanceBetween(this, player);
    if (distance > this.aggroRange) {
      return;
    }

    const direction = normalizeVector(player.x - this.x, player.z - this.z);
    if (direction.x || direction.z) {
      this.facing = direction;
    }

    if (distance > this.attackRange + this.radius + player.radius) {
      game.moveEnemy(this, direction.x * this.speed * dt, direction.z * this.speed * dt);
      return;
    }

    if (time >= this.lastAttackAt + this.attackCooldown) {
      this.lastAttackAt = time;
      this.attackAnimUntil = time + 0.2;
      player.takeDamage(this.damage, time);
    }
  }

  takeDamage(amount, hitDirection, time) {
    this.health = Math.max(0, this.health - amount);
    this.hitFlashUntil = time + 0.15;
    this.x += hitDirection.x * 0.9;
    this.z += hitDirection.z * 0.9;
  }

  get alive() {
    return this.health > 0;
  }
}
