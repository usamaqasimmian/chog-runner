/* PARALLAX_GLOBAL_DEF */
var parallax = { t:0, clouds:[], mountains:[] };
// Chog Runner — Fullscreen build (clean)
// Features: always-on RAF, document key handling, R restart, game-over freeze,
// ground-only obstacles, 200–600 px random gaps, coin chase, HUD, feet-aligned sprite,
// smoothed motion, initial render, DPR-correct drawing.
(function(){
  // Mobile detection (moved to top)
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
  
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  
  // Mobile-optimized device pixel ratio
  const dpr = isMobile ? Math.min(2, window.devicePixelRatio || 1) : Math.max(1, Math.floor(window.devicePixelRatio || 1));

  // Logical world units - adjusted for mobile
  const BASE_W = isMobile ? 400 : 900;
  const BASE_H = isMobile ? 225 : 260;
  
  // Set canvas size with mobile optimization
  canvas.width = BASE_W * dpr;
  canvas.height = BASE_H * dpr;
  ctx.scale(dpr, dpr);

  // Mobile-optimized scaling
  function fitToWindow(){
    const el = canvas;
    el.style.width = "100%";
    el.style.height = "100%";
    
    // Mobile-specific optimizations
    if (isMobile) {
      // Ensure canvas fits mobile screen properly
      const container = el.parentElement;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      
      // Maintain aspect ratio while fitting container
      const aspectRatio = BASE_W / BASE_H;
      let newWidth = containerWidth;
      let newHeight = containerWidth / aspectRatio;
      
      if (newHeight > containerHeight) {
        newHeight = containerHeight;
        newWidth = containerHeight * aspectRatio;
      }
      
      el.style.width = newWidth + 'px';
      el.style.height = newHeight + 'px';
    }
  }
  
  fitToWindow();
  window.addEventListener('resize', fitToWindow);

  // DOM
  const startOverlay = document.getElementById("startOverlay");
  const gameOverOverlay = document.getElementById("gameOverOverlay");
  const scoreLine = document.getElementById("scoreLine");
  const restartBtn = document.getElementById("restartBtn");
  const playerNameInput = document.getElementById("playerNameInput");
  const saveScoreBtn = document.getElementById("saveScoreBtn");
  const playerNameSection = document.getElementById("playerNameSection");
  const viewLeaderboardBtn = document.getElementById("viewLeaderboardBtn");
  const leaderboardModal = document.getElementById("leaderboardModal");
  const modalLeaderboardList = document.getElementById("modalLeaderboardList");
  const closeLeaderboard = document.getElementById("closeLeaderboard");
  const touchJump = document.getElementById("touchJump");
  const touchDuck = document.getElementById("touchDuck");

  // World state
  const world = { w: BASE_W, h: BASE_H, groundY: 210, speed: 6, speedTarget: 6, t: 0 };
  const chog = { x: 80, y: 0, w: 46, h: 44, vy: 0, onGround: true, duck: false, frame: 0 };
  const logo = { x: 360, y: 140, w: 34, h: 34, vx: 0, active: true, cooldown: 0 };
  // Smaller player hitbox (ignores hair & shadow)
  // Insets in world pixels - made more reasonable for better collision detection
  const CHOG_HITBOX = { left: 8, right: 6, top: 8, bottom: 6 }; // more reasonable hitbox
  function getChogHitbox(){
    // when ducking, visual draw height is slightly smaller; keep box consistent but a bit lower
    const hb = {
      x: chog.x + CHOG_HITBOX.left,
      y: chog.y + CHOG_HITBOX.top,
      w: chog.w - CHOG_HITBOX.left - CHOG_HITBOX.right,
      h: chog.h - CHOG_HITBOX.top - CHOG_HITBOX.bottom
    };
    return hb;
  }

  let obstacles = [];
    initParallax();
  // Timed power-up coin (spawns every 5–17s)
  const FPS = 60;
  function sec(s){ return Math.round(s * FPS); }

  let powerCoin = { active:false, x:0, y:0, w:34, h:34, vx:0 };
  let nextPowerAt = Number.POSITIVE_INFINITY;

  let invincibleFor = 0;   // frames
  let multiplierFor = 0;   // frames
  let scoreMultiplier = 1; // 1 or 5

  // Make power-up easier to collect: negative pad enlarges coin hitbox
  const POWER_PICK_PAD = -12; // increase magnitude for even easier pickups
  const OBSTACLE_COLLISION_PAD = 6;
  function createEmptySummary(){
    return {
      frames: 0,
      baseScore: 0,
      multiplierFrames: 0,
      multiplierBonus: 0,
      coinsCollected: 0,
      powerCoinsCollected: 0,
      startedAt: null,
      endedAt: null
    };
  }

  function createMulberry32(seed){
    let t = seed >>> 0;
    return function next(){
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function getPowerRandom(){
    if (powerRng) return powerRng();
    return Math.random();
  }

  function computeScoreFromSummary(stats){
    return (stats.baseScore || 0) + (stats.multiplierBonus || 0) + (stats.coinsCollected || 0) * 100;
  }

  function normaliseSummaryForPayload(stats){
    if (!stats || !stats.startedAt || !stats.endedAt){
      throw new Error('Run timing data missing');
    }
    return {
      frames: Math.max(0, Math.floor(stats.frames || 0)),
      baseScore: Math.max(0, Math.floor(stats.baseScore || 0)),
      multiplierFrames: Math.max(0, Math.floor(stats.multiplierFrames || 0)),
      multiplierBonus: Math.max(0, Math.floor(stats.multiplierBonus || 0)),
      coinsCollected: Math.max(0, Math.floor(stats.coinsCollected || 0)),
      powerCoinsCollected: Math.max(0, Math.floor(stats.powerCoinsCollected || 0)),
      startedAt: Math.max(0, Math.floor(stats.startedAt || 0)),
      endedAt: Math.max(0, Math.floor(stats.endedAt || 0))
    };
  }

  async function computeRunHash(summary, sessionId){
    if (!window.crypto || !window.crypto.subtle) return null;
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(`${JSON.stringify(summary)}:${sessionId}`);
      const digest = await window.crypto.subtle.digest('SHA-256', data);
      const bytes = Array.from(new Uint8Array(digest));
      return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      return null;
    }
  }

  async function requestLeaderboardSession(){
    const response = await fetch('/api/leaderboard/session', { method: 'POST' });
    if (!response.ok) {
      throw new Error(`Session request failed with status ${response.status}`);
    }
    const payload = await response.json();
    currentSession = {
      id: payload.sessionId,
      issuedAt: payload.issuedAt || Date.now(),
      expiresAt: payload.expiresAt || Date.now() + 5 * 60 * 1000,
      used: false,
      powerSeed: typeof payload.powerSeed === 'number' ? payload.powerSeed : null
    };
    powerRng = currentSession.powerSeed !== null ? createMulberry32(currentSession.powerSeed) : null;
    if (!running) {
      scheduleNextPower(true);
    }
    return currentSession;
  }

  function ensureLeaderboardSession(){
    if (currentSession && !currentSession.used) {
      return Promise.resolve(currentSession);
    }
    if (!pendingSessionPromise) {
      pendingSessionPromise = requestLeaderboardSession()
        .catch((error) => {
          // swallow
          currentSession = null;
          return null;
        })
        .finally(() => {
          pendingSessionPromise = null;
        });
    }
    return pendingSessionPromise;
  }

  function applyFrameScore(baseDelta){
    if (!runSummary || !runSummary.startedAt) return;
    runSummary.frames += 1;
    runSummary.baseScore += baseDelta;
    if (scoreMultiplier > 1){
      runSummary.multiplierFrames += 1;
      const bonus = baseDelta * (scoreMultiplier - 1);
      runSummary.multiplierBonus += bonus;
    }
    score = computeScoreFromSummary(runSummary);
  }

  function recordCoinPickup(){
    if (!runSummary || !runSummary.startedAt) return;
    runSummary.coinsCollected += 1;
    score = computeScoreFromSummary(runSummary);
  }

  function recordPowerCoinPickup(){
    if (!runSummary || !runSummary.startedAt) return;
    runSummary.powerCoinsCollected += 1;
  }

  function finaliseRunSummary(){
    if (!runSummary || !runSummary.startedAt || runSummary.endedAt) return;
    runSummary.endedAt = Date.now();
    finalSummary = normaliseSummaryForPayload(runSummary);
  }

  async function ensureRunning(){
    if (running) return true;
    if (gameOver) return false;
    const session = await ensureLeaderboardSession();
    if (!session) {
      alert('Unable to start run: leaderboard session unavailable.');
      return false;
    }
    runSummary = createEmptySummary();
    runSummary.startedAt = Date.now();
    if (powerRng){
      scheduleNextPower(true);
    }
    running = true;
    hide(startOverlay);
    hide(gameOverOverlay);
    return true;
  }


  function scheduleNextPower(reset=false){
    const delay = sec(5) + Math.floor(getPowerRandom()*sec(12));
    nextPowerAt = world.t + delay;
    if (reset) {
      powerCoin.active = false;
    }
  }
  /* === POWER-UP VARIANTS === */
  // 0: score x50 (blue glow) — 10s
  // 1: slow-motion 3s (purple glow)
  // 2: double-jump 10s (red glow)
  let powerType = 0;
  let allowDoubleJump = false;
  let usedSecondJump = false;

  function choosePowerType(){
    powerType = Math.floor(getPowerRandom()*3);
  }


  let running = false;
  let gameOver = false;
  let score = 0;
  let high = parseInt(localStorage.getItem("chog_highscore") || "0", 10) || 0;
  let leaderboard = [];
  let playerName = "";
  let currentSession = null;
  let pendingSessionPromise = null;
  let runSummary = createEmptySummary();
  let finalSummary = null;
  let saveInFlight = false;
  let powerRng = null;


  // Pixel-based gap control
  let distSinceLast = 0;
  let nextGap = 300;
  function randGap(){ return 200 + Math.floor(Math.random()*401); } // 200–600

  // ==== Sprite setup (single image) ====
  const CHOG_SPRITE = new Image();
  CHOG_SPRITE.src = "assets/chog.png";
  let CHOG_READY = false;
  CHOG_SPRITE.onload = () => { CHOG_READY = true; };
  // Coin image (blue Monad). Fallback to vector if not ready.
  const COIN_IMG = new Image();
  COIN_IMG.src = "assets/monad.png";
  let COIN_READY = false;
  COIN_IMG.onload = () => { COIN_READY = true; };


  const FRAME_W = 256;
  const FRAME_H = 256;
  const CHOG_SCALE = 0.35; // scales sprite into ~46x44 hitbox

  // Smoothed procedural motion
  let animTime = 0;
  let animPhase = 0;
  let bobSm = 0, swaySm = 0, tiltSm = 0;
  const BOB_MAX  = 1.8;
  const SWAY_MAX = 1.0;
  const TILT_MAX = 0.02;
  function lerp(a,b,t){ return a + (b-a)*t; }
  /* === PARALLAX & PARTICLES === */
  // Parallax layers: simple procedural mountains & clouds
  parallax = {
    t: 0,
    clouds: [],
    mountains: [],
  };

  function initParallax(){
    parallax.clouds = [];
    for (let i=0;i<8;i++){
      parallax.clouds.push({
        x: Math.random()*world.w,
        y: 40 + Math.random()*80,
        w: 90 + Math.random()*80,
        h: 30 + Math.random()*20,
        speed: 0.5 + Math.random()*0.4
      });
    }
    parallax.mountains = [];
    for (let i=0;i<6;i++){
      parallax.mountains.push({
        x: Math.random()*world.w,
        baseY: world.groundY+10,
        w: 180 + Math.random()*220,
        h: 60 + Math.random()*80,
        speed: 0.25 + Math.random()*0.25
      });
    }
  }

  // Particle system for sparkles & flashes
  const particles = [];
  function spawnSparkles(x, y, color){
    for (let i=0;i<12;i++){
      particles.push({
        x, y,
        vx: (Math.random()*2-1)*1.6,
        vy: -Math.random()*1.8,
        life: 28 + Math.random()*10,
        t: 0,
        color
      });
    }
  }
  function spawnFlash(x, y, color){
    // single expanding ring particle
    particles.push({
      x, y, ring: true, r: 6, vr: 2.8, life: 18, t:0, color
    });
  }
  function updateParticles(){
    for (const p of particles){
      p.t++; p.life--;
      if (p.ring){
        p.r += p.vr;
      } else {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06; // gravity
      }
    }
    // remove dead
    for (let i=particles.length-1;i>=0;i--){
      if (particles[i].life<=0) particles.splice(i,1);
    }
  }
  function drawParticles(){
    for (const p of particles){
      const alpha = Math.max(0, Math.min(1, p.life/28));
      if (p.ring){
        ctx.save();
        ctx.globalAlpha = 0.35*alpha;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = 0.9*alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 2, 2);
        ctx.restore();
      }
    }
  }

  // Day/Night cycle: hue over time
  let dayT = 0; // 0..1..2.. (wrap)
  function drawSky(){
    dayT += 0.0002; // slower cycle for smoother day/night // slow cycle
    const phase = dayT % 2; // 0..2
    // interpolate colors between day (light blue), sunset (orange), night (deep blue), dawn (pinkish)
    function lerpColor(a,b,t){ return `rgb(${Math.round(a[0]+(b[0]-a[0])*t)},${Math.round(a[1]+(b[1]-a[1])*t)},${Math.round(a[2]+(b[2]-a[2])*t)})`; }
    let top, mid, bot;
    if (phase < 0.5){ // day -> sunset
      const t = phase/0.5;
      top = lerpColor([160,210,255],[255,180,120], t);
      mid = lerpColor([190,225,255],[255,200,150], t);
      bot = lerpColor([220,240,255],[255,220,170], t);
    } else if (phase < 1.0){ // sunset -> night
      const t = (phase-0.5)/0.5;
      top = lerpColor([255,180,120],[15,25,60], t);
      mid = lerpColor([255,200,150],[25,35,80], t);
      bot = lerpColor([255,220,170],[35,45,100], t);
    } else if (phase < 1.5){ // night -> dawn
      const t = (phase-1.0)/0.5;
      top = lerpColor([15,25,60],[255,140,155], t);
      mid = lerpColor([25,35,80],[255,170,170], t);
      bot = lerpColor([35,45,100],[255,200,190], t);
    } else { // dawn -> day
      const t = (phase-1.5)/0.5;
      top = lerpColor([255,140,155],[160,210,255], t);
      mid = lerpColor([255,170,170],[190,225,255], t);
      bot = lerpColor([255,200,190],[220,240,255], t);
    }
    // gradient
    const g = ctx.createLinearGradient(0,0,0,world.h);
    g.addColorStop(0, top); g.addColorStop(0.5, mid); g.addColorStop(1, bot);
    ctx.fillStyle = g; ctx.fillRect(0,0,world.w,world.h);
  }

  function drawParallax(){
    // clouds (slowest)
    for (const c of parallax.clouds){
      c.x -= world.speed * 0.2 * c.speed;
      if (c.x + c.w < -20){ c.x = world.w + Math.random()*100; c.y = 40 + Math.random()*100; }
      // draw cloud
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.w*0.45, c.h*0.6, 0, 0, Math.PI*2);
      ctx.ellipse(c.x+ c.w*0.35, c.y+4, c.w*0.35, c.h*0.55, 0, 0, Math.PI*2);
      ctx.ellipse(c.x- c.w*0.35, c.y+6, c.w*0.35, c.h*0.55, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
    // mountains (mid layer)
    for (const m of parallax.mountains){
      m.x -= world.speed * 0.35 * m.speed;
      if (m.x + m.w < -20){ m.x = world.w + Math.random()*200; m.h = 60 + Math.random()*80; }
      ctx.save();
      const base = m.baseY;
      ctx.fillStyle = "#7a8aa6";
      ctx.beginPath();
      ctx.moveTo(m.x, base);
      ctx.lineTo(m.x + m.w*0.5, base - m.h);
      ctx.lineTo(m.x + m.w, base);
      ctx.closePath();
      ctx.fill();
      // snow cap
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.moveTo(m.x + m.w*0.5, base - m.h);
      ctx.lineTo(m.x + m.w*0.6, base - m.h*0.75);
      ctx.lineTo(m.x + m.w*0.4, base - m.h*0.75);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }


  // Utils
  function collide(a, b, pad=4){
    return (a.x + a.w - pad > b.x + pad &&
            a.x + pad < b.x + b.w - pad &&
            a.y + a.h - pad > b.y + pad &&
            a.y + pad < b.y + b.h - pad);
  }
  function show(el){ el.style.display = ""; }
  function hide(el){ el.style.display = "none"; }

  // Leaderboard functions
  async function saveToLeaderboard(score, summarySnapshot) {
    if (saveInFlight) return false;
    try {
      if (!summarySnapshot) {
        alert('No run summary available to save score.');
        return false;
      }
      const session = currentSession && !currentSession.used ? currentSession : null;
      if (!session) {
        alert('Session expired before score could be saved. Please try another run.');
        return false;
      }

      saveInFlight = true;
      const summaryPayload = normaliseSummaryForPayload(summarySnapshot);
      const hash = await computeRunHash(summaryPayload, session.id);

      const response = await fetch('/api/leaderboard/redis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playerName: playerName || 'Anonymous',
          score: score,
          timestamp: Date.now(),
          sessionId: session.id,
          summary: summaryPayload,
          hash
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        leaderboard = data.leaderboard || [];
        updateLeaderboardDisplay();
        session.used = true;
        currentSession = null;
        finalSummary = null;
        powerRng = null;
        ensureLeaderboardSession();
        return true;
      } else {
        // failure handled by alert below
        return false;
      }
    } catch (error) {
      // handled via alert below
      alert('Failed to save score. Please try again.');
      return false;
    } finally {
      saveInFlight = false;
    }
  }

  async function loadLeaderboard() {
    try {
      const response = await fetch('/api/leaderboard/redis');
      
      if (response.ok) {
        const data = await response.json();
        leaderboard = data.leaderboard || [];
        updateLeaderboardDisplay();
      } else {
        // ignore, UI will reflect stale data
      }
    } catch (error) {
      // network failure ignored, UI unchanged
    }
  }

  function updateLeaderboardDisplay() {
    if (!modalLeaderboardList) {
      return;
    }
    
    if (leaderboard.length === 0) {
      modalLeaderboardList.innerHTML = '<div style="text-align: center; color: #64748b; padding: 20px;">No scores yet!</div>';
      return;
    }

    const html = leaderboard.map((entry, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      const date = new Date(entry.timestamp).toLocaleDateString();
      return `
        <div class="leaderboard-item">
          <div class="player-info">
            <span class="medal">${medal}</span>
            <span class="player-name">${entry.playerName}</span>
          </div>
          <div class="score-info">
            <div class="score-value">${entry.score.toLocaleString()}</div>
            <div class="score-date">${date}</div>
          </div>
        </div>
      `;
    }).join('');

    modalLeaderboardList.innerHTML = html;
  }

  function resetGame(){
    world.speed = 6; world.speedTarget = 6; world.t = 0;
    chog.y = world.groundY - chog.h; chog.vy = 0; chog.onGround = true; chog.duck = false; chog.frame = 0;
    logo.x = 360; logo.y = world.groundY - 70; logo.active = true; logo.cooldown = 120;
    obstacles = [];
    initParallax();
    distSinceLast = 0; nextGap = randGap();
    score = 0; gameOver = false;
    hide(gameOverOverlay); show(startOverlay);
      powerCoin.active = false;
    if (powerRng){
      scheduleNextPower(true);
    } else {
      nextPowerAt = Number.POSITIVE_INFINITY;
    }
    invincibleFor = 0;
    multiplierFor = 0;
    scoreMultiplier = 1;
    runSummary = createEmptySummary();
    finalSummary = null;
    if (currentSession && !currentSession.used) {
      currentSession = null;
    }
    powerRng = null;
    ensureLeaderboardSession();
    
    // Reset UI elements
    playerNameSection.style.display = 'none';
    playerNameInput.value = '';
    saveScoreBtn.textContent = 'Save Score';
    saveScoreBtn.disabled = false;
    
    // Load leaderboard on game reset
    loadLeaderboard();
}

  function spawnObstacle(){
    const w = 18 + Math.floor(Math.random() * 42);  // 18–60
    const h = 22 + Math.floor(Math.random() * 48);  // 22–70
    obstacles.push({ x: world.w + 10, y: world.groundY - h, w, h });
  }

  function jump(stronger=false){
    if (chog.onGround){
      chog.vy = stronger ? -15 : -12.5;
      chog.onGround = false;
      world.speedTarget += 0.02;
    }
  }

  function performJump(){
    if (gameOver) return;
    if (chog.onGround){
      jump(false);
    } else if (allowDoubleJump && !usedSecondJump){
      usedSecondJump = true;
      chog.vy = -11.5;
    }
  }

  function update(){
    // Freeze world when game over, still allow a static draw to keep overlays correct.
    if (gameOver){ updateParticles();
    drawFrame(); return; }

    // Ease speed
    world.speed += (world.speedTarget - world.speed) * 0.02;

    // Background
    ctx.clearRect(0,0,world.w,world.h);
    drawSky();
    drawParallax();

    ctx.strokeStyle = "#d0d0d0"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, world.groundY + 1); ctx.lineTo(world.w, world.groundY + 1); ctx.stroke();
    ctx.setLineDash([10,14]);
    ctx.beginPath(); ctx.moveTo(-(world.t % 24), world.groundY + 9); ctx.lineTo(world.w, world.groundY + 9); ctx.stroke();
    ctx.setLineDash([]);

    // Gravity
    const g = 0.7;
    if (!chog.onGround){
      chog.vy += g; chog.y += chog.vy;
      if (chog.y >= world.groundY - chog.h){
        chog.y = world.groundY - chog.h; chog.vy = 0; chog.onGround = true; usedSecondJump = false;
      }
    }
    chog.frame += world.speed * 0.2;

    // Smoothed animation driving
    animTime += world.speed * 0.12;
    animPhase += world.speed * 0.09;
    const bobTarget  = Math.sin(animPhase)       * BOB_MAX;
    const swayTarget = Math.sin(animPhase * 1.6) * SWAY_MAX;
    const tiltTarget = Math.sin(animPhase * 2.2) * TILT_MAX;
    bobSm  = lerp(bobSm,  bobTarget,  0.14);
    swaySm = lerp(swaySm, swayTarget, 0.14);
    tiltSm = lerp(tiltSm, tiltTarget, 0.14);

    // Obstacles
    for (const o of obstacles){ o.x -= world.speed; }
    obstacles = obstacles.filter(o => o.x + o.w > -40);

    // Pixel-based random spacing
    distSinceLast += world.speed;
    if (distSinceLast >= nextGap){
      spawnObstacle();
      distSinceLast = 0;
      nextGap = randGap();
    }

    // Monad coin movement
    if (logo.active){
      const targetX = Math.min(world.w - 140, chog.x + 260);
      const targetY = world.groundY - 70 + Math.sin(world.t * 0.03) * 18;
      logo.x += (targetX - logo.x) * 0.02;
      logo.y += (targetY - logo.y) * 0.1;
      if (Math.random() < 0.005) logo.x += 20;
    } else {
      logo.cooldown--;
      if (logo.cooldown <= 0){
        logo.active = true; logo.x = chog.x + 320; logo.y = world.groundY - 70;
      }
    }

    
    // ---- Power coin spawn & movement ----
    if (!powerCoin.active && world.t >= nextPowerAt){
      choosePowerType();
      powerCoin.type = powerType;
      powerCoin.active = true; // intentionally capitalized placeholder to replace with true later
      powerCoin.w = 36; powerCoin.h = 36;
      powerCoin.x = world.w + 20;
      powerCoin.y = world.groundY - 80 + Math.sin(world.t * 0.05) * 10;
      powerCoin.vx = -world.speed * (1.0 + Math.random()*0.3);
    }
    if (powerCoin.active){
      powerCoin.x += powerCoin.vx;
      // drift up/down slightly
      powerCoin.y = world.groundY - 80 + Math.sin(world.t * 0.05) * 10;
      if (powerCoin.x + powerCoin.w < -40){
        powerCoin.active = false; scheduleNextPower();
      }
    }

    // Tick timers
    if (invincibleFor > 0) invincibleFor--;
    if (multiplierFor > 0) multiplierFor--;
    scoreMultiplier = (multiplierFor > 0) ? 50 : 1;

    // Collisions
    // Power coin pickup (pre-obstacle)
    if (powerCoin.active && collide(getChogHitbox(), {x:powerCoin.x,y:powerCoin.y,w:powerCoin.w,h:powerCoin.h}, POWER_PICK_PAD)){
      powerCoin.active = false;
      invincibleFor = sec(5);
      multiplierFor = sec(10);
      recordPowerCoinPickup();
      scheduleNextPower();
    }
    for (const o of obstacles){
      if (collide(getChogHitbox(), o, OBSTACLE_COLLISION_PAD) && invincibleFor <= 0){
        endGame(); updateParticles();
    drawFrame(); return;
      }
    }

    if (logo.active && collide(getChogHitbox(), {x:logo.x,y:logo.y,w:logo.w,h:logo.h}, 10)){
      recordCoinPickup();
      world.speedTarget += 0.6; logo.active = false;
      logo.cooldown = 220 - Math.min(120, Math.floor(world.speed * 10));
    }

    // Power coin pickup
    if (powerCoin.active && collide(getChogHitbox(), {x:powerCoin.x,y:powerCoin.y,w:powerCoin.w,h:powerCoin.h}, POWER_PICK_PAD)){
      powerCoin.active = false;
      invincibleFor = sec(5);          // 5s invincible
      multiplierFor = sec(10);         // 10s x50 score
      recordPowerCoinPickup();
      scheduleNextPower();
    }


    if (running){
      const baseDelta = Math.max(0, Math.floor(world.speed * 0.2));
      applyFrameScore(baseDelta);
    }

    updateParticles();
    drawFrame();
    world.t += 1;
  }

  function drawFrame(){
    // obstacles
    for (const o of obstacles) drawObstacle(o);
    // logo
    if (logo.active) drawCoin(logo.x, logo.y, logo.w, logo.h);
    if (powerCoin.active) drawPowerCoin(powerCoin.x, powerCoin.y, powerCoin.w, powerCoin.h, world.t);
    // chog sprite
    const chogDrawH = chog.duck ? chog.h * 0.9 : chog.h;
    drawChogSprite(ctx, chog.x, chog.y + (chog.h - chogDrawH), chog.w, chogDrawH, chog.frame, chog.duck);
    // HUD
    drawHUD();
    drawParticles();
  }

  function drawObstacle(r){
    ctx.fillStyle = "#2f2f2f"; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = "#6a6a6a"; ctx.fillRect(r.x+3, r.y+3, Math.max(0,r.w-6), Math.max(0,r.h-6));
  }

  function drawChogSprite(ctx, x, y, w, h, frame, duck){
    if (!CHOG_READY){
      ctx.fillStyle = "#333";
      ctx.fillRect(x, y, w, h);
      return;
    }
    const bob  = bobSm;
    const sway = swaySm;
    const tilt = tiltSm;

    const drawW = FRAME_W * CHOG_SCALE;
    const drawH = FRAME_H * CHOG_SCALE * (duck ? 0.90 : 1.0);

    const BASELINE_LIFT = 6;
    const baselineY = y + h;
    const dy = baselineY - drawH - BASELINE_LIFT + bob;
    const dx = x + (w - drawW) / 2;

    const pivotY = drawH * 0.85;

    ctx.save();
    ctx.translate(dx + drawW/2 + sway, dy + pivotY);
    ctx.rotate(tilt);

    // Sprite
    if (typeof invincibleFor !== 'undefined' && invincibleFor>0){ ctx.save(); ctx.globalAlpha=0.4; ctx.strokeStyle="#7c3aed"; ctx.lineWidth=6; ctx.beginPath(); ctx.arc(0, -drawH*0.2, Math.max(drawW,drawH)*0.42, 0, Math.PI*2); ctx.stroke(); ctx.restore(); }
    ctx.drawImage(CHOG_SPRITE, 0, 0, FRAME_W, FRAME_H, -drawW/2, -pivotY, drawW, drawH);
    ctx.restore();
  }

  function drawMonad(x,y,w,h){
    ctx.save(); ctx.translate(x + w/2, y + h/2);
    const r = Math.min(w,h)/2;
    ctx.beginPath(); ctx.fillStyle="#ffd54d"; ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
    ctx.lineWidth=2; ctx.strokeStyle="#cfa928"; ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,r*0.75,0,Math.PI*2); ctx.strokeStyle="#b48b1f"; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r*0.5, r*0.35);
    ctx.lineTo(-r*0.5, -r*0.1);
    ctx.lineTo(-r*0.1, r*0.15);
    ctx.lineTo(r*0.3, -r*0.2);
    ctx.lineTo(r*0.3, r*0.35);
    ctx.lineWidth = 3; ctx.strokeStyle = "#2b2b2b"; ctx.stroke();
    ctx.restore();
  }

  
  function drawCoin(x,y,w,h){
    if (COIN_READY){
      // Draw centered
      const pad = 2;
      const dw = Math.max(0, w - pad*2);
      const dh = Math.max(0, h - pad*2);
      const dx = x + pad;
      const dy = y + pad;
      ctx.drawImage(COIN_IMG, dx, dy, dw, dh);
    } else {
      // Fallback to vector
      drawMonad(x,y,w,h);
    }
  }

  
  function drawPowerCoin(x,y,w,h,t){
    // pulsing halo
    ctx.save();
    const r = Math.max(w,h)*0.75;
    const pulse = (Math.sin(t*0.08)+1)/2; // 0..1
    ctx.globalAlpha = 0.35 * (0.7 + 0.3*pulse);
    const grad = ctx.createRadialGradient(x+w/2, y+h/2, Math.max(2, r*0.2), x+w/2, y+h/2, r);
    const c0 = (powerCoin.type===0? "rgba(80,170,255,0.85)" : powerCoin.type===1? "rgba(155,93,229,0.85)" : "rgba(244,63,94,0.85)");
    const c1 = c0.replace("0.85","0.0");
    grad.addColorStop(0, c0);
    grad.addColorStop(1, c1);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x+w/2, y+h/2, r, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
    // coin image
    drawCoin(x,y,w,h);
  }

  
function drawHUD(){
  // Night-aware color
  const phase = (typeof dayT !== 'undefined') ? (dayT % 2) : 0;
  const night = (phase >= 0.6 && phase <= 1.6);

  const rx = world.w - 12;
  const yScore = 14;
  const yBest  = 34;
  const yInv   = 54;
  const yMult  = 74;

  ctx.save();
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.font = "14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto";

  if (night){
    // subtle stroke for readability on dark
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.strokeText(`SCORE ${String(score).padStart(5,"0")}`, rx, yScore);
    ctx.strokeText(`BEST  ${String(high).padStart(5,"0")}`,  rx, yBest);
    ctx.fillStyle = "#fff";
  } else {
    ctx.fillStyle = "#111";
  }

  // Main numbers
  ctx.fillText(`SCORE ${String(score).padStart(5,"0")}`, rx, yScore);
  ctx.fillText(`BEST  ${String(high).padStart(5,"0")}`,  rx, yBest);

  // Badges (aligned at same right edge)
  if (typeof invincibleFor !== 'undefined' && invincibleFor > 0){
    if (night){ ctx.strokeText("INVINCIBLE", rx, yInv); }
    ctx.fillText("INVINCIBLE", rx, yInv);
  }
  if (typeof multiplierFor !== 'undefined' && multiplierFor > 0){
    if (night){ ctx.strokeText("x50", rx, yMult); }
    ctx.fillText("x50", rx, yMult);
  }

  ctx.restore();
}

  function endGame(){
    gameOver = true; running = false;
    high = Math.max(high, score);
    localStorage.setItem("chog_highscore", String(high));
    scoreLine.textContent = `Score: ${score} · Best: ${high}`;
    finaliseRunSummary();
    
    // Show player name input
    playerNameSection.style.display = 'block';
    updateLeaderboardDisplay();
    
    hide(startOverlay); show(gameOverOverlay);
  }

  // Main loop (always schedules next frame)
  function loop(){
    requestAnimationFrame(loop);
    update();
  }

  // Input
  function keydown(e){
    const isJump = (e.code === "Space" || e.code === "ArrowUp" || e.key === " " || e.key === "ArrowUp");
    const isDuckDown = (e.code === "ArrowDown" || e.key === "ArrowDown");
    const isEnter = (e.code === "Enter" || e.key === "Enter");
    
    // Check if user is typing in the name input field
    const isTypingName = document.activeElement === playerNameInput;
    
    if (isJump){
      e.preventDefault();
      if (!running && !gameOver){
        ensureRunning().then((ok) => {
          if (ok) performJump();
        });
      } else {
        performJump();
      }
    }
    if (isDuckDown){ chog.duck = chog.onGround; }
    if (isEnter && !isTypingName){
      e.preventDefault();
      if (gameOver){
        // Enter restarts the game when game is over and not typing
        resetGame();
        ensureRunning();
      } else if (!running && !gameOver){
        // Enter starts the game
        ensureRunning();
      }
    }
  }
  function keyup(e){
    const isDuckDown = (e.code === "ArrowDown" || e.key === "ArrowDown");
    if (isDuckDown){ chog.duck = false; }
  }
  document.addEventListener("keydown", keydown);
  document.addEventListener("keyup", keyup);

  // Canvas touch/click handling
  canvas.addEventListener("pointerdown", () => {
    if (gameOver) return;
    ensureRunning().then((ok) => {
      if (ok) jump();
    });
  });

  // Mobile-specific canvas touch handling
  if (isMobile) {
    canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (gameOver) return;
      ensureRunning().then((ok) => {
        if (ok) jump();
      });
    }, { passive: false });
  }
  restartBtn.addEventListener("click", () => {
    resetGame();
    ensureRunning();
  });

  // Touch Controls for Mobile
  touchJump.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (gameOver) return;
    ensureRunning().then((ok) => {
      if (ok) jump();
    });
  });

  touchDuck.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (!gameOver) {
      chog.duck = chog.onGround;
    }
  });

  touchDuck.addEventListener("touchend", (e) => {
    e.preventDefault();
    chog.duck = false;
  });

  // Prevent default touch behaviors
  document.addEventListener("touchstart", (e) => {
    if (e.target === touchJump || e.target === touchDuck) {
      e.preventDefault();
    }
  }, { passive: false });

  document.addEventListener("touchend", (e) => {
    if (e.target === touchJump || e.target === touchDuck) {
      e.preventDefault();
    }
  }, { passive: false });

  // Save score button event listener
  saveScoreBtn.addEventListener("click", async () => {
    const name = playerNameInput.value.trim();
    if (name) {
      playerName = name;
      if (!finalSummary) {
        alert('Run data missing. Please play a new round before saving.');
        return;
      }
      const saved = await saveToLeaderboard(score, finalSummary);
      if (saved) {
        playerNameSection.style.display = 'none';
        saveScoreBtn.textContent = 'Score Saved!';
        saveScoreBtn.disabled = true;
      }
    } else {
      alert('Please enter your name!');
    }
  });

  // Enter key support for player name input
  playerNameInput.addEventListener("keypress", (e) => {
    if (e.key === 'Enter') {
      saveScoreBtn.click();
    }
  });

  // Leaderboard modal functionality
  viewLeaderboardBtn.addEventListener("click", () => {
    leaderboardModal.style.display = 'flex';
  });

  closeLeaderboard.addEventListener("click", () => {
    leaderboardModal.style.display = 'none';
  });

  // Close modal when clicking outside
  leaderboardModal.addEventListener("click", (e) => {
    if (e.target === leaderboardModal) {
      leaderboardModal.style.display = 'none';
    }
  });

  // Close modal with Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === 'Escape' && leaderboardModal.style.display === 'flex') {
      leaderboardModal.style.display = 'none';
    }
  });

  // Mobile optimizations
  if (isMobile) {
    // Canvas performance optimizations
    ctx.imageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;
    
    // Prevent zoom on double tap
    let lastTouchEnd = 0;
    document.addEventListener('touchend', function (event) {
      const now = (new Date()).getTime();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    }, false);

    // Prevent scrolling on touch
    document.addEventListener('touchmove', function (e) {
      if (e.target === touchJump || e.target === touchDuck || e.target === canvas) {
        e.preventDefault();
      }
    }, { passive: false });

    // Add mobile-specific styling
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    
    // Optimize canvas for mobile
    canvas.style.imageRendering = 'pixelated';
    canvas.style.imageRendering = '-webkit-optimize-contrast';
  }

  // Init
  resetGame();
  try { update(); } catch (e) {} // initial render
  requestAnimationFrame(loop);
})();