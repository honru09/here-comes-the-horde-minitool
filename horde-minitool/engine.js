/* 《群尸来压境》10 TPS 深度战斗模拟核心（含相邻协同、城墙守卫/工人、大法师亡语、特效事件与飘字，严格 ES2017） */
(function (global) {
  'use strict';

  var DATA = global.HORDE_DATA;
  var WORLD_W = 760;
  var WORLD_H = 440;
  var WALL_X = 56;
  var MAX_ENTITIES_PER_SIDE = 190;
  var MAX_CORPSES = 180;
  var MAX_EFFECTS = 48;
  var MAX_FLOATS = 24;

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function setWorldWidth(w) {
    WORLD_W = clamp(Math.round(w || 760), 540, 1080);
  }

  function getWorldWidth() {
    return WORLD_W;
  }

  function createProfile() {
    return {
      souls: 0,
      unlockedLevel: 1,
      selectedLevel: 1,
      talents: {},
      tutorialDone: false,
      followRewardClaimed: false,
      followPromptSeen: false
    };
  }

  function getTalentLevel(profile, id) {
    return (profile && profile.talents && profile.talents[id]) ? profile.talents[id] : 0;
  }

  function isTalentUnlocked(profile, talent) {
    if (!talent || !talent.req || talent.req.length === 0) return true;
    for (var i = 0; i < talent.req.length; i += 1) {
      var parts = talent.req[i].split(':');
      var reqId = parts[0];
      var reqLv = parseInt(parts[1], 10) || 1;
      if (getTalentLevel(profile, reqId) < reqLv) return false;
    }
    return true;
  }

  function isUnitUnlocked(profile, unitId) {
    if (unitId === 'peasant') return true;
    return getTalentLevel(profile, 'unlock_' + unitId) > 0;
  }

  function getMaxSpeed(profile) {
    var tw = getTalentLevel(profile, 'time_warp');
    if (tw >= 2) return 3;
    if (tw >= 1) return 2;
    return 1;
  }

  function getWallMaxHp(profile) {
    return DATA.ECONOMY.baseWallHealth
      + getTalentLevel(profile, 'wall_hp_300') * 300
      + getTalentLevel(profile, 'wall_hp_1000') * 1000
      + getTalentLevel(profile, 'wall_hp_5000') * 5000;
  }

  function getStartGold(profile) {
    return 12
      + getTalentLevel(profile, 'start_gold_10') * 10
      + getTalentLevel(profile, 'start_gold_100') * 100
      + getTalentLevel(profile, 'start_gold_1000') * 1000;
  }

  function getGoldPerSecond(profile) {
    var followBonus = (profile && profile.followRewardClaimed) ? 1 : 0;
    return 1
      + followBonus
      + getTalentLevel(profile, 'gold_income_5') * 5
      + getTalentLevel(profile, 'gold_income_50') * 50;
  }

  function countBuiltOfType(slots, unitId) {
    var c = 0;
    for (var i = 0; i < slots.length; i += 1) {
      if (slots[i] && slots[i].unitId === unitId) c += 1;
    }
    return c;
  }

  function getBuildCost(profile, slots, unitId) {
    var built = countBuiltOfType(slots, unitId);
    if (unitId === 'peasant' && built < DATA.ECONOMY.peasantBuildingCosts.length) {
      return DATA.ECONOMY.peasantBuildingCosts[built];
    }
    var base = DATA.UNITS[unitId].buildCost;
    var cost = Math.round(base * Math.pow(DATA.ECONOMY.buildingCostGrowth, built));
    return Math.max(1, cost);
  }

  function getUpgradeCost(profile, slot) {
    var unitId = slot.unitId;
    var lvl = slot.level;
    var unitIdx = DATA.UNIT_ORDER.indexOf(unitId);
    var tierScale = DATA.ECONOMY.tierUpgradeScales[unitIdx] || 1;
    var baseCost = DATA.UNITS[unitId].buildCost * DATA.ECONOMY.upgradeBaseMultiplier;
    var growth = lvl < DATA.ECONOMY.lateUpgradeStart
      ? Math.pow(DATA.ECONOMY.upgradeGrowth, lvl)
      : Math.pow(DATA.ECONOMY.upgradeGrowth, DATA.ECONOMY.lateUpgradeStart) * Math.pow(DATA.ECONOMY.lateUpgradeGrowth, lvl - DATA.ECONOMY.lateUpgradeStart);
    var raw = baseCost * tierScale * growth;
    if (unitId === 'peasant' && lvl === 1) {
      raw = DATA.ECONOMY.firstPeasantUpgradeCost;
    }
    var unitDiscLv = getTalentLevel(profile, unitId + '_discount');
    var unitFactor = Math.max(DATA.ECONOMY.unitDiscountFloor, 1 - unitDiscLv * 0.2);
    var globalDiscLv = getTalentLevel(profile, 'upgrade_discount');
    var globalFactor = Math.max(DATA.ECONOMY.globalDiscountFloor, 1 - globalDiscLv * 0.1);
    return Math.max(DATA.ECONOMY.minimumUpgradeCost, Math.round(raw * unitFactor * globalFactor));
  }

  function getSlotSynergyPercent(slots, slotIndex) {
    var slot = slots[slotIndex];
    if (!slot) return 0;
    var col = slotIndex % 3;
    var row = Math.floor(slotIndex / 3);
    var neighbors = [
      col > 0 ? slotIndex - 1 : -1,
      col < 2 ? slotIndex + 1 : -1,
      row > 0 ? slotIndex - 3 : -1,
      row < 4 ? slotIndex + 3 : -1
    ];
    var count = 0;
    for (var n = 0; n < neighbors.length; n += 1) {
      var ni = neighbors[n];
      if (ni >= 0 && slots[ni] && slots[ni].unitId === slot.unitId) count += 1;
    }
    return count * 15;
  }

  function getBuildingProduction(profile, slots, slotIndex) {
    var slot = slots[slotIndex];
    if (!slot) return 0;
    var unitId = slot.unitId;
    var baseProd = slot.level + getTalentLevel(profile, unitId + '_production');
    var mult = 1;
    if (unitId === 'peasant') {
      mult += getTalentLevel(profile, 'peasant_multiplier');
    } else if (unitId === 'archmage') {
      mult += getTalentLevel(profile, 'archmage_production') * 0.5;
    }
    var divLv = getTalentLevel(profile, 'diversity_hire');
    if (divLv > 0) {
      var seen = {};
      var unique = 0;
      for (var i = 0; i < slots.length; i += 1) {
        if (slots[i] && !seen[slots[i].unitId]) {
          seen[slots[i].unitId] = true;
          unique += 1;
        }
      }
      mult *= (1 + unique * divLv * 0.08);
    }
    var synPct = getSlotSynergyPercent(slots, slotIndex);
    if (synPct > 0) mult *= (1 + synPct / 100);
    return Math.max(1, Math.round(baseProd * mult));
  }

  function pushEffect(battle, ef) {
    if (battle.effects.length >= MAX_EFFECTS) battle.effects.shift();
    battle.effects.push(ef);
  }

  function pushFloatText(battle, x, y, text, color) {
    if (battle.floatTexts.length >= MAX_FLOATS) battle.floatTexts.shift();
    battle.floatTexts.push({ x: x, y: y, text: text, color: color || '#f0d598', life: 12, maxLife: 12 });
  }

  function createBattle(profile, levelNum, isTutorial) {
    var lvlIdx = clamp((levelNum || 1) - 1, 0, DATA.LEVELS.length - 1);
    var cfg = isTutorial
      ? { level: 0, counts: [14, 0, 0, 0, 0, 0, 0], duration: 40 }
      : DATA.LEVELS[lvlIdx];
    var wallMax = isTutorial ? 200 : getWallMaxHp(profile);
    var slots = [];
    for (var s = 0; s < 15; s += 1) slots.push(null);

    if (!isTutorial) {
      var freePeasants = getTalentLevel(profile, 'free_peasant_building');
      for (var fp = 0; fp < freePeasants && fp < 3; fp += 1) {
        slots[fp * 3] = { unitId: 'peasant', level: 1, invested: 0 };
      }
    }

    var totalEnemies = 0;
    var enemyQueue = [];
    for (var u = 0; u < DATA.UNIT_ORDER.length; u += 1) {
      var cnt = cfg.counts[u] || 0;
      totalEnemies += cnt;
      if (cnt > 0) {
        enemyQueue.push({ unitId: DATA.UNIT_ORDER[u], remaining: cnt, total: cnt });
      }
    }

    return {
      isTutorial: !!isTutorial,
      tutorialStep: isTutorial ? 1 : 0,
      level: isTutorial ? 0 : cfg.level,
      durationTicks: cfg.duration * 10,
      tick: 0,
      status: 'running',
      reviveUsed: false,
      bombWave: null,
      shakeTicks: 0,
      wallHp: wallMax,
      wallMaxHp: wallMax,
      gold: isTutorial ? 6 : getStartGold(profile),
      earnedGold: 0,
      earnedSouls: 0,
      kills: 0,
      slots: slots,
      living: [],
      undead: [],
      projectiles: [],
      effects: [],
      floatTexts: [],
      corpses: [],
      enemyQueue: enemyQueue,
      totalEnemies: totalEnemies,
      spawnedEnemies: 0,
      boss: null,
      bossSpawned: false,
      bossEvent: '',
      bossToast: '',
      bossToastTicks: 0,
      rallyTicks: 0,
      tornadoTicks: 0,
      tornadoX: WORLD_W * 0.5,
      tornadoY: WORLD_H * 0.5,
      abilityCooldowns: { tornado: 0, sheep_explosion: 0, rally: 0 },
      workerCooldown: 20,
      workerY: WORLD_H * 0.5,
      workerTargetY: WORLD_H * 0.5,
      wallArcherCd: 10,
      wallMageCd: 20,
      wallArcherCount: getTalentLevel(profile, 'watchers_on_the_wall'),
      wallMageCount: getTalentLevel(profile, 'wall_mages'),
      workerCount: getTalentLevel(profile, 'construction_worker'),
      nextId: 1
    };
  }

  function spawnEntity(battle, side, unitId, x, y, packSize, isSheep) {
    var def = isSheep ? { health: 30, damage: 0, attackRange: 10, attackType: 'none', cooldownTicks: 20, radius: 5, value: 0 } : DATA.UNITS[unitId];
    var size = Math.max(1, packSize || 1);
    var entity = {
      id: battle.nextId++,
      side: side,
      unitId: isSheep ? 'sheep' : unitId,
      isSheep: !!isSheep,
      x: x,
      y: y,
      hp: def.health * size,
      maxHp: def.health * size,
      damage: def.damage * size,
      packSize: size,
      radius: def.radius + (size > 1 ? Math.min(4, Math.log(size) * 1.1) : 0),
      cooldown: Math.floor(Math.random() * 5),
      animPhase: Math.random() * 6.28,
      attackFlash: 0,
      value: def.value * size
    };
    if (side === 'living') battle.living.push(entity);
    else battle.undead.push(entity);
    return entity;
  }

  function spawnBoss(battle) {
    battle.bossSpawned = true;
    battle.boss = {
      id: battle.nextId++,
      side: 'undead',
      unitId: 'moriana',
      isBoss: true,
      x: WORLD_W - 50,
      y: WORLD_H * 0.5,
      hp: DATA.BOSS_MORIANA.health,
      maxHp: DATA.BOSS_MORIANA.health,
      radius: DATA.BOSS_MORIANA.radius,
      phase: 1,
      novaCd: 90,
      raiseCd: 240,
      pulseCd: 30,
      animPhase: 0
    };
    battle.bossEvent = 'opening';
    battle.bossToast = '暗影女皇莫里亚娜降临战场！';
    battle.bossToastTicks = 55;
    battle.shakeTicks = 12;
  }

  function triggerReviveBombWave(battle) {
    if (!battle || battle.reviveUsed) return false;
    battle.reviveUsed = true;
    battle.wallHp = battle.wallMaxHp;
    battle.status = 'running';
    battle.bombWave = { x: WALL_X, speed: 34, active: true };
    battle.shakeTicks = 18;
    battle.bossToast = '圣光复活！全屏圣光炸弹波横扫亡灵军团！';
    battle.bossToastTicks = 40;
    for (var i = 0; i < 8; i += 1) {
      var y = 60 + i * ((WORLD_H - 120) / 7);
      spawnEntity(battle, 'living', 'peasant', WALL_X + 26 + (i % 2) * 12, y, 2, false);
    }
    return true;
  }

  function tryBuildOrUpgrade(profile, battle, slotIndex, selectedUnitId, demolishMode) {
    if (!battle || battle.status !== 'running') return { ok: false, reason: '战斗未进行' };
    var slot = battle.slots[slotIndex];
    if (demolishMode) {
      if (!slot) return { ok: false, reason: '该格为空' };
      var refund = Math.floor((slot.invested || 0) * 0.5);
      battle.gold += refund;
      battle.slots[slotIndex] = null;
      return { ok: true, action: 'demolish', refund: refund };
    }
    if (!slot) {
      if (!selectedUnitId || !isUnitUnlocked(profile, selectedUnitId)) return { ok: false, reason: '兵种未解锁' };
      var cost = getBuildCost(profile, battle.slots, selectedUnitId);
      if (battle.gold < cost) return { ok: false, reason: '金币不足' };
      battle.gold -= cost;
      battle.slots[slotIndex] = { unitId: selectedUnitId, level: 1, invested: cost };
      var rowY = 56 + Math.floor(slotIndex / 3) * ((WORLD_H - 112) / 4);
      pushEffect(battle, { type: 'impact', x: WALL_X + 14, y: rowY, r: 16, maxR: 40, color: '#f0d598', life: 8, maxLife: 8 });
      if (battle.isTutorial && battle.tutorialStep === 1) {
        battle.tutorialStep = 2;
        spawnEntity(battle, 'living', selectedUnitId, WALL_X + 22, WORLD_H * 0.45, 1, false);
        spawnEntity(battle, 'living', selectedUnitId, WALL_X + 28, WORLD_H * 0.55, 1, false);
      }
      return { ok: true, action: 'build', cost: cost };
    }
    var upCost = getUpgradeCost(profile, slot);
    if (battle.gold < upCost) return { ok: false, reason: '金币不足' };
    battle.gold -= upCost;
    slot.level += 1;
    slot.invested = (slot.invested || 0) + upCost;
    var upRowY = 56 + Math.floor(slotIndex / 3) * ((WORLD_H - 112) / 4);
    pushEffect(battle, { type: 'shockwave', x: WALL_X + 14, y: upRowY, r: 14, maxR: 44, color: '#f0d598', life: 9, maxLife: 9 });
    if (battle.isTutorial && battle.tutorialStep === 2) {
      battle.tutorialStep = 3;
      spawnEntity(battle, 'living', slot.unitId, WALL_X + 24, WORLD_H * 0.4, 1, false);
      spawnEntity(battle, 'living', slot.unitId, WALL_X + 24, WORLD_H * 0.6, 1, false);
    }
    return { ok: true, action: 'upgrade', cost: upCost };
  }

  function triggerAbility(profile, battle, abilityId) {
    if (!battle || battle.status !== 'running') return false;
    if (getTalentLevel(profile, 'unlock_' + abilityId) <= 0) return false;
    if ((battle.abilityCooldowns[abilityId] || 0) > 0) return false;
    var cfg = DATA.ABILITIES[abilityId];
    if (!cfg) return false;

    battle.abilityCooldowns[abilityId] = cfg.cooldownTicks;

    if (abilityId === 'tornado') {
      battle.tornadoTicks = cfg.durationTicks;
      battle.tornadoX = WORLD_W * 0.42;
      battle.tornadoY = WORLD_H * 0.5;
      pushEffect(battle, { type: 'shockwave', x: battle.tornadoX, y: battle.tornadoY, r: 16, maxR: 96, color: '#9ed8ff', life: 14, maxLife: 14 });
      return true;
    }

    if (abilityId === 'sheep_explosion') {
      battle.shakeTicks = 8;
      var exploded = 0;
      for (var i = battle.undead.length - 1; i >= 0; i -= 1) {
        var u = battle.undead[i];
        if (u.isSheep) {
          exploded += 1;
          explodeAt(battle, u.x, u.y, 78, 240 * u.packSize, '#ff8d4d');
          u.hp = 0;
        }
      }
      if (exploded === 0) {
        explodeAt(battle, WORLD_W * 0.42, WORLD_H * 0.5, 72, 200, '#ff8d4d');
      }
      return true;
    }

    if (abilityId === 'rally') {
      battle.rallyTicks = cfg.durationTicks;
      pushEffect(battle, { type: 'shockwave', x: WALL_X + 35, y: WORLD_H * 0.5, r: 22, maxR: 160, color: '#f0d598', life: 16, maxLife: 16 });
      return true;
    }
    return false;
  }

  function explodeAt(battle, x, y, radius, dmg, color) {
    pushEffect(battle, { type: 'shockwave', x: x, y: y, r: 10, maxR: radius, color: color || '#ff9c52', life: 10, maxLife: 10 });
    var r2 = radius * radius;
    for (var i = 0; i < battle.undead.length; i += 1) {
      var e = battle.undead[i];
      if (e.hp <= 0) continue;
      var dx = e.x - x;
      var dy = e.y - y;
      if (dx * dx + dy * dy <= r2) e.hp -= dmg;
    }
    if (battle.boss && battle.boss.hp > 0) {
      var bdx = battle.boss.x - x;
      var bdy = battle.boss.y - y;
      if (bdx * bdx + bdy * bdy <= (radius + battle.boss.radius) * (radius + battle.boss.radius)) {
        battle.boss.hp -= dmg;
      }
    }
  }

  function damageLivingArea(battle, x, y, radius, dmg) {
    var r2 = radius * radius;
    for (var i = 0; i < battle.living.length; i += 1) {
      var a = battle.living[i];
      if (a.hp <= 0) continue;
      var dx = a.x - x;
      var dy = a.y - y;
      if (dx * dx + dy * dy <= r2) a.hp -= dmg;
    }
  }

  function addCorpse(battle, x, y, color) {
    if (battle.corpses.length >= MAX_CORPSES) battle.corpses.shift();
    battle.corpses.push({ x: x, y: y, color: color });
  }

  function stepBattle(profile, battle, isDemo) {
    if (!battle || battle.status !== 'running') return;
    battle.tick += 1;
    if (battle.shakeTicks > 0) battle.shakeTicks -= 1;

    if (battle.bossToastTicks > 0) {
      battle.bossToastTicks -= 1;
      if (battle.bossToastTicks === 0) battle.bossToast = '';
    }

    /* 全屏圣光复活炸弹波 */
    if (battle.bombWave && battle.bombWave.active) {
      var prevX = battle.bombWave.x;
      battle.bombWave.x += battle.bombWave.speed;
      var curX = battle.bombWave.x;
      for (var bi = 0; bi < battle.undead.length; bi += 1) {
        var bu = battle.undead[bi];
        if (bu.hp > 0 && bu.x <= curX + 26) {
          bu.hp = 0;
          if (bi % 3 === 0) {
            pushEffect(battle, { type: 'shockwave', x: bu.x, y: bu.y, r: 8, maxR: 44, color: '#ffd966', life: 9, maxLife: 9 });
          }
        }
      }
      if (battle.boss && battle.boss.hp > 0 && battle.boss.x >= prevX && battle.boss.x <= curX + 26) {
        battle.boss.hp -= Math.round(battle.boss.maxHp * 0.25);
        pushEffect(battle, { type: 'shockwave', x: battle.boss.x, y: battle.boss.y, r: 22, maxR: 130, color: '#ffae42', life: 14, maxLife: 14 });
      }
      if (curX > WORLD_W + 60) battle.bombWave = null;
    }

    var abKeys = ['tornado', 'sheep_explosion', 'rally'];
    for (var ak = 0; ak < abKeys.length; ak += 1) {
      var k = abKeys[ak];
      if (battle.abilityCooldowns[k] > 0) battle.abilityCooldowns[k] -= 1;
    }
    if (battle.rallyTicks > 0) battle.rallyTicks -= 1;

    if (battle.tick % 10 === 0) {
      var income = getGoldPerSecond(profile);
      battle.gold += income;
      battle.earnedGold += income;
    }

    /* 自动建筑工人沿城墙巡逻并自动升级 */
    var workerCount = getTalentLevel(profile, 'construction_worker');
    battle.workerCount = workerCount;
    if (workerCount > 0 && !battle.isTutorial) {
      battle.workerY += (battle.workerTargetY - battle.workerY) * 0.22;
      battle.workerCooldown -= workerCount;
      if (battle.workerCooldown <= 0) {
        battle.workerCooldown = 24;
        var limit = 50 + getTalentLevel(profile, 'worker_price_limit') * 350;
        var bestIdx = -1;
        var bestCost = 1e12;
        for (var wi = 0; wi < battle.slots.length; wi += 1) {
          if (battle.slots[wi]) {
            var wc = getUpgradeCost(profile, battle.slots[wi]);
            if (wc <= limit && wc <= battle.gold && wc < bestCost) {
              bestCost = wc;
              bestIdx = wi;
            }
          }
        }
        if (bestIdx >= 0) {
          battle.workerTargetY = 56 + Math.floor(bestIdx / 3) * ((WORLD_H - 112) / 4);
          tryBuildOrUpgrade(profile, battle, bestIdx, null, false);
        }
      }
    }

    /* 玩家兵营错峰产兵 */
    var cycleTick = battle.tick % DATA.ECONOMY.playerSpawnIntervalTicks;
    var rowStarts = [50, 40, 30, 20, 10];
    for (var r = 0; r < 5; r += 1) {
      if (cycleTick === rowStarts[r]) {
        for (var c = 0; c < 3; c += 1) {
          var idx = r * 3 + c;
          var slot = battle.slots[idx];
          if (!slot) continue;
          var prod = getBuildingProduction(profile, battle.slots, idx);
          var room = Math.max(1, MAX_ENTITIES_PER_SIDE - battle.living.length);
          var spawnEntities = Math.min(prod, Math.min(6, room));
          var packSize = Math.max(1, Math.ceil(prod / spawnEntities));
          var baseY = 56 + r * ((WORLD_H - 112) / 4);
          for (var sp = 0; sp < spawnEntities; sp += 1) {
            var jitterY = (Math.random() - 0.5) * 30;
            var jitterX = (Math.random() - 0.5) * 14;
            spawnEntity(battle, 'living', slot.unitId, WALL_X + 18 + jitterX, clamp(baseY + jitterY, 28, WORLD_H - 36), packSize, false);
          }
        }
      }
    }

    /* 城墙守望者与城墙奥术塔 */
    var wallArchers = getTalentLevel(profile, 'watchers_on_the_wall');
    battle.wallArcherCount = wallArchers;
    if (wallArchers > 0) {
      battle.wallArcherCd -= 1;
      if (battle.wallArcherCd <= 0 && (battle.undead.length > 0 || battle.boss)) {
        battle.wallArcherCd = Math.max(4, 14 - wallArchers * 3);
        var wyA = 60 + Math.random() * (WORLD_H - 120);
        var targetA = findNearestTarget(WALL_X, wyA, battle.undead, battle.boss, 360);
        if (targetA) {
          fireProjectile(battle, 'living', WALL_X, wyA, targetA, 18 * wallArchers, 360, 0, '#ffe17d', 'arrow_fire');
        }
      }
    }
    var wallMages = getTalentLevel(profile, 'wall_mages');
    battle.wallMageCount = wallMages;
    if (wallMages > 0) {
      battle.wallMageCd -= 1;
      if (battle.wallMageCd <= 0 && (battle.undead.length > 0 || battle.boss)) {
        battle.wallMageCd = Math.max(10, 26 - wallMages * 6);
        var wyM = 80 + Math.random() * (WORLD_H - 160);
        var targetM = findNearestTarget(WALL_X, wyM, battle.undead, battle.boss, 400);
        if (targetM) {
          fireProjectile(battle, 'living', WALL_X, wyM, targetM, 75 * wallMages, 260, 38, '#c28aff', 'bolt_living');
        }
      }
    }

    /* 敌军波次生成 */
    var allowEnemySpawn = !(battle.isTutorial && battle.tutorialStep === 1);
    if (allowEnemySpawn) {
      var progress = Math.min(1, battle.tick / Math.max(1, battle.durationTicks));
      var targetSpawned = Math.ceil(battle.totalEnemies * progress);
      var toSpawn = targetSpawned - battle.spawnedEnemies;
      if (toSpawn > 0 && battle.enemyQueue.length > 0) {
        var sheepChance = getTalentLevel(profile, 'sheep') * 0.03;
        var undeadRoom = Math.max(1, MAX_ENTITIES_PER_SIDE - battle.undead.length);
        var maxBatches = Math.min(8, undeadRoom);
        var batchCount = Math.min(toSpawn, maxBatches);
        var perPack = Math.max(1, Math.ceil(toSpawn / batchCount));
        var spawnedNow = 0;

        for (var b = 0; b < batchCount && spawnedNow < toSpawn; b += 1) {
          var bucket = null;
          for (var q = 0; q < battle.enemyQueue.length; q += 1) {
            if (battle.enemyQueue[q].remaining > 0) { bucket = battle.enemyQueue[q]; break; }
          }
          if (!bucket) break;
          var take = Math.min(bucket.remaining, Math.min(perPack, toSpawn - spawnedNow));
          bucket.remaining -= take;
          spawnedNow += take;
          battle.spawnedEnemies += take;
          var isSheep = sheepChance > 0 && Math.random() < sheepChance;
          spawnEntity(battle, 'undead', bucket.unitId, WORLD_W - 14 - Math.random() * 18, 34 + Math.random() * (WORLD_H - 78), take, isSheep);
        }
      }
    }

    if (battle.level === 30 && !battle.bossSpawned && battle.tick >= 120) {
      spawnBoss(battle);
    }

    /* 龙卷风 */
    if (battle.tornadoTicks > 0) {
      battle.tornadoTicks -= 1;
      battle.tornadoX += 2.2;
      battle.tornadoY = WORLD_H * 0.5 + Math.sin(battle.tick * 0.25) * 85;
      var tStr = 1 + getTalentLevel(profile, 'tornado_strength');
      var tRad = 55 + tStr * 14;
      for (var ti = 0; ti < battle.undead.length; ti += 1) {
        var tu = battle.undead[ti];
        if (tu.hp <= 0) continue;
        var tdx = tu.x - battle.tornadoX;
        var tdy = tu.y - battle.tornadoY;
        if (tdx * tdx + tdy * tdy <= tRad * tRad) {
          tu.hp -= 28 * tStr;
          tu.x = Math.min(WORLD_W - 16, tu.x + 4);
        }
      }
      if (battle.boss && battle.boss.hp > 0) {
        var btdx = battle.boss.x - battle.tornadoX;
        var btdy = battle.boss.y - battle.tornadoY;
        if (btdx * btdx + btdy * btdy <= (tRad + battle.boss.radius) * (tRad + battle.boss.radius)) {
          battle.boss.hp -= 450 * tStr;
        }
      }
    }

    /* 友军行动 */
    var rallyMult = battle.rallyTicks > 0 ? 1.45 : 1;
    var archerRangeMult = 1 + getTalentLevel(profile, 'archer_range') * 0.35;
    var fireArrows = getTalentLevel(profile, 'fire_arrows') > 0;
    for (var li = 0; li < battle.living.length; li += 1) {
      var unit = battle.living[li];
      if (unit.hp <= 0) continue;
      unit.animPhase += 0.35;
      if (unit.attackFlash > 0) unit.attackFlash -= 1;
      if (unit.cooldown > 0) unit.cooldown -= 1;

      var uDef = DATA.UNITS[unit.unitId];
      var effRange = uDef.attackRange * (unit.unitId === 'archer' ? archerRangeMult : 1);
      var target = findNearestTarget(unit.x, unit.y, battle.undead, battle.boss, effRange + 140);

      if (target) {
        var dx = target.x - unit.x;
        var dy = target.y - unit.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var reach = effRange + unit.radius + target.radius;
        if (dist <= reach) {
          if (unit.cooldown <= 0) {
            unit.cooldown = Math.max(2, Math.round(uDef.cooldownTicks / rallyMult));
            unit.attackFlash = 4;
            var dmg = unit.damage * rallyMult * (fireArrows && unit.unitId === 'archer' ? 1.5 : 1);
            performAttack(battle, unit, target, uDef, dmg, fireArrows);
          }
        } else {
          var spd = 4.0 * rallyMult;
          unit.x += (dx / dist) * spd;
          unit.y = clamp(unit.y + (dy / dist) * spd, 28, WORLD_H - 36);
        }
      } else {
        unit.x = Math.min(WORLD_W - 24, unit.x + 3.4 * rallyMult);
      }
    }

    /* 亡灵行动 */
    var wallThorns = getTalentLevel(profile, 'stronghold_thorns') * 0.35;
    for (var ui = 0; ui < battle.undead.length; ui += 1) {
      var foe = battle.undead[ui];
      if (foe.hp <= 0) continue;
      foe.animPhase += 0.32;
      if (foe.attackFlash > 0) foe.attackFlash -= 1;
      if (foe.cooldown > 0) foe.cooldown -= 1;

      if (foe.isSheep) {
        foe.x -= 2.4;
        if (foe.x <= WALL_X + 10) foe.hp = 0;
        continue;
      }

      var fDef = DATA.UNITS[foe.unitId];
      var foeTarget = findNearestTarget(foe.x, foe.y, battle.living, null, fDef.attackRange + 95);
      if (foeTarget) {
        var fdx = foeTarget.x - foe.x;
        var fdy = foeTarget.y - foe.y;
        var fdist = Math.sqrt(fdx * fdx + fdy * fdy);
        var freach = fDef.attackRange + foe.radius + foeTarget.radius;
        if (fdist <= freach) {
          if (foe.cooldown <= 0) {
            foe.cooldown = fDef.cooldownTicks;
            foe.attackFlash = 4;
            performAttack(battle, foe, foeTarget, fDef, foe.damage, false);
          }
        } else {
          var fspd = battle.isTutorial ? 2.5 : 3.4;
          foe.x += (fdx / fdist) * fspd;
          foe.y = clamp(foe.y + (fdy / fdist) * fspd, 28, WORLD_H - 36);
        }
      } else if (foe.x > WALL_X + foe.radius + 4) {
        foe.x -= (battle.isTutorial ? 2.5 : 3.4);
      } else {
        if (foe.cooldown <= 0) {
          foe.cooldown = fDef.cooldownTicks;
          foe.attackFlash = 4;
          battle.wallHp = Math.max(0, battle.wallHp - foe.damage);
          pushEffect(battle, { type: 'impact', x: WALL_X + 4, y: foe.y, r: 8, maxR: 22, color: '#ff8a80', life: 6, maxLife: 6 });
          if (wallThorns > 0) foe.hp -= foe.damage * wallThorns;
        }
      }
    }

    /* Boss 暗影女皇 */
    if (battle.boss && battle.boss.hp > 0) {
      var boss = battle.boss;
      boss.animPhase += 0.2;
      if (boss.x > WALL_X + 240) boss.x -= 1.2;
      var ratio = boss.hp / boss.maxHp;
      if (ratio <= 0.33 && boss.phase < 3) {
        boss.phase = 3;
        battle.bossEvent = 'phase3';
        battle.bossToast = '暗影女皇进入狂暴阶段！';
        battle.bossToastTicks = 50;
        battle.shakeTicks = 10;
      } else if (ratio <= 0.66 && boss.phase < 2) {
        boss.phase = 2;
        battle.bossEvent = 'phase2';
        battle.bossToast = '暗影女皇进入受损阶段！';
        battle.bossToastTicks = 50;
        battle.shakeTicks = 8;
      }
      var pIdx = boss.phase - 1;
      boss.novaCd -= 1;
      if (boss.novaCd <= 0) {
        boss.novaCd = DATA.BOSS_MORIANA.novaIntervalTicks[pIdx];
        var novaDmg = DATA.BOSS_MORIANA.novaDamage[pIdx] * 18;
        battle.shakeTicks = 6;
        pushEffect(battle, { type: 'shockwave', x: boss.x, y: boss.y, r: 22, maxR: 215, color: '#e84393', life: 14, maxLife: 14 });
        damageLivingArea(battle, boss.x, boss.y, 215, novaDmg);
      }
      boss.pulseCd -= 1;
      if (boss.pulseCd <= 0) {
        boss.pulseCd = DATA.BOSS_MORIANA.pulsePeriodTicks;
        damageLivingArea(battle, boss.x, boss.y, 120, DATA.BOSS_MORIANA.pulseDamage * 10);
      }
      boss.raiseCd -= 1;
      if (boss.raiseCd <= 0) {
        boss.raiseCd = DATA.BOSS_MORIANA.raiseIntervalTicks[pIdx];
        pushEffect(battle, { type: 'shockwave', x: boss.x, y: boss.y, r: 16, maxR: 135, color: '#9b59b6', life: 15, maxLife: 15 });
        for (var rz = 0; rz < 6; rz += 1) {
          spawnEntity(battle, 'undead', 'knight', boss.x - 20 - Math.random() * 40, clamp(boss.y + (Math.random() - 0.5) * 160, 34, WORLD_H - 40), 25 * boss.phase, false);
        }
      }
    }

    /* 弹道推进 */
    for (var pi = battle.projectiles.length - 1; pi >= 0; pi -= 1) {
      var proj = battle.projectiles[pi];
      var pdx = proj.tx - proj.x;
      var pdy = proj.ty - proj.y;
      var pdist = Math.sqrt(pdx * pdx + pdy * pdy);
      var stepDist = proj.speed * 0.1;
      if (pdist <= stepDist + 6) {
        if (proj.area > 0) {
          if (proj.side === 'living') {
            explodeAt(battle, proj.tx, proj.ty, proj.area, proj.damage, proj.color);
          } else {
            pushEffect(battle, { type: 'shockwave', x: proj.tx, y: proj.ty, r: 8, maxR: proj.area, color: proj.color, life: 8, maxLife: 8 });
            damageLivingArea(battle, proj.tx, proj.ty, proj.area, proj.damage);
          }
        } else if (proj.target && proj.target.hp > 0) {
          proj.target.hp -= proj.damage;
          pushEffect(battle, { type: 'impact', x: proj.tx, y: proj.ty, r: 5, maxR: 18, color: proj.color, life: 5, maxLife: 5 });
        }
        battle.projectiles.splice(pi, 1);
      } else {
        proj.x += (pdx / pdist) * stepDist;
        proj.y += (pdy / pdist) * stepDist;
      }
    }

    for (var ei = battle.effects.length - 1; ei >= 0; ei -= 1) {
      battle.effects[ei].life -= 1;
      if (battle.effects[ei].life <= 0) battle.effects.splice(ei, 1);
    }

    for (var fi = battle.floatTexts.length - 1; fi >= 0; fi -= 1) {
      battle.floatTexts[fi].y -= 1.4;
      battle.floatTexts[fi].life -= 1;
      if (battle.floatTexts[fi].life <= 0) battle.floatTexts.splice(fi, 1);
    }

    /* 阵亡结算（含大法师亡语奥术自爆） */
    for (var dl = battle.living.length - 1; dl >= 0; dl -= 1) {
      var lu = battle.living[dl];
      if (lu.hp <= 0) {
        addCorpse(battle, lu.x, lu.y, '#6f6556');
        if (lu.unitId === 'archmage') {
          explodeAt(battle, lu.x, lu.y, 75, lu.damage * 2.5, '#6ce2ff');
        }
        battle.living.splice(dl, 1);
      }
    }
    for (var du = battle.undead.length - 1; du >= 0; du -= 1) {
      var uu = battle.undead[du];
      if (uu.hp <= 0) {
        addCorpse(battle, uu.x, uu.y, '#3e523a');
        if (!uu.isSheep) {
          battle.kills += uu.packSize;
          battle.gold += uu.value;
          battle.earnedGold += uu.value;
          var soulGain = Math.max(1, Math.round(uu.value * 0.45));
          battle.earnedSouls += soulGain;
          if (!isDemo && uu.value >= 5 && (battle.kills % 2 === 0)) {
            pushFloatText(battle, uu.x, uu.y - 10, '+' + uu.value + '金', '#f0d598');
          }
        }
        battle.undead.splice(du, 1);
      }
    }

    if (battle.boss && battle.boss.hp <= 0) {
      battle.earnedSouls += DATA.BOSS_MORIANA.rewardSouls;
      battle.bossEvent = 'defeat';
      battle.bossToast = '暗影女皇已陨落！亡灵军团土崩瓦解！';
      battle.bossToastTicks = 60;
      battle.boss = null;
      battle.undead.length = 0;
      battle.status = 'victory';
      return;
    }

    if (battle.wallHp <= 0) {
      if (!isDemo && !battle.isTutorial && !battle.reviveUsed) battle.status = 'revive_prompt';
      else battle.status = 'defeat';
      return;
    }
    var allSpawned = battle.spawnedEnemies >= battle.totalEnemies;
    if (allSpawned && battle.undead.length === 0 && (!battle.boss || battle.boss.hp <= 0) && (battle.level < 30 || battle.bossSpawned)) {
      if (battle.isTutorial) battle.earnedSouls += 30;
      battle.status = 'victory';
    }
  }

  function findNearestTarget(x, y, list, boss, maxRange) {
    var best = null;
    var bestD2 = maxRange * maxRange;
    for (var i = 0; i < list.length; i += 1) {
      var item = list[i];
      if (item.hp <= 0) continue;
      var dx = item.x - x;
      var dy = item.y - y;
      var d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = item; }
    }
    if (boss && boss.hp > 0) {
      var bdx = boss.x - x;
      var bdy = boss.y - y;
      if (bdx * bdx + bdy * bdy < bestD2) best = boss;
    }
    return best;
  }

  function fireProjectile(battle, side, x, y, target, damage, speed, area, color, spriteKind) {
    var ang = Math.atan2(target.y - y, target.x - x);
    battle.projectiles.push({
      side: side, x: x, y: y, tx: target.x, ty: target.y, angle: ang,
      target: target, damage: damage, speed: speed || 280, area: area || 0,
      color: color || '#ffe17d', spriteKind: spriteKind || ''
    });
  }

  function performAttack(battle, attacker, target, def, dmg, isFireArrow) {
    if (def.attackType === 'projectile_single' || def.attackType === 'projectile_splash') {
      var sk = '';
      var pColor = '#f2e0a2';
      if (attacker.unitId === 'archer') {
        sk = isFireArrow ? 'arrow_fire' : 'arrow';
        pColor = isFireArrow ? '#ff7c3a' : '#f2e0a2';
      } else {
        sk = attacker.side === 'living' ? 'bolt_living' : 'bolt_undead';
        pColor = attacker.unitId === 'archmage' ? '#6ce2ff' : '#c28aff';
      }
      fireProjectile(battle, attacker.side, attacker.x, attacker.y, target, dmg, def.projectileSpeed, def.area, pColor, sk);
      return;
    }
    if (def.area > 0) {
      if (attacker.unitId === 'paladin') {
        pushEffect(battle, { type: 'paladin_slash', x: target.x, y: target.y, r: 16, maxR: def.area * 1.2, color: '#ffe885', life: 8, maxLife: 8 });
      }
      if (attacker.side === 'living') {
        explodeAt(battle, target.x, target.y, def.area, dmg, attacker.unitId === 'paladin' ? '#ffe885' : '#e6a563');
      } else {
        damageLivingArea(battle, target.x, target.y, def.area, dmg);
      }
    } else {
      target.hp -= dmg;
    }
    if (target.isBoss && attacker.side === 'living') {
      attacker.hp -= dmg * (DATA.BOSS_MORIANA.meleeReflectPercent / 100);
    }
  }

  function getTotalCount(list) {
    var sum = 0;
    for (var i = 0; i < list.length; i += 1) sum += list[i].packSize || 1;
    return sum;
  }

  global.HORDE_ENGINE = {
    WORLD_H: WORLD_H,
    WALL_X: WALL_X,
    setWorldWidth: setWorldWidth,
    getWorldWidth: getWorldWidth,
    createProfile: createProfile,
    getTalentLevel: getTalentLevel,
    isTalentUnlocked: isTalentUnlocked,
    isUnitUnlocked: isUnitUnlocked,
    getMaxSpeed: getMaxSpeed,
    getGoldPerSecond: getGoldPerSecond,
    getBuildCost: getBuildCost,
    getUpgradeCost: getUpgradeCost,
    getSlotSynergyPercent: getSlotSynergyPercent,
    getBuildingProduction: getBuildingProduction,
    createBattle: createBattle,
    triggerReviveBombWave: triggerReviveBombWave,
    tryBuildOrUpgrade: tryBuildOrUpgrade,
    triggerAbility: triggerAbility,
    stepBattle: stepBattle,
    getTotalCount: getTotalCount
  };
})(window);
