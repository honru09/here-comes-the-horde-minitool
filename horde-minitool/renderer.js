/* 《群尸来压境》深度原作特效离屏缓存渲染器（真实 VFX 贴图 + 城墙工人/守卫 + 女皇法阵 + 震屏 + 飘字，严格 ES2017） */
(function (global) {
  'use strict';

  var DATA = global.HORDE_DATA;
  var ENGINE = global.HORDE_ENGINE;

  var IMAGES = {};
  var LOADED = false;
  var qualityMode = 'medium';
  var showFloats = true;
  var bgCache = null;
  var bgCacheW = 0;
  var bgCacheH = 0;
  var frameCounter = 0;
  var renderPool = [];

  function setQuality(q) {
    if (q === 'low' || q === 'medium' || q === 'high') {
      qualityMode = q;
      bgCacheW = 0;
    }
  }

  function setShowFloats(v) {
    showFloats = !!v;
  }

  function loadImage(key, src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { IMAGES[key] = img; resolve(true); };
      img.onerror = function () { resolve(false); };
      img.src = src;
    });
  }

  async function preloadAssets() {
    if (LOADED) return;
    var tasks = [
      loadImage('ground_spring', './assets/map/ground_spring.webp'),
      loadImage('wall_tile', './assets/map/wall_tile.webp'),
      loadImage('corpse_living', './assets/corpses/living.webp'),
      loadImage('corpse_undead', './assets/corpses/undead.webp'),
      loadImage('sheep_walk', './assets/units/sheep_walk.webp'),
      loadImage('worker_walk', './assets/units/worker_walk.webp'),
      loadImage('empress_new', './assets/ui/empress_new.webp'),
      loadImage('vfx_arrow_fire', './assets/vfx/arrow_fire.webp'),
      loadImage('vfx_bolt_living', './assets/vfx/bolt_living.webp'),
      loadImage('vfx_bolt_undead', './assets/vfx/bolt_undead.webp'),
      loadImage('vfx_shockwave', './assets/vfx/shockwave.webp'),
      loadImage('vfx_paladin_slash', './assets/vfx/paladin_slash.webp'),
      loadImage('vfx_impact', './assets/vfx/impact.webp'),
      loadImage('vfx_empress_runes', './assets/vfx/empress_runes.webp')
    ];
    for (var i = 0; i < DATA.UNIT_ORDER.length; i += 1) {
      var uid = DATA.UNIT_ORDER[i];
      tasks.push(loadImage(uid + '_living_walk', './assets/units/' + uid + '_living_walk.webp'));
      tasks.push(loadImage(uid + '_living_attack', './assets/units/' + uid + '_living_attack.webp'));
      tasks.push(loadImage(uid + '_undead_walk', './assets/units/' + uid + '_undead_walk.webp'));
      tasks.push(loadImage(uid + '_undead_attack', './assets/units/' + uid + '_undead_attack.webp'));
    }
    await Promise.all(tasks);
    LOADED = true;
    bgCacheW = 0;
  }

  function getDprCap() {
    if (qualityMode === 'low') return 1;
    if (qualityMode === 'high') return 1.8;
    return 1.3;
  }

  function resizeCanvas(canvas) {
    var cw = Math.max(1, canvas.clientWidth || 640);
    var ch = Math.max(1, canvas.clientHeight || 360);
    var dpr = Math.min(global.devicePixelRatio || 1, getDprCap());
    var w = Math.floor(cw * dpr);
    var h = Math.floor(ch * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w: w, h: h };
  }

  function ensureBgCache(w, h, scale, worldW) {
    if (bgCache && bgCacheW === w && bgCacheH === h) return bgCache;
    if (!bgCache) bgCache = document.createElement('canvas');
    bgCache.width = w;
    bgCache.height = h;
    bgCacheW = w;
    bgCacheH = h;

    var bctx = bgCache.getContext('2d');
    if (!bctx) return null;
    bctx.save();
    bctx.scale(scale, scale);

    if (IMAGES.ground_spring) {
      var pat = bctx.createPattern(IMAGES.ground_spring, 'repeat');
      bctx.save();
      bctx.scale(0.5, 0.5);
      bctx.fillStyle = pat;
      bctx.fillRect(0, 0, worldW * 2, ENGINE.WORLD_H * 2);
      bctx.restore();
    } else {
      bctx.fillStyle = '#4a6b35';
      bctx.fillRect(0, 0, worldW, ENGINE.WORLD_H);
    }

    bctx.fillStyle = 'rgba(12, 20, 12, 0.16)';
    bctx.fillRect(0, 0, worldW, ENGINE.WORLD_H);

    var fogGrad = bctx.createLinearGradient(worldW * 0.68, 0, worldW, 0);
    fogGrad.addColorStop(0, 'rgba(125, 16, 24, 0)');
    fogGrad.addColorStop(1, 'rgba(125, 16, 24, 0.42)');
    bctx.fillStyle = fogGrad;
    bctx.fillRect(worldW * 0.68, 0, worldW * 0.32, ENGINE.WORLD_H);

    if (IMAGES.wall_tile) {
      var tileW = ENGINE.WALL_X;
      var tileH = (IMAGES.wall_tile.height / IMAGES.wall_tile.width) * tileW;
      for (var wy = 0; wy < ENGINE.WORLD_H; wy += tileH) {
        bctx.drawImage(IMAGES.wall_tile, 0, wy, tileW, tileH);
      }
    } else {
      bctx.fillStyle = '#5a5d66';
      bctx.fillRect(0, 0, ENGINE.WALL_X, ENGINE.WORLD_H);
    }

    bctx.restore();
    return bgCache;
  }

  function drawSpriteFrame(ctx, img, frameIdx, x, y, drawSize, flipX) {
    var fw = img.width * 0.25;
    var fh = img.height * 0.25;
    var idx = frameIdx & 15;
    var col = idx & 3;
    var row = idx >> 2;
    if (flipX) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, col * fw, row * fh, fw, fh, -drawSize * 0.5, -drawSize * 0.74, drawSize, drawSize);
      ctx.restore();
    } else {
      ctx.drawImage(img, col * fw, row * fh, fw, fh, x - drawSize * 0.5, y - drawSize * 0.74, drawSize, drawSize);
    }
  }

  function renderBattle(canvas, battle) {
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    frameCounter += 1;
    var size = resizeCanvas(canvas);
    var scale = size.h / ENGINE.WORLD_H;
    var worldW = size.w / scale;
    ENGINE.setWorldWidth(worldW);

    ctx.save();
    /* 轻微打击震屏效果 */
    if (battle && battle.shakeTicks > 0 && qualityMode !== 'low') {
      var amp = Math.min(5, battle.shakeTicks * 0.5) * scale;
      ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
    }

    var bg = ensureBgCache(size.w, size.h, scale, worldW);
    if (bg) ctx.drawImage(bg, 0, 0);

    if (!battle) {
      ctx.restore();
      return;
    }

    ctx.scale(scale, scale);

    /* 1. 城墙上的守卫弓箭手、法师与巡逻施工工人 */
    if (battle.wallArcherCount > 0 && IMAGES.archer_living_attack) {
      var aCnt = Math.min(4, battle.wallArcherCount + 1);
      for (var wa = 0; wa < aCnt; wa += 1) {
        var ay = 70 + wa * ((ENGINE.WORLD_H - 140) / Math.max(1, aCnt - 1));
        drawSpriteFrame(ctx, IMAGES.archer_living_attack, (battle.tick + wa * 3) & 15, ENGINE.WALL_X - 18, ay, 30, false);
      }
    }
    if (battle.wallMageCount > 0 && IMAGES.mage_living_attack) {
      var mCnt = Math.min(2, battle.wallMageCount);
      for (var wm = 0; wm < mCnt; wm += 1) {
        var my = 140 + wm * 160;
        drawSpriteFrame(ctx, IMAGES.mage_living_attack, (battle.tick + wm * 5) & 15, ENGINE.WALL_X - 30, my, 32, false);
      }
    }
    if (battle.workerCount > 0 && IMAGES.worker_walk) {
      drawSpriteFrame(ctx, IMAGES.worker_walk, (battle.tick * 2) & 15, ENGINE.WALL_X - 10, battle.workerY, 30, false);
    }

    /* 2. 尸体层 */
    var maxCorpses = qualityMode === 'low' ? 35 : (qualityMode === 'high' ? 160 : 80);
    var cStart = Math.max(0, battle.corpses.length - maxCorpses);
    for (var ci = cStart; ci < battle.corpses.length; ci += 1) {
      var cp = battle.corpses[ci];
      var cImg = cp.color === '#6f6556' ? IMAGES.corpse_living : IMAGES.corpse_undead;
      if (cImg) ctx.drawImage(cImg, cp.x - 10, cp.y - 7, 20, 14);
    }

    /* 3. 单位深度排序绘制 */
    renderPool.length = 0;
    for (var li = 0; li < battle.living.length; li += 1) renderPool.push(battle.living[li]);
    for (var ui = 0; ui < battle.undead.length; ui += 1) renderPool.push(battle.undead[ui]);
    if (qualityMode !== 'low' || (frameCounter & 3) === 0) {
      renderPool.sort(function (a, b) { return a.y - b.y; });
    }

    var drawShadows = qualityMode !== 'low';
    var isRallied = battle.rallyTicks > 0;
    for (var k = 0; k < renderPool.length; k += 1) {
      drawUnit(ctx, renderPool[k], isRallied, drawShadows);
    }

    /* 4. Boss 暗影女皇（带旋转符文法阵） */
    if (battle.boss && battle.boss.hp > 0) {
      drawBoss(ctx, battle.boss, battle.tick);
    }

    /* 5. 龙卷风 */
    if (battle.tornadoTicks > 0) {
      ctx.strokeStyle = 'rgba(185, 232, 255, 0.9)';
      ctx.lineWidth = 3;
      for (var tr = 14; tr <= 48; tr += 12) {
        ctx.beginPath();
        ctx.arc(battle.tornadoX, battle.tornadoY, tr, battle.tick * 0.45 + tr, battle.tick * 0.45 + tr + 4.3);
        ctx.stroke();
      }
    }

    /* 6. 真实原作弹道特效（火箭 / 法球 / 箭矢） */
    for (var pi = 0; pi < battle.projectiles.length; pi += 1) {
      var pr = battle.projectiles[pi];
      var pImg = pr.spriteKind === 'arrow_fire' ? IMAGES.vfx_arrow_fire
        : (pr.spriteKind === 'bolt_living' ? IMAGES.vfx_bolt_living
          : (pr.spriteKind === 'bolt_undead' ? IMAGES.vfx_bolt_undead : null));
      if (pImg) {
        var ps = pr.area > 0 ? 22 : 18;
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.rotate(pr.angle || 0);
        ctx.drawImage(pImg, -ps * 0.5, -ps * 0.5, ps, ps);
        ctx.restore();
      } else {
        ctx.fillStyle = pr.color;
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, pr.area > 0 ? 4.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* 7. 原作打击火花 / 圣骑士斩击 / 冲击波特效 */
    for (var ei = 0; ei < battle.effects.length; ei += 1) {
      var ef = battle.effects[ei];
      var prog = 1 - ef.life / ef.maxLife;
      var curR = ef.r + (ef.maxR - ef.r) * prog;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - prog);
      var eImg = ef.type === 'shockwave' ? IMAGES.vfx_shockwave
        : (ef.type === 'paladin_slash' ? IMAGES.vfx_paladin_slash
          : (ef.type === 'impact' ? IMAGES.vfx_impact : null));
      if (eImg && qualityMode !== 'low') {
        ctx.drawImage(eImg, ef.x - curR, ef.y - curR, curR * 2, curR * 2);
      } else {
        ctx.strokeStyle = ef.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ef.x, ef.y, curR, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* 8. 复活圣光炸弹波 */
    if (battle.bombWave && battle.bombWave.active) {
      var bx = battle.bombWave.x;
      var bGrad = ctx.createLinearGradient(bx - 75, 0, bx + 24, 0);
      bGrad.addColorStop(0, 'rgba(255, 160, 40, 0)');
      bGrad.addColorStop(0.7, 'rgba(255, 210, 90, 0.72)');
      bGrad.addColorStop(0.92, 'rgba(255, 252, 220, 0.96)');
      bGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = bGrad;
      ctx.fillRect(bx - 75, 0, 99, ENGINE.WORLD_H);
    }

    /* 9. 浮动金币飘字 */
    if (showFloats && qualityMode !== 'low' && battle.floatTexts.length > 0) {
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      for (var fi = 0; fi < battle.floatTexts.length; fi += 1) {
        var ft = battle.floatTexts[fi];
        ctx.save();
        ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
        ctx.fillStyle = '#09121d';
        ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  function drawUnit(ctx, u, isRallied, drawShadows) {
    if (drawShadows) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(u.x, u.y + 3, u.radius * 0.9, u.radius * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isRallied && u.side === 'living') {
      ctx.strokeStyle = 'rgba(240, 213, 152, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    } else if (u.packSize > 1) {
      ctx.strokeStyle = u.side === 'living' ? 'rgba(240, 213, 152, 0.55)' : 'rgba(255, 110, 120, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(u.x, u.y + 2, u.radius + 2.5, u.radius * 0.65, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    var drawSize = u.isSheep ? 26 : (26 + u.radius * 2.1);
    var frameIdx = Math.floor(u.animPhase * 2.6) & 15;

    if (u.isSheep) {
      if (IMAGES.sheep_walk) drawSpriteFrame(ctx, IMAGES.sheep_walk, frameIdx, u.x, u.y, drawSize, true);
      return;
    }

    var key = u.unitId + '_' + u.side + '_' + (u.attackFlash > 0 ? 'attack' : 'walk');
    var sheet = IMAGES[key];
    if (sheet) {
      drawSpriteFrame(ctx, sheet, frameIdx, u.x, u.y, drawSize, u.side === 'undead');
    } else {
      var def = DATA.UNITS[u.unitId];
      ctx.fillStyle = u.side === 'living' ? def.color : def.undeadColor;
      ctx.beginPath();
      ctx.arc(u.x, u.y, u.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBoss(ctx, boss, tick) {
    /* 脚底旋转死灵符文法阵 */
    if (IMAGES.vfx_empress_runes) {
      ctx.save();
      ctx.translate(boss.x, boss.y + 18);
      ctx.scale(1, 0.45);
      ctx.rotate(tick * 0.04);
      ctx.globalAlpha = 0.72;
      ctx.drawImage(IMAGES.vfx_empress_runes, -74, -74, 148, 148);
      ctx.restore();
    }

    var pulse = Math.sin(boss.animPhase) * 5;
    var auraColor = boss.phase === 3 ? 'rgba(255, 45, 105, 0.44)' : (boss.phase === 2 ? 'rgba(175, 55, 200, 0.35)' : 'rgba(92, 224, 198, 0.34)');
    ctx.fillStyle = auraColor;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, boss.radius + 24 + pulse, 0, Math.PI * 2);
    ctx.fill();

    if (IMAGES.empress_new) {
      var sz = 116;
      ctx.drawImage(IMAGES.empress_new, boss.x - sz * 0.5, boss.y + Math.sin(boss.animPhase) * 4 - sz * 0.62, sz, sz);
    }
  }

  function buildResultPosterDataUrl(battle, isVictory) {
    var c = document.createElement('canvas');
    c.width = 640;
    c.height = 360;
    var ctx = c.getContext('2d');
    if (!ctx) return '';

    var grad = ctx.createLinearGradient(0, 0, 640, 360);
    grad.addColorStop(0, '#0d2035');
    grad.addColorStop(1, isVictory ? '#1b3a2c' : '#3a1622');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 360);

    ctx.strokeStyle = '#cba64c';
    ctx.lineWidth = 4;
    ctx.strokeRect(14, 14, 612, 332);

    ctx.fillStyle = '#9bfce0';
    ctx.font = 'bold 34px serif';
    ctx.textAlign = 'center';
    ctx.fillText('群尸来压境 · 战况速报', 320, 74);

    ctx.fillStyle = isVictory ? '#9effaa' : '#ff9494';
    ctx.font = 'bold 24px sans-serif';
    var sub = battle.isTutorial ? '新手教学演练' : ('第 ' + battle.level + ' 关 · ' + (isVictory ? '防线守卫成功！' : '城墙危急求援！'));
    ctx.fillText(sub, 320, 126);

    ctx.fillStyle = '#ece4ca';
    ctx.font = '20px sans-serif';
    ctx.fillText('击杀亡灵：' + String(battle.kills), 320, 188);
    ctx.fillText('收割灵魂：+' + String(battle.earnedSouls), 320, 228);
    ctx.fillText('获得金币：+' + String(battle.earnedGold), 320, 268);

    ctx.fillStyle = '#f0d598';
    ctx.font = '14px sans-serif';
    ctx.fillText('小红书横屏兵海守城小工具 · 快来一起抵御亡灵大军', 320, 316);

    return c.toDataURL('image/png');
  }

  global.HORDE_RENDERER = {
    setQuality: setQuality,
    setShowFloats: setShowFloats,
    preloadAssets: preloadAssets,
    renderBattle: renderBattle,
    buildResultPosterDataUrl: buildResultPosterDataUrl
  };
})(window);
