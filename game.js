(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const L = window.LETTER, F = window.FINALE;

  /* ============================================================
     CONSTANTS
  ============================================================ */
  const W = 400, H = 225, GROUND = 177, WORLD = 1500, S = 2;
  const LAKE_Y = GROUND - 30;
  const canvas = $('gameCanvas'), ctx = canvas.getContext('2d');
  const fcanvas = $('finaleCanvas'), fctx = fcanvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  fctx.imageSmoothingEnabled = true;
  fctx.imageSmoothingQuality = 'high';

  /* ============================================================
     PIXEL SPRITES — the guy (black tee, black shorts, white sneakers)
  ============================================================ */
  const BODY = [
    '...hhhhhh...',
    '..hhhhhhhh..',
    '..ssshhhhh..',
    '..sesssshh..',
    '..ssssssss..',
    '...SsssssS..',
    '.kkkkkkkkkk.',
    '.skkkkkkkks.',
    '.skkkKkkkks.',
    '..kkkkkkkk..',
    '..nnnnnnnn..',
    '..nnnnnnnn..'
  ];
  const LEGS = {
    stand: ['..ss....ss..', '.wwww..wwww.'],
    walk:  ['...ss..ss...', '..wwww.www..'],
    jump:  ['.ss......ss.', 'www......www']
  };
  const SPR = {};
  Object.keys(LEGS).forEach(k => SPR[k] = BODY.concat(LEGS[k]));

  const PAL_HERO = {
    h: '#14100e', s: '#9a6340', S: '#7a4a2e', e: '#0d0d0d',
    k: '#1c1c24', K: '#34343f', n: '#101018', w: '#f4f4fa'
  };

  const HEART = ['.wr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'];
  const QMARK = ['.xxxx.', 'xx..xx', '....xx', '..xxx.', '..xx..', '......', '..xx..'];

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
        c.fillStyle = ch === 'w' ? '#ffd9ec' : color;
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
     t: b = brick, q = ? block row, g = grass ledge, p = green pipe
  ============================================================ */
  const PLATFORMS = [
    { x: 190,  y: 145, w: 32, t: 'p' },
    { x: 230,  y: 140, w: 48, t: 'b' },
    { x: 330,  y: 140, w: 48, t: 'q' },
    { x: 400,  y: 104, w: 48, t: 'q' },
    { x: 490,  y: 140, w: 96, t: 'g' },
    { x: 700,  y: 140, w: 48, t: 'b' },
    { x: 772,  y: 106, w: 64, t: 'g' },
    { x: 860,  y: 145, w: 32, t: 'p' },
    { x: 900,  y: 140, w: 96, t: 'g' },
    { x: 1090, y: 140, w: 48, t: 'b' },
    { x: 1160, y: 106, w: 48, t: 'q' },
    { x: 1230, y: 140, w: 48, t: 'b' }
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

  // the castle at the end of the level (goal)
  const CAS = { x: 1316, y: GROUND - 84, w: 84, h: 84 };
  const CAS_CX = CAS.x + CAS.w / 2;

  // scenery
  const BUSHES = [10, 70, 150, 262, 350, 456, 560, 662, 782, 872, 984, 1072, 1192, 1282, 1450]
    .map((x, i) => ({ x, r: 10 + ((i * 7) % 6) * 1.5, flower: i % 2 === 0 }));

  // pre-rendered sky + stars
  const STARS = Array.from({ length: 46 }, (_, i) => ({
    x: (i * 97 + 13) % W, y: (i * 53 + 7) % 112, o: i, big: i % 7 === 0
  }));
  const SKY_STOPS = [[0, '#0c0f3a'], [0.35, '#25196a'], [0.62, '#6b3a9e'], [0.82, '#d2658f'], [1, '#ffb07a']];
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  function skyAt(t) {
    for (let i = 1; i < SKY_STOPS.length; i++) {
      if (t <= SKY_STOPS[i][0]) {
        const [t0, c0] = SKY_STOPS[i - 1], [t1, c1] = SKY_STOPS[i];
        const k = (t - t0) / (t1 - t0), a = hex(c0), b = hex(c1);
        return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * k)).join(',')})`;
      }
    }
    return SKY_STOPS[SKY_STOPS.length - 1][1];
  }
  const skyC = document.createElement('canvas');
  skyC.width = W; skyC.height = H;
  (function () {
    const c = skyC.getContext('2d');
    for (let y = 0; y < GROUND; y += 3) { c.fillStyle = skyAt(y / GROUND); c.fillRect(0, y, W, 3); }
  })();

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
  const nearGoal = () => Math.abs((P.x + 12) - CAS_CX) < 38;

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
      P.x += ((CAS_CX - 12) - P.x) * 0.12;
      P.y += ((GROUND - 28) - P.y) * 0.3;
      P.face = (CAS_CX - 12) > P.x ? 1 : -1;
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
    if (nearGoal()) return setHint('Press ↓ / ENTER to step inside ♡');
    if (tick < 700 && P.x < 260) return setHint('← → to walk · ↑ to jump · grab the coins & hearts!');
    if (P.x > 700) return setHint('✨ Something special is waiting for you in the castle…');
    setHint(null);
  }

  function tryEnter() {
    if (state !== 'play') return;
    if (nearGoal()) {
      state = 'entering'; P.enterT = 0; keys.left = keys.right = keys.jump = false;
      setHint(null);
      beep(520, 180, 0.7, 'triangle');
    } else {
      flash = { txt: 'Walk to the glowing castle first ♡', until: tick + 150 };
      setHint(flash.txt);
    }
  }

  /* ============================================================
     DRAWING: GAME WORLD
  ============================================================ */
  const wrap = (v, m) => ((v % m) + m) % m;

  function disc(cx, cy, r, color) {            // pixel-art filled circle
    ctx.fillStyle = color;
    for (let dy = -r; dy <= r; dy += 2) {
      const half = Math.sqrt(Math.max(0, r * r - dy * dy));
      ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), Math.round(half * 2), 2);
    }
  }
  function pixelHill(cx, r, color, base) {
    ctx.fillStyle = color;
    for (let dy = 0; dy < r; dy += 3) {
      const half = Math.sqrt(r * r - (r - dy) * (r - dy));
      ctx.fillRect(Math.round(cx - half), base - r + dy, Math.round(half * 2), 3);
    }
  }
  function mountain(cx, hgt, halfw, color, hi) {
    for (let dy = 0; dy < hgt; dy += 3) {
      const half = halfw * Math.pow((dy + 3) / hgt, 0.85);
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(cx - half), LAKE_Y - hgt + dy, Math.round(half * 2), 3);
      ctx.fillStyle = hi;                       // lit left slope
      ctx.fillRect(Math.round(cx - half), LAKE_Y - hgt + dy, Math.max(2, Math.round(half * 0.35)), 3);
    }
  }
  function cloud(x, y) {
    ctx.fillStyle = '#8e9cf5';
    ctx.fillRect(x + 10, y, 24, 6);
    ctx.fillRect(x + 2, y + 6, 40, 8);
    ctx.fillStyle = '#c6d0ff';
    ctx.fillRect(x + 12, y, 14, 2);
    ctx.fillRect(x + 4, y + 6, 10, 2);
    ctx.fillStyle = '#f59ac8';
    ctx.fillRect(x + 2, y + 12, 40, 4);
    ctx.fillRect(x + 8, y + 16, 28, 2);
  }
  function bush(x, r, flower) {
    const by = GROUND - r + 5;
    disc(x, by, r, '#1f7a35');
    disc(x - r * 0.9, by + 3, r * 0.75, '#1f7a35');
    disc(x + r * 0.9, by + 3, r * 0.75, '#1f7a35');
    disc(x - 2, by - 2, r * 0.8, '#34a844');
    disc(x + r * 0.8, by + 2, r * 0.55, '#34a844');
    ctx.fillStyle = '#7be06a';
    ctx.fillRect(Math.round(x - r * 0.5), Math.round(by - r * 0.55), 4, 2);
    ctx.fillRect(Math.round(x + r * 0.3), Math.round(by - r * 0.3), 3, 2);
    if (flower) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + r - 2, GROUND - 5, 4, 4);
      ctx.fillRect(x + r - 1, GROUND - 6, 2, 6);
      ctx.fillStyle = '#ffd34d';
      ctx.fillRect(x + r - 1, GROUND - 4, 2, 2);
    }
  }
  function dirtBlock(x, y, w, h, off) {         // brown brick-dirt
    ctx.fillStyle = '#b86a34'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#d98a4c'; ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = '#8a4a22';
    for (let yy = y + 8; yy < y + h; yy += 8) ctx.fillRect(x, yy, w, 2);
    for (let yy = y + 8, r = 0; yy < y + h; yy += 8, r++)
      for (let xx = x + ((r + off) % 2 ? 8 : 0); xx < x + w; xx += 16) ctx.fillRect(xx, yy - 8, 2, 8);
  }
  function grassTop(x, y, w) {                  // grass with dripping edge
    ctx.fillStyle = '#58d24a'; ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = '#7be06a'; ctx.fillRect(x, y, w, 1);
    ctx.fillStyle = '#3fae3c'; ctx.fillRect(x, y + 4, w, 2);
    for (let xx = x; xx < x + w; xx += 4) {
      const d = ((xx * 7 + 3) % 5) + 1;         // deterministic drip length
      ctx.fillRect(xx, y + 6, 3, Math.min(d, 5));
    }
  }

  function drawBackground(cam, ts) {
    ctx.drawImage(skyC, 0, 0);

    // twinkling stars
    STARS.forEach(s => {
      const a = 0.35 + 0.65 * Math.abs(Math.sin(ts / 700 + s.o));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ffe9f5';
      const x = Math.round(wrap(s.x - cam * 0.04, W));
      ctx.fillRect(x, s.y, s.big ? 2 : 1, s.big ? 2 : 1);
    });
    ctx.globalAlpha = 1;

    // parallax clouds
    [[40, 34], [210, 58], [380, 24], [560, 50], [720, 30]].forEach(([cx, cy]) =>
      cloud(Math.round(wrap(cx - cam * 0.15, 800)) - 60, cy));

    // distant mountains
    [[60, 62, 70], [250, 52, 60], [420, 66, 78], [610, 50, 58]].forEach(([mx, h, hw]) =>
      mountain(Math.round(wrap(mx - cam * 0.25, 700)) - 80, h, hw, '#2a6f6a', '#3a8a74'));
    // pink horizon haze
    const hz = ctx.createLinearGradient(0, LAKE_Y - 36, 0, LAKE_Y);
    hz.addColorStop(0, 'rgba(255,150,120,0)'); hz.addColorStop(1, 'rgba(255,150,120,0.35)');
    ctx.fillStyle = hz; ctx.fillRect(0, LAKE_Y - 36, W, 36);

    // lake
    ctx.fillStyle = '#3a3fa8'; ctx.fillRect(0, LAKE_Y, W, 12);
    ctx.fillStyle = '#2a2d86'; ctx.fillRect(0, LAKE_Y + 12, W, GROUND - LAKE_Y - 12);
    ctx.fillStyle = 'rgba(255,170,200,0.45)';
    for (let i = 0; i < 9; i++) {
      const lx = wrap(i * 61 + Math.sin(ts / 900 + i) * 8 - cam * 0.5, W + 40) - 20;
      ctx.fillRect(Math.round(lx), LAKE_Y + 3 + (i % 4) * 5, 10 + (i % 3) * 6, 2);
    }

    // nearer rolling hills
    [[90, 40], [320, 30], [560, 44], [820, 34]].forEach(([hx, r], i) =>
      pixelHill(Math.round(wrap(hx - cam * 0.55, 700)) - 60, r, i % 2 ? '#2e9e45' : '#3bb44f', GROUND));
  }

  function drawGround(cam) {
    const x0 = Math.floor(cam / 16) * 16;
    for (let x = x0; x < cam + W + 16; x += 16) {
      const sx = x - cam;
      dirtBlock(sx, GROUND + 6, 16, H - GROUND - 6, (x / 16) % 2);
      grassTop(sx, GROUND, 16);
    }
  }

  function drawPlatform(p, ts) {
    if (p.t === 'g') {
      dirtBlock(p.x, p.y + 6, p.w, 14, 0);
      grassTop(p.x, p.y, p.w);
      return;
    }
    if (p.t === 'p') {                           // green warp pipe
      const h = GROUND - p.y;
      ctx.fillStyle = '#2fb23a'; ctx.fillRect(p.x + 2, p.y + 8, p.w - 4, h - 8);
      ctx.fillStyle = '#7fe58a'; ctx.fillRect(p.x + 5, p.y + 8, 4, h - 8);
      ctx.fillStyle = '#1c7a2a'; ctx.fillRect(p.x + p.w - 8, p.y + 8, 6, h - 8);
      ctx.fillStyle = '#2fb23a'; ctx.fillRect(p.x, p.y, p.w, 8);
      ctx.fillStyle = '#7fe58a'; ctx.fillRect(p.x + 3, p.y, 4, 8);
      ctx.fillStyle = '#1c7a2a'; ctx.fillRect(p.x + p.w - 6, p.y, 6, 8);
      ctx.fillStyle = '#0f4d1a'; ctx.fillRect(p.x, p.y + 7, p.w, 1); ctx.fillRect(p.x, p.y, p.w, 1);
      return;
    }
    for (let tx = 0; tx < p.w; tx += 16) {
      const x = p.x + tx, y = p.y;
      if (p.t === 'q' && (tx / 16) % 2 === 0) {  // ? block
        const shine = Math.floor(ts / 400) % 6 === 0;
        ctx.fillStyle = '#a05a10'; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = shine ? '#ffd45a' : '#f5a623'; ctx.fillRect(x + 1, y + 1, 14, 14);
        ctx.fillStyle = '#ffd45a'; ctx.fillRect(x + 1, y + 1, 14, 1);
        ctx.fillStyle = '#fff';
        QMARK.forEach((row, r) => {
          for (let c = 0; c < 6; c++) if (row[c] === 'x') ctx.fillRect(x + 2 + c * 2, y + 1 + r * 2, 2, 2);
        });
        ctx.fillStyle = '#a05a10';
        ctx.fillRect(x + 1, y + 1, 1, 1); ctx.fillRect(x + 14, y + 1, 1, 1);
        ctx.fillRect(x + 1, y + 14, 1, 1); ctx.fillRect(x + 14, y + 14, 1, 1);
      } else {                                   // brick
        const off = (tx / 16) % 2 ? 8 : 0;
        ctx.fillStyle = '#d4682f'; ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = '#ff9a62'; ctx.fillRect(x, y, 16, 2);
        ctx.fillStyle = '#7a3516';
        ctx.fillRect(x, y + 7, 16, 2);
        ctx.fillRect(x + off, y, 2, 8);
        ctx.fillRect(x + (8 - off), y + 9, 2, 7);
        ctx.fillRect(x + 15, y, 1, 16);
      }
    }
  }

  function drawCastle(ts) {
    const { x, y, w, h } = CAS;
    const cx = x + w / 2;

    // warm beam of light falling from the sky onto the castle
    const pulse = 0.2 + 0.05 * Math.sin(ts / 500);
    const bg = ctx.createLinearGradient(0, 0, 0, GROUND);
    bg.addColorStop(0, `rgba(255,214,150,${pulse + 0.05})`);
    bg.addColorStop(1, `rgba(255,214,150,${pulse * 0.4})`);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(cx - 12, 0); ctx.lineTo(cx + 12, 0); ctx.lineTo(cx + 60, GROUND); ctx.lineTo(cx - 60, GROUND);
    ctx.closePath(); ctx.fill();

    // glowing sandy patch in front
    ctx.fillStyle = 'rgba(255,214,130,0.35)';
    ctx.fillRect(cx - 52, GROUND - 2, 104, 3);
    ctx.fillRect(cx - 40, GROUND - 4, 80, 2);

    // stone wall
    ctx.fillStyle = '#8a8d9e'; ctx.fillRect(x, y + 24, w, h - 24);
    ctx.fillStyle = '#a3a7b8'; ctx.fillRect(x, y + 24, w, 2);
    ctx.fillStyle = '#666a7c';
    for (let yy = y + 32; yy < y + h; yy += 10) ctx.fillRect(x, yy, w, 2);
    for (let yy = y + 32, r = 0; yy < y + h; yy += 10, r++)
      for (let xx = x + (r % 2 ? 8 : 0); xx < x + w; xx += 16) ctx.fillRect(xx, yy - 8, 2, 8);
    // battlements
    ctx.fillStyle = '#8a8d9e';
    for (let m = 0; m < w; m += 24) ctx.fillRect(x + m, y + 14, 12, 10);
    ctx.fillStyle = '#a3a7b8';
    for (let m = 0; m < w; m += 24) ctx.fillRect(x + m, y + 14, 12, 2);
    // central tower
    ctx.fillStyle = '#8a8d9e'; ctx.fillRect(x + 30, y + 4, 24, 24);
    ctx.fillStyle = '#a3a7b8'; ctx.fillRect(x + 30, y + 4, 24, 2);
    ctx.fillStyle = '#666a7c'; ctx.fillRect(x + 40, y + 10, 4, 8);
    // red roof
    for (let i = 0; i < 6; i++) {
      const rw = 28 - i * 4;
      ctx.fillStyle = i % 2 ? '#c0504d' : '#d9605c';
      ctx.fillRect(Math.round(cx - rw / 2), y + 4 - (i + 1) * 2, rw, 2);
    }
    // pole + waving flag
    ctx.fillStyle = '#8a5a2a'; ctx.fillRect(cx - 1, y - 24, 2, 16);
    const wave = Math.round(Math.sin(ts / 180) * 2);
    ctx.fillStyle = '#ff4f6e';
    ctx.fillRect(cx + 1, y - 24, 11, 3);
    ctx.fillRect(cx + 1, y - 21 + wave * 0, 9 + wave, 3);
    ctx.fillRect(cx + 1, y - 18, 7, 2);
    // arched door with glow
    ctx.fillStyle = '#1a1030'; ctx.fillRect(cx - 11, y + h - 28, 22, 28);
    ctx.fillRect(cx - 9, y + h - 32, 18, 4);
    ctx.fillRect(cx - 5, y + h - 35, 10, 3);
    const dg = 0.35 + 0.2 * Math.sin(ts / 280);
    const gr = ctx.createRadialGradient(cx, y + h - 6, 2, cx, y + h - 6, 26);
    gr.addColorStop(0, `rgba(255,214,234,${dg})`);
    gr.addColorStop(1, 'rgba(255,105,180,0)');
    ctx.fillStyle = gr; ctx.fillRect(cx - 12, y + h - 34, 24, 34);

    // floating hearts around the castle
    [[-58, 20], [56, 6], [-36, -8], [40, 34]].forEach(([dx, dy], i) =>
      drawHeart(ctx, cx + dx - 7, y + dy + Math.round(Math.sin(ts / 320 + i * 1.7) * 4), 2, '#ff6fae'));

    // "enter" arrow when close
    if (state === 'play' && nearGoal() && Math.floor(ts / 350) % 2) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 4, y + h - 52, 8, 4);
      ctx.fillRect(cx - 2, y + h - 48, 4, 4);
    }
  }

  function draw(ts) {
    const cam = Math.round(camX);

    drawBackground(cam, ts);
    drawGround(cam);

    ctx.save();
    ctx.translate(-cam, 0);

    BUSHES.forEach(b => { if (b.x > cam - 40 && b.x < cam + W + 40) bush(b.x, b.r, b.flower); });
    drawCastle(ts);
    PLATFORMS.forEach(p => { if (p.x + p.w > cam - 20 && p.x < cam + W + 20) drawPlatform(p, ts); });

    // coins
    coins.forEach(c => {
      if (c.got) return;
      const cw = Math.max(2, Math.round(Math.abs(Math.cos(ts / 220 + c.x)) * 10));
      const cx = Math.round(c.x - cw / 2);
      ctx.fillStyle = '#c47a00'; ctx.fillRect(cx - 1, c.y, cw + 2, 12);
      ctx.fillStyle = '#ffb300'; ctx.fillRect(cx, c.y, cw, 12);
      ctx.fillStyle = '#ffe566'; ctx.fillRect(cx + 1, c.y + 1, Math.max(1, Math.floor(cw / 3)), 10);
    });

    // collectible hearts
    hearts.forEach(h => {
      if (h.got) return;
      drawHeart(ctx, h.x, h.y + Math.round(Math.sin(ts / 260 + h.x) * 2), 2, '#ff6fae');
    });

    // the guy
    const pose = !P.onGround && state === 'play' ? 'jump' : (P.moving && Math.floor(tick / 7) % 2 ? 'walk' : 'stand');
    if (state === 'entering') ctx.globalAlpha = Math.max(0, 1 - P.enterT * 1.1);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';                       // soft ground shadow
    if (P.onGround) ctx.fillRect(Math.round(P.x + 2), Math.round(P.y + 27), 20, 2);
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

  /* ---------- CASTLE DOOR TRANSITION ---------- */
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

  /* The finale animates the photo itself: slow zoom toward the kiss, the guy
     leans back then in for the kiss, hearts burst, "mwah", blush, sparkles,
     and a gentle nuzzle that repeats. All coordinates below are in the
     photo's own 1254 x 1254 space. */
  const R = 1254, FC = fcanvas.width;
  const fimg = new Image();
  let fimgOK = false;
  fimg.onload = () => { fimgOK = true; };
  fimg.src = 'couple.jpg';

  const KISS = { x: 610, y: 338 };               // where lips meet her cheek
  const FOCUS = { x: 630, y: 360 };              // camera zoom focus
  const PIVOT = { x: 555, y: 380 };              // his neck (head rotates about this)
  const HEAD = { cx: 553, cy: 278, rx: 72, ry: 88 };
  const SPARKS = [
    [70, 90], [160, 40], [270, 175], [330, 60], [940, 120], [1050, 60], [1150, 200],
    [1000, 330], [230, 250], [880, 40], [450, 60], [780, 120], [180, 560], [1100, 520]
  ].map(([x, y], i) => ({ x, y, o: i * 1.3, s: 4 + (i % 3) * 2 }));
  const KISS_COLORS = ['#ff6fae', '#ff4f8b', '#ffb3d6', '#ffd9ec', '#ff8fc4'];

  let fin = null;

  function startFinale() {
    $('finMission').textContent = F.mission;
    $('finLove').textContent = F.declaration;
    $('replayBtn').textContent = F.replay;
    fin = { t0: 0, lt: 0, kissN: -1, textShown: false, parts: [], mwahs: [] };
    setAmbient(true, 380);
    requestAnimationFrame(finLoop);
  }

  function burst(n) {
    for (let i = 0; i < n; i++) {
      fin.parts.push({
        x: KISS.x + (Math.random() - 0.5) * 60, y: KISS.y + (Math.random() - 0.5) * 30,
        vx: (Math.random() - 0.5) * 260, vy: -(110 + Math.random() * 230),
        s: 3 + Math.floor(Math.random() * 4), life: 2.4 + Math.random() * 0.8,
        c: KISS_COLORS[Math.floor(Math.random() * KISS_COLORS.length)]
      });
    }
  }

  function finLoop(ts) {
    if (!fin) return;
    if (!fin.t0) fin.t0 = ts;
    const t = (ts - fin.t0) / 1000;
    const dt = Math.min(0.05, Math.max(0, t - fin.lt));
    fin.lt = t;

    // a kiss lands every 3 seconds, starting at 3.5s
    if (t >= 3.5) {
      const n = Math.floor((t - 3.5) / 3);
      if (n > fin.kissN) {
        fin.kissN = n;
        burst(n === 0 ? 30 : 12);
        fin.mwahs.push({ t0: t, txt: n === 0 ? 'mwah!' : '♥' });
        if (n === 0) {
          for (let i = 0; i < 26; i++) setTimeout(() => spawn($('fx'), ['♥', '♥', '✦'], true), i * 60);
          beep(660, 1320, 0.35, 'triangle');
          setTimeout(() => beep(880, 1760, 0.4, 'triangle'), 250);
        } else {
          beep(784, 1176, 0.18, 'triangle');
        }
      }
    }
    if (t > 5.2 && !fin.textShown) {
      fin.textShown = true;
      $('finaleText').classList.add('show');
    }
    drawFinale(t, dt);
    requestAnimationFrame(finLoop);
  }

  function drawFinale(t, dt) {
    const c = fctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.fillStyle = '#0b0514'; c.fillRect(0, 0, FC, FC);
    if (!fimgOK) return;

    const ease = x => 1 - (1 - x) * (1 - x);
    const since = t >= 3.5 ? (t - 3.5) % 3 : 0;          // seconds since last kiss
    const phase = t >= 3.5 ? since / 3 : 0;

    // head lean: pulled back → leans in → gentle nuzzle loop
    let A;
    if (t < 3) A = 0.05 + 0.006 * Math.sin(t * 3);
    else if (t < 3.5) { const q = (t - 3) / 0.5; A = 0.05 * (1 - q * q); }
    else A = 0.022 * (0.5 - 0.5 * Math.cos(Math.PI * 2 * phase));

    const bump = t >= 3.5 ? 0.025 * Math.exp(-since * 7) : 0;
    const z = 1 + 0.07 * (1 - ease(Math.min(1, t / 1.6))) + 0.1 * ease(Math.min(1, t / 14)) + bump;

    c.save();
    c.scale(FC / R, FC / R);
    c.translate(FOCUS.x, FOCUS.y); c.scale(z, z); c.translate(-FOCUS.x, -FOCUS.y);

    // base photo
    c.drawImage(fimg, 0, 0, R, R);

    // his head, re-drawn rotating about the neck
    c.save();
    c.translate(PIVOT.x, PIVOT.y); c.rotate(-A); c.translate(-PIVOT.x, -PIVOT.y);
    c.beginPath(); c.ellipse(HEAD.cx, HEAD.cy, HEAD.rx, HEAD.ry, 0, 0, Math.PI * 2); c.clip();
    c.drawImage(fimg, 0, 0, R, R);
    c.restore();

    // pulsing spotlight
    c.globalCompositeOperation = 'lighter';
    const sg = c.createRadialGradient(630, 0, 10, 630, 0, 760);
    sg.addColorStop(0, `rgba(255,205,150,${0.12 + 0.05 * Math.sin(t * 2)})`);
    sg.addColorStop(1, 'rgba(255,150,120,0)');
    c.fillStyle = sg; c.fillRect(0, 0, R, R);
    c.globalCompositeOperation = 'source-over';

    // twinkling sparkles
    c.fillStyle = '#fff';
    SPARKS.forEach(s => {
      c.globalAlpha = Math.max(0, Math.sin(t * 1.8 + s.o)) * 0.9;
      c.fillRect(s.x - s.s * 1.5, s.y - s.s / 2, s.s * 3, s.s);
      c.fillRect(s.x - s.s / 2, s.y - s.s * 1.5, s.s, s.s * 3);
    });
    c.globalAlpha = 1;

    // blush on her cheek after each kiss
    if (t > 3.4) {
      const a = 0.1 + 0.28 * Math.exp(-since * 2);
      const bg = c.createRadialGradient(612, 358, 4, 612, 358, 70);
      bg.addColorStop(0, `rgba(255,80,140,${a})`);
      bg.addColorStop(1, 'rgba(255,80,140,0)');
      c.fillStyle = bg; c.fillRect(530, 280, 180, 160);
    }

    // heart particles
    fin.parts.forEach(p => {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.992; p.vy *= 0.992;
      c.globalAlpha = Math.max(0, Math.min(1, p.life / 0.9));
      drawHeart(c, p.x, p.y, p.s, p.c);
    });
    fin.parts = fin.parts.filter(p => p.life > 0);
    c.globalAlpha = 1;

    // "mwah!" pop-up
    c.font = '34px "Press Start 2P", monospace';
    c.textAlign = 'center';
    fin.mwahs.forEach(m => {
      const age = t - m.t0;
      if (age > 1.5) return;
      c.globalAlpha = Math.min(1, (1.5 - age) / 0.6);
      const y = 250 - age * 46, sc = 1 + 0.25 * Math.exp(-age * 6);
      c.save(); c.translate(745, y); c.scale(sc, sc);
      c.lineWidth = 9; c.strokeStyle = '#7a1f52'; c.strokeText(m.txt, 0, 0);
      c.fillStyle = '#fff'; c.fillText(m.txt, 0, 0);
      c.restore();
    });
    c.globalAlpha = 1;
    c.restore();

    // fade in from black
    if (t < 1.2) {
      c.fillStyle = '#000';
      c.globalAlpha = 1 - t / 1.2;
      c.fillRect(0, 0, FC, FC);
      c.globalAlpha = 1;
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
