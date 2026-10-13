(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const L = window.LETTER, F = window.FINALE;

  /* ============================================================
     CONSTANTS
  ============================================================ */
  const W = 400, H = 225, GROUND = 177, WORLD = 1500, S = 2;
  const canvas = $('gameCanvas'), ctx = canvas.getContext('2d');
  const fcanvas = $('finaleCanvas'), fctx = fcanvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  fctx.imageSmoothingEnabled = false;

  /* ============================================================
     PIXEL SPRITES (original characters)
  ============================================================ */
  const BODY = [
    '...tttttt...',
    '..tttttttt..',
    '..ttttyttt..',
    '..TTTTTTTT..',
    '..ssssssss..',
    '.ssksssskss.',
    '..ssssssss..',
    '...pppppp...',
    '..bbbbbbbbpp',
    '.sbbbbbbbbs.',
    '..bbnnnnbb..',
    '..nnnnnnnn..'
  ];
  const LEGS = {
    stand: ['..nnn..nnn..', '.kkkk..kkkk.'],
    walk:  ['...nn..nn...', '..kkk..kkk..'],
    jump:  ['...nnnnnn...', '..kkkkkkkk..']
  };
  const SPR = {};
  Object.keys(LEGS).forEach(k => SPR[k] = BODY.concat(LEGS[k]));

  const PAL_HERO = { t:'#2bb3a3', T:'#1b7f75', s:'#ffd2a8', k:'#2b2b3a', p:'#ff6fa5', b:'#4f8cff', n:'#2f3a8f', y:'#ffe14d' };
  const PAL_GIRL = { t:'#6b3f26', T:'#4d2b19', s:'#ffd2a8', k:'#7a2b55', p:'#ffffff', b:'#ff8fb8', n:'#e0679a', y:'#ff4f8b' };

  const HEART = ['.wr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'];

  function drawSprite(c, rows, pal, x, y, s, flip) {
    const w = rows[0].length;
    for (let r = 0; r < rows.length; r++) {
      for (let col = 0; col < w; col++) {
        const ch = rows[r][flip ? w - 1 - col : col];
        if (ch === '.') continue;
        c.fillStyle = pal[ch];
        c.fillRect(Math.round(x + col * s), Math.round(y + r * s), s, s);
      }
    }
  }
  function drawHeart(c, x, y, s, color) {
    for (let r = 0; r < HEART.length; r++) {
      for (let col = 0; col < 7; col++) {
        const ch = HEART[r][col];
        if (ch === '.') continue;
        c.fillStyle = ch === 'w' ? '#ffffff' : color;
        c.fillRect(Math.round(x + col * s), Math.round(y + r * s), s, s);
      }
    }
  }

  /* ============================================================
     SOUND (tiny retro beeps, mute button available)
  ============================================================ */
  let actx = null, muted = false;
  function beep(f1, f2, dur, type) {
    if (muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = type || 'square';
      o.frequency.setValueAtTime(f1, t);
      if (f2) o.frequency.linearRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(t + dur);
    } catch (e) { /* audio is optional */ }
  }
  $('muteBtn').addEventListener('click', e => {
    muted = !muted;
    e.currentTarget.textContent = muted ? '✕' : '♪';
    e.currentTarget.blur();
  });

  /* ============================================================
     LEVEL DATA
  ============================================================ */
  const PLATFORMS = [
    { x: 230,  y: 140, w: 48 }, { x: 330,  y: 140, w: 48 }, { x: 400,  y: 104, w: 48 },
    { x: 490,  y: 140, w: 96 }, { x: 700,  y: 140, w: 48 }, { x: 772,  y: 106, w: 64 },
    { x: 900,  y: 140, w: 96 }, { x: 1090, y: 140, w: 48 }, { x: 1160, y: 106, w: 48 },
    { x: 1230, y: 140, w: 48 }
  ];
  const coins = [];
  [[110, 182], [600, 672], [1000, 1072]].forEach(([a, b]) => {
    for (let x = a; x <= b; x += 24) coins.push({ x, y: GROUND - 22 });
  });
  PLATFORMS.forEach(p => { for (let cx = p.x + 8; cx < p.x + p.w; cx += 24) coins.push({ x: cx, y: p.y - 20 }); });

  const hearts = [
    { x: 416, y: 78 }, { x: 530, y: 112 }, { x: 796, y: 80 }, { x: 940, y: 112 }, { x: 1176, y: 80 }
  ];
  $('heartsTotal').textContent = hearts.length;

  const TUN = { x: 1330, y: GROUND - 72, w: 64, h: 72 };

  /* ============================================================
     GAME STATE
  ============================================================ */
  let state = 'title';           // title | play | entering | transition | letter | finale
  const keys = { left: false, right: false, jump: false };
  const P = { x: 30, y: GROUND - 28, vx: 0, vy: 0, face: 1, onGround: true, moving: false, enterT: 0 };
  let camX = 0, tick = 0, score = 0, heartN = 0;
  let pops = [];
  let hintTxt = null, flash = null;
  let running = false, last = 0, acc = 0;

  const hint = $('hint');
  function setHint(txt) {
    if (txt === hintTxt) return;
    hintTxt = txt;
    if (txt) { hint.textContent = txt; hint.classList.add('show'); }
    else hint.classList.remove('show');
  }
  function pop(x, y, txt) { pops.push({ x, y, txt, life: 50 }); }
  const nearTunnel = () => Math.abs((P.x + 12) - (TUN.x + TUN.w / 2)) < 38;

  /* ============================================================
     INPUT
  ============================================================ */
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
    ArrowDown: 'enter', KeyS: 'enter', KeyE: 'enter', Enter: 'enter'
  };
  addEventListener('keydown', e => {
    const k = KEYMAP[e.code];
    if (!k) return;
    if (state === 'play' || state === 'entering') {
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    }
    if (state !== 'play') return;
    if (k === 'enter') { if (!e.repeat) tryEnter(); } else keys[k] = true;
  });
  addEventListener('keyup', e => {
    const k = KEYMAP[e.code];
    if (k && k !== 'enter') keys[k] = false;
  });
  addEventListener('blur', () => { keys.left = keys.right = keys.jump = false; });

  document.querySelectorAll('#pad button').forEach(b => {
    const k = b.dataset.k;
    const down = e => {
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (_) {}
      b.classList.add('down');
      if (k === 'enter') { if (state === 'play') tryEnter(); } else keys[k] = true;
    };
    const up = e => {
      e.preventDefault();
      b.classList.remove('down');
      if (k !== 'enter') keys[k] = false;
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
  });

  /* ============================================================
     GAME LOGIC
  ============================================================ */
  function update() {
    tick++;

    if (state === 'play') {
      const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      P.vx = dir * 1.9;
      if (dir) P.face = dir;
      P.moving = dir !== 0;

      if (keys.jump && P.onGround) { P.vy = -5.9; P.onGround = false; beep(300, 720, 0.15); }
      P.vy = Math.min(P.vy + 0.32, 8);
      P.x = Math.max(0, Math.min(WORLD - 24, P.x + P.vx));

      const prevBottom = P.y + 28;
      P.y += P.vy;
      P.onGround = false;
      if (P.vy >= 0) {
        let land = GROUND;
        for (const pl of PLATFORMS) {
          if (P.x + 20 > pl.x && P.x + 4 < pl.x + pl.w && prevBottom <= pl.y + 1 && P.y + 28 >= pl.y) {
            land = Math.min(land, pl.y);
          }
        }
        if (P.y + 28 >= land) { P.y = land - 28; P.vy = 0; P.onGround = true; }
      }
      collect();
      updateHint();
    } else if (state === 'entering') {
      P.enterT += 1 / 45;
      P.x += ((TUN.x + TUN.w / 2 - 12) - P.x) * 0.12;
      P.y += ((GROUND - 28) - P.y) * 0.3;
      P.face = (TUN.x + TUN.w / 2 - 12) > P.x ? 1 : -1;
      P.moving = true;
      if (P.enterT >= 1) { state = 'transition'; startTransition(); }
    } else {
      P.moving = false;
    }

    const target = Math.max(0, Math.min(WORLD - W, P.x + 12 - W / 2));
    camX += (target - camX) * 0.12;
    pops.forEach(p => { p.y -= 0.6; p.life--; });
    pops = pops.filter(p => p.life > 0);
  }

  function collect() {
    const px = P.x + 2, py = P.y, pw = 20, ph = 28;
    for (const c of coins) {
      if (!c.got && c.x + 5 > px && c.x - 5 < px + pw && c.y + 12 > py && c.y < py + ph) {
        c.got = true; score += 100;
        beep(988, 1319, 0.12);
        pop(c.x, c.y, '+100');
        $('score').textContent = String(score).padStart(5, '0');
      }
    }
    for (const h of hearts) {
      if (!h.got && h.x + 14 > px && h.x < px + pw && h.y + 12 > py && h.y < py + ph) {
        h.got = true; score += 500; heartN++;
        beep(660, 1320, 0.3, 'triangle');
        pop(h.x, h.y, '+500 ♥');
        $('score').textContent = String(score).padStart(5, '0');
        $('hearts').textContent = heartN;
      }
    }
  }

  function updateHint() {
    if (flash && tick < flash.until) return setHint(flash.txt);
    if (nearTunnel()) return setHint('Press ↓ / ENTER to step inside ♡');
    if (tick < 700 && P.x < 260) return setHint('← → to walk · ↑ to jump · grab the coins & hearts!');
    if (P.x > 700) return setHint('✨ Something special is waiting for you inside the tunnel…');
    setHint(null);
  }

  function tryEnter() {
    if (state !== 'play') return;
    if (nearTunnel()) {
      state = 'entering'; P.enterT = 0; keys.left = keys.right = keys.jump = false;
      setHint(null);
      beep(520, 180, 0.7, 'triangle');
    } else {
      flash = { txt: 'Walk to the glowing tunnel first ♡', until: tick + 150 };
      setHint(flash.txt);
    }
  }

  /* ============================================================
     DRAWING: GAME WORLD
  ============================================================ */
  function pixelHill(cx, r, color) {
    ctx.fillStyle = color;
    for (let dy = 0; dy < r; dy += 3) {
      const half = Math.sqrt(r * r - (r - dy) * (r - dy));
      ctx.fillRect(Math.round(cx - half), GROUND - r + dy, Math.round(half * 2), 3);
    }
  }
  function cloud(x, y) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 8, y, 24, 8);
    ctx.fillRect(x, y + 8, 40, 8);
    ctx.fillRect(x + 4, y + 16, 32, 4);
    ctx.fillStyle = '#e3f4ff';
    ctx.fillRect(x + 4, y + 16, 32, 4);
  }
  const wrap = (v, m) => ((v % m) + m) % m;

  function draw(ts) {
    const cam = Math.round(camX);

    // sky
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, '#4fb0ff'); g.addColorStop(1, '#cdeeff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // parallax clouds
    [[40, 34], [210, 58], [380, 28], [560, 50], [720, 36]].forEach(([cx, cy]) => cloud(wrap(cx - cam * 0.3, 800) - 60, cy));
    // parallax hills
    [[90, 70], [420, 55], [740, 80]].forEach(([hx, r]) => pixelHill(wrap(hx - cam * 0.4, 900) - 100, r, '#7fe08a'));
    [[250, 46], [560, 62], [860, 40]].forEach(([hx, r]) => pixelHill(wrap(hx - cam * 0.6, 900) - 100, r, '#45c25a'));

    // ground
    const x0 = Math.floor(cam / 16) * 16;
    for (let x = x0; x < cam + W + 16; x += 16) {
      const sx = x - cam;
      ctx.fillStyle = '#4ccf5a'; ctx.fillRect(sx, GROUND, 16, 5);
      ctx.fillStyle = '#2e9e45'; ctx.fillRect(sx, GROUND + 5, 16, 2);
      ctx.fillStyle = '#c8793a'; ctx.fillRect(sx, GROUND + 7, 16, H - GROUND - 7);
      ctx.fillStyle = '#a85f28';
      ctx.fillRect(sx, GROUND + 7, 2, H - GROUND - 7);
      for (let y = GROUND + 15; y < H; y += 16) ctx.fillRect(sx, y, 16, 2);
    }

    ctx.save();
    ctx.translate(-cam, 0);

    // brick platforms
    PLATFORMS.forEach(p => {
      for (let tx = 0; tx < p.w; tx += 16) {
        const x = p.x + tx, y = p.y, off = (tx / 16) % 2 ? 8 : 0;
        ctx.fillStyle = '#e2733a'; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = '#ff9a62'; ctx.fillRect(x, y, 16, 2);
        ctx.fillStyle = '#8a3b1a';
        ctx.fillRect(x, y + 7, 16, 2);
        ctx.fillRect(x + off, y, 2, 8);
        ctx.fillRect(x + (8 - off), y + 9, 2, 7);
        ctx.fillRect(x + 15, y, 1, 16);
      }
    });

    drawTunnel(ts);

    // coins
    coins.forEach(c => {
      if (c.got) return;
      const cw = Math.max(2, Math.round(Math.abs(Math.cos(ts / 220 + c.x)) * 10));
      const cx = Math.round(c.x - cw / 2);
      ctx.fillStyle = '#ffb300'; ctx.fillRect(cx, c.y, cw, 12);
      ctx.fillStyle = '#ffe566'; ctx.fillRect(cx + 1, c.y + 1, Math.max(1, Math.floor(cw / 3)), 10);
    });

    // collectible hearts
    hearts.forEach(h => {
      if (h.got) return;
      drawHeart(ctx, h.x, h.y + Math.round(Math.sin(ts / 260 + h.x) * 2), 2, '#ff4f8b');
    });

    // player
    const pose = !P.onGround && state === 'play' ? 'jump' : (P.moving && Math.floor(tick / 7) % 2 ? 'walk' : 'stand');
    if (state === 'entering') ctx.globalAlpha = Math.max(0, 1 - P.enterT * 1.1);
    drawSprite(ctx, SPR[pose], PAL_HERO, P.x, P.y, S, P.face === 1);
    ctx.globalAlpha = 1;

    // score pops
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    pops.forEach(p => {
      ctx.lineWidth = 3; ctx.strokeStyle = '#7a1f52'; ctx.strokeText(p.txt, p.x, p.y);
      ctx.fillStyle = '#fff'; ctx.fillText(p.txt, p.x, p.y);
    });

    ctx.restore();
  }

  function drawTunnel(ts) {
    const { x, y, w, h } = TUN;
    // stone body
    ctx.fillStyle = '#7d6a9c';
    ctx.fillRect(x, y + 12, w, h - 12);
    ctx.fillRect(x + 6, y + 6, w - 12, 6);
    ctx.fillRect(x + 14, y, w - 28, 6);
    ctx.fillStyle = '#9886b8';
    ctx.fillRect(x + 14, y, w - 28, 2);
    ctx.fillStyle = '#5d4c7c';
    for (let yy = y + 18; yy < y + h; yy += 12) ctx.fillRect(x, yy, w, 2);
    for (let yy = y + 18, r = 0; yy < y + h; yy += 12, r++)
      for (let xx = x + (r % 2 ? 8 : 0); xx < x + w; xx += 16) ctx.fillRect(xx, yy, 2, 12);
    // opening
    ctx.fillStyle = '#0b0418';
    ctx.fillRect(x + 16, y + 24, w - 32, h - 24);
    ctx.fillRect(x + 20, y + 20, w - 40, 4);
    // glow
    const pulse = 0.55 + 0.25 * Math.sin(ts / 300);
    const gr = ctx.createRadialGradient(x + w / 2, y + h - 10, 2, x + w / 2, y + h - 10, 26);
    gr.addColorStop(0, `rgba(255,214,234,${pulse})`);
    gr.addColorStop(1, 'rgba(255,105,180,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(x + 16, y + 20, w - 32, h - 20);
    // floating heart above
    drawHeart(ctx, x + w / 2 - 7, y - 20 + Math.round(Math.sin(ts / 300) * 3), 2, '#ff4f8b');
    // "enter" arrow when close
    if (state === 'play' && nearTunnel() && Math.floor(ts / 350) % 2) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + w / 2 - 4, y - 36, 8, 4);
      ctx.fillRect(x + w / 2 - 2, y - 32, 4, 4);
    }
  }

  /* ============================================================
     MAIN LOOP
  ============================================================ */
  function frame(ts) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!last) last = ts;
    acc += Math.min(100, ts - last);
    last = ts;
    while (acc >= 16.667) { update(); acc -= 16.667; }
    draw(ts);
  }
  function startLoop() { if (running) return; running = true; last = 0; acc = 0; requestAnimationFrame(frame); }

  /* ============================================================
     SCENES, FX
  ============================================================ */
  function showScene(id) {
    document.querySelectorAll('.scene').forEach(s => s.classList.toggle('active', s.id === 'scene-' + id));
  }

  const HEART_COLORS = ['#ff7eb6', '#ff4f8b', '#ffd6e9', '#ffffff', '#ff9ec9'];
  function spawn(layer, chars, fast) {
    const e = document.createElement('span');
    e.className = 'float-heart';
    e.textContent = chars[Math.floor(Math.random() * chars.length)];
    const dur = fast ? 3 + Math.random() * 3 : 6 + Math.random() * 5;
    e.style.cssText =
      `left:${Math.random() * 100}%;font-size:${10 + Math.random() * 22}px;` +
      `animation-duration:${dur}s;--dx:${(Math.random() - 0.5) * 90}px;` +
      `color:${HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)]}`;
    layer.appendChild(e);
    e.addEventListener('animationend', () => e.remove());
  }
  let ambient = null;
  function setAmbient(on, ms) {
    clearInterval(ambient);
    if (on) ambient = setInterval(() => spawn($('fx'), ['♥', '♥', '✦']), ms);
  }

  /* ---------- START ---------- */
  $('startBtn').addEventListener('click', () => {
    if (state !== 'title') return;
    $('startBtn').blur();
    $('startOverlay').classList.add('hide');
    state = 'play';
    beep(523, 1047, 0.25);
  });

  /* ---------- TUNNEL TRANSITION ---------- */
  async function startTransition() {
    const dark = $('dark');
    dark.classList.add('on');                 // fade to black (0.9s)
    await sleep(1000);
    running = false;                          // stop game loop
    dark.classList.add('glow');               // light orb + sparkles
    const sp = setInterval(() => spawn($('darkFx'), ['♥', '✦', '✧', '♥'], true), 140);
    beep(392, 1568, 1.6, 'triangle');
    await sleep(3300);
    renderLetter();
    state = 'letter';
    showScene('letter');
    setAmbient(true, 650);
    dark.classList.remove('on');
    await sleep(1000);
    dark.classList.remove('glow');
    clearInterval(sp);
    $('darkFx').textContent = '';
  }

  /* ---------- LETTER ---------- */
  function renderLetter() {
    $('letterTitle').textContent = '♥ ' + L.title;
    const body = $('letterBody');
    body.textContent = '';
    let i = 0;
    const add = (cls, text) => {
      const p = document.createElement('p');
      p.className = 'line ' + cls;
      p.style.setProperty('--d', Math.min(i++, 14));
      p.textContent = text;
      body.appendChild(p);
    };
    add('greet', L.greeting);
    L.paragraphs.forEach(t => add('', t));
    add('closing', L.closing);
    add('sign', L.signature);

    const wrapDiv = document.createElement('div');
    wrapDiv.className = 'line more';
    wrapDiv.style.setProperty('--d', Math.min(i++, 14));
    const b = document.createElement('button');
    b.className = 'btn-px';
    b.textContent = L.button;
    b.addEventListener('click', goFinale);
    wrapDiv.appendChild(b);
    body.appendChild(wrapDiv);
    body.scrollTop = 0;
  }

  /* ---------- FINALE ---------- */
  async function goFinale() {
    if (state !== 'letter') return;
    state = 'finale';
    beep(523, 784, 0.3, 'triangle');
    const dark = $('dark');
    dark.classList.add('on');
    await sleep(1000);
    showScene('finale');
    dark.classList.remove('on');
    startFinale();
  }

  let fin = null;
  const STARS = Array.from({ length: 22 }, (_, i) => ({
    x: (i * 53 + 17) % 200, y: (i * 37 + 9) % 80, o: i
  }));

  function startFinale() {
    $('finMission').textContent = F.mission;
    $('finLove').textContent = F.declaration;
    $('replayBtn').textContent = F.replay;
    fin = { t0: 0, kissed: false, textShown: false };
    setAmbient(true, 380);
    requestAnimationFrame(finLoop);
  }

  function finLoop(ts) {
    if (!fin) return;
    if (!fin.t0) fin.t0 = ts;
    const t = (ts - fin.t0) / 1000;
    drawFinale(t);
    if (t > 3.4 && !fin.kissed) {
      fin.kissed = true;
      for (let i = 0; i < 26; i++) setTimeout(() => spawn($('fx'), ['♥', '♥', '✦'], true), i * 60);
      beep(660, 1320, 0.35, 'triangle');
      setTimeout(() => beep(880, 1760, 0.4, 'triangle'), 250);
    }
    if (t > 5.2 && !fin.textShown) {
      fin.textShown = true;
      $('finaleText').classList.add('show');
    }
    requestAnimationFrame(finLoop);
  }

  function drawFinale(t) {
    const c = fctx;
    c.fillStyle = '#0b0514'; c.fillRect(0, 0, 200, 112);

    // twinkling stars
    STARS.forEach(s => {
      c.globalAlpha = 0.25 + 0.75 * Math.abs(Math.sin(t * 1.4 + s.o));
      c.fillStyle = '#ffd6e9';
      c.fillRect(s.x, s.y, 1, 1);
    });
    c.globalAlpha = 1;

    // glowing spotlight cone + pool
    const pulse = 0.09 + 0.03 * Math.sin(t * 2);
    c.fillStyle = `rgba(255,200,230,${pulse})`;
    c.beginPath(); c.moveTo(82, 0); c.lineTo(118, 0); c.lineTo(168, 100); c.lineTo(32, 100); c.closePath(); c.fill();
    const gr = c.createRadialGradient(100, 70, 4, 100, 80, 80);
    gr.addColorStop(0, `rgba(255,170,215,${0.28 + 0.07 * Math.sin(t * 2)})`);
    gr.addColorStop(1, 'rgba(255,105,180,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 200, 112);
    c.fillStyle = 'rgba(255,170,215,0.28)';
    c.fillRect(46, 97, 108, 3); c.fillRect(34, 100, 132, 2);

    // characters (scale 4 → 48x56)
    const sc = 4, top = 98 - 56;
    const girlX = 88;
    const p = Math.min(1, Math.max(0, (t - 0.4) / 2.6));
    const ease = 1 - (1 - p) * (1 - p);
    const heroX = -50 + 112 * ease;
    const walking = p > 0 && p < 1;
    const hugging = p >= 1;
    const bob = hugging ? Math.round(Math.sin(t * 5)) : 0;

    drawSprite(c, SPR[walking && Math.floor(t * 7) % 2 ? 'walk' : 'stand'], PAL_HERO, heroX, top + bob, sc, true);
    drawSprite(c, SPR.stand, PAL_GIRL, girlX, top + (hugging ? bob : Math.round(Math.sin(t * 3) * 0.6)), sc, false);

    if (hugging) {
      // arms wrapped around each other
      c.fillStyle = '#ffd2a8';
      c.fillRect(Math.round(heroX + 14), top + bob + 36, Math.round(girlX + 36 - (heroX + 14)), 4);
      c.fillRect(Math.round(heroX + 14), top + bob + 40, 4, 4);
      c.fillRect(Math.round(girlX + 32), top + bob + 40, 4, 4);
    }

    // the kiss: big heart rising above them
    if (t > 3.4) {
      const k = Math.min(1, (t - 3.4) * 1.5), s = Math.round(2 + k * 2);
      const mid = (heroX + 24 + girlX + 24) / 2;
      drawHeart(c, Math.round(mid - 3.5 * s), Math.round(top - 8 - s * 6 - Math.sin(t * 4) * 2), s, '#ff4f8b');
    }
  }

  /* ---------- REPLAY ---------- */
  $('replayBtn').addEventListener('click', async () => {
    fin = null;
    $('dark').classList.add('on');
    await sleep(900);
    location.reload();
  });

  /* ============================================================
     BOOT
  ============================================================ */
  startLoop();
})();
