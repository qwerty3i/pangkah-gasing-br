# 🌀 PANGKAH: Gasing Battle Royale

<div align="center">

**A physics-based battle royale game inspired by traditional Malaysian Gasing (spinning tops)**

![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)
![Matter.js](https://img.shields.io/badge/Matter.js-0.20.0-green?style=for-the-badge)
![Tailwind](https://img.shields.io/badge/Tailwind-4.0-38bdf8?style=for-the-badge&logo=tailwind-css)

[Play Now](#getting-started) • [Game Guide](GAME_GUIDE.md) • [Technical Docs](TECHNICAL_GUIDE.md) • [Quick Reference](QUICK_REFERENCE.md)

</div>

---

## 🎮 About

**PANGKAH** is a top-down physics battle game where you control a Gasing (traditional Malaysian spinning top) in an intense battle royale against 10 AI opponents. Master the unique alternating spin mechanic, manage your RPM across three distinct zones, and survive in a shrinking arena to become the last Gasing standing!

### ✨ Key Features

- 🌀 **Unique Spin Mechanic**: Alternate J/K keys to maintain your spin
- ⚡ **Three RPM Zones**: Grey (Wobble), Green (Sweet Spot), Red (Over-Spin)
- 🎯 **Shrinking Safe Zone**: Battle Royale-style arena that penalizes stragglers
- 🤖 **Smart AI Bots**: 10 opponents with survival and chase behaviors
- ⚔️ **Physics-Based Combat**: Realistic collisions with knockback mechanics
- 🎨 **Polished UI**: Dynamic HUD with RPM gauge, player counter, and visual effects
- 🏆 **Win Conditions**: Eliminate all bots or be eliminated yourself

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+ installed
- Modern web browser (Chrome, Firefox, Edge, Safari)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd gasing-game
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   ```
   Navigate to http://localhost:3000
   ```

### Building for Production

```bash
npm run build
npm start
```

---

## 🎯 How to Play

### Controls

| Key | Action |
|-----|--------|
| **W** | Move Up |
| **A** | Move Left |
| **S** | Move Down |
| **D** | Move Right |
| **J / K** | Spin (Must Alternate!) |

### Objective

**Be the last Gasing spinning!**

1. **Maintain your RPM** by alternating J and K keys
2. **Stay inside the safe zone** (green circle)
3. **Knock out opponents** by colliding when you have higher RPM
4. **Survive** as the arena shrinks

### RPM System

Your RPM (Revolutions Per Minute) determines everything:

- **0-30 (Grey Zone)**: Sluggish movement, high vulnerability
- **30-85 (Green Zone)**: Optimal control and maneuverability ✨
- **85-100 (Red Zone)**: 150% damage but erratic movement

### Safe Zone

- The green dashed circle shows the safe zone
- It shrinks continuously throughout the match
- Being outside causes:
  - 3x faster RPM decay
  - 50% reduced input efficiency
  - 50% slower movement

---

## 📚 Documentation

- **[Game Guide](GAME_GUIDE.md)**: Complete gameplay mechanics, strategies, and tips
- **[Technical Guide](TECHNICAL_GUIDE.md)**: Implementation details and architecture
- **[Quick Reference](QUICK_REFERENCE.md)**: Quick lookup for controls and mechanics

---

## 🛠️ Tech Stack

### Frontend
- **Next.js 16.1.6** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS 4.0** - Utility-first styling

### Game Engine
- **Matter.js 0.20.0** - 2D physics engine
- **HTML5 Canvas API** - High-performance rendering

### State Management
- **React Hooks** - useState, useRef, useEffect

---

## 🎨 Game Architecture

```
┌─────────────────────────────────────┐
│         React Component             │
│  (State Management & UI)            │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Matter.js Physics Engine       │
│  (Bodies, Collisions, Forces)       │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│       Canvas Rendering Loop         │
│  (60 FPS, Visual Effects)           │
└─────────────────────────────────────┘
```

### Core Systems

1. **Physics Engine**: Matter.js handles all collision detection and force application
2. **Game Loop**: 60 FPS update cycle for physics, AI, and rendering
3. **AI System**: Finite State Machine (FSM) for bot behavior
4. **Input System**: Keyboard event handling with alternating key detection
5. **Rendering Pipeline**: Canvas API with glow effects and dynamic colors

---

## 🎯 Game Mechanics

### Alternating Spin Mechanic

The core innovation of PANGKAH is the alternating key press mechanic:

```typescript
// Only registers if different from last key
if (key === 'j' || key === 'k') {
  if (lastSpinKeyRef.current !== key) {
    currentRPM = Math.min(100, currentRPM + RPM_GAIN);
    lastSpinKeyRef.current = key;
  }
}
```

This creates a rhythm-based gameplay where players must constantly alternate J→K→J→K to maintain their spin.

### Combat System

Collisions are resolved based on RPM:

- Higher RPM wins the collision
- Knockback force = Base Force + (RPM × Multiplier)
- Red Zone (85+): 150% knockback but 50% self-recoil

### AI Behavior

Bots use a two-state FSM:

1. **Survival Mode**: Move toward center when threatened
2. **Chase Mode**: Hunt nearby targets with lower RPM

---

## 🏗️ Project Structure

```
gasing-game/
├── app/
│   ├── page.tsx          # Main game component (all game logic)
│   ├── layout.tsx        # Next.js app layout
│   ├── globals.css       # Global styles
│   └── favicon.ico       # App icon
├── public/               # Static assets
├── node_modules/         # Dependencies
├── package.json          # Project configuration
├── tsconfig.json         # TypeScript configuration
├── tailwind.config.js    # Tailwind configuration
├── GAME_GUIDE.md        # Player documentation
├── TECHNICAL_GUIDE.md   # Developer documentation
├── QUICK_REFERENCE.md   # Quick lookup guide
└── README.md            # This file
```

---

## 🎮 Gameplay Tips

### For Beginners

1. **Master the J/K alternation** - This is crucial!
2. **Stay in the green zone** (30-85 RPM)
3. **Watch the safe zone** - Always move toward center
4. **Avoid the grey zone** (0-30 RPM) - You're vulnerable

### Advanced Strategies

1. **Red Zone Attacks**: Boost to 85+ RPM before collision for maximum damage
2. **Bot Exploitation**: Check bot RPM numbers and attack when they're low
3. **Positioning**: Control the center early, use edges to trap opponents
4. **Endgame**: Maintain high RPM as players cluster in shrinking zone

---

## 🐛 Troubleshooting

### Game not loading?
- Ensure Node.js 20+ is installed
- Run `npm install` to install dependencies
- Check console for errors

### Controls not working?
- Click on the game canvas to focus it
- Ensure keyboard is connected
- Try refreshing the page

### Performance issues?
- Close other browser tabs
- Update your browser to the latest version
- Check if hardware acceleration is enabled

---

## 🤝 Contributing

This is a hackathon project, but contributions are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is created for educational and entertainment purposes.

---

## 🙏 Acknowledgments

- **Gasing**: Traditional Malaysian spinning top game
- **Matter.js**: Excellent 2D physics engine
- **Next.js**: Amazing React framework
- **Tailwind CSS**: Beautiful utility-first CSS

---

## 📞 Support

For questions or issues:
- Check the [Game Guide](GAME_GUIDE.md)
- Review the [Technical Guide](TECHNICAL_GUIDE.md)
- Open an issue on GitHub

---

<div align="center">

**Made with ❤️ for the Hackathon Q1 2026**

🌀 May your Gasing spin forever! 🌀

[⬆ Back to Top](#-pangkah-gasing-battle-royale)

</div>
