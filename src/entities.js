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

function rotateVector(vector, degrees) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return normalizeVector(vector.x * cos - vector.z * sin, vector.x * sin + vector.z * cos);
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
  constructor({ x, z, direction, speed, radius, damage, distance, color, source, pierce = 0 }) {
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
    this.pierce = pierce;
    this.hitTargets = new Set();
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

  markHit(targetId) {
    this.hitTargets.add(targetId);
  }

  hasHit(targetId) {
    return this.hitTargets.has(targetId);
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
    const moveForward = (input.up ? 1 : 0) - (input.down ? 1 : 0);
    const moveStrafe = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const movementBasis = game.getMovementBasis?.() ?? {
      forward: { x: 0, z: -1 },
      right: { x: 1, z: 0 },
    };
    const moveX = movementBasis.right.x * moveStrafe + movementBasis.forward.x * moveForward;
    const moveZ = movementBasis.right.z * moveStrafe + movementBasis.forward.z * moveForward;

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

    const spawnArc = ({ direction = this.facing, range = this.basicAttack.range, radius = this.basicAttack.radius, arcDegrees = this.basicAttack.arcDegrees, damage = this.basicAttack.damage } = {}) => {
      game.spawnPulse({
        x: this.x + direction.x * range,
        z: this.z + direction.z * range,
        radius,
        damage,
        lifetime: this.attackAnimDuration,
        color: this.basicAttack.color,
        source: "player",
        direction: { ...direction },
        arcDegrees: arcDegrees ?? 360,
        originX: this.x,
        originZ: this.z,
        maxReach: range + radius,
      });
    };

    if (this.basicAttack.pattern === "spin") {
      game.spawnPulse({
        x: this.x,
        z: this.z,
        radius: this.basicAttack.radius + this.basicAttack.range * 0.45,
        damage: this.basicAttack.damage,
        lifetime: this.attackAnimDuration,
        color: this.basicAttack.color,
        source: "player",
        direction: null,
        arcDegrees: 360,
        originX: this.x,
        originZ: this.z,
        maxReach: this.basicAttack.radius + this.basicAttack.range * 0.45,
      });
      return true;
    }

    if (this.basicAttack.pattern === "double") {
      const spread = this.basicAttack.spreadDegrees ?? 34;
      const damage = Math.ceil(this.basicAttack.damage * 0.68);
      spawnArc({ direction: rotateVector(this.facing, -spread / 2), damage });
      spawnArc({ direction: rotateVector(this.facing, spread / 2), damage });
      return true;
    }

    if (this.basicAttack.pattern === "stab") {
      spawnArc({
        range: this.basicAttack.range + 0.65,
        radius: this.basicAttack.radius * 0.72,
        arcDegrees: this.basicAttack.arcDegrees ?? 42,
        damage: this.basicAttack.damage + 2,
      });
      return true;
    }

    spawnArc();
    return true;
  }

  trySpecial(game, time) {
    if (time < this.lastSpecialUsed + this.special.cooldown) {
      return false;
    }

    this.lastSpecialUsed = time;
    this.specialAnimUntil = time + this.specialAnimDuration;

    if (this.special.type === "projectile") {
      const count = this.special.count ?? 1;
      const spread = this.special.spreadDegrees ?? 0;
      const startAngle = count > 1 ? -spread / 2 : 0;
      const step = count > 1 ? spread / (count - 1) : 0;

      for (let index = 0; index < count; index += 1) {
        const direction = rotateVector(this.facing, startAngle + step * index);
        game.spawnProjectile({
          x: this.x + direction.x * 1.8,
          z: this.z + direction.z * 1.8,
          direction,
          speed: this.special.speed,
          radius: this.special.radius,
          damage: this.special.damage,
          distance: this.special.distance,
          color: this.special.color,
          source: "player",
          pierce: this.special.pierce ?? 0,
        });
      }
      return true;
    }

    if (this.special.type === "burst") {
      const count = this.special.count ?? 8;
      for (let index = 0; index < count; index += 1) {
        const angle = (360 * index) / count;
        const direction = rotateVector(this.facing, angle);
        game.spawnProjectile({
          x: this.x + direction.x * 1.6,
          z: this.z + direction.z * 1.6,
          direction,
          speed: this.special.speed,
          radius: this.special.radius,
          damage: this.special.damage,
          distance: this.special.distance,
          color: this.special.color,
          source: "player",
          pierce: this.special.pierce ?? 0,
        });
      }
      return true;
    }

    if (this.special.type === "slam") {
      const rings = this.special.rings ?? 1;
      for (let index = 0; index < rings; index += 1) {
        const scale = 1 + index * 0.36;
        game.spawnPulse({
          x: this.x,
          z: this.z,
          radius: this.special.radius * scale,
          damage: Math.ceil(this.special.damage * (index === 0 ? 1 : 0.58)),
          lifetime: 0.24 + index * 0.08,
          color: this.special.color,
          source: "player",
          direction: { ...this.facing },
          arcDegrees: 360,
          originX: this.x,
          originZ: this.z,
          maxReach: this.special.radius * scale,
        });
      }
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
  constructor({
    x,
    z,
    health,
    speed,
    damage,
    attackRange,
    aggroRange,
    side,
    radius = 1,
    boss = false,
    attackCooldown = 1,
    windupDuration = 0.2,
    slamRadius = 0,
  }) {
    this.id = makeId("enemy");
    this.x = x;
    this.z = z;
    this.radius = radius;
    this.health = health;
    this.maxHealth = health;
    this.speed = speed;
    this.damage = damage;
    this.attackRange = attackRange;
    this.aggroRange = aggroRange;
    this.side = side;
    this.boss = boss;
    this.facing = { x: -1, z: 0 };
    this.attackCooldown = attackCooldown;
    this.windupDuration = windupDuration;
    this.slamRadius = slamRadius || attackRange;
    this.lastAttackAt = -Infinity;
    this.hitFlashUntil = 0;
    this.attackAnimUntil = 0;
    this.telegraphX = x;
    this.telegraphZ = z;
    this.telegraphStartedAt = -Infinity;
    this.telegraphUntil = -Infinity;
    this.pendingSlam = false;
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

    if (this.boss) {
      if (this.pendingSlam) {
        if (time >= this.telegraphUntil) {
          this.pendingSlam = false;
          this.attackAnimUntil = time + 0.34;
          if (distanceBetween(player, { x: this.telegraphX, z: this.telegraphZ }) <= this.slamRadius + player.radius) {
            player.takeDamage(this.damage, time);
          }
        }
        return;
      }

      if (time >= this.lastAttackAt + this.attackCooldown) {
        this.lastAttackAt = time;
        this.pendingSlam = true;
        this.telegraphX = player.x;
        this.telegraphZ = player.z;
        this.telegraphStartedAt = time;
        this.telegraphUntil = time + this.windupDuration;
      }
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
