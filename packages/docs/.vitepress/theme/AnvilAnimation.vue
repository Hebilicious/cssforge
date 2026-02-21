<template>
  <div class="anvil-container">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-50 -50 900 750"
      width="100%"
      height="100%"
    >
      <defs>
        <radialGradient id="bgGrad" cx="50%" cy="50%" r="75%">
          <stop offset="0%" stop-color="#140d26" />
          <stop offset="100%" stop-color="#030206" />
        </radialGradient>

        <linearGradient id="metalDark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2a2a35" />
          <stop offset="40%" stop-color="#15151c" />
          <stop offset="100%" stop-color="#08080c" />
        </linearGradient>

        <linearGradient id="metalLight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#555568" />
          <stop offset="50%" stop-color="#2b2b3a" />
          <stop offset="100%" stop-color="#111118" />
        </linearGradient>

        <linearGradient id="metalPlate" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#3b3b4f" />
          <stop offset="20%" stop-color="#6a6a82" />
          <stop offset="80%" stop-color="#44445c" />
          <stop offset="100%" stop-color="#1a1a24" />
        </linearGradient>

        <linearGradient id="metalCylinder" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#0a0a10" />
          <stop offset="30%" stop-color="#4a4a5e" />
          <stop offset="70%" stop-color="#4a4a5e" />
          <stop offset="100%" stop-color="#0a0a10" />
        </linearGradient>

        <linearGradient id="energyStrike" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#00f3ff" />
          <stop offset="50%" stop-color="#ffffff" />
          <stop offset="100%" stop-color="#ff00a0" />
        </linearGradient>

        <filter id="dropShadow" x="-20%" y="-20%" width="150%" height="150%">
          <feDropShadow dx="0" dy="15" stdDeviation="10" flood-color="#000" flood-opacity="0.9" />
        </filter>
        <filter id="shadowSmall" x="-20%" y="-20%" width="150%" height="150%">
          <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#000" flood-opacity="0.8" />
        </filter>

        <filter id="glowCyan" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur1" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="15" result="blur2" />
          <feMerge>
            <feMergeNode in="blur2" />
            <feMergeNode in="blur1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="glowMagenta" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur1" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="15" result="blur2" />
          <feMerge>
            <feMergeNode in="blur2" />
            <feMergeNode in="blur1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <pattern id="gridPattern" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#00f3ff" stroke-width="1" stroke-opacity="0.05" />
        </pattern>
      </defs>

      <!-- Deep Background Grid -->
      <!-- Removed static bg rects to allow Anvil to float on page background -->

      <!-- Background Forge Reactor Rings -->
      <g class="reactor-ring" opacity="0.4">
        <circle cx="0" cy="0" r="280" fill="none" stroke="#00f3ff" stroke-width="1" stroke-dasharray="4 16" />
        <circle cx="0" cy="0" r="300" fill="none" stroke="#ff00a0" stroke-width="2" stroke-dasharray="40 80 10 40" />
        <circle cx="0" cy="0" r="320" fill="none" stroke="#00f3ff" stroke-width="8" opacity="0.1" />
      </g>

      <!-- Camera shake group -->
      <g class="scene-shake">
        <!-- Floor Plane -->
        <ellipse cx="400" cy="620" rx="350" ry="25" fill="#000" filter="blur(10px)" opacity="0.8" />
        <line x1="-100" y1="620" x2="900" y2="620" stroke="#00f3ff" stroke-width="2" opacity="0.3" />

        <!-- Forge Pillar (Right) -->
        <rect x="720" y="-50" width="200" height="700" fill="url(#metalDark)" filter="url(#dropShadow)" />
        <rect x="730" y="-50" width="20" height="700" fill="url(#metalPlate)" />
        <rect x="780" y="50" width="40" height="550" fill="#050508" stroke="#111" stroke-width="4" />
        <line x1="800" y1="50" x2="800" y2="600" stroke="#ff00a0" stroke-width="4" filter="url(#glowMagenta)" opacity="0.4" />
        <path d="M 740 200 L 860 200 L 880 240 L 880 320 L 860 360 L 740 360 Z" fill="url(#metalLight)" filter="url(#shadowSmall)" />
        <text x="750" y="230" font-family="sans-serif" font-weight="900" font-size="14" fill="#00f3ff">SYS_PIVOT</text>
        <rect x="750" y="330" width="60" height="8" fill="#ff00a0" />

        <!-- Anvil Assembly -->
        <g class="anvil" filter="url(#dropShadow)">
          <!-- Base Tier 1 -->
          <polygon points="210,620 590,620 560,560 240,560" fill="url(#metalDark)" />
          <polygon points="240,560 560,560 550,555 250,555" fill="url(#metalPlate)" />
          <line x1="220" y1="615" x2="580" y2="615" stroke="#ff00a0" stroke-width="4" filter="url(#glowMagenta)" />

          <!-- Base Tier 2 -->
          <polygon points="250,555 550,555 510,510 290,510" fill="url(#metalLight)" stroke="#111" stroke-width="2" />

          <!-- CSSFORGE Branding -->
          <g transform="translate(400, 585)">
            <rect x="-140" y="-16" width="280" height="32" rx="4" fill="#050508" stroke="#00f3ff" stroke-width="1" />
            <text x="0" y="7" text-anchor="middle" font-size="24" font-weight="900" font-family="system-ui, sans-serif" letter-spacing="8" fill="#ffffff" filter="url(#glowCyan)">CSSFORGE</text>
          </g>

          <!-- Waist / Core Block -->
          <rect x="310" y="440" width="180" height="70" fill="#0a0a0f" />
          <rect x="325" y="440" width="30" height="70" fill="url(#metalCylinder)" stroke="#000" stroke-width="2" />
          <rect x="385" y="440" width="30" height="70" fill="url(#metalCylinder)" stroke="#000" stroke-width="2" />
          <rect x="445" y="440" width="30" height="70" fill="url(#metalCylinder)" stroke="#000" stroke-width="2" />
          <rect x="360" y="450" width="20" height="50" fill="#00f3ff" filter="url(#glowCyan)" opacity="0.6" />
          <rect x="420" y="450" width="20" height="50" fill="#00f3ff" filter="url(#glowCyan)" opacity="0.6" />

          <!-- Upper Body -->
          <polygon points="120,360 580,360 580,400 490,440 310,440 220,400" fill="url(#metalDark)" stroke="#111" stroke-width="3" />
          <polygon points="135,363 565,363 565,395 480,435 320,435 225,395" fill="none" stroke="url(#metalPlate)" stroke-width="6" />

          <!-- Strike Plate -->
          <polygon points="110,340 590,340 580,360 120,360" fill="url(#metalPlate)" />
          <line x1="110" y1="340" x2="590" y2="340" stroke="#ffffff" stroke-width="2" opacity="0.8" />
          <line x1="140" y1="350" x2="560" y2="350" stroke="#00f3ff" stroke-width="2" filter="url(#glowCyan)" />

          <!-- Bolts -->
          <circle cx="260" cy="380" r="4" fill="#111" stroke="#555" stroke-width="1" />
          <circle cx="320" cy="380" r="4" fill="#111" stroke="#555" stroke-width="1" />
          <circle cx="480" cy="380" r="4" fill="#111" stroke="#555" stroke-width="1" />
          <circle cx="540" cy="380" r="4" fill="#111" stroke="#555" stroke-width="1" />

          <!-- Hardy Hole -->
          <polygon points="510,340 540,340 535,350 515,350" fill="#ff00a0" filter="url(#glowMagenta)" />
        </g>

        <!-- Hammer Assembly -->
        <g class="hammer" filter="url(#dropShadow)">
          <g transform="translate(800, 280)">
            <!-- Hydraulic Arm -->
            <rect x="-380" y="-18" width="380" height="12" fill="url(#metalCylinder)" stroke="#111" stroke-width="2" />
            <rect x="-380" y="6" width="380" height="12" fill="url(#metalCylinder)" stroke="#111" stroke-width="2" />
            <line x1="-360" y1="0" x2="-40" y2="0" stroke="#00f3ff" stroke-width="4" filter="url(#glowCyan)" />
            <rect x="-280" y="-25" width="30" height="50" rx="4" fill="url(#metalDark)" stroke="#334" stroke-width="2" />
            <rect x="-160" y="-25" width="30" height="50" rx="4" fill="url(#metalDark)" stroke="#334" stroke-width="2" />

            <!-- Hammer Head -->
            <g transform="translate(-400, 0)">
              <rect x="-70" y="-100" width="140" height="180" rx="12" fill="url(#metalDark)" stroke="#0a0a0f" stroke-width="4" />
              <rect x="-60" y="-90" width="120" height="160" rx="6" fill="url(#metalLight)" stroke="#555568" stroke-width="2" />
              <rect x="-40" y="-70" width="80" height="20" rx="2" fill="#08080c" />
              <rect x="-40" y="-40" width="80" height="80" rx="4" fill="#050508" stroke="#ff00a0" stroke-width="1" />
              <circle cx="0" cy="0" r="28" fill="#111" stroke="#00f3ff" stroke-width="3" />
              <circle cx="0" cy="0" r="18" fill="#00f3ff" filter="url(#glowCyan)" />
              <circle cx="0" cy="0" r="8" fill="#ffffff" />
              <path d="M -30 -100 L 30 -100 L 40 -120 L -40 -120 Z" fill="url(#metalPlate)" />
              <rect x="-25" y="-120" width="50" height="6" fill="#00f3ff" filter="url(#glowCyan)" />
              <path d="M -70 80 L 70 80 L 80 100 L -80 100 Z" fill="url(#metalPlate)" />
              <rect x="-75" y="94" width="150" height="6" fill="url(#energyStrike)" filter="url(#glowMagenta)" />
              <line x1="-75" y1="100" x2="75" y2="100" stroke="#ffffff" stroke-width="3" />
            </g>
          </g>
        </g>

        <!-- Pivot Joint Cover -->
        <g transform="translate(800, 280)" filter="url(#shadowSmall)">
          <circle cx="0" cy="0" r="50" fill="url(#metalDark)" stroke="#222" stroke-width="4" />
          <circle cx="0" cy="0" r="35" fill="url(#metalPlate)" />
          <circle cx="0" cy="0" r="20" fill="#050508" />
          <circle cx="0" cy="0" r="12" fill="#00f3ff" filter="url(#glowCyan)" />
          <circle cx="0" cy="0" r="4" fill="#ffffff" />
        </g>

        <!-- Impact Effects -->
        <ellipse cx="400" cy="360" rx="1" ry="0.3" fill="none" stroke="#ffffff" class="shockwave" filter="url(#glowCyan)" />
        <ellipse cx="400" cy="360" rx="1" ry="0.3" fill="none" stroke="#ff00a0" class="shockwave shockwave-delayed" filter="url(#glowMagenta)" />

        <!-- Core Flash -->
        <ellipse cx="400" cy="360" rx="280" ry="120" fill="url(#bgGrad)" class="impact-flash" />
        <ellipse cx="400" cy="360" rx="150" ry="60" fill="#ffffff" filter="url(#glowCyan)" class="impact-flash" />

        <!-- Sparks -->
        <g transform="translate(400, 360)">
          <g class="spark" :style="{ '--rot': '10deg', '--dist': '350px' }"><rect x="0" y="-3" width="30" height="6" rx="3" fill="#ffffff" filter="url(#glowCyan)" /></g>
          <g class="spark" :style="{ '--rot': '25deg', '--dist': '280px' }"><rect x="0" y="-2" width="20" height="4" rx="2" fill="#ffffff" filter="url(#glowMagenta)" /></g>
          <g class="spark" :style="{ '--rot': '40deg', '--dist': '320px' }"><rect x="0" y="-4" width="40" height="8" rx="4" fill="#ffffff" filter="url(#glowCyan)" /></g>
          <g class="spark" :style="{ '--rot': '140deg', '--dist': '300px' }"><rect x="0" y="-3" width="25" height="6" rx="3" fill="#ffffff" filter="url(#glowMagenta)" /></g>
          <g class="spark" :style="{ '--rot': '160deg', '--dist': '380px' }"><rect x="0" y="-4" width="35" height="8" rx="4" fill="#ffffff" filter="url(#glowCyan)" /></g>
          <g class="spark" :style="{ '--rot': '170deg', '--dist': '250px' }"><rect x="0" y="-2" width="18" height="4" rx="2" fill="#ffffff" filter="url(#glowMagenta)" /></g>
          <g class="spark" :style="{ '--rot': '-15deg', '--dist': '450px' }"><rect x="0" y="-3" width="45" height="6" rx="3" fill="#ffffff" filter="url(#glowCyan)" /></g>
          <g class="spark" :style="{ '--rot': '-35deg', '--dist': '200px' }"><rect x="0" y="-2" width="15" height="4" rx="2" fill="#ffffff" filter="url(#glowMagenta)" /></g>
          <g class="spark" :style="{ '--rot': '-165deg', '--dist': '400px' }"><rect x="0" y="-3" width="30" height="6" rx="3" fill="#ffffff" filter="url(#glowCyan)" /></g>
          <g class="spark" :style="{ '--rot': '-145deg', '--dist': '280px' }"><rect x="0" y="-2" width="22" height="4" rx="2" fill="#ffffff" filter="url(#glowMagenta)" /></g>
          <g class="spark" :style="{ '--rot': '0deg', '--dist': '500px' }"><rect x="0" y="-5" width="60" height="10" rx="5" fill="#ffffff" filter="url(#glowCyan)" /></g>
          <g class="spark" :style="{ '--rot': '180deg', '--dist': '500px' }"><rect x="0" y="-5" width="60" height="10" rx="5" fill="#ffffff" filter="url(#glowMagenta)" /></g>
        </g>
      </g>

      <!-- HUD Panels -->
      <g font-family="sans-serif" font-weight="bold" font-size="12" fill="#00f3ff" opacity="0.6">
        <path d="M 20 50 L 20 20 L 50 20" fill="none" stroke="#00f3ff" stroke-width="2" />
        <text x="30" y="45">SYS.FORGE // ONLINE</text>
        <text x="30" y="65" fill="#ff00a0">PRSR: 80,000 kN</text>
        <text x="30" y="85">HEAT: 4,200 °K</text>
        <rect x="30" y="100" width="120" height="4" fill="#00f3ff" opacity="0.3" />
        <rect x="30" y="100" width="85" height="4" fill="#00f3ff" filter="url(#glowCyan)" />
      </g>

      <g font-family="sans-serif" font-weight="bold" font-size="12" fill="#ff00a0" opacity="0.6" transform="translate(850, 680)">
        <path d="M 0 -30 L 30 -30 L 30 0" fill="none" stroke="#ff00a0" stroke-width="2" />
        <text x="20" y="-15" text-anchor="end">CYBER_ANVIL_v3.0</text>
      </g>

      <!-- Scanner -->
      <rect x="-50" y="0" width="1000" height="4" fill="#ffffff" filter="url(#glowCyan)" class="scanner" />
    </svg>
  </div>
</template>

<style scoped>
.anvil-container {
  width: 100%;
  max-width: 500px; /* Reduced from 640px to leave room for text */
  margin: 0 auto;
  aspect-ratio: 900 / 750;
  overflow: hidden;
  border-radius: 12px;
  /* Add scale/transform to align nicely on desktop if needed */
  transform: translateX(5%) scale(1.1);
}

/* Camera Shake */
@keyframes camera-shake {
  0%, 19.9% { transform: translate(0, 0); }
  20% { transform: translate(-6px, 12px); }
  22% { transform: translate(8px, -10px); }
  24% { transform: translate(-4px, 6px); }
  26% { transform: translate(2px, -2px); }
  28%, 100% { transform: translate(0, 0); }
}

/* Hammer Swing */
@keyframes hammer-swing {
  0% { transform: rotate(120deg); animation-timing-function: cubic-bezier(0.4, 0, 0.8, 1); }
  18% { transform: rotate(130deg); animation-timing-function: cubic-bezier(0.8, 0, 1, 1); }
  20% { transform: rotate(0deg); animation-timing-function: ease-out; }
  22% { transform: rotate(6deg); animation-timing-function: ease-in-out; }
  26% { transform: rotate(0deg); animation-timing-function: linear; }
  45% { transform: rotate(0deg); animation-timing-function: cubic-bezier(0.2, 0.8, 0.4, 1); }
  70%, 100% { transform: rotate(120deg); }
}

/* Anvil Bump */
@keyframes anvil-bump {
  0%, 19.9% { transform: translateY(0); }
  20% { transform: translateY(12px); animation-timing-function: ease-out; }
  24% { transform: translateY(-2px); animation-timing-function: ease-in-out; }
  28%, 100% { transform: translateY(0); }
}

/* Shockwave */
@keyframes shockwave-expand {
  0%, 19.9% { opacity: 0; transform: scale(0); stroke-width: 25px; }
  20% { opacity: 1; transform: scale(0.1); stroke-width: 15px; }
  50%, 100% { opacity: 0; transform: scale(3.5); stroke-width: 1px; }
}

/* Sparks */
@keyframes spark-shoot {
  0%, 19.9% { opacity: 0; transform: rotate(var(--rot)) translateX(0) scale(1); }
  20% { opacity: 1; transform: rotate(var(--rot)) translateX(40px) scale(1.8); }
  45%, 100% { opacity: 0; transform: rotate(var(--rot)) translateX(var(--dist)) scale(0); }
}

/* Flash */
@keyframes flash {
  0%, 19.9% { opacity: 0; }
  20% { opacity: 1; transform: scale(1); }
  25% { opacity: 0.5; transform: scale(1.2); }
  30%, 100% { opacity: 0; }
}

/* Scanline */
@keyframes scanline {
  0% { transform: translateY(-100px); opacity: 0; }
  10%, 90% { opacity: 0.3; }
  100% { transform: translateY(850px); opacity: 0; }
}

/* Spin */
@keyframes spin-slow { 100% { transform: rotate(360deg); } }

.scene-shake { animation: camera-shake 3.5s infinite; transform-origin: center; }
.hammer { animation: hammer-swing 3.5s infinite; transform-origin: 800px 280px; }
.anvil { animation: anvil-bump 3.5s infinite; }
.shockwave { animation: shockwave-expand 3.5s infinite; transform-origin: 400px 360px; }
.shockwave-delayed { animation-delay: 0.05s; }
.spark { animation: spark-shoot 3.5s infinite ease-out; }
.impact-flash { animation: flash 3.5s infinite ease-out; pointer-events: none; transform-origin: 400px 360px; }
.scanner { animation: scanline 4s linear infinite; pointer-events: none; }
.reactor-ring { animation: spin-slow 20s linear infinite; transform-origin: 400px 360px; }
</style>
