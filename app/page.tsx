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
}

interface GameState {
  phase: 'menu' | 'playing' | 'gameover';
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
const FRICTION_AIR = 0.025;          // LOW so things slide nicely
const RESTITUTION = 0.85;            // bouncy collisions
const DENSITY = 0.003;               // lighter = more reactive to forces

// RPM tuning  (at 60 fps)
const RPM_DECAY_PER_FRAME = 0.12;    // lose ~7.2 RPM/sec naturally
const RPM_GAIN_PER_PRESS = 6;        // each valid J/K press adds 6
const STARTING_RPM = 55;             // start in green zone

// Movement tuning
const PLAYER_MOVE_FORCE = 0.004;     // snappy movement
const BOT_MOVE_FORCE = 0.003;        // bots move almost as fast

// Safe zone
const SAFE_ZONE_INITIAL = 360;
const SAFE_ZONE_MIN = 120;
const SAFE_ZONE_SHRINK_PER_SEC = 4;  // px per second

// Combat
const KNOCKBACK_BASE = 0.008;
const KNOCKBACK_RPM_MULT = 0.00012;

// Bot AI
const BOT_COUNT = 10;
const BOT_SPIN_CHANCE = 0.12;        // 12% per frame = ~7 spins/sec avg
const BOT_SPIN_GAIN = 5;

const BOT_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B739', '#52B788',
];
const BOT_NAMES = [
  'Razak', 'Siti', 'Ahmad', 'Mei Ling', 'Raju',
  'Farah', 'Kumar', 'Aisyah', 'Wei Ming', 'Priya',
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
    keys: Set<string>;
    lastSpinKey: string;
    animId: number;
    frameCount: number;
    playerAlive: boolean;
    playerTrail: { x: number; y: number; alpha: number }[];
  } | null>(null);

  const [displayRPM, setDisplayRPM] = useState(STARTING_RPM);
  const [gameState, setGameState] = useState<GameState>({
    phase: 'menu',
    isWinner: false,
    playersAlive: BOT_COUNT + 1,
  });
  const [displaySafeZone, setDisplaySafeZone] = useState(SAFE_ZONE_INITIAL);

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

    // ── Arena walls (circular approximation with segments) ──
    const wallSegs = 32;
    const wallBodies: Matter.Body[] = [];
    for (let i = 0; i < wallSegs; i++) {
      const a1 = (i / wallSegs) * Math.PI * 2;
      const a2 = ((i + 1) / wallSegs) * Math.PI * 2;
      const mx = CX + Math.cos((a1 + a2) / 2) * (ARENA_R + 25);
      const my = CY + Math.sin((a1 + a2) / 2) * (ARENA_R + 25);
      const len = 2 * (ARENA_R + 25) * Math.sin(Math.PI / wallSegs) + 10;
      const wall = Matter.Bodies.rectangle(mx, my, len, 50, {
        isStatic: true,
        angle: (a1 + a2) / 2 + Math.PI / 2,
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
    for (let i = 0; i < BOT_COUNT; i++) {
      const angle = (i / BOT_COUNT) * Math.PI * 2;
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
        rpm: 45 + Math.random() * 30,  // 45-75 starting RPM
        color: BOT_COLORS[i],
        name: BOT_NAMES[i],
        alive: true,
        stateTimer: 0,
        trail: [],
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

        // ── Knockback vector ──
        const dx = defender.position.x - attacker.position.x;
        const dy = defender.position.y - attacker.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;

        let force = KNOCKBACK_BASE + attackerRPM * KNOCKBACK_RPM_MULT;

        // Red zone bonus
        if (attackerRPM >= 85) {
          force *= 1.5;
          // Self-recoil
          Matter.Body.applyForce(attacker, attacker.position, {
            x: -nx * force * 0.4,
            y: -ny * force * 0.4,
          });
        }

        // Defender with low RPM gets extra knockback
        if (defenderRPM < 30) {
          force *= 1.3;
        }

        Matter.Body.applyForce(defender, defender.position, {
          x: nx * force,
          y: ny * force,
        });

        // Collision drains some RPM from defender
        const rpmDrain = 3 + (attackerRPM - defenderRPM) * 0.05;
        if (defender.label === 'player') {
          g.currentRPM = Math.max(0, g.currentRPM - Math.max(0, rpmDrain));
        } else {
          const defBot = bots.find((b) => b.body === defender);
          if (defBot) defBot.rpm = Math.max(0, defBot.rpm - Math.max(0, rpmDrain));
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
      keys: new Set<string>(),
      lastSpinKey: '',
      animId: 0,
      frameCount: 0,
      playerAlive: true,
      playerTrail: [] as { x: number; y: number; alpha: number }[],
    };
    gameRef.current = game;

    // ── Keyboard handlers ──
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ('wasd'.includes(k) && k.length === 1) game.keys.add(k);

      if ((k === 'j' || k === 'k') && game.playerAlive) {
        if (game.lastSpinKey !== k) {
          const playerDist = dist2Center(game.player);
          const outside = playerDist > game.safeZone;
          const gain = outside ? RPM_GAIN_PER_PRESS * 0.5 : RPM_GAIN_PER_PRESS;
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

    // ── Main game loop ──
    const tick = () => {
      if (!game.playerAlive && game.bots.every((b) => !b.alive)) {
        game.animId = requestAnimationFrame(tick);
        return;
      }

      game.frameCount++;
      Matter.Engine.update(engine, 1000 / 60);

      // ─── Player movement ───
      if (game.playerAlive) {
        let mf = PLAYER_MOVE_FORCE;

        // RPM affects movement
        if (game.currentRPM < 30) {
          mf *= 0.6; // sluggish in grey zone
        } else if (game.currentRPM >= 30 && game.currentRPM < 85) {
          mf *= 1.0; // perfect in green
        }
        // Red zone: full speed but erratic
        if (game.currentRPM >= 85) {
          const shake = 0.0008;
          Matter.Body.applyForce(player, player.position, {
            x: (Math.random() - 0.5) * shake,
            y: (Math.random() - 0.5) * shake,
          });
        }

        const pDist = dist2Center(player);
        const pOutside = pDist > game.safeZone;
        const dragMult = pOutside ? 0.6 : 1.0;

        if (game.keys.has('w'))
          Matter.Body.applyForce(player, player.position, { x: 0, y: -mf * dragMult });
        if (game.keys.has('s'))
          Matter.Body.applyForce(player, player.position, { x: 0, y: mf * dragMult });
        if (game.keys.has('a'))
          Matter.Body.applyForce(player, player.position, { x: -mf * dragMult, y: 0 });
        if (game.keys.has('d'))
          Matter.Body.applyForce(player, player.position, { x: mf * dragMult, y: 0 });

        // RPM decay
        let decay = RPM_DECAY_PER_FRAME;
        if (pOutside) decay *= 2.5;
        game.currentRPM = Math.max(0, game.currentRPM - decay);

        // Trail
        game.playerTrail.push({ x: player.position.x, y: player.position.y, alpha: 1 });
        if (game.playerTrail.length > 20) game.playerTrail.shift();
        game.playerTrail.forEach((t) => (t.alpha -= 0.05));

        // Elimination check
        if (game.currentRPM <= 0 || pDist > ARENA_R + 10) {
          game.playerAlive = false;
          setGameState({ phase: 'gameover', isWinner: false, playersAlive: 0 });
        }
      }

      // ─── Safe zone shrink ───
      if (game.frameCount % 60 === 0 && game.safeZone > SAFE_ZONE_MIN) {
        game.safeZone = Math.max(SAFE_ZONE_MIN, game.safeZone - SAFE_ZONE_SHRINK_PER_SEC);
        setDisplaySafeZone(game.safeZone);
      }

      // ─── Bot AI ───
      let aliveCount = 0;
      for (const bot of game.bots) {
        if (!bot.alive) continue;

        const bDist = dist2Center(bot.body);

        // Elimination
        if (bot.rpm <= 0 || bDist > ARENA_R + 10) {
          bot.alive = false;
          continue;
        }

        aliveCount++;

        // Bot RPM management — bots spin aggressively
        const bOutside = bDist > game.safeZone;
        let botDecay = RPM_DECAY_PER_FRAME * 0.7; // bots decay a bit slower
        if (bOutside) botDecay *= 2.5;
        bot.rpm = Math.max(0, bot.rpm - botDecay);

        // Bots "spin" frequently
        if (Math.random() < BOT_SPIN_CHANCE) {
          const gain = bOutside ? BOT_SPIN_GAIN * 0.5 : BOT_SPIN_GAIN;
          bot.rpm = Math.min(95, bot.rpm + gain); // bots cap at 95
        }

        bot.stateTimer++;

        // ── AI Decision Making ──
        const bf = BOT_MOVE_FORCE;

        if (bOutside || bDist > game.safeZone * 0.85) {
          // SURVIVAL: Rush toward center
          const dx = CX - bot.body.position.x;
          const dy = CY - bot.body.position.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          Matter.Body.applyForce(bot.body, bot.body.position, {
            x: (dx / d) * bf * 1.5,
            y: (dy / d) * bf * 1.5,
          });
        } else if (bot.rpm > 35) {
          // CHASE: Find weakest nearby target
          let bestTarget: Matter.Body | null = null;
          let bestScore = -Infinity;

          // Consider player
          if (game.playerAlive && game.currentRPM < bot.rpm) {
            const pdx = player.position.x - bot.body.position.x;
            const pdy = player.position.y - bot.body.position.y;
            const pDist = Math.sqrt(pdx * pdx + pdy * pdy);
            if (pDist < 300) {
              const score = (bot.rpm - game.currentRPM) / (pDist + 1) * 100;
              if (score > bestScore) {
                bestScore = score;
                bestTarget = player;
              }
            }
          }

          // Consider other bots
          for (const other of game.bots) {
            if (other === bot || !other.alive) continue;
            if (other.rpm >= bot.rpm) continue;

            const odx = other.body.position.x - bot.body.position.x;
            const ody = other.body.position.y - bot.body.position.y;
            const oDist = Math.sqrt(odx * odx + ody * ody);
            if (oDist < 300) {
              const score = (bot.rpm - other.rpm) / (oDist + 1) * 100;
              if (score > bestScore) {
                bestScore = score;
                bestTarget = other.body;
              }
            }
          }

          if (bestTarget) {
            const dx = bestTarget.position.x - bot.body.position.x;
            const dy = bestTarget.position.y - bot.body.position.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            Matter.Body.applyForce(bot.body, bot.body.position, {
              x: (dx / d) * bf,
              y: (dy / d) * bf,
            });
          } else {
            // Wander toward center-ish with some randomness
            const wx = CX + (Math.random() - 0.5) * 200 - bot.body.position.x;
            const wy = CY + (Math.random() - 0.5) * 200 - bot.body.position.y;
            const wd = Math.sqrt(wx * wx + wy * wy) || 1;
            Matter.Body.applyForce(bot.body, bot.body.position, {
              x: (wx / wd) * bf * 0.5,
              y: (wy / wd) * bf * 0.5,
            });
          }
        } else {
          // LOW RPM: Flee from everyone, try to survive
          let fleeX = 0;
          let fleeY = 0;
          for (const other of game.bots) {
            if (other === bot || !other.alive) continue;
            const dx = bot.body.position.x - other.body.position.x;
            const dy = bot.body.position.y - other.body.position.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            if (d < 150) {
              fleeX += (dx / d) / (d * 0.01);
              fleeY += (dy / d) / (d * 0.01);
            }
          }
          if (game.playerAlive) {
            const dx = bot.body.position.x - player.position.x;
            const dy = bot.body.position.y - player.position.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            if (d < 150) {
              fleeX += (dx / d) / (d * 0.01);
              fleeY += (dy / d) / (d * 0.01);
            }
          }
          const fd = Math.sqrt(fleeX * fleeX + fleeY * fleeY) || 1;
          Matter.Body.applyForce(bot.body, bot.body.position, {
            x: (fleeX / fd) * bf * 0.8,
            y: (fleeY / fd) * bf * 0.8,
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

      // ─── Render ───
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
      ctx.arc(CX, CY, game.safeZone, 0, Math.PI * 2, true);
      ctx.fill();

      // Safe zone glow
      const grad = ctx.createRadialGradient(CX, CY, game.safeZone - 10, CX, CY, game.safeZone + 10);
      grad.addColorStop(0, 'rgba(0, 255, 136, 0.05)');
      grad.addColorStop(1, 'rgba(0, 255, 136, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(CX, CY, game.safeZone + 10, 0, Math.PI * 2);
      ctx.fill();

      // Safe zone line
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(CX, CY, game.safeZone, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arena boundary
      ctx.strokeStyle = 'rgba(255, 100, 100, 0.4)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(CX, CY, ARENA_R, 0, Math.PI * 2);
      ctx.stroke();

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
        if (bot.rpm > 30) {
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
        ctx.fillStyle = bot.rpm < 30 ? '#ff6666' : bot.rpm < 85 ? '#66ff88' : '#ff4444';
        ctx.font = '9px monospace';
        ctx.fillText(`${Math.floor(bot.rpm)}`, bot.body.position.x, bot.body.position.y - BOT_R - 2);
      }

      // ── Draw player ──
      if (game.playerAlive) {
        // Trail
        for (const t of game.playerTrail) {
          if (t.alpha <= 0) continue;
          const trailColor =
            game.currentRPM >= 85 ? `rgba(255,50,50,${t.alpha * 0.3})`
              : game.currentRPM >= 30 ? `rgba(0,255,136,${t.alpha * 0.3})`
                : `rgba(150,150,150,${t.alpha * 0.2})`;
          ctx.fillStyle = trailColor;
          ctx.beginPath();
          ctx.arc(t.x, t.y, PLAYER_R * 0.5 * t.alpha, 0, Math.PI * 2);
          ctx.fill();
        }

        // Glow
        const pColor =
          game.currentRPM >= 85 ? '#ff3333'
            : game.currentRPM >= 30 ? '#00ff88'
              : '#888888';

        if (game.currentRPM >= 30) {
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
  }, []);

  // ─── Start game ──────────────────────────────────────────────
  const startGame = useCallback(() => {
    setGameState({ phase: 'playing', isWinner: false, playersAlive: BOT_COUNT + 1 });
    setDisplayRPM(STARTING_RPM);
    setDisplaySafeZone(SAFE_ZONE_INITIAL);
  }, []);

  // Run engine when phase changes to playing
  useEffect(() => {
    if (gameState.phase !== 'playing') return;
    const cleanup = initGame();
    return cleanup;
  }, [gameState.phase, initGame]);

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
    if (gameRef.current) {
      cancelAnimationFrame(gameRef.current.animId);
      Matter.World.clear(gameRef.current.engine.world, false);
      Matter.Engine.clear(gameRef.current.engine);
      gameRef.current = null;
    }
    setGameState({ phase: 'menu', isWinner: false, playersAlive: BOT_COUNT + 1 });
  };

  // ─── RPM helpers ──────────────────────────────────────────────
  const rpmColor =
    displayRPM >= 85 ? '#ff3333'
      : displayRPM >= 30 ? '#00ff88'
        : '#888888';

  const rpmZone =
    displayRPM >= 85 ? 'OVER-SPIN!'
      : displayRPM >= 30 ? 'SWEET SPOT'
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

        {/* ── HUD (only during gameplay) ── */}
        {gameState.phase === 'playing' && (
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
                  {gameState.playersAlive}<span className="text-lg text-gray-500">/{BOT_COUNT + 1}</span>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="absolute bottom-4 left-4 pointer-events-none">
              <div className="bg-black/60 backdrop-blur rounded-lg px-3 py-2 text-[11px] text-gray-400 space-y-0.5">
                <div><span className="text-yellow-400 font-bold">WASD</span> Move</div>
                <div><span className="text-yellow-400 font-bold">J/K</span> Spin (alternate!)</div>
              </div>
            </div>

            {/* Safe zone radius */}
            <div className="absolute bottom-4 right-4 pointer-events-none">
              <div className="bg-black/60 backdrop-blur rounded-lg px-3 py-2">
                <div className="text-green-400 text-[10px] font-bold tracking-widest">SAFE ZONE</div>
                <div className="text-white text-xl font-mono font-bold">{Math.floor(displaySafeZone)}<span className="text-xs text-gray-500">m</span></div>
              </div>
            </div>
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
                      <div className="text-gray-400 font-bold">0-30</div>
                      <div className="text-gray-500">Wobble 🫨</div>
                    </div>
                    <div className="bg-green-900/30 rounded p-2 text-center border border-green-800/30">
                      <div className="text-green-400 font-bold">30-85</div>
                      <div className="text-green-600">Sweet Spot ✨</div>
                    </div>
                    <div className="bg-red-900/30 rounded p-2 text-center">
                      <div className="text-red-400 font-bold">85-100</div>
                      <div className="text-red-600">Over-Spin! 🔥</div>
                    </div>
                  </div>
                </div>
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
                Battle against {BOT_COUNT} AI opponents in a shrinking arena
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
