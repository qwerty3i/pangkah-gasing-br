'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Matter from 'matter-js';

// ─── Sound Manager (procedural Web Audio API) ────────────────
class SoundManager {
  private ctx: AudioContext | null = null;
  private bgmGain: GainNode | null = null;
  private bgmPlaying = false;
  private bgmInterval: ReturnType<typeof setInterval> | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }

  playCollision(intensity = 0.5) {
    const ctx = this.getCtx();
    const t = ctx.currentTime;
    // Short noise burst for impact
    const bufferSize = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800 + intensity * 1200, t);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15 * intensity, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(t);
    source.stop(t + 0.08);
  }

  playDeath() {
    const ctx = this.getCtx();
    const t = ctx.currentTime;
    // Descending tone + noise burst
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.3);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
    // Pop noise
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.2, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    src.connect(g2).connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.15);
  }

  playSpin() {
    const ctx = this.getCtx();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200 + Math.random() * 400, t);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.04, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.03);
  }

  playGameOver(isWinner: boolean) {
    const ctx = this.getCtx();
    const t = ctx.currentTime;
    if (isWinner) {
      // Ascending triumphant notes
      [0, 0.12, 0.24, 0.4].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime([523, 659, 784, 1047][i], t + offset);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.12, t + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.25);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t + offset);
        osc.stop(t + offset + 0.25);
      });
    } else {
      // Descending sad notes
      [0, 0.15, 0.3].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime([400, 300, 200][i], t + offset);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.1, t + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t + offset);
        osc.stop(t + offset + 0.3);
      });
    }
  }

  startBGM() {
    if (this.bgmPlaying) return;
    const ctx = this.getCtx();
    this.bgmGain = ctx.createGain();
    this.bgmGain.gain.value = 0.06;
    this.bgmGain.connect(ctx.destination);
    this.bgmPlaying = true;

    const notes = [130.81, 146.83, 164.81, 174.61, 196.00, 220.00, 246.94, 261.63];
    let beatIndex = 0;

    const playBeat = () => {
      if (!this.bgmPlaying || !this.bgmGain) return;
      const t = ctx.currentTime;

      // Bass note
      const bass = ctx.createOscillator();
      bass.type = 'triangle';
      bass.frequency.setValueAtTime(notes[beatIndex % notes.length], t);
      const bassGain = ctx.createGain();
      bassGain.gain.setValueAtTime(0.15, t);
      bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      bass.connect(bassGain).connect(this.bgmGain!);
      bass.start(t);
      bass.stop(t + 0.3);

      // Hi-hat (noise tick)
      if (beatIndex % 2 === 0) {
        const bufSize = ctx.sampleRate * 0.03;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const hpf = ctx.createBiquadFilter();
        hpf.type = 'highpass';
        hpf.frequency.value = 6000;
        const hg = ctx.createGain();
        hg.gain.setValueAtTime(0.08, t);
        hg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
        src.connect(hpf).connect(hg).connect(this.bgmGain!);
        src.start(t);
        src.stop(t + 0.03);
      }

      beatIndex++;
    };

    playBeat();
    this.bgmInterval = setInterval(playBeat, 400);
  }

  stopBGM() {
    this.bgmPlaying = false;
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
    if (this.bgmGain) {
      this.bgmGain.gain.value = 0;
      this.bgmGain = null;
    }
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }
}

const soundManager = new SoundManager();

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
  kills: number;
}

type GameMode = 'arena' | 'survival' | 'duel';

// Duel mode projectiles
interface Laser {
  x: number; y: number;
  vx: number; vy: number;
  life: number; // frames remaining
}
interface Bomb {
  x: number; y: number;
  vx: number; vy: number;
  timer: number; // frames until explosion
  exploded: boolean;
  explodeTimer: number; // frames of explosion visual
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

// Survival mode
const SURVIVAL_SPAWN_INTERVAL = 180; // frames between bot spawns (3 sec at 60fps)
const SURVIVAL_SAFE_ZONE_SHRINK = 2;  // slower shrink in survival

// Duel mode
const BOSS_R = 28;                    // boss is bigger
const BOSS_RPM = 40;                  // boss starting RPM per round (low for fast fights)
const BOSS_COLOR = '#ff2266';         // boss color
const DUEL_LASER_SPEED = 8;           // pixels per frame
const DUEL_LASER_INTERVAL = 12;       // frames between lasers (5/sec)
const DUEL_BOMB_SPEED = 4;
const DUEL_BOMB_INTERVAL = 12;        // frames between bombs (5/sec)
const DUEL_BOMB_EXPLODE_R = 60;       // explosion radius
const DUEL_BOMB_DMG = 12;             // RPM damage from bomb
const DUEL_LASER_DMG = 8;             // RPM damage from laser
const DUEL_COLLISION_MULT = 3;        // collision damage multiplier in duel
const DUEL_SAFE_ZONE_SHRINK = 4;      // slower shrink for boss fight
const DUEL_ROUND_TRANSITION_FRAMES = 180; // 3 seconds at 60fps
const DUEL_PROJECTILE_INVULN = 20;    // invincibility frames after projectile hit (0.33 sec)
const DUEL_BOSS_SPIN_CHANCE = 0.10;   // boss spins slower than normal bots (10% vs 30%)
const DUEL_BOSS_SPIN_GAIN = 3;        // half normal gain

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
export default function GasingIO() {
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
    gameMode: GameMode;
    kills: number;
    nextBotSpawnFrame: number;  // for survival mode
    botSpawnIndex: number;      // which bot index to spawn next
    wallBodies: Matter.Body[];  // reference to walls for spawning
    // Duel mode
    duelRound: number;
    duelLasers: Laser[];
    duelBombs: Bomb[];
    lastLaserFrame: number;
    lastBombFrame: number;
    duelBossMaxRPM: number;
    duelTransition: boolean;      // true during round transition
    duelTransitionTimer: number;  // countdown frames
    lastProjectileHitFrame: number; // for invincibility after projectile hit
  } | null>(null);

  const [displayRPM, setDisplayRPM] = useState(STARTING_RPM);
  const [displayTimer, setDisplayTimer] = useState(0);
  const [botCount, setBotCount] = useState(10);
  const [gameState, setGameState] = useState<GameState>({
    phase: 'menu',
    isWinner: false,
    playersAlive: 11,
    kills: 0,
  });
  const [displaySafeZone, setDisplaySafeZone] = useState(SAFE_ZONE_INITIAL);
  const isPausedRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [gameId, setGameId] = useState(0);
  const [gameMode, setGameMode] = useState<GameMode>('arena');
  const [displayKills, setDisplayKills] = useState(0);
  const gameOverRef = useRef(false);
  const [duelRound, setDuelRound] = useState(1);
  const [bossRPM, setBossRPM] = useState(BOSS_RPM);

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

    // ── Bot bodies (Battle Royale: spawn all, Survival: spawn none) ──
    const bots: Bot[] = [];
    if (gameMode === 'arena') {
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
          rpm: 50 + Math.random() * 20,
          color: BOT_COLORS[i % BOT_COLORS.length],
          name: BOT_NAMES[i % BOT_NAMES.length],
          alive: true,
          stateTimer: 0,
          trail: [],
          wanderAngle: Math.random() * Math.PI * 2,
          personality: Math.random(),
          lastHitFrame: -999,
          chainHits: 0,
        });
      }
    }
    // Survival mode: bots array starts empty, they'll be spawned in the game loop

    // Duel mode: spawn 1 boss bot on opposite side
    if (gameMode === 'duel') {
      const bossBody = Matter.Bodies.circle(CX + 200, CY, BOSS_R, {
        frictionAir: FRICTION_AIR * 0.7, // boss has less air friction
        restitution: RESTITUTION,
        density: DENSITY * 1.5,  // heavier boss
        label: 'bot_0',
      });
      bots.push({
        body: bossBody,
        rpm: BOSS_RPM,
        color: BOSS_COLOR,
        name: 'BOSS',
        alive: true,
        stateTimer: 0,
        trail: [],
        wanderAngle: Math.random() * Math.PI * 2,
        personality: 0.8,
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

        // Duel mode: boss spikes = 2x damage and knockback
        const isDuelBoss = g.gameMode === 'duel' && attacker.label === 'bot_0';
        if (isDuelBoss) force *= 2;

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
        soundManager.playCollision(Math.min(1, force * 5));

        // ── RPM drain — FLAT 5% + CHAIN BONUS ──
        if (defender.label === 'player') {
          // Duel: boss spikes deal extra damage TO player, but player deals normal damage to boss
          const duelMult = isDuelBoss ? DUEL_COLLISION_MULT : 1;
          const playerDrain = (10 + Math.max(0, attackerRPM - defenderRPM) * 0.08) * duelMult;
          g.currentRPM = Math.max(0, g.currentRPM - playerDrain);
        } else {
          const defBot = bots.find((b) => b.body === defender);
          if (defBot) {
            if (g.frameCount - defBot.lastHitFrame < BOT_CHAIN_WINDOW) {
              defBot.chainHits++;
            } else {
              defBot.chainHits = 1;
            }
            defBot.lastHitFrame = g.frameCount;

            // Drain = 5 base + 5 per chain level
            let chainDrain = 5 + (defBot.chainHits - 1) * 5;

            // Duel mode: momentum damage — faster player hits = more damage to boss
            if (g.gameMode === 'duel' && attacker.label === 'player') {
              const playerSpeed = Math.sqrt(attacker.velocity.x ** 2 + attacker.velocity.y ** 2);
              const momentumBonus = playerSpeed * 3; // ~0-15 extra RPM drain based on speed
              chainDrain += momentumBonus;
            }

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
      gameMode,
      kills: 0,
      nextBotSpawnFrame: SURVIVAL_SPAWN_INTERVAL,
      botSpawnIndex: 0,
      wallBodies,
      // Duel
      duelRound: 1,
      duelLasers: [] as Laser[],
      duelBombs: [] as Bomb[],
      lastLaserFrame: 0,
      lastBombFrame: 0,
      duelBossMaxRPM: BOSS_RPM,
      duelTransition: false,
      duelTransitionTimer: 0,
      lastProjectileHitFrame: -999,  // for invincibility frames
    };
    gameRef.current = game;

    // ── Keyboard handlers ──
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // Block all gameplay input during duel round transition
      if (game.duelTransition) return;
      if ('wasd'.includes(k) && k.length === 1) game.keys.add(k);

      if ((k === 'j' || k === 'k') && game.playerAlive) {
        if (game.lastSpinKey !== k) {
          soundManager.playSpin();
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
      // Stop physics when game is over (but still render for particles)
      const isGameOver = gameOverRef.current;

      // Check pause
      if (isPausedRef.current) {
        game.lastTimestamp = timestamp;
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

        // Skip physics updates if game is over
        if (isGameOver) continue;

        // Duel: freeze during round transition
        if (game.duelTransition) {
          game.duelTransitionTimer--;
          if (game.duelTransitionTimer <= 0) {
            game.duelTransition = false;
          }
          continue;
        }

        game.frameCount++;
        Matter.Engine.update(engine, FIXED_DT);

        // ─── Survival Mode: Spawn bots from holes ───
        if (game.gameMode === 'survival' && game.frameCount >= game.nextBotSpawnFrame && game.playerAlive) {
          // No limit in survival — bots keep coming!
          const idx = game.botSpawnIndex;
          // Pick a random hole to spawn from
          const holeAngle = HOLE_ANGLES[Math.floor(Math.random() * HOLE_ANGLES.length)];
          const spawnDist = ARENA_R - 30; // just inside the wall at hole
          const sx = CX + Math.cos(holeAngle) * spawnDist;
          const sy = CY + Math.sin(holeAngle) * spawnDist;

          const newBody = Matter.Bodies.circle(sx, sy, BOT_R, {
            frictionAir: FRICTION_AIR,
            restitution: RESTITUTION,
            density: DENSITY,
            label: `bot_${idx}`,
          });

          // Give initial velocity toward center
          const toCenter = { x: (CX - sx) * 0.01, y: (CY - sy) * 0.01 };
          Matter.Body.setVelocity(newBody, toCenter);

          const newBot: Bot = {
            body: newBody,
            rpm: 55 + Math.random() * 15,
            color: BOT_COLORS[idx % BOT_COLORS.length],
            name: BOT_NAMES[idx % BOT_NAMES.length],
            alive: true,
            stateTimer: 0,
            trail: [],
            wanderAngle: Math.random() * Math.PI * 2,
            personality: Math.random(),
            lastHitFrame: -999,
            chainHits: 0,
          };

          game.bots.push(newBot);
          Matter.World.add(engine.world, newBody);

          game.botSpawnIndex++;
          game.nextBotSpawnFrame = game.frameCount + SURVIVAL_SPAWN_INTERVAL;
        }

        // ─── Center gravity ─── 
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
            soundManager.playDeath();
            soundManager.playGameOver(false);
            gameOverRef.current = true;
            setGameState({ phase: 'gameover', isWinner: false, playersAlive: 0, kills: game.kills });
          }
        }

        // ─── Safe zone shrink + drift ───
        // Safe zone shrink (slower in survival)
        const shrinkRate = game.gameMode === 'duel' ? DUEL_SAFE_ZONE_SHRINK : game.gameMode === 'survival' ? SURVIVAL_SAFE_ZONE_SHRINK : SAFE_ZONE_SHRINK_PER_SEC;
        if (game.frameCount % 60 === 0 && game.safeZone > SAFE_ZONE_MIN) {
          game.safeZone = Math.max(SAFE_ZONE_MIN, game.safeZone - shrinkRate);
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
            soundManager.playDeath();
            game.kills++;
            setDisplayKills(game.kills);

            // Duel mode: advance round when boss dies
            if (game.gameMode === 'duel') {
              if (game.duelRound < 3) {
                // Start round transition — freeze physics for 3 seconds
                game.duelRound++;
                setDuelRound(game.duelRound);
                game.duelTransition = true;
                game.duelTransitionTimer = DUEL_ROUND_TRANSITION_FRAMES;

                // Reset boss
                bot.alive = true;
                bot.rpm = BOSS_RPM + game.duelRound * 15; // boss gets significantly stronger
                game.duelBossMaxRPM = bot.rpm;
                setBossRPM(bot.rpm);
                Matter.Body.setPosition(bot.body, { x: CX + 200, y: CY });
                Matter.Body.setVelocity(bot.body, { x: 0, y: 0 });

                // Reset player position and RPM
                Matter.Body.setPosition(player, { x: CX - 200, y: CY });
                Matter.Body.setVelocity(player, { x: 0, y: 0 });
                game.currentRPM = STARTING_RPM;
                setDisplayRPM(STARTING_RPM);

                // Reset safe zone
                game.safeZone = SAFE_ZONE_INITIAL;
                game.safeZoneCX = CX;
                game.safeZoneCY = CY;
                setDisplaySafeZone(SAFE_ZONE_INITIAL);

                // Clear projectiles
                game.duelLasers = [];
                game.duelBombs = [];

                // Visual flash
                spawnDeathParticles(CX, CY, '#ffff00', 30);
              } else {
                // All 3 rounds complete — player wins!
                soundManager.playGameOver(true);
                gameOverRef.current = true;
                setGameState({ phase: 'gameover', isWinner: true, playersAlive: 1, kills: game.kills });
              }
            }
            continue;
          }

          aliveCount++;

          // Bot RPM management
          const bOutside = bDistSz > game.safeZone;
          let botDecay = RPM_DECAY_PER_FRAME * 0.35;
          if (bOutside) botDecay *= OUTSIDE_DECAY_MULT;
          bot.rpm = Math.max(0, bot.rpm - botDecay);

          // Passive regen inside safe zone (disabled for duel boss)
          if (!bOutside && game.gameMode !== 'duel') {
            bot.rpm = Math.min(90, bot.rpm + BOT_PASSIVE_REGEN / 60);
          }

          // RPM floor inside safe zone (disabled for duel boss)
          if (!bOutside && bot.rpm < BOT_RPM_FLOOR_INSIDE && game.gameMode !== 'duel') {
            bot.rpm = BOT_RPM_FLOOR_INSIDE;
          }

          // Reset chain if no hits for 2 seconds
          if (game.frameCount - bot.lastHitFrame > BOT_CHAIN_WINDOW) {
            bot.chainHits = 0;
          }

          // Regular spinning (duel boss: slower spin rate)
          const spinChance = game.gameMode === 'duel' ? DUEL_BOSS_SPIN_CHANCE : BOT_SPIN_CHANCE;
          const spinGain = game.gameMode === 'duel' ? DUEL_BOSS_SPIN_GAIN : BOT_SPIN_GAIN;
          if (Math.random() < spinChance) {
            const gain = bOutside ? spinGain * OUTSIDE_GAIN_MULT : spinGain;
            bot.rpm = Math.min(90, bot.rpm + gain);
          }

          // EMERGENCY SPIN: when RPM is critically low (disabled for duel boss)
          if (game.gameMode !== 'duel' && bot.rpm < SWEET_LOW && Math.random() < BOT_EMERGENCY_SPIN_CHANCE) {
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
                const ody = o.body.position.y - o.body.position.y;
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

        // ─── Duel Mode: Boss Weapons ───
        if (game.gameMode === 'duel' && game.playerAlive) {
          const boss = game.bots[0];
          if (boss && boss.alive) {
            setBossRPM(boss.rpm);

            // Round 2+: Fire laser toward player
            if (game.duelRound >= 2 && game.frameCount - game.lastLaserFrame >= DUEL_LASER_INTERVAL) {
              game.lastLaserFrame = game.frameCount;
              const dx = player.position.x - boss.body.position.x;
              const dy = player.position.y - boss.body.position.y;
              const d = Math.sqrt(dx * dx + dy * dy) || 1;
              game.duelLasers.push({
                x: boss.body.position.x,
                y: boss.body.position.y,
                vx: (dx / d) * DUEL_LASER_SPEED,
                vy: (dy / d) * DUEL_LASER_SPEED,
                life: 120, // 2 seconds
              });
            }

            // Round 3+: Throw bomb toward player
            if (game.duelRound >= 3 && game.frameCount - game.lastBombFrame >= DUEL_BOMB_INTERVAL) {
              game.lastBombFrame = game.frameCount;
              const dx = player.position.x - boss.body.position.x;
              const dy = player.position.y - boss.body.position.y;
              const d = Math.sqrt(dx * dx + dy * dy) || 1;
              game.duelBombs.push({
                x: boss.body.position.x,
                y: boss.body.position.y,
                vx: (dx / d) * DUEL_BOMB_SPEED,
                vy: (dy / d) * DUEL_BOMB_SPEED,
                timer: Math.max(30, Math.floor(d / DUEL_BOMB_SPEED)), // explodes when it reaches target area
                exploded: false,
                explodeTimer: 0,
              });
            }
          }

          // Update lasers
          for (let i = game.duelLasers.length - 1; i >= 0; i--) {
            const laser = game.duelLasers[i];
            laser.x += laser.vx;
            laser.y += laser.vy;
            laser.life--;

            // Check collision with player
            const ldx = laser.x - player.position.x;
            const ldy = laser.y - player.position.y;
            const lDist = Math.sqrt(ldx * ldx + ldy * ldy);
            if (lDist < PLAYER_R + 6) {
              // Check invincibility
              const isInvuln = game.frameCount - game.lastProjectileHitFrame < DUEL_PROJECTILE_INVULN;
              if (!isInvuln) {
                game.currentRPM = Math.max(0, game.currentRPM - DUEL_LASER_DMG);
                Matter.Body.applyForce(player, player.position, {
                  x: laser.vx * 0.003,
                  y: laser.vy * 0.003,
                });
                game.lastProjectileHitFrame = game.frameCount;
              }
              soundManager.playCollision(0.6);
              spawnDeathParticles(laser.x, laser.y, '#ff0066', 5);
              game.duelLasers.splice(i, 1);
              continue;
            }

            if (laser.life <= 0 || laser.x < 0 || laser.x > CANVAS_W || laser.y < 0 || laser.y > CANVAS_H) {
              game.duelLasers.splice(i, 1);
            }
          }

          // Update bombs
          for (let i = game.duelBombs.length - 1; i >= 0; i--) {
            const bomb = game.duelBombs[i];
            if (!bomb.exploded) {
              bomb.x += bomb.vx;
              bomb.y += bomb.vy;
              bomb.timer--;

              if (bomb.timer <= 0) {
                // Explode!
                bomb.exploded = true;
                bomb.explodeTimer = 20; // show explosion for 20 frames
                soundManager.playCollision(1.0);

                // Damage player if in radius
                const bdx = bomb.x - player.position.x;
                const bdy = bomb.y - player.position.y;
                const bDist = Math.sqrt(bdx * bdx + bdy * bdy);
                if (bDist < DUEL_BOMB_EXPLODE_R) {
                  const isInvuln = game.frameCount - game.lastProjectileHitFrame < DUEL_PROJECTILE_INVULN;
                  if (!isInvuln) {
                    const falloff = 1 - (bDist / DUEL_BOMB_EXPLODE_R);
                    game.currentRPM = Math.max(0, game.currentRPM - DUEL_BOMB_DMG * falloff);
                    const kx = (player.position.x - bomb.x) / (bDist || 1);
                    const ky = (player.position.y - bomb.y) / (bDist || 1);
                    Matter.Body.applyForce(player, player.position, {
                      x: kx * 0.02 * falloff,
                      y: ky * 0.02 * falloff,
                    });
                    game.lastProjectileHitFrame = game.frameCount;
                  }
                }
                spawnDeathParticles(bomb.x, bomb.y, '#ff8800', 15);
              }
            } else {
              bomb.explodeTimer--;
              if (bomb.explodeTimer <= 0) {
                game.duelBombs.splice(i, 1);
              }
            }
          }
        }

        // Update alive count
        const totalAlive = aliveCount + (game.playerAlive ? 1 : 0);
        setGameState((prev) => {
          if (prev.phase !== 'playing') return prev;
          if (game.gameMode === 'arena' && aliveCount === 0 && game.playerAlive) {
            soundManager.playGameOver(true);
            gameOverRef.current = true;
            return { phase: 'gameover', isWinner: true, playersAlive: 1, kills: game.kills };
          }
          // In survival mode, player wins if they survive for a certain time or clear all bots (if MAX_BOTS is reached)
          // For now, survival mode win condition is just "don't die"
          if (game.gameMode === 'survival' && !game.playerAlive) {
            soundManager.playGameOver(false);
            return { phase: 'gameover', isWinner: false, playersAlive: 0, kills: game.kills };
          }
          return { ...prev, playersAlive: totalAlive, kills: game.kills };
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

      // ─── Duel Mode: Draw boss spikes, lasers, bombs ───
      if (game.gameMode === 'duel') {
        const boss = game.bots[0];
        if (boss && boss.alive) {
          // Draw spikes around boss
          const spikeCount = 8;
          const spikeLen = 12;
          ctx.strokeStyle = '#ffcc00';
          ctx.lineWidth = 3;
          for (let s = 0; s < spikeCount; s++) {
            const sa = (game.frameCount * 0.04) + (s / spikeCount) * Math.PI * 2;
            const x1 = boss.body.position.x + Math.cos(sa) * (BOSS_R + 2);
            const y1 = boss.body.position.y + Math.sin(sa) * (BOSS_R + 2);
            const x2 = boss.body.position.x + Math.cos(sa) * (BOSS_R + 2 + spikeLen);
            const y2 = boss.body.position.y + Math.sin(sa) * (BOSS_R + 2 + spikeLen);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }

          // Boss HP bar above boss
          const hpW = 50;
          const hpH = 5;
          const hpX = boss.body.position.x - hpW / 2;
          const hpY = boss.body.position.y - BOSS_R - 22;
          const hpPct = boss.rpm / game.duelBossMaxRPM;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(hpX, hpY, hpW, hpH);
          ctx.fillStyle = hpPct > 0.5 ? '#ff2266' : hpPct > 0.25 ? '#ff8800' : '#ff0000';
          ctx.fillRect(hpX, hpY, hpW * hpPct, hpH);
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.lineWidth = 1;
          ctx.strokeRect(hpX, hpY, hpW, hpH);

          // Round label
          ctx.fillStyle = '#ffcc00';
          ctx.font = 'bold 10px "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`ROUND ${game.duelRound}`, boss.body.position.x, hpY - 5);
        }

        // Draw lasers
        for (const laser of game.duelLasers) {
          ctx.shadowBlur = 15;
          ctx.shadowColor = '#ff0066';
          ctx.strokeStyle = '#ff0066';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(laser.x - laser.vx * 3, laser.y - laser.vy * 3); // trail
          ctx.lineTo(laser.x, laser.y);
          ctx.stroke();
          // Bright tip
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(laser.x, laser.y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }

        // Draw bombs
        for (const bomb of game.duelBombs) {
          if (!bomb.exploded) {
            // Flying bomb
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#ff8800';
            ctx.fillStyle = '#ff8800';
            ctx.beginPath();
            ctx.arc(bomb.x, bomb.y, 7, 0, Math.PI * 2);
            ctx.fill();
            // Fuse spark
            ctx.fillStyle = '#ffff00';
            ctx.beginPath();
            ctx.arc(bomb.x - bomb.vx * 0.5, bomb.y - bomb.vy * 0.5, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          } else {
            // Explosion
            const progress = 1 - bomb.explodeTimer / 20;
            const r = DUEL_BOMB_EXPLODE_R * progress;
            ctx.globalAlpha = 1 - progress;
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#ff4400';
            ctx.fillStyle = `rgba(255, ${Math.floor(100 + 100 * (1 - progress))}, 0, ${0.6 * (1 - progress)})`;
            ctx.beginPath();
            ctx.arc(bomb.x, bomb.y, r, 0, Math.PI * 2);
            ctx.fill();
            // Inner bright core
            ctx.fillStyle = `rgba(255, 255, 200, ${0.8 * (1 - progress)})`;
            ctx.beginPath();
            ctx.arc(bomb.x, bomb.y, r * 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
          }
        }
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

      // ─── Duel: Round Transition Overlay ───
      if (game.gameMode === 'duel' && game.duelTransition) {
        const progress = 1 - game.duelTransitionTimer / DUEL_ROUND_TRANSITION_FRAMES;
        const countdown = Math.ceil(game.duelTransitionTimer / 60);

        // Dark overlay
        ctx.fillStyle = `rgba(0, 0, 0, ${0.7 + 0.2 * Math.sin(progress * Math.PI)})`;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Round number — big text with scale animation
        const scale = progress < 0.2 ? progress / 0.2 : 1;
        ctx.save();
        ctx.translate(CANVAS_W / 2, CANVAS_H / 2 - 40);
        ctx.scale(scale, scale);
        ctx.font = 'bold 80px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffcc00';
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#ffcc00';
        ctx.fillText(`ROUND ${game.duelRound}`, 0, 0);
        ctx.restore();

        // Weapons description
        ctx.font = 'bold 18px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 0;
        const weapons = game.duelRound === 1 ? '🔱 SPIKES'
          : game.duelRound === 2 ? '🔱 SPIKES + 🔴 LASER'
            : '🔱 SPIKES + 🔴 LASER + 💣 BOMBS';
        ctx.fillText(weapons, CANVAS_W / 2, CANVAS_H / 2 + 20);

        // Countdown
        ctx.font = 'bold 36px "Segoe UI", sans-serif';
        ctx.fillStyle = countdown <= 1 ? '#00ff88' : '#ffffff';
        ctx.shadowBlur = countdown <= 1 ? 20 : 0;
        ctx.shadowColor = '#00ff88';
        const countdownText = countdown <= 0 ? 'FIGHT!' : `${countdown}`;
        ctx.fillText(countdownText, CANVAS_W / 2, CANVAS_H / 2 + 80);
        ctx.shadowBlur = 0;

        // VS indicator
        ctx.font = 'bold 14px "Segoe UI", sans-serif';
        ctx.fillStyle = '#888888';
        ctx.fillText('YOU  VS  BOSS', CANVAS_W / 2, CANVAS_H / 2 + 110);
      }

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
  }, [botCount, gameMode]);

  // ─── Start game ──────────────────────────────────────────────
  const startGame = useCallback(() => {
    // Clean up any existing game first
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    gameRef.current = null;
    const initialAlive = gameMode === 'arena' ? botCount + 1 : gameMode === 'duel' ? 2 : 1;
    setGameState({ phase: 'playing', isWinner: false, playersAlive: initialAlive, kills: 0 });
    setDisplayRPM(STARTING_RPM);
    setDisplaySafeZone(SAFE_ZONE_INITIAL);
    setDisplayTimer(0);
    setDisplayKills(0);
    setDuelRound(1);
    setBossRPM(BOSS_RPM);
    isPausedRef.current = false;
    gameOverRef.current = false;
    setGameId(prev => prev + 1);
  }, [botCount, gameMode]);

  // Run engine when gameId changes (new game started)
  useEffect(() => {
    if (gameId === 0) return; // no game started yet
    const cleanup = initGame();
    cleanupRef.current = cleanup ?? null;
    soundManager.resume();
    soundManager.startBGM();
    // Only destroy engine on component unmount, NOT on pause
    return () => {
      if (cleanup) cleanup();
      cleanupRef.current = null;
      soundManager.stopBGM();
    };
  }, [gameId, initGame]);

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
    gameOverRef.current = false;
    soundManager.stopBGM();
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (gameRef.current) {
      gameRef.current = null;
    }
    setGameId(0);
    setGameState({ phase: 'menu', isWinner: false, playersAlive: botCount + 1, kills: 0 });
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

            {/* Alive counter / Survival stats / Duel stats */}
            <div className="absolute top-4 right-4 pointer-events-none">
              <div className="bg-black/80 backdrop-blur rounded-lg p-4" style={{ border: '1px solid rgba(234, 179, 8, 0.3)' }}>
                {gameMode === 'duel' ? (
                  <>
                    <div className="text-gray-400 text-xs font-bold tracking-widest mb-1">ROUND</div>
                    <div className="text-4xl font-bold text-red-400 font-mono">
                      {duelRound}<span className="text-lg text-gray-500">/3</span>
                    </div>
                    <div className="mt-2">
                      <div className="text-gray-400 text-[10px] font-bold tracking-widest mb-1">BOSS HP</div>
                      <div className="w-28 h-3 bg-gray-900 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-150"
                          style={{
                            width: `${(bossRPM / (BOSS_RPM + duelRound * 10)) * 100}%`,
                            background: 'linear-gradient(90deg, #ff2266, #ff6688)',
                          }}
                        />
                      </div>
                    </div>
                  </>
                ) : gameMode === 'survival' ? (
                  <>
                    <div className="text-gray-400 text-xs font-bold tracking-widest mb-1">KILLS</div>
                    <div className="text-4xl font-bold text-red-400 font-mono">
                      {displayKills}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-gray-400 text-xs font-bold tracking-widest mb-1">ALIVE</div>
                    <div className="text-4xl font-bold text-yellow-400 font-mono">
                      {gameState.playersAlive}<span className="text-lg text-gray-500">/{botCount + 1}</span>
                    </div>
                  </>
                )}
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
              <h1 className="text-7xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-yellow-400 bg-clip-text text-transparent mb-2">
                GASING.IO
              </h1>
              <p className="text-2xl text-purple-300 font-semibold mb-8">Choose Your Mode</p>

              {/* Mode Selection */}
              <div className="flex gap-4 mb-8">
                <button
                  onClick={() => setGameMode('arena')}
                  className={`flex-1 rounded-xl p-5 text-left transition-all hover:scale-[1.02] ${gameMode === 'arena' ? 'ring-2 ring-purple-400 bg-purple-900/40' : 'bg-white/5 hover:bg-white/10'
                    }`}
                >
                  <div className="text-2xl mb-1">⚔️</div>
                  <div className="text-white font-bold text-lg">Arena</div>
                  <div className="text-gray-400 text-xs mt-1">Last gasing standing wins!</div>
                </button>
                <button
                  onClick={() => setGameMode('survival')}
                  className={`flex-1 rounded-xl p-5 text-left transition-all hover:scale-[1.02] ${gameMode === 'survival' ? 'ring-2 ring-red-400 bg-red-900/40' : 'bg-white/5 hover:bg-white/10'
                    }`}
                >
                  <div className="text-2xl mb-1">🛡️</div>
                  <div className="text-white font-bold text-lg">Survival</div>
                  <div className="text-gray-400 text-xs mt-1">Endless waves of bots!</div>
                </button>
                <button
                  onClick={() => setGameMode('duel')}
                  className={`flex-1 rounded-xl p-5 text-left transition-all hover:scale-[1.02] ${gameMode === 'duel' ? 'ring-2 ring-yellow-400 bg-yellow-900/40' : 'bg-white/5 hover:bg-white/10'
                    }`}
                >
                  <div className="text-2xl mb-1">👑</div>
                  <div className="text-white font-bold text-lg">Duel</div>
                  <div className="text-gray-400 text-xs mt-1">1v1 boss fight with 3 rounds!</div>
                </button>
              </div>

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

              {/* Bot count selector (Battle Royale only) */}
              {gameMode === 'arena' && (
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
              )}

              <button
                onClick={startGame}
                className="px-14 py-4 rounded-full text-white font-bold text-xl transition-all hover:scale-105 active:scale-95"
                style={{
                  background: gameMode === 'duel'
                    ? 'linear-gradient(135deg, #f39c12, #e74c3c)'
                    : gameMode === 'survival'
                      ? 'linear-gradient(135deg, #e74c3c, #f39c12)'
                      : 'linear-gradient(135deg, #7c3aed, #ec4899)',
                  boxShadow: gameMode === 'duel'
                    ? '0 0 30px rgba(243, 156, 18, 0.4)'
                    : gameMode === 'survival'
                      ? '0 0 30px rgba(231, 76, 60, 0.4)'
                      : '0 0 30px rgba(124, 58, 237, 0.4)',
                }}
              >
                {gameMode === 'duel' ? '👑 START DUEL 👑' : gameMode === 'survival' ? '🛡️ START SURVIVAL 🛡️' : '🌀 START ARENA 🌀'}
              </button>

              <p className="text-gray-600 text-xs mt-4">
                {gameMode === 'duel'
                  ? 'Face a boss with spikes, lasers, and bombs across 3 rounds!'
                  : gameMode === 'survival'
                    ? 'Survive endless waves of bots entering from the holes!'
                    : `Battle against ${botCount} AI opponent${botCount !== 1 ? 's' : ''} in a shrinking arena`}
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
              {gameMode === 'duel' ? (
                <div className="mb-8">
                  <p className="text-gray-300 text-xl mb-4">
                    {gameState.isWinner
                      ? 'You defeated the boss across all 3 rounds!'
                      : `Defeated on Round ${duelRound} of 3`}
                  </p>
                  <div className="flex gap-6 justify-center">
                    <div className="bg-white/10 rounded-xl p-4">
                      <div className="text-yellow-400 text-3xl font-bold font-mono">{duelRound}/3</div>
                      <div className="text-gray-500 text-xs font-bold tracking-widest">ROUNDS</div>
                    </div>
                    <div className="bg-white/10 rounded-xl p-4">
                      <div className="text-cyan-400 text-3xl font-bold font-mono">
                        {String(Math.floor(displayTimer / 60)).padStart(2, '0')}:{String(displayTimer % 60).padStart(2, '0')}
                      </div>
                      <div className="text-gray-500 text-xs font-bold tracking-widest">TIME</div>
                    </div>
                  </div>
                </div>
              ) : gameMode === 'survival' ? (
                <div className="mb-8">
                  <p className="text-gray-300 text-xl mb-4">Your gasing stopped spinning...</p>
                  <div className="flex gap-6 justify-center">
                    <div className="bg-white/10 rounded-xl p-4">
                      <div className="text-red-400 text-3xl font-bold font-mono">{gameState.kills}</div>
                      <div className="text-gray-500 text-xs font-bold tracking-widest">KILLS</div>
                    </div>
                    <div className="bg-white/10 rounded-xl p-4">
                      <div className="text-cyan-400 text-3xl font-bold font-mono">
                        {String(Math.floor(displayTimer / 60)).padStart(2, '0')}:{String(displayTimer % 60).padStart(2, '0')}
                      </div>
                      <div className="text-gray-500 text-xs font-bold tracking-widest">TIME</div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-300 text-xl mb-8">
                  {gameState.isWinner
                    ? 'You are the last Gasing standing!'
                    : 'Your Gasing stopped spinning...'}
                </p>
              )}
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
