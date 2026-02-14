'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Matter from 'matter-js';

// ─── Types ───────────────────────────────────────────────────────
interface Bot {
  body: Matter.Body;
  rpm: number;
  color: string;
  name: string;
  alive: boolean;
  stateTimer: number;
  trail: { x: number; y: number; alpha: number }[];
  wanderAngle: number;
  personality: number;
  lastHitFrame: number;    // frame of last collision (for cooldown/chain)
  chainHits: number;       // consecutive hits within chain window
}

interface GameState {
  phase: 'menu' | 'playing' | 'paused' | 'gameover';
  isWinner: boolean;
  playersAlive: number;
}

// ─── Constants (TUNED FOR FUN!) ──────────────────────────────────
const CANVAS_W = 1200;
const CANVAS_H = 800;
const CX = CANVAS_W / 2;            // center X
const CY = CANVAS_H / 2;            // center Y
const ARENA_R = 380;                 // arena radius
const PLAYER_R = 22;                 // player radius
const BOT_R = 19;                    // bot radius

// Physics tuning
const FRICTION_AIR = 0.015;          // LOW — snooker-like sliding
const RESTITUTION = 0.95;            // very bouncy — snooker-like elastic collisions
const DENSITY = 0.002;               // light = reactive to knockback

// RPM zones: Grey 0-40, Sweet Spot 40-60, Over-Spin 60-100
const SWEET_LOW = 40;
const SWEET_HIGH = 60;

// RPM tuning  (at 60 fps)
const RPM_DECAY_PER_FRAME = 0.4;    // lose ~21 RPM/sec — must actively spin!
const RPM_GAIN_PER_PRESS = 3;        // each valid J/K press adds 3 — need constant spam to maintain!
const STARTING_RPM = 50;             // start in sweet spot

// Outside safe zone penalties
const OUTSIDE_DECAY_MULT = 4;        // 4x RPM decay
const OUTSIDE_GAIN_MULT = 0.15;      // only 15% spin efficiency! ~0.3 RPM per press
const OUTSIDE_DRAG_MULT = 0.4;       // 40% movement speed

// Movement tuning
const PLAYER_MOVE_FORCE = 0.004;     // snappy movement
const BOT_MOVE_FORCE = 0.004;        // bots move almost as fast

// Safe zone
const SAFE_ZONE_INITIAL = 360;
const SAFE_ZONE_MIN = 0;             // can shrink to nothing!
const SAFE_ZONE_SHRINK_PER_SEC = 8;  // px per second (fast shrink!)
const SAFE_ZONE_DRIFT_SPEED = 0.8;   // px per frame the safe zone center drifts

// Center gravity — bowl-shaped arena
const CENTER_GRAVITY = 0.0000225;     // bowl pull (10% reduced from 0.000025)

// Combat — SNOOKER-LIKE KNOCKBACK
const KNOCKBACK_BASE = 1.04;         // 5x stronger base
const KNOCKBACK_RPM_MULT = 1.0008;   // 7x stronger RPM scaling
const VELOCITY_KNOCKBACK = 1.015;    // bonus from collision speed

// Arena holes (out-of-bounds exits at 4 cardinal directions)
const HOLE_HALF_ANGLE = 0.12;        // half-width of each hole in radians (~14 degrees)
const HOLE_ANGLES = [                // top, right, bottom, left
  -Math.PI / 2,                      // top
  0,                                 // right
  Math.PI / 2,                       // bottom
  Math.PI,                           // left
];

// Bot AI
const MAX_BOTS = 25;
const BOT_SPIN_CHANCE = 0.30;        // 20% per frame — bots spin aggressively
const BOT_SPIN_GAIN = 6;             // higher gain so bots survive longer
const BOT_EMERGENCY_SPIN_CHANCE = 0.60; // 60% extra chance when RPM is critical
const BOT_EMERGENCY_SPIN_GAIN = 10;  // big emergency gain
const BOT_COLLISION_COOLDOWN = 15;   // frames between counting chain hits (~0.25 sec)
const BOT_CHAIN_WINDOW = 120;        // frames before chain resets (~2 sec)
const BOT_RPM_FLOOR_INSIDE = 20;     // bots can't drop below this inside safe zone
const BOT_PASSIVE_REGEN = 10.0;       // RPM per second passive regen (inside safe zone)
const BOT_SEPARATION_RADIUS = 100;
const BOT_SEPARATION_FORCE = 0.0015;

const BOT_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788',
  '#E74C3C', '#1ABC9C', '#3498DB', '#E67E22', '#9B59B6',
  '#2ECC71', '#F39C12', '#1F77B4', '#E377C2', '#7F7F7F',
  '#17BECF', '#BCBD22', '#D62728', '#FF9896', '#AEC7E8',
];
const BOT_NAMES = [
  'Razak', 'Siti', 'Ahmad', 'Mei Ling', 'Raju',
  'Farah', 'Kumar', 'Aisyah', 'Wei Ming', 'Priya',
  'Zain', 'Lina', 'Hafiz', 'Xiao Wei', 'Arjun',
  'Nadia', 'Raj', 'Aminah', 'Jun', 'Devi',
  'Ismail', 'Yuki', 'Hassan', 'Li Na', 'Vikram',
];

// ─── Component ───────────────────────────────────────────────────
export default function GasingBattleRoyale() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<{
    engine: Matter.Engine;
    player: Matter.Body;
    bots: Bot[];
    currentRPM: number;
    safeZone: number;
    safeZoneCX: number;    // safe zone center X (drifts randomly)
    safeZoneCY: number;    // safe zone center Y
    szTargetX: number;     // target point the safe zone is drifting toward
    szTargetY: number;
    keys: Set<string>;
    lastSpinKey: string;
    animId: number;
    frameCount: number;
    playerAlive: boolean;
    playerTrail: { x: number; y: number; alpha: number }[];
    lastTimestamp: number;
    accumulator: number;
    deathParticles: { x: number; y: number; vx: number; vy: number; alpha: number; size: number; color: string }[];
  } | null>(null);

  const [displayRPM, setDisplayRPM] = useState(STARTING_RPM);
  const [displayTimer, setDisplayTimer] = useState(0);
  const [botCount, setBotCount] = useState(10);
  const [gameState, setGameState] = useState<GameState>({
    phase: 'menu',
    isWinner: false,
    playersAlive: 11,
  });
  const [displaySafeZone, setDisplaySafeZone] = useState(SAFE_ZONE_INITIAL);
  const isPausedRef = useRef(false);

  // ─── Initialize game engine ─────────────────────────────────
  const initGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clean up previous game
    if (gameRef.current) {
      cancelAnimationFrame(gameRef.current.animId);
      Matter.World.clear(gameRef.current.engine.world, false);
      Matter.Engine.clear(gameRef.current.engine);
    }

    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 0, scale: 0 },
    });

    // ── Arena walls with 4 HOLES (top, right, bottom, left) ──
    const wallSegs = 64; // more segments for smoother circle
    const wallBodies: Matter.Body[] = [];

    // Helper: check if an angle falls inside any hole
    function isInHole(angle: number): boolean {
      for (const ha of HOLE_ANGLES) {
        // Normalize angle difference to [-PI, PI]
        let diff = angle - ha;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) < HOLE_HALF_ANGLE) return true;
      }
      return false;
    }

    for (let i = 0; i < wallSegs; i++) {
      const a1 = (i / wallSegs) * Math.PI * 2;
      const a2 = ((i + 1) / wallSegs) * Math.PI * 2;
      const midAngle = (a1 + a2) / 2;

      // Skip wall segments that fall inside a hole
      if (isInHole(midAngle)) continue;

      const mx = CX + Math.cos(midAngle) * (ARENA_R + 25);
      const my = CY + Math.sin(midAngle) * (ARENA_R + 25);
      const len = 2 * (ARENA_R + 25) * Math.sin(Math.PI / wallSegs) + 10;
      const wall = Matter.Bodies.rectangle(mx, my, len, 50, {
        isStatic: true,
        angle: midAngle + Math.PI / 2,
        restitution: 0.9,
        label: 'wall',
      });
      wallBodies.push(wall);
    }

    // ── Player body ──
    const player = Matter.Bodies.circle(CX, CY, PLAYER_R, {
      frictionAir: FRICTION_AIR,
      restitution: RESTITUTION,
      density: DENSITY,
      label: 'player',
    });

    // ── Bot bodies ──
    const bots: Bot[] = [];
    for (let i = 0; i < botCount; i++) {
      const angle = (i / botCount) * Math.PI * 2;
      const dist = 180 + Math.random() * 80;
      const x = CX + Math.cos(angle) * dist;
      const y = CY + Math.sin(angle) * dist;

      const body = Matter.Bodies.circle(x, y, BOT_R, {
        frictionAir: FRICTION_AIR,
        restitution: RESTITUTION,
        density: DENSITY,
        label: `bot_${i}`,
      });

      bots.push({
        body,
        rpm: 50 + Math.random() * 20,  // 50-70 starting RPM (solid start)
        color: BOT_COLORS[i],
        name: BOT_NAMES[i],
        alive: true,
        stateTimer: 0,
        trail: [],
        wanderAngle: Math.random() * Math.PI * 2,
        personality: Math.random(),
        lastHitFrame: -999,
        chainHits: 0,
      });
    }

    Matter.World.add(engine.world, [
      ...wallBodies,
      player,
      ...bots.map((b) => b.body),
    ]);

    // ── Collision handler ──
    Matter.Events.on(engine, 'collisionStart', (event) => {
      const g = gameRef.current;
      if (!g) return;

      for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair;

        // Skip wall collisions for knockback
        if (bodyA.label === 'wall' || bodyB.label === 'wall') continue;

        let attackerRPM = 0;
        let defenderRPM = 0;
        let attacker = bodyA;
        let defender = bodyB;

        // Figure out who's who
        const isPlayerA = bodyA.label === 'player';
        const isPlayerB = bodyB.label === 'player';
        const botA = bots.find((b) => b.body === bodyA && b.alive);
        const botB = bots.find((b) => b.body === bodyB && b.alive);

        if (isPlayerA && botB) {
          attackerRPM = g.currentRPM;
          defenderRPM = botB.rpm;
          attacker = bodyA;
          defender = bodyB;
        } else if (isPlayerB && botA) {
          attackerRPM = g.currentRPM;
          defenderRPM = botA.rpm;
          attacker = bodyB;
          defender = bodyA;
        } else if (botA && botB) {
          if (botA.rpm >= botB.rpm) {
            attackerRPM = botA.rpm;
            defenderRPM = botB.rpm;
            attacker = bodyA;
            defender = bodyB;
          } else {
            attackerRPM = botB.rpm;
            defenderRPM = botA.rpm;
            attacker = bodyB;
            defender = bodyA;
          }
        } else {
          continue;
        }

        // ── SNOOKER-STYLE Knockback ──
        const dx = defender.position.x - attacker.position.x;
        const dy = defender.position.y - attacker.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;

        // Relative velocity along collision axis (snooker physics!)
        const relVx = attacker.velocity.x - defender.velocity.x;
        const relVy = attacker.velocity.y - defender.velocity.y;
        const relSpeed = Math.abs(relVx * nx + relVy * ny);

        // Force = base + RPM scaling + velocity impact
        let force = KNOCKBACK_BASE + attackerRPM * KNOCKBACK_RPM_MULT + relSpeed * VELOCITY_KNOCKBACK;

        // Over-spin zone bonus (above SWEET_HIGH)
        if (attackerRPM >= SWEET_HIGH) {
          force *= 1.6;
          // Self-recoil — Newton's 3rd law
          Matter.Body.applyForce(attacker, attacker.position, {
            x: -nx * force * 0.5,
            y: -ny * force * 0.5,
          });
        }

        // Wobble zone defender takes extra knockback (unstable spin)
        if (defenderRPM < SWEET_LOW) {
          force *= 1.5;
        }

        Matter.Body.applyForce(defender, defender.position, {
          x: nx * force,
          y: ny * force,
        });

        // ── RPM drain — FLAT 5% + CHAIN BONUS ──
        if (defender.label === 'player') {
          // Player takes ~10% base + small RPM-diff bonus
          const playerDrain = 10 + Math.max(0, attackerRPM - defenderRPM) * 0.08;
          g.currentRPM = Math.max(0, g.currentRPM - playerDrain);
        } else {
          const defBot = bots.find((b) => b.body === defender);
          if (defBot) {
            // Check if this hit is within chain window
            if (g.frameCount - defBot.lastHitFrame < BOT_CHAIN_WINDOW) {
              // Still in chain — escalate
              defBot.chainHits++;
            } else {
              // Chain expired — reset
              defBot.chainHits = 1;
            }
            defBot.lastHitFrame = g.frameCount;

            // Drain = 5 base + 5 per chain level
            const chainDrain = 5 + (defBot.chainHits - 1) * 5;
            defBot.rpm = Math.max(0, defBot.rpm - chainDrain);
          }
        }
      }
    });

    // ── Store game ref ──
    const game = {
      engine,
      player,
      bots,
      currentRPM: STARTING_RPM,
      safeZone: SAFE_ZONE_INITIAL,
      safeZoneCX: CX,             // starts at arena center
      safeZoneCY: CY,
      szTargetX: CX + (Math.random() - 0.5) * 100,  // first random drift target
      szTargetY: CY + (Math.random() - 0.5) * 100,
      keys: new Set<string>(),
      lastSpinKey: '',
      animId: 0,
      frameCount: 0,
      playerAlive: true,
      playerTrail: [] as { x: number; y: number; alpha: number }[],
      lastTimestamp: 0,
      accumulator: 0,
      deathParticles: [] as { x: number; y: number; vx: number; vy: number; alpha: number; size: number; color: string }[],
    };
    gameRef.current = game;

    // ── Keyboard handlers ──
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ('wasd'.includes(k) && k.length === 1) game.keys.add(k);

      if ((k === 'j' || k === 'k') && game.playerAlive) {
        if (game.lastSpinKey !== k) {
          const playerDist = distToSafeZone(game.player);
          const outside = playerDist > game.safeZone;
          const gain = outside ? RPM_GAIN_PER_PRESS * OUTSIDE_GAIN_MULT : RPM_GAIN_PER_PRESS;
          game.currentRPM = Math.min(100, game.currentRPM + gain);
          game.lastSpinKey = k;
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      game.keys.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ── Helpers ──
    function dist2Center(body: Matter.Body) {
      const dx = body.position.x - CX;
      const dy = body.position.y - CY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    function distToSafeZone(body: Matter.Body) {
      const dx = body.position.x - game.safeZoneCX;
      const dy = body.position.y - game.safeZoneCY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    // Spawn death particles at a position
    function spawnDeathParticles(x: number, y: number, color: string, count = 25) {
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const speed = 2 + Math.random() * 5;
        game.deathParticles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          size: 3 + Math.random() * 5,
          color,
        });
      }
    }

    // ── Main game loop (fixed 60fps timestep) ──
    const FIXED_DT = 1000 / 60; // 16.667ms per physics step

    const tick = (timestamp: number) => {
      if (!game.playerAlive && game.bots.every((b) => !b.alive)) {
        game.animId = requestAnimationFrame(tick);
        return;
      }

      // Check pause
      if (isPausedRef.current) {
        game.lastTimestamp = timestamp; // reset so we don't accumulate while paused
        game.animId = requestAnimationFrame(tick);
        return;
      }

      // Calculate elapsed time since last frame
      if (game.lastTimestamp === 0) game.lastTimestamp = timestamp;
      let elapsed = timestamp - game.lastTimestamp;
      game.lastTimestamp = timestamp;

      // Clamp to prevent spiral of death (e.g. tab was hidden)
      if (elapsed > 200) elapsed = 200;

      game.accumulator += elapsed;

      // Run physics in fixed steps of ~16.67ms (60fps)
      while (game.accumulator >= FIXED_DT) {
        game.accumulator -= FIXED_DT;

        game.frameCount++;
        Matter.Engine.update(engine, FIXED_DT);

        // ─── Center gravity — BOWL SHAPE (quadratic: stronger toward edges) ───
        const allBodies = [player, ...bots.filter(b => b.alive).map(b => b.body)];
        for (const body of allBodies) {
          const gdx = CX - body.position.x;
          const gdy = CY - body.position.y;
          const gd = Math.sqrt(gdx * gdx + gdy * gdy);
          if (gd > 5) {
            // Force scales with distance² — like rolling down a bowl
            const gForce = CENTER_GRAVITY * gd;
            Matter.Body.applyForce(body, body.position, {
              x: (gdx / gd) * gForce,
              y: (gdy / gd) * gForce,
            });
          }
        }

        // ─── Dynamic friction based on RPM ───
        // Low RPM = sticky (hard to move), Over-spin = ice (can't stop)
        function rpmToFriction(rpm: number): number {
          if (rpm < SWEET_LOW) {
            // Wobble zone: very sticky, scales from 0.10 (rpm=0) to 0.03 (rpm=40)
            return 0.10 - (rpm / SWEET_LOW) * 0.07;
          } else if (rpm <= SWEET_HIGH) {
            // Sweet spot: normal friction
            return 0.025;
          } else {
            // Over-spin: friction drops dramatically toward 0
            const overFactor = (rpm - SWEET_HIGH) / (100 - SWEET_HIGH); // 0 to 1
            return 0.025 - overFactor * 0.022; // 0.025 down to 0.003
          }
        }

        // Update player friction
        if (game.playerAlive) {
          player.frictionAir = rpmToFriction(game.currentRPM);
        }
        // Update bot friction
        for (const bot of game.bots) {
          if (!bot.alive) continue;
          bot.body.frictionAir = rpmToFriction(bot.rpm);
        }

        // ─── Player movement ───
        if (game.playerAlive) {
          let mf = PLAYER_MOVE_FORCE;

          // RPM affects movement force
          if (game.currentRPM < SWEET_LOW) {
            // Wobble: sluggish — hard to get moving
            mf *= 0.4;
          } else if (game.currentRPM >= SWEET_LOW && game.currentRPM <= SWEET_HIGH) {
            // Sweet spot: balanced, responsive
            mf *= 1.1;
          } else {
            // Over-spin: VERY reactive — launches you!
            const overFactor = (game.currentRPM - SWEET_HIGH) / (100 - SWEET_HIGH);
            mf *= 1.5 + overFactor * 0.8; // up to 2.3x force
          }

          // Over-spin: erratic shaking (energy vibration)
          if (game.currentRPM > SWEET_HIGH) {
            const intensity = (game.currentRPM - SWEET_HIGH) / (100 - SWEET_HIGH);
            const shake = 0.0015 + intensity * 0.003;
            Matter.Body.applyForce(player, player.position, {
              x: (Math.random() - 0.5) * shake,
              y: (Math.random() - 0.5) * shake,
            });
          }

          const pDist = distToSafeZone(player);
          const pOutside = pDist > game.safeZone;
          const dragMult = pOutside ? OUTSIDE_DRAG_MULT : 1.0;

          if (game.keys.has('w'))
            Matter.Body.applyForce(player, player.position, { x: 0, y: -mf * dragMult });
          if (game.keys.has('s'))
            Matter.Body.applyForce(player, player.position, { x: 0, y: mf * dragMult });
          if (game.keys.has('a'))
            Matter.Body.applyForce(player, player.position, { x: -mf * dragMult, y: 0 });
          if (game.keys.has('d'))
            Matter.Body.applyForce(player, player.position, { x: mf * dragMult, y: 0 });

          // RPM decay — much harsher outside zone
          let decay = RPM_DECAY_PER_FRAME;
          if (pOutside) decay *= OUTSIDE_DECAY_MULT;
          game.currentRPM = Math.max(0, game.currentRPM - decay);

          // Trail
          game.playerTrail.push({ x: player.position.x, y: player.position.y, alpha: 1 });
          if (game.playerTrail.length > 20) game.playerTrail.shift();
          game.playerTrail.forEach((t) => (t.alpha -= 0.05));

          // Elimination check: RPM death OR flew out through a hole
          if (game.currentRPM <= 0 || dist2Center(player) > ARENA_R + 50) {
            game.playerAlive = false;
            spawnDeathParticles(player.position.x, player.position.y, '#00ff88', 35);
            setGameState({ phase: 'gameover', isWinner: false, playersAlive: 0 });
          }
        }

        // ─── Safe zone shrink + drift ───
        if (game.frameCount % 60 === 0 && game.safeZone > SAFE_ZONE_MIN) {
          game.safeZone = Math.max(SAFE_ZONE_MIN, game.safeZone - SAFE_ZONE_SHRINK_PER_SEC);
          setDisplaySafeZone(game.safeZone);
        }
        // Drift safe zone center toward random target
        const szDx = game.szTargetX - game.safeZoneCX;
        const szDy = game.szTargetY - game.safeZoneCY;
        const szDist = Math.sqrt(szDx * szDx + szDy * szDy);
        if (szDist > 5) {
          game.safeZoneCX += (szDx / szDist) * SAFE_ZONE_DRIFT_SPEED;
          game.safeZoneCY += (szDy / szDist) * SAFE_ZONE_DRIFT_SPEED;
        } else {
          // Reached target — pick a new random target within arena bounds
          // Keep safe zone center reasonable distance from edges
          const maxDrift = Math.max(50, ARENA_R - game.safeZone - 40);
          const angle = Math.random() * Math.PI * 2;
          const drift = Math.random() * maxDrift;
          game.szTargetX = CX + Math.cos(angle) * drift;
          game.szTargetY = CY + Math.sin(angle) * drift;
        }

        // ─── Bot AI ───
        let aliveCount = 0;
        for (const bot of game.bots) {
          if (!bot.alive) continue;

          const bDist = dist2Center(bot.body);   // distance from arena center (for elimination)
          const bDistSz = distToSafeZone(bot.body); // distance from safe zone center (for RPM penalty)

          // Elimination: RPM death OR flew out through a hole
          if (bot.rpm <= 0 || bDist > ARENA_R + 50) {
            bot.alive = false;
            spawnDeathParticles(bot.body.position.x, bot.body.position.y, bot.color, 25);
            continue;
          }

          aliveCount++;

          // Bot RPM management
          const bOutside = bDistSz > game.safeZone;
          let botDecay = RPM_DECAY_PER_FRAME * 0.35;
          if (bOutside) botDecay *= OUTSIDE_DECAY_MULT;
          bot.rpm = Math.max(0, bot.rpm - botDecay);

          // Passive regen inside safe zone (1 RPM/sec)
          if (!bOutside) {
            bot.rpm = Math.min(90, bot.rpm + BOT_PASSIVE_REGEN / 60);
          }

          // RPM floor inside safe zone
          if (!bOutside && bot.rpm < BOT_RPM_FLOOR_INSIDE) {
            bot.rpm = BOT_RPM_FLOOR_INSIDE;
          }

          // Reset chain if no hits for 2 seconds
          if (game.frameCount - bot.lastHitFrame > BOT_CHAIN_WINDOW) {
            bot.chainHits = 0;
          }

          // Regular spinning
          if (Math.random() < BOT_SPIN_CHANCE) {
            const gain = bOutside ? BOT_SPIN_GAIN * OUTSIDE_GAIN_MULT : BOT_SPIN_GAIN;
            bot.rpm = Math.min(90, bot.rpm + gain);
          }

          // EMERGENCY SPIN: when RPM is critically low, bots panic-spin extra hard
          if (bot.rpm < SWEET_LOW && Math.random() < BOT_EMERGENCY_SPIN_CHANCE) {
            const eGain = bOutside ? BOT_EMERGENCY_SPIN_GAIN * OUTSIDE_GAIN_MULT : BOT_EMERGENCY_SPIN_GAIN;
            bot.rpm = Math.min(90, bot.rpm + eGain);
          }

          bot.stateTimer++;
          // Slowly drift wander angle for organic movement
          bot.wanderAngle += (Math.random() - 0.5) * 0.3;

          // ── SEPARATION FORCE (anti-clumping!) ──
          let sepX = 0;
          let sepY = 0;
          for (const other of game.bots) {
            if (other === bot || !other.alive) continue;
            const sdx = bot.body.position.x - other.body.position.x;
            const sdy = bot.body.position.y - other.body.position.y;
            const sDist = Math.sqrt(sdx * sdx + sdy * sdy);
            if (sDist < BOT_SEPARATION_RADIUS && sDist > 0) {
              // Inverse-distance push: closer = stronger repulsion
              const strength = (BOT_SEPARATION_RADIUS - sDist) / BOT_SEPARATION_RADIUS;
              sepX += (sdx / sDist) * strength;
              sepY += (sdy / sDist) * strength;
            }
          }
          // Apply separation
          const sepLen = Math.sqrt(sepX * sepX + sepY * sepY);
          if (sepLen > 0) {
            Matter.Body.applyForce(bot.body, bot.body.position, {
              x: (sepX / sepLen) * BOT_SEPARATION_FORCE,
              y: (sepY / sepLen) * BOT_SEPARATION_FORCE,
            });
          }

          // ── DANGER AVOIDANCE (dodge stronger enemies + holes) ──
          let dodgeX = 0;
          let dodgeY = 0;

          // Avoid stronger enemies
          for (const other of game.bots) {
            if (other === bot || !other.alive) continue;
            if (other.rpm > bot.rpm + 5) { // enemy is stronger
              const ddx = bot.body.position.x - other.body.position.x;
              const ddy = bot.body.position.y - other.body.position.y;
              const dd = Math.sqrt(ddx * ddx + ddy * ddy);
              if (dd < 120) {
                const urgency = (120 - dd) / 120;
                dodgeX += (ddx / dd) * urgency * 2;
                dodgeY += (ddy / dd) * urgency * 2;
              }
            }
          }
          // Avoid stronger player
          if (game.playerAlive && game.currentRPM > bot.rpm + 5) {
            const ddx = bot.body.position.x - player.position.x;
            const ddy = bot.body.position.y - player.position.y;
            const dd = Math.sqrt(ddx * ddx + ddy * ddy);
            if (dd < 140) {
              const urgency = (140 - dd) / 140;
              dodgeX += (ddx / dd) * urgency * 3; // extra caution around player
              dodgeY += (ddy / dd) * urgency * 3;
            }
          }
          // Avoid holes
          for (const ha of HOLE_ANGLES) {
            const hx = CX + Math.cos(ha) * ARENA_R;
            const hy = CY + Math.sin(ha) * ARENA_R;
            const hdx = bot.body.position.x - hx;
            const hdy = bot.body.position.y - hy;
            const hdist = Math.sqrt(hdx * hdx + hdy * hdy);
            if (hdist < 100) {
              const urgency = (100 - hdist) / 100;
              dodgeX += (hdx / hdist) * urgency * 2.5;
              dodgeY += (hdy / hdist) * urgency * 2.5;
            }
          }

          // ── AI Decision Making ──
          const bf = BOT_MOVE_FORCE;
          const dodgeLen = Math.sqrt(dodgeX * dodgeX + dodgeY * dodgeY);
          const isDodging = dodgeLen > 0.5; // significant dodge needed

          if (isDodging) {
            // DODGE MODE: Evade danger first!
            Matter.Body.applyForce(bot.body, bot.body.position, {
              x: (dodgeX / dodgeLen) * bf * 1.5,
              y: (dodgeY / dodgeLen) * bf * 1.5,
            });
          } else if (bOutside || bDistSz > game.safeZone * 0.85) {
            // SURVIVAL: Rush toward safe zone center (not arena center!)
            const dx = game.safeZoneCX - bot.body.position.x;
            const dy = game.safeZoneCY - bot.body.position.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            Matter.Body.applyForce(bot.body, bot.body.position, {
              x: (dx / d) * bf * 1.8,
              y: (dy / d) * bf * 1.8,
            });
          } else if (bot.rpm > SWEET_LOW + 5) {
            // CHASE: Only attack when we have a CLEAR RPM advantage (10+ RPM)
            let bestTarget: Matter.Body | null = null;
            let bestScore = -Infinity;
            const MIN_RPM_ADVANTAGE = 10; // must be 10+ RPM ahead to attack

            // Consider player
            if (game.playerAlive && game.currentRPM + MIN_RPM_ADVANTAGE < bot.rpm) {
              const pdx = player.position.x - bot.body.position.x;
              const pdy = player.position.y - bot.body.position.y;
              const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
              if (pDist < 200) {
                const score = (bot.rpm - game.currentRPM) / (pDist + 1) * 100 * (0.5 + bot.personality);
                if (score > bestScore) {
                  bestScore = score;
                  bestTarget = player;
                }
              }
            }

            // Consider other bots — only those significantly weaker
            const otherBots = game.bots
              .filter((o) => o !== bot && o.alive && o.rpm + MIN_RPM_ADVANTAGE < bot.rpm)
              .map((o) => {
                const odx = o.body.position.x - bot.body.position.x;
                const ody = o.body.position.y - bot.body.position.y;
                return { bot: o, dist: Math.sqrt(odx * odx + ody * ody) };
              })
              .filter((o) => o.dist < 200)
              .sort((a, b) => a.dist - b.dist)
              .slice(0, 2);

            for (const { bot: other, dist: oDist } of otherBots) {
              const score = (bot.rpm - other.rpm) / (oDist + 1) * 100;
              if (score > bestScore) {
                bestScore = score;
                bestTarget = other.body;
              }
            }

            if (bestTarget) {
              const dx = bestTarget.position.x - bot.body.position.x;
              const dy = bestTarget.position.y - bot.body.position.y;
              const d = Math.sqrt(dx * dx + dy * dy) || 1;
              // Flanking approach — not head-on
              const perpX = -dy / d;
              const perpY = dx / d;
              const flankOffset = Math.sin(game.frameCount * 0.03 + bot.wanderAngle) * 0.35;
              Matter.Body.applyForce(bot.body, bot.body.position, {
                x: (dx / d + perpX * flankOffset) * bf,
                y: (dy / d + perpY * flankOffset) * bf,
              });
            } else {
              // WANDER — unique per bot using wanderAngle
              const wx = CX + Math.cos(bot.wanderAngle) * 150 - bot.body.position.x;
              const wy = CY + Math.sin(bot.wanderAngle) * 150 - bot.body.position.y;
              const wd = Math.sqrt(wx * wx + wy * wy) || 1;
              Matter.Body.applyForce(bot.body, bot.body.position, {
                x: (wx / wd) * bf * 0.6,
                y: (wy / wd) * bf * 0.6,
              });
            }
          } else {
            // LOW RPM: Flee from ALL threats, prioritize survival
            let fleeX = 0;
            let fleeY = 0;
            for (const other of game.bots) {
              if (other === bot || !other.alive) continue;
              const dx = bot.body.position.x - other.body.position.x;
              const dy = bot.body.position.y - other.body.position.y;
              const d = Math.sqrt(dx * dx + dy * dy) || 1;
              if (d < 180) {
                fleeX += (dx / d) * (180 - d) / 180;
                fleeY += (dy / d) * (180 - d) / 180;
              }
            }
            if (game.playerAlive) {
              const dx = bot.body.position.x - player.position.x;
              const dy = bot.body.position.y - player.position.y;
              const d = Math.sqrt(dx * dx + dy * dy) || 1;
              if (d < 180) {
                fleeX += (dx / d) * (180 - d) / 180;
                fleeY += (dy / d) * (180 - d) / 180;
              }
            }
            // Bias flee toward safe zone center so they don't flee outside
            fleeX += (game.safeZoneCX - bot.body.position.x) * 0.008;
            fleeY += (game.safeZoneCY - bot.body.position.y) * 0.008;
            const fd = Math.sqrt(fleeX * fleeX + fleeY * fleeY) || 1;
            Matter.Body.applyForce(bot.body, bot.body.position, {
              x: (fleeX / fd) * bf * 0.9,
              y: (fleeY / fd) * bf * 0.9,
            });
          }

          // Trail
          bot.trail.push({ x: bot.body.position.x, y: bot.body.position.y, alpha: 1 });
          if (bot.trail.length > 12) bot.trail.shift();
          bot.trail.forEach((t) => (t.alpha -= 0.08));
        }

        // Update alive count
        const totalAlive = aliveCount + (game.playerAlive ? 1 : 0);
        setGameState((prev) => {
          if (prev.phase !== 'playing') return prev;
          if (aliveCount === 0 && game.playerAlive) {
            return { phase: 'gameover', isWinner: true, playersAlive: 1 };
          }
          return { ...prev, playersAlive: totalAlive };
        });
        setDisplayRPM(game.currentRPM);
        // Update stopwatch every second
        if (game.frameCount % 60 === 0) {
          setDisplayTimer(Math.floor(game.frameCount / 60));
        }

      } // end fixed timestep while loop

      // ─── Render (runs at native refresh rate for smooth visuals) ───
      // Background
      ctx.fillStyle = '#0f0f1a';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Grid lines for visual depth
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      for (let x = 0; x < CANVAS_W; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_H);
        ctx.stroke();
      }
      for (let y = 0; y < CANVAS_H; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_W, y);
        ctx.stroke();
      }

      // Rough terrain (outside safe zone)
      ctx.fillStyle = 'rgba(120, 60, 20, 0.15)';
      ctx.beginPath();
      ctx.arc(CX, CY, ARENA_R, 0, Math.PI * 2);
      if (game.safeZone > 2) {
        ctx.arc(game.safeZoneCX, game.safeZoneCY, game.safeZone, 0, Math.PI * 2, true);
      }
      ctx.fill();

      // Safe zone glow
      if (game.safeZone > 5) {
        const grad = ctx.createRadialGradient(
          game.safeZoneCX, game.safeZoneCY, game.safeZone - 10,
          game.safeZoneCX, game.safeZoneCY, game.safeZone + 10
        );
        grad.addColorStop(0, 'rgba(0, 255, 136, 0.05)');
        grad.addColorStop(1, 'rgba(0, 255, 136, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(game.safeZoneCX, game.safeZoneCY, game.safeZone + 10, 0, Math.PI * 2);
        ctx.fill();

        // Safe zone line
        ctx.strokeStyle = 'rgba(0, 255, 136, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.arc(game.safeZoneCX, game.safeZoneCY, game.safeZone, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Safe zone center indicator (small crosshair)
      if (game.safeZone > 0 && game.safeZone < 200) {
        ctx.strokeStyle = 'rgba(0, 255, 136, 0.3)';
        ctx.lineWidth = 1;
        const cSize = 8;
        ctx.beginPath();
        ctx.moveTo(game.safeZoneCX - cSize, game.safeZoneCY);
        ctx.lineTo(game.safeZoneCX + cSize, game.safeZoneCY);
        ctx.moveTo(game.safeZoneCX, game.safeZoneCY - cSize);
        ctx.lineTo(game.safeZoneCX, game.safeZoneCY + cSize);
        ctx.stroke();
      }

      // Center gravity visual — subtle vortex lines
      ctx.strokeStyle = 'rgba(100, 50, 200, 0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const spiralAngle = game.frameCount * 0.01 + (i / 4) * Math.PI * 2;
        ctx.beginPath();
        for (let r = 30; r < 200; r += 2) {
          const a = spiralAngle + r * 0.015;
          const x = CX + Math.cos(a) * r;
          const y = CY + Math.sin(a) * r;
          if (r === 30) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Arena boundary — draw arcs between holes
      ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
      ctx.lineWidth = 3;
      for (let i = 0; i < HOLE_ANGLES.length; i++) {
        const holeEnd = HOLE_ANGLES[i] + HOLE_HALF_ANGLE;
        const nextHole = HOLE_ANGLES[(i + 1) % HOLE_ANGLES.length];
        let nextHoleStart = nextHole - HOLE_HALF_ANGLE;
        // Ensure we draw the shorter arc
        if (nextHoleStart < holeEnd) nextHoleStart += Math.PI * 2;
        ctx.beginPath();
        ctx.arc(CX, CY, ARENA_R, holeEnd, nextHoleStart);
        ctx.stroke();
      }

      // Draw HOLES — danger zones with glow markers
      for (const ha of HOLE_ANGLES) {
        const holeStart = ha - HOLE_HALF_ANGLE;
        const holeEnd = ha + HOLE_HALF_ANGLE;

        // Danger glow behind hole
        const hx = CX + Math.cos(ha) * ARENA_R;
        const hy = CY + Math.sin(ha) * ARENA_R;
        const holeGrad = ctx.createRadialGradient(hx, hy, 5, hx, hy, 60);
        holeGrad.addColorStop(0, 'rgba(255, 0, 0, 0.3)');
        holeGrad.addColorStop(0.5, 'rgba(255, 50, 0, 0.1)');
        holeGrad.addColorStop(1, 'rgba(255, 0, 0, 0)');
        ctx.fillStyle = holeGrad;
        ctx.beginPath();
        ctx.arc(hx, hy, 60, 0, Math.PI * 2);
        ctx.fill();

        // Hole opening arc (bright red)
        ctx.strokeStyle = `rgba(255, ${50 + Math.floor(Math.sin(game.frameCount * 0.08) * 50 + 50)}, 0, 0.8)`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(CX, CY, ARENA_R, holeStart, holeEnd);
        ctx.stroke();

        // Arrow pointing outward (danger indicator)
        const arrowDist = ARENA_R + 20;
        const ax = CX + Math.cos(ha) * arrowDist;
        const ay = CY + Math.sin(ha) * arrowDist;
        ctx.fillStyle = `rgba(255, ${80 + Math.floor(Math.sin(game.frameCount * 0.1) * 60)}, 0, 0.7)`;
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Choose arrow direction based on hole position
        const arrows = ['↑', '→', '↓', '←'];
        const arrowIdx = HOLE_ANGLES.indexOf(ha);
        // Point outward (reversed)
        const outArrows = ['⚠', '⚠', '⚠', '⚠'];
        ctx.fillText(outArrows[arrowIdx >= 0 ? arrowIdx : 0], ax, ay);
      }

      // ── Draw bots ──
      for (const bot of game.bots) {
        if (!bot.alive) continue;

        // Trail
        for (const t of bot.trail) {
          if (t.alpha <= 0) continue;
          ctx.fillStyle = bot.color + Math.floor(t.alpha * 40).toString(16).padStart(2, '0');
          ctx.beginPath();
          ctx.arc(t.x, t.y, BOT_R * 0.6 * t.alpha, 0, Math.PI * 2);
          ctx.fill();
        }

        // Glow
        if (bot.rpm > SWEET_LOW) {
          ctx.shadowBlur = 12 + bot.rpm * 0.15;
          ctx.shadowColor = bot.color;
        }

        // Body
        ctx.fillStyle = bot.color;
        ctx.beginPath();
        ctx.arc(bot.body.position.x, bot.body.position.y, BOT_R, 0, Math.PI * 2);
        ctx.fill();

        // Inner ring (spinning effect)
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(
          bot.body.position.x,
          bot.body.position.y,
          BOT_R * 0.5,
          game.frameCount * 0.1 * (bot.rpm / 50),
          game.frameCount * 0.1 * (bot.rpm / 50) + Math.PI * 1.5
        );
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Name + RPM
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = 'bold 10px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(bot.name, bot.body.position.x, bot.body.position.y - BOT_R - 12);
        ctx.fillStyle = bot.rpm < SWEET_LOW ? '#ff6666' : bot.rpm < SWEET_HIGH ? '#66ff88' : '#ff4444';
        ctx.font = '9px monospace';
        ctx.fillText(`${Math.floor(bot.rpm)}`, bot.body.position.x, bot.body.position.y - BOT_R - 2);
      }

      // ── Draw player ──
      if (game.playerAlive) {
        // Trail
        for (const t of game.playerTrail) {
          if (t.alpha <= 0) continue;
          const trailColor =
            game.currentRPM >= SWEET_HIGH ? `rgba(255,50,50,${t.alpha * 0.3})`
              : game.currentRPM >= SWEET_LOW ? `rgba(0,255,136,${t.alpha * 0.3})`
                : `rgba(150,150,150,${t.alpha * 0.2})`;
          ctx.fillStyle = trailColor;
          ctx.beginPath();
          ctx.arc(t.x, t.y, PLAYER_R * 0.5 * t.alpha, 0, Math.PI * 2);
          ctx.fill();
        }

        // Glow
        const pColor =
          game.currentRPM >= SWEET_HIGH ? '#ff3333'
            : game.currentRPM >= SWEET_LOW ? '#00ff88'
              : '#888888';

        if (game.currentRPM >= SWEET_LOW) {
          ctx.shadowBlur = 20 + game.currentRPM * 0.2;
          ctx.shadowColor = pColor;
        }

        // Body
        ctx.fillStyle = pColor;
        ctx.beginPath();
        ctx.arc(player.position.x, player.position.y, PLAYER_R, 0, Math.PI * 2);
        ctx.fill();

        // Inner spinning ring
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
          player.position.x,
          player.position.y,
          PLAYER_R * 0.55,
          game.frameCount * 0.12 * (game.currentRPM / 50),
          game.frameCount * 0.12 * (game.currentRPM / 50) + Math.PI * 1.5
        );
        ctx.stroke();

        // Outer ring
        ctx.strokeStyle = pColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(player.position.x, player.position.y, PLAYER_R + 4, 0, Math.PI * 2);
        ctx.stroke();

        ctx.shadowBlur = 0;

        // Label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('YOU', player.position.x, player.position.y - PLAYER_R - 10);
      }

      // ─── Death Particles ───
      for (let i = game.deathParticles.length - 1; i >= 0; i--) {
        const p = game.deathParticles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08; // gravity
        p.vx *= 0.98; // drag
        p.alpha -= 0.015;
        p.size *= 0.985;

        if (p.alpha <= 0 || p.size < 0.5) {
          game.deathParticles.splice(i, 1);
          continue;
        }

        // Glow
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      game.animId = requestAnimationFrame(tick);
    };

    game.animId = requestAnimationFrame(tick);

    // Cleanup function
    return () => {
      cancelAnimationFrame(game.animId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      Matter.World.clear(engine.world, false);
      Matter.Engine.clear(engine);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botCount]);

  // ─── Start game ──────────────────────────────────────────────
  const startGame = useCallback(() => {
    setGameState({ phase: 'playing', isWinner: false, playersAlive: botCount + 1 });
    setDisplayRPM(STARTING_RPM);
    setDisplaySafeZone(SAFE_ZONE_INITIAL);
    setDisplayTimer(0);
    isPausedRef.current = false;
  }, [botCount]);

  // Run engine when phase changes to playing
  useEffect(() => {
    if (gameState.phase !== 'playing') return;
    const cleanup = initGame();
    return cleanup;
  }, [gameState.phase, initGame]);

  // Escape key for pause
  useEffect(() => {
    const handlePause = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (gameState.phase === 'playing' || gameState.phase === 'paused')) {
        if (gameState.phase === 'playing') {
          isPausedRef.current = true;
          setGameState(prev => ({ ...prev, phase: 'paused' }));
        } else {
          isPausedRef.current = false;
          setGameState(prev => ({ ...prev, phase: 'playing' }));
        }
      }
    };
    window.addEventListener('keydown', handlePause);
    return () => window.removeEventListener('keydown', handlePause);
  }, [gameState.phase]);

  // Draw menu background on canvas
  useEffect(() => {
    if (gameState.phase !== 'menu') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let frame = 0;

    const drawMenu = () => {
      frame++;
      ctx.fillStyle = '#0f0f1a';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      // Animated circles
      for (let i = 0; i < 15; i++) {
        const angle = (frame * 0.005 + (i / 15) * Math.PI * 2);
        const r = 100 + i * 20;
        const x = CX + Math.cos(angle) * r;
        const y = CY + Math.sin(angle) * r;
        ctx.fillStyle = BOT_COLORS[i % BOT_COLORS.length] + '30';
        ctx.beginPath();
        ctx.arc(x, y, 10 + Math.sin(frame * 0.02 + i) * 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Center spinning top preview
      ctx.shadowBlur = 30;
      ctx.shadowColor = '#00ff88';
      ctx.fillStyle = '#00ff88';
      ctx.beginPath();
      ctx.arc(CX, CY, 30, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(CX, CY, 18, frame * 0.05, frame * 0.05 + Math.PI * 1.5);
      ctx.stroke();
      ctx.shadowBlur = 0;

      animId = requestAnimationFrame(drawMenu);
    };
    drawMenu();
    return () => cancelAnimationFrame(animId);
  }, [gameState.phase]);

  const restartGame = () => {
    isPausedRef.current = false;
    if (gameRef.current) {
      cancelAnimationFrame(gameRef.current.animId);
      Matter.World.clear(gameRef.current.engine.world, false);
      Matter.Engine.clear(gameRef.current.engine);
      gameRef.current = null;
    }
    setGameState({ phase: 'menu', isWinner: false, playersAlive: botCount + 1 });
  };

  const togglePause = () => {
    if (gameState.phase === 'playing') {
      isPausedRef.current = true;
      setGameState(prev => ({ ...prev, phase: 'paused' }));
    } else if (gameState.phase === 'paused') {
      isPausedRef.current = false;
      setGameState(prev => ({ ...prev, phase: 'playing' }));
    }
  };

  // ─── RPM helpers ──────────────────────────────────────────────
  const rpmColor =
    displayRPM >= SWEET_HIGH ? '#ff3333'
      : displayRPM >= SWEET_LOW ? '#00ff88'
        : '#888888';

  const rpmZone =
    displayRPM >= SWEET_HIGH ? 'OVER-SPIN!'
      : displayRPM >= SWEET_LOW ? 'SWEET SPOT'
        : 'WOBBLE';

  // ─── Render ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center overflow-hidden">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="rounded-xl shadow-2xl"
          style={{ border: '2px solid rgba(128, 90, 213, 0.4)' }}
        />

        {/* ── HUD (during gameplay or paused) ── */}
        {(gameState.phase === 'playing' || gameState.phase === 'paused') && (
          <>
            {/* RPM Gauge */}
            <div className="absolute top-4 left-4 pointer-events-none">
              <div className="bg-black/80 backdrop-blur rounded-lg p-4" style={{ border: `1px solid ${rpmColor}40` }}>
                <div className="text-gray-400 text-xs font-bold tracking-widest mb-2">RPM GAUGE</div>
                <div className="w-56 h-6 bg-gray-900 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-75"
                    style={{
                      width: `${displayRPM}%`,
                      background: `linear-gradient(90deg, ${rpmColor}88, ${rpmColor})`,
                      boxShadow: `0 0 15px ${rpmColor}66`,
                    }}
                  />
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-2xl font-bold font-mono" style={{ color: rpmColor }}>
                    {Math.floor(displayRPM)}
                  </span>
                  <span className="text-xs font-bold tracking-wider" style={{ color: rpmColor }}>
                    {rpmZone}
                  </span>
                </div>
                <div className="text-gray-600 text-[10px] mt-1">
                  Alternate <span className="text-gray-400">J</span> / <span className="text-gray-400">K</span> to spin
                </div>
              </div>
            </div>

            {/* Alive counter */}
            <div className="absolute top-4 right-4 pointer-events-none">
              <div className="bg-black/80 backdrop-blur rounded-lg p-4" style={{ border: '1px solid rgba(234, 179, 8, 0.3)' }}>
                <div className="text-gray-400 text-xs font-bold tracking-widest mb-1">ALIVE</div>
                <div className="text-4xl font-bold text-yellow-400 font-mono">
                  {gameState.playersAlive}<span className="text-lg text-gray-500">/{botCount + 1}</span>
                </div>
              </div>
            </div>

            {/* Controls + Pause/Restart buttons */}
            <div className="absolute bottom-4 left-4 flex flex-col gap-2">
              <div className="bg-black/60 backdrop-blur rounded-lg px-3 py-2 text-[11px] text-gray-400 space-y-0.5 pointer-events-none">
                <div><span className="text-yellow-400 font-bold">WASD</span> Move</div>
                <div><span className="text-yellow-400 font-bold">J/K</span> Spin (alternate!)</div>
                <div><span className="text-yellow-400 font-bold">ESC</span> Pause</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={togglePause}
                  className="px-3 py-1.5 rounded-lg text-white text-xs font-bold transition-all hover:scale-105 active:scale-95"
                  style={{ background: 'rgba(100, 100, 255, 0.3)', border: '1px solid rgba(100, 100, 255, 0.5)' }}
                >
                  {gameState.phase === 'paused' ? '▶ RESUME' : '⏸ PAUSE'}
                </button>
                <button
                  onClick={restartGame}
                  className="px-3 py-1.5 rounded-lg text-white text-xs font-bold transition-all hover:scale-105 active:scale-95"
                  style={{ background: 'rgba(255, 80, 80, 0.3)', border: '1px solid rgba(255, 80, 80, 0.5)' }}
                >
                  ↺ RESTART
                </button>
              </div>
            </div>

            {/* Safe zone radius + Stopwatch */}
            <div className="absolute bottom-4 right-4 pointer-events-none flex flex-col items-end gap-2">
              <div className="bg-black/60 backdrop-blur rounded-lg px-3 py-2">
                <div className="text-green-400 text-[10px] font-bold tracking-widest">SAFE ZONE</div>
                <div className="text-white text-xl font-mono font-bold">{Math.floor(displaySafeZone)}<span className="text-xs text-gray-500">m</span></div>
              </div>
              <div className="bg-black/60 backdrop-blur rounded-lg px-3 py-2">
                <div className="text-cyan-400 text-[10px] font-bold tracking-widest">TIME</div>
                <div className="text-white text-xl font-mono font-bold">
                  {String(Math.floor(displayTimer / 60)).padStart(2, '0')}:{String(displayTimer % 60).padStart(2, '0')}
                </div>
              </div>
            </div>

            {/* Pause overlay */}
            {gameState.phase === 'paused' && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-xl">
                <div className="text-center">
                  <h2 className="text-5xl font-black text-white mb-4">⏸ PAUSED</h2>
                  <div className="flex gap-4 justify-center">
                    <button
                      onClick={togglePause}
                      className="px-8 py-3 rounded-full text-white font-bold text-lg transition-all hover:scale-105 active:scale-95"
                      style={{ background: 'linear-gradient(135deg, #7c3aed, #ec4899)', boxShadow: '0 0 20px rgba(124, 58, 237, 0.3)' }}
                    >
                      ▶ RESUME
                    </button>
                    <button
                      onClick={restartGame}
                      className="px-8 py-3 rounded-full text-white font-bold text-lg transition-all hover:scale-105 active:scale-95"
                      style={{ background: 'linear-gradient(135deg, #e74c3c, #c0392b)', boxShadow: '0 0 20px rgba(231, 76, 60, 0.3)' }}
                    >
                      ↺ MENU
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Main Menu ── */}
        {gameState.phase === 'menu' && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl" style={{ background: 'rgba(0,0,0,0.85)' }}>
            <div className="text-center max-w-xl px-8">
              <h1 className="text-7xl font-black mb-2" style={{
                background: 'linear-gradient(135deg, #f7dc6f, #ff6b6b, #bb8fce)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                PANGKAH
              </h1>
              <p className="text-2xl text-purple-300 font-semibold mb-10">Gasing Battle Royale</p>

              <div className="bg-white/5 rounded-xl p-6 mb-8 text-left space-y-3">
                <h2 className="text-lg font-bold text-yellow-400 mb-3">🎮 How to Play</h2>
                <div className="text-gray-300 text-sm">
                  <span className="text-green-400 font-bold">Goal:</span> Be the last Gasing spinning!
                </div>
                <div className="text-gray-300 text-sm">
                  <span className="text-green-400 font-bold">Move:</span>{' '}
                  {['W', 'A', 'S', 'D'].map(k => (
                    <kbd key={k} className="px-2 py-0.5 bg-gray-800 rounded text-white text-xs mx-0.5 border border-gray-600">{k}</kbd>
                  ))}
                </div>
                <div className="text-gray-300 text-sm">
                  <span className="text-green-400 font-bold">Spin:</span>{' '}
                  Alternate <kbd className="px-2 py-0.5 bg-gray-800 rounded text-white text-xs border border-gray-600">J</kbd> and{' '}
                  <kbd className="px-2 py-0.5 bg-gray-800 rounded text-white text-xs border border-gray-600">K</kbd> rapidly!
                </div>
                <div className="text-gray-500 text-xs pl-2">
                  ⚠️ Must alternate: J→K→J→K (same key twice = nothing!)
                </div>
                <div className="text-gray-300 text-sm mt-2">
                  <span className="text-green-400 font-bold">RPM Zones:</span>
                  <div className="grid grid-cols-3 gap-2 mt-1 text-xs">
                    <div className="bg-gray-800/50 rounded p-2 text-center">
                      <div className="text-gray-400 font-bold">0-40</div>
                      <div className="text-gray-500">Wobble 🫨</div>
                    </div>
                    <div className="bg-green-900/30 rounded p-2 text-center border border-green-800/30">
                      <div className="text-green-400 font-bold">40-60</div>
                      <div className="text-green-600">Sweet Spot ✨</div>
                    </div>
                    <div className="bg-red-900/30 rounded p-2 text-center">
                      <div className="text-red-400 font-bold">60-100</div>
                      <div className="text-red-600">Over-Spin! 🔥</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bot count selector */}
              <div className="bg-white/5 rounded-xl p-4 mb-8">
                <div className="text-sm font-bold text-purple-300 mb-3">⚙️ Settings</div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-300 text-sm">AI Opponents</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setBotCount(Math.max(1, botCount - 1))}
                      className="w-8 h-8 rounded-lg bg-gray-700 text-white font-bold hover:bg-gray-600 transition-colors"
                    >
                      −
                    </button>
                    <span className="text-2xl font-bold text-yellow-400 font-mono w-8 text-center">{botCount}</span>
                    <button
                      onClick={() => setBotCount(Math.min(MAX_BOTS, botCount + 1))}
                      className="w-8 h-8 rounded-lg bg-gray-700 text-white font-bold hover:bg-gray-600 transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="text-gray-600 text-[10px] mt-1 text-right">1 – {MAX_BOTS} opponents</div>
              </div>

              <button
                onClick={startGame}
                className="px-14 py-4 rounded-full text-white font-bold text-xl transition-all hover:scale-105 active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
                  boxShadow: '0 0 30px rgba(124, 58, 237, 0.4)',
                }}
              >
                🌀 START BATTLE 🌀
              </button>

              <p className="text-gray-600 text-xs mt-4">
                Battle against {botCount} AI opponent{botCount !== 1 ? 's' : ''} in a shrinking arena
              </p>
            </div>
          </div>
        )}

        {/* ── Game Over ── */}
        {gameState.phase === 'gameover' && (
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center rounded-xl">
            <div className="text-center">
              <h1 className={`text-6xl font-black mb-3 ${gameState.isWinner ? 'text-yellow-400' : 'text-red-500'}`}>
                {gameState.isWinner ? '🏆 VICTORY! 🏆' : '💀 KNOCKED OUT 💀'}
              </h1>
              <p className="text-gray-300 text-xl mb-8">
                {gameState.isWinner
                  ? 'You are the last Gasing standing!'
                  : 'Your Gasing stopped spinning...'}
              </p>
              <button
                onClick={restartGame}
                className="px-12 py-4 rounded-full text-white font-bold text-xl transition-all hover:scale-105 active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
                  boxShadow: '0 0 25px rgba(124, 58, 237, 0.3)',
                }}
              >
                PLAY AGAIN
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
