# 🎮 PANGKAH: Gasing Battle Royale

## Game Overview
A top-down physics battle game based on traditional Malaysian "Gasing" (spinning tops). Control your Gasing against 10 AI bots in a shrinking arena. Be the last one spinning to win!

## 🎯 Objective
**Survive and be the last Gasing standing!** Eliminate opponents by:
- Maintaining your RPM (spin speed)
- Staying inside the shrinking safe zone
- Knocking out opponents with strategic collisions

## 🎮 Controls

### Movement
- **W** - Move Up
- **A** - Move Left
- **S** - Move Down
- **D** - Move Right

### Spin Mechanic (CRITICAL!)
- **J / K** - Increase RPM by **alternating** between these keys
- ⚠️ **Important**: You MUST alternate! Pressing J→J or K→K does nothing!
- ✅ **Correct**: J→K→J→K→J→K
- ❌ **Wrong**: J→J→J or K→K→K

## 📊 RPM System

Your RPM (Revolutions Per Minute) is your lifeline! It ranges from 0-100 and determines your performance.

### RPM Zones

#### 🔘 Grey Zone (0-30) - "Wobble Mode"
- **Color**: Grey
- **Status**: DANGER!
- **Effects**:
  - Sluggish movement (50% speed)
  - High vulnerability to knockback
  - Poor control
- **Strategy**: Get out of this zone FAST!

#### 🟢 Green Zone (30-85) - "Sweet Spot"
- **Color**: Green with glow effect
- **Status**: OPTIMAL
- **Effects**:
  - Perfect control and maneuverability
  - Best movement speed
  - Balanced offense and defense
- **Strategy**: Stay in this zone for maximum control!

#### 🔴 Red Zone (85-100) - "Over-Spin"
- **Color**: Red with intense glow
- **Status**: HIGH RISK / HIGH REWARD
- **Effects**:
  - Erratic, slippery movement (random shake)
  - 150% knockback damage to opponents
  - 50% self-recoil damage
  - Dangerous but powerful
- **Strategy**: Use strategically for powerful attacks, but be careful!

### RPM Decay
- **Natural Decay**: -0.5 RPM per frame (constant)
- **Outside Safe Zone**: -1.5 RPM per frame (3x faster!)

## 🎯 Safe Zone Mechanics

### The Shrinking Arena
- A green dashed circle shows the **Safe Zone**
- The zone shrinks continuously throughout the match
- Brown/muddy area outside = **Rough Terrain**

### Penalties for Being Outside Safe Zone
When you're outside the safe zone:
1. **RPM Decay Triples** (-1.5 instead of -0.5)
2. **Input Efficiency Halved** (J/K presses give 50% less RPM)
3. **Movement Drag Increased** (50% slower movement)

### Strategy
- Always try to stay inside the green zone
- If forced outside, spin frantically (J/K) to maintain RPM
- Move toward the center when the zone shrinks

## ⚔️ Combat System

### Collision Physics
- When two Gasing collide, the one with **higher RPM** wins
- Knockback is calculated based on:
  - Base force
  - Attacker's RPM
  - RPM zone multipliers

### Knockback Formula
```
Force = BaseForce + (AttackerRPM × Multiplier)
```

### Red Zone Combat Bonus
- **150% knockback** to opponents
- **50% self-recoil** (you also get pushed back!)
- Use when you need maximum impact

### Elimination
Opponents are eliminated when:
- Their RPM reaches 0 (stopped spinning)
- They are pushed outside the arena boundary

## 🤖 AI Bot Behavior

The 10 AI bots have intelligent behavior:

### State 1: Survival Mode
**Triggered when**:
- Bot is outside or near the edge of the safe zone
- Bot RPM is critically low

**Behavior**:
- Move toward arena center
- Focus on staying alive

### State 2: Chase Mode
**Triggered when**:
- Bot has healthy RPM (>40)
- Bot is safely inside the safe zone

**Behavior**:
- Hunt for targets with lower RPM
- Prioritize nearby weak opponents
- Strategic positioning

### Bot RPM
- Bots have visible RPM numbers above them
- Their RPM fluctuates realistically
- Target bots when their RPM is low!

## 🎨 Visual Indicators

### Player (YOU)
- Larger circle with "YOU" label
- Color changes based on RPM zone
- Glowing effect in Green/Red zones

### AI Bots
- 10 different colors for easy tracking
- RPM number displayed above each bot
- Glow effect when in optimal range

### Arena
- **Grey border**: Arena boundary (don't cross!)
- **Green dashed circle**: Safe zone (stay inside!)
- **Brown tinted area**: Rough terrain (penalties apply!)

## 📈 HUD Elements

### Top Left - RPM Gauge
- Visual bar showing current RPM (0-100)
- Color-coded: Grey → Green → Red
- Current RPM number
- Zone status (WOBBLE MODE / SWEET SPOT / OVER-SPIN!)
- Control reminder

### Top Right - Players Remaining
- Shows X/11 players still alive
- Updates in real-time as players are eliminated

### Bottom Left - Controls
- Quick reference for movement and spin controls
- Reminder to stay in the green zone

### Bottom Right - Safe Zone Info
- Current safe zone radius
- "Shrinking..." indicator

## 🏆 Win/Lose Conditions

### Victory 🏆
- You are the last Gasing with RPM > 0
- All 10 AI bots have been eliminated
- **"VICTORY!"** screen appears

### Defeat 💀
- Your RPM reaches 0 (stopped spinning)
- You are pushed outside the arena boundary
- **"KNOCKED OUT"** screen appears

## 💡 Pro Tips & Strategies

### 1. RPM Management
- Keep alternating J/K to maintain 40-70 RPM (sweet spot)
- Don't let RPM drop below 30 (grey zone)
- Only enter red zone (85+) for strategic attacks

### 2. Safe Zone Awareness
- Always know where the safe zone is
- Plan your movements toward the center as it shrinks
- Avoid getting trapped outside

### 3. Combat Tactics
- **Defensive**: Stay in green zone (30-85) for control
- **Offensive**: Boost to red zone (85+) before collision
- **Evasive**: Use WASD to dodge when low on RPM

### 4. Bot Exploitation
- Watch bot RPM numbers
- Attack when they're in grey zone (low RPM)
- Avoid bots with high RPM unless you're in red zone

### 5. Positioning
- Control the center early game
- Use arena edges to trap opponents
- Push weakened bots toward the boundary

### 6. Endgame Strategy
- As safe zone shrinks, all players cluster
- Maintain high RPM for final confrontations
- Use the chaos to eliminate multiple bots

## 🔧 Technical Details

### Physics Engine
- **Matter.js** for realistic 2D physics
- Zero gravity (top-down view)
- Friction and restitution for authentic spinning top feel

### Performance
- 60 FPS target
- Optimized collision detection
- Smooth canvas rendering

### Browser Compatibility
- Modern browsers with Canvas API support
- Keyboard input required
- Best on desktop/laptop

## 🎮 How to Play

1. **Start**: The game begins immediately when loaded
2. **Spin**: Press J and K alternating to build RPM
3. **Move**: Use WASD to navigate
4. **Survive**: Stay in the safe zone and maintain RPM
5. **Fight**: Collide with opponents to knock them out
6. **Win**: Be the last one standing!

## 🔄 Restart

Press the **"PLAY AGAIN"** button on the game over screen to restart.

---

## 🎯 Quick Start Checklist

- [ ] Understand J/K alternating mechanic
- [ ] Know the three RPM zones (Grey/Green/Red)
- [ ] Watch the safe zone (green circle)
- [ ] Check opponent RPM before attacking
- [ ] Keep your RPM above 30 at all times
- [ ] Stay inside the safe zone
- [ ] Eliminate all 10 bots to win!

---

**Good luck, and may your Gasing spin forever! 🌀**
