/* 《群尸来压境》主控制器（零延迟持久化DOM + 旋转手势1:1映射 + 完美胶囊避让 + 星图天赋树 + 协同/特效，严格 ES2017） */
(function (global) {
  'use strict';

  var DATA = global.HORDE_DATA;
  var ENGINE = global.HORDE_ENGINE;
  var RENDERER = global.HORDE_RENDERER;
  var AUDIO = global.HORDE_AUDIO;

  var STORAGE_KEY = 'horde_minitool_profile_v3';
  var STORAGE_MIN_CLIENT_VERSION = 9460;
  var FOLLOW_MIN_CLIENT_VERSION = 9510;
  var RANK_MIN_CLIENT_VERSION = 9510;
  var SHARE_MIN_CLIENT_VERSION = 9530;

  var state = {
    profile: createFullProfile(),
    battle: null,
    titleBattle: null,
    mode: 'title',
    isRotated: false,
    selectedUnitId: 'peasant',
    selectedTalentId: 'peasant_production',
    talentPanX: 0,
    talentPanY: 0,
    talentZoom: 0.92,
    talentJustDragged: false,
    demolishMode: false,
    speed: 1,
    paused: false,
    rankPeriod: 'all',
    storageStatusText: '',
    rafId: 0,
    lastFrameMs: 0,
    accumulatorMs: 0,
    pageHidden: false,
    dialogueQueue: [],
    dialogueTimerTicks: 0,
    nextBanterTick: 70,
    resetConfirm: false,
    slotEls: [],
    unitEls: {},
    abilityEls: {},
    talentNodeEls: {},
    talentLinkEls: []
  };

  var dom = {};

  function $(id) {
    return document.getElementById(id);
  }

  function createFullProfile() {
    var p = ENGINE.createProfile();
    p.bestScore = 0;
    p.settings = {
      master: 80,
      sfx: 80,
      music: 45,
      quality: 'medium',
      showDialogue: true,
      showFloats: true,
      vibrate: true
    };
    return p;
  }

  /* 横屏自适应 + 物理旋转方向标志（供所有拖动/滚动手势做精确坐标转换） */
  function updateLandscapeViewport() {
    var root = dom.stageRoot;
    var safe = dom.stageSafe;
    if (!root || !safe) return;
    var vw = global.innerWidth || document.documentElement.clientWidth || 800;
    var vh = global.innerHeight || document.documentElement.clientHeight || 450;
    if (vh > vw) {
      state.isRotated = true;
      root.style.width = vh + 'px';
      root.style.height = vw + 'px';
      root.style.transformOrigin = '0 0';
      root.style.transform = 'translate(' + vw + 'px, 0px) rotate(90deg)';
      safe.style.paddingLeft = '92px';
      safe.style.paddingRight = '24px';
      safe.style.paddingTop = '0px';
      safe.style.paddingBottom = '0px';
    } else {
      state.isRotated = false;
      root.style.width = '100%';
      root.style.height = '100%';
      root.style.transform = 'none';
      safe.style.paddingLeft = '0px';
      safe.style.paddingRight = '0px';
      safe.style.paddingTop = '0px';
      safe.style.paddingBottom = '0px';
    }
  }

  /* 屏幕增量 -> 横屏逻辑增量转换（90度顺时针旋转下：dLocalX = +dScreenY, dLocalY = -dScreenX） */
  function toLocalDelta(dx, dy) {
    if (state.isRotated) {
      return { x: dy, y: -dx };
    }
    return { x: dx, y: dy };
  }

  /* 为旋转模式下的列表容器（关卡/设置/排行榜/底部兵种栏）绑定 1:1 跟手滑动 */
  function bindRotatedScroll(el, axis) {
    if (!el) return;
    var active = false;
    var lastX = 0;
    var lastY = 0;
    el.addEventListener('pointerdown', function (e) {
      if (!state.isRotated) return;
      if (e.target && e.target.tagName === 'INPUT') return;
      active = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    el.addEventListener('pointermove', function (e) {
      if (!active || !state.isRotated) return;
      var d = toLocalDelta(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
      if (axis === 'x') {
        el.scrollLeft -= d.x;
      } else {
        el.scrollTop -= d.y;
      }
    });
    function end() { active = false; }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', end);
  }

  function getClientVersion(buildVersion) {
    return Math.floor((Number(buildVersion) || 0) / 1000);
  }

  function readBuildVersion(launchOptions) {
    var env = launchOptions && launchOptions.miniToolEnv;
    var val = Number(env && env.buildVersion);
    return val > 0 ? val : null;
  }

  async function getBuildVersion() {
    var xhs = global.xhs;
    var syncVer = readBuildVersion(xhs && xhs.launchOptions);
    if (syncVer !== null) return syncVer;
    var miniTool = xhs && xhs.miniTool;
    if (!miniTool || typeof miniTool.getLaunchOptions !== 'function') return null;
    try {
      return readBuildVersion(await miniTool.getLaunchOptions());
    } catch (e) {
      return null;
    }
  }

  async function loadProfileFromContainer() {
    var buildVersion = await getBuildVersion();
    var miniTool = global.xhs && global.xhs.miniTool;
    if (buildVersion === null || getClientVersion(buildVersion) < STORAGE_MIN_CLIENT_VERSION) {
      state.storageStatusText = '当前环境未提供容器存档，进度仅在本次会话保留';
      return;
    }
    if (!miniTool || typeof miniTool.getStorage !== 'function') {
      state.storageStatusText = '容器存档接口未就绪，进度仅在本次会话保留';
      return;
    }
    try {
      var res = await miniTool.getStorage({ key: STORAGE_KEY });
      if (res && typeof res.data === 'string' && res.data) {
        var parsed = JSON.parse(res.data);
        if (parsed && typeof parsed === 'object') {
          state.profile.souls = Number(parsed.souls) || 0;
          state.profile.unlockedLevel = Math.max(1, Math.min(30, Number(parsed.unlockedLevel) || 1));
          state.profile.selectedLevel = Math.max(1, Math.min(state.profile.unlockedLevel, Number(parsed.selectedLevel) || 1));
          state.profile.talents = parsed.talents && typeof parsed.talents === 'object' ? parsed.talents : {};
          state.profile.tutorialDone = !!parsed.tutorialDone;
          state.profile.followRewardClaimed = !!parsed.followRewardClaimed;
          state.profile.followPromptSeen = !!parsed.followPromptSeen;
          state.profile.bestScore = Number(parsed.bestScore) || 0;
          if (parsed.settings && typeof parsed.settings === 'object') {
            state.profile.settings = Object.assign(state.profile.settings, parsed.settings);
          }
        }
      }
      state.storageStatusText = '已连接小红书容器本地存档';
    } catch (e) {
      state.storageStatusText = '已就绪，新进度将自动保存';
    }
  }

  async function saveProfileToContainer() {
    var buildVersion = await getBuildVersion();
    var miniTool = global.xhs && global.xhs.miniTool;
    if (buildVersion === null || getClientVersion(buildVersion) < STORAGE_MIN_CLIENT_VERSION) return false;
    if (!miniTool || typeof miniTool.setStorage !== 'function') return false;
    try {
      var res = await miniTool.setStorage({ key: STORAGE_KEY, data: JSON.stringify(state.profile) });
      return !!res && res.errMsg === 'setStorage:ok';
    } catch (e) {
      return false;
    }
  }

  function applyRuntimeSettings() {
    var s = state.profile.settings;
    AUDIO.applySettings(s);
    RENDERER.setQuality(s.quality || 'medium');
    RENDERER.setShowFloats(s.showFloats !== false);
  }

  function tryVibrate() {
    if (!state.profile.settings.vibrate) return;
    var miniTool = global.xhs && global.xhs.miniTool;
    if (miniTool && typeof miniTool.vibrateShort === 'function') {
      try { miniTool.vibrateShort({ type: 'light' }); } catch (e) { /* 忽略 */ }
    }
  }

  function formatZhNum(n) {
    if (n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1) + '万';
    if (n >= 1000) return (n / 1000).toFixed(1) + '千';
    return String(Math.floor(n));
  }

  /* 局内纯文本双人对话气泡（无人物语音包） */
  function enqueueDialogues(lines) {
    if (!state.profile.settings.showDialogue || !lines || !lines.length) return;
    for (var i = 0; i < lines.length; i += 1) state.dialogueQueue.push(lines[i]);
    if (state.dialogueTimerTicks <= 0) advanceDialogue();
  }

  function advanceDialogue() {
    if (!state.dialogueQueue.length || state.mode !== 'battle') {
      dom.dialogueBox.classList.add('is-hidden');
      state.dialogueTimerTicks = 0;
      return;
    }
    var item = state.dialogueQueue.shift();
    var isEmpress = item.who === 'empress';
    dom.dialogueBox.classList.toggle('is-empress', isEmpress);
    dom.dialoguePortrait.src = isEmpress ? './assets/ui/empress_new.webp' : './assets/ui/king_new.webp';
    dom.dialogueSpeaker.textContent = isEmpress ? '暗影女皇' : '狮心国王';
    dom.dialogueText.textContent = item.text;
    dom.dialogueBox.classList.remove('is-hidden');
    state.dialogueTimerTicks = 34;
  }

  /* 持久化构建 15 个兵营格 + 7 个兵种卡 + 3 个技能钮（零 innerHTML 重建） */
  function initPersistentBattleDom() {
    dom.buildingGrid.innerHTML = '';
    state.slotEls = [];
    for (var i = 0; i < 15; i += 1) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-cell';
      btn.setAttribute('data-slot', String(i));

      var img = document.createElement('img');
      img.className = 'slot-art is-hidden';
      img.alt = '';

      var plus = document.createElement('span');
      plus.className = 'slot-plus';
      plus.textContent = '+';

      var lv = document.createElement('span');
      lv.className = 'slot-badge-lv is-hidden';

      var syn = document.createElement('span');
      syn.className = 'slot-badge-syn is-hidden';

      var cost = document.createElement('span');
      cost.className = 'slot-badge-cost is-hidden';

      btn.appendChild(img);
      btn.appendChild(plus);
      btn.appendChild(lv);
      btn.appendChild(syn);
      btn.appendChild(cost);
      dom.buildingGrid.appendChild(btn);

      state.slotEls.push({ btn: btn, img: img, plus: plus, lv: lv, syn: syn, cost: cost, lastKey: '' });
    }

    dom.unitPalette.innerHTML = '';
    state.unitEls = {};
    for (var u = 0; u < DATA.UNIT_ORDER.length; u += 1) {
      var uid = DATA.UNIT_ORDER[u];
      var def = DATA.UNITS[uid];
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'unit-card';
      card.setAttribute('data-unit', uid);

      var thumb = document.createElement('img');
      thumb.className = 'unit-thumb';
      thumb.src = './assets/buildings/' + uid + '.webp';
      thumb.alt = '';

      var nm = document.createElement('span');
      nm.className = 'unit-name';
      nm.textContent = def.name;

      var cs = document.createElement('span');
      cs.className = 'unit-cost';

      card.appendChild(thumb);
      card.appendChild(nm);
      card.appendChild(cs);
      dom.unitPalette.appendChild(card);
      state.unitEls[uid] = { card: card, cs: cs, lastKey: '' };
    }

    dom.abilityBar.innerHTML = '';
    state.abilityEls = {};
    var abIds = ['tornado', 'sheep_explosion', 'rally'];
    for (var a = 0; a < abIds.length; a += 1) {
      var aid = abIds[a];
      var abBtn = document.createElement('button');
      abBtn.type = 'button';
      abBtn.className = 'ability-btn is-hidden';
      abBtn.setAttribute('data-ability', aid);
      dom.abilityBar.appendChild(abBtn);
      state.abilityEls[aid] = { btn: abBtn, lastKey: '' };
    }
  }

  function syncBuildingGrid() {
    var b = state.battle;
    if (!b) return;
    for (var i = 0; i < 15; i += 1) {
      var slot = b.slots[i];
      var ref = state.slotEls[i];
      var tutHi = (b.isTutorial && b.tutorialStep === 1 && i === 0 && !slot) || (b.isTutorial && b.tutorialStep === 2 && !!slot);
      var upCost = slot ? ENGINE.getUpgradeCost(state.profile, slot) : 0;
      var synPct = slot ? ENGINE.getSlotSynergyPercent(b.slots, i) : 0;
      var unaff = slot ? (b.gold < upCost) : false;
      var key = (slot ? (slot.unitId + ':' + slot.level + ':' + upCost + ':' + synPct + ':' + (unaff ? 1 : 0)) : 'E')
        + '|' + (state.demolishMode ? 1 : 0) + '|' + (tutHi ? 1 : 0);
      if (ref.lastKey === key) continue;
      ref.lastKey = key;

      ref.btn.classList.toggle('is-built', !!slot);
      ref.btn.classList.toggle('is-demolish', !!(state.demolishMode && slot));
      ref.btn.classList.toggle('tutorial-highlight', tutHi);

      if (slot) {
        var imgSrc = './assets/buildings/' + slot.unitId + '.webp';
        if (ref.img.getAttribute('src') !== imgSrc) ref.img.setAttribute('src', imgSrc);
        ref.img.classList.remove('is-hidden');
        ref.plus.classList.add('is-hidden');
        ref.lv.textContent = slot.level + '级';
        ref.lv.classList.remove('is-hidden');
        if (synPct > 0) {
          ref.syn.textContent = '+' + synPct + '%';
          ref.syn.classList.remove('is-hidden');
        } else {
          ref.syn.classList.add('is-hidden');
        }
        ref.cost.textContent = state.demolishMode ? '拆' : formatZhNum(upCost);
        ref.cost.classList.toggle('is-unaffordable', !state.demolishMode && unaff);
        ref.cost.classList.remove('is-hidden');
      } else {
        ref.img.classList.add('is-hidden');
        ref.plus.classList.remove('is-hidden');
        ref.lv.classList.add('is-hidden');
        ref.syn.classList.add('is-hidden');
        ref.cost.classList.add('is-hidden');
      }
    }
  }

  function syncUnitPalette() {
    var b = state.battle;
    if (!b) return;
    for (var i = 0; i < DATA.UNIT_ORDER.length; i += 1) {
      var uid = DATA.UNIT_ORDER[i];
      var ref = state.unitEls[uid];
      var unlocked = ENGINE.isUnitUnlocked(state.profile, uid);
      var cost = ENGINE.getBuildCost(state.profile, b.slots, uid);
      var sel = state.selectedUnitId === uid;
      var key = (unlocked ? 1 : 0) + ':' + cost + ':' + (sel ? 1 : 0);
      if (ref.lastKey === key) continue;
      ref.lastKey = key;
      ref.card.disabled = !unlocked;
      ref.card.classList.toggle('is-selected', sel);
      ref.cs.textContent = unlocked ? (formatZhNum(cost) + '金') : '未解锁';
    }
  }

  function syncAbilityBar() {
    var b = state.battle;
    if (!b) return;
    var abIds = ['tornado', 'sheep_explosion', 'rally'];
    for (var i = 0; i < abIds.length; i += 1) {
      var aid = abIds[i];
      var ref = state.abilityEls[aid];
      var unlocked = ENGINE.getTalentLevel(state.profile, 'unlock_' + aid) > 0;
      var cd = Math.ceil((b.abilityCooldowns[aid] || 0) / 10);
      var key = (unlocked ? 1 : 0) + ':' + cd;
      if (ref.lastKey === key) continue;
      ref.lastKey = key;
      ref.btn.classList.toggle('is-hidden', !unlocked);
      ref.btn.disabled = cd > 0;
      ref.btn.textContent = DATA.ABILITIES[aid].name + (cd > 0 ? (' ' + cd + '秒') : '');
    }
  }

  /* 原作灵魂天赋星图：自由平移 + 旋转坐标1:1跟手 + 缩放 */
  function buildTalentGraphOnce() {
    var stepX = 82;
    var stepY = 78;
    var offX = 56;
    var offY = 56;

    dom.talentLinks.innerHTML = '';
    dom.talentNodes.innerHTML = '';
    state.talentNodeEls = {};
    state.talentLinkEls = [];

    var svgNS = 'http://www.w3.org/2000/svg';
    for (var i = 0; i < DATA.TALENTS.length; i += 1) {
      var t = DATA.TALENTS[i];
      var x2 = offX + t.gx * stepX;
      var y2 = offY + t.gy * stepY;

      for (var r = 0; r < t.req.length; r += 1) {
        var reqId = t.req[r].split(':')[0];
        var parent = DATA.TALENT_MAP[reqId];
        if (!parent) continue;
        var line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', String(offX + parent.gx * stepX));
        line.setAttribute('y1', String(offY + parent.gy * stepY));
        line.setAttribute('x2', String(x2));
        line.setAttribute('y2', String(y2));
        line.setAttribute('stroke-width', '3.5');
        line.setAttribute('stroke-linecap', 'round');
        dom.talentLinks.appendChild(line);
        state.talentLinkEls.push({ line: line, childId: t.id });
      }

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tnode state-lock';
      btn.style.left = x2 + 'px';
      btn.style.top = y2 + 'px';
      btn.setAttribute('data-tnode', t.id);

      var ico = document.createElement('img');
      ico.className = 'tnode-ico';
      ico.src = t.icon;
      ico.alt = '';

      var lock = document.createElement('img');
      lock.className = 'tnode-lock';
      lock.src = './assets/talent/lock_icon.webp';
      lock.alt = '';

      var lv = document.createElement('span');
      lv.className = 'tnode-lv';

      var cost = document.createElement('span');
      cost.className = 'tnode-cost';

      btn.appendChild(ico);
      btn.appendChild(lock);
      btn.appendChild(lv);
      btn.appendChild(cost);
      dom.talentNodes.appendChild(btn);
      state.talentNodeEls[t.id] = { btn: btn, lock: lock, lv: lv, cost: cost };
    }
  }

  function applyTalentTransform() {
    var vp = dom.talentViewport;
    if (!vp || !dom.talentCanvasWrap) return;
    var vw = vp.clientWidth || 360;
    var vh = vp.clientHeight || 260;
    var z = state.talentZoom;
    var cw = 780 * z;
    var ch = 740 * z;
    var minX = Math.min(40, vw - cw - 40);
    var maxX = 40;
    var minY = Math.min(40, vh - ch - 40);
    var maxY = 40;
    state.talentPanX = Math.max(minX, Math.min(maxX, state.talentPanX));
    state.talentPanY = Math.max(minY, Math.min(maxY, state.talentPanY));
    dom.talentCanvasWrap.style.transform = 'translate3d(' + state.talentPanX.toFixed(1) + 'px,' + state.talentPanY.toFixed(1) + 'px,0) scale(' + z.toFixed(2) + ')';
  }

  function centerTalentGraphOnRoot() {
    var vp = dom.talentViewport;
    if (!vp) return;
    var vw = vp.clientWidth || 360;
    var vh = vp.clientHeight || 260;
    var rootX = (56 + 4 * 82) * state.talentZoom;
    var rootY = (56 + 7.5 * 78) * state.talentZoom;
    state.talentPanX = vw * 0.5 - rootX;
    state.talentPanY = vh * 0.65 - rootY;
    applyTalentTransform();
  }

  function bindTalentPan() {
    var vp = dom.talentViewport;
    if (!vp) return;
    var dragging = false;
    var moved = 0;
    var lastX = 0;
    var lastY = 0;

    vp.addEventListener('pointerdown', function (e) {
      dragging = true;
      moved = 0;
      state.talentJustDragged = false;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    vp.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var rawDx = e.clientX - lastX;
      var rawDy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      moved += Math.abs(rawDx) + Math.abs(rawDy);
      if (moved > 8) state.talentJustDragged = true;
      var d = toLocalDelta(rawDx, rawDy);
      state.talentPanX += d.x;
      state.talentPanY += d.y;
      applyTalentTransform();
    });
    function endDrag() { dragging = false; }
    vp.addEventListener('pointerup', endDrag);
    vp.addEventListener('pointercancel', endDrag);
    vp.addEventListener('pointerleave', endDrag);
  }

  function syncTalentGraph() {
    var totalLv = 0;
    var keys = Object.keys(state.profile.talents);
    for (var k = 0; k < keys.length; k += 1) totalLv += state.profile.talents[keys[k]] || 0;
    dom.talentSoulsVal.textContent = formatZhNum(state.profile.souls);
    dom.talentSummary.textContent = '已点亮 ' + totalLv + ' 级';

    for (var l = 0; l < state.talentLinkEls.length; l += 1) {
      var lk = state.talentLinkEls[l];
      var child = DATA.TALENT_MAP[lk.childId];
      var unlocked = ENGINE.isTalentUnlocked(state.profile, child);
      var bought = ENGINE.getTalentLevel(state.profile, lk.childId) > 0;
      lk.line.setAttribute('stroke', bought ? '#f0d598' : (unlocked ? '#69b4e8' : '#3a4b61'));
    }

    for (var i = 0; i < DATA.TALENTS.length; i += 1) {
      var item = DATA.TALENTS[i];
      var ref = state.talentNodeEls[item.id];
      var curLv = ENGINE.getTalentLevel(state.profile, item.id);
      var maxLv = item.costs.length;
      var maxed = curLv >= maxLv;
      var unlocked = ENGINE.isTalentUnlocked(state.profile, item);
      var cost = maxed ? 0 : item.costs[curLv];
      var stCls = maxed ? 'state-max' : (!unlocked ? 'state-lock' : (state.profile.souls >= cost ? 'state-ok' : 'state-no'));

      ref.btn.className = 'tnode ' + stCls + (state.selectedTalentId === item.id ? ' is-selected' : '');
      ref.lock.classList.toggle('is-hidden', unlocked || maxed);
      ref.lv.textContent = curLv + '/' + maxLv;
      ref.cost.textContent = maxed ? '满' : formatZhNum(cost);
      ref.cost.classList.toggle('is-hidden', !unlocked && !maxed);
    }

    syncTalentInspector();
  }

  function syncTalentInspector() {
    var item = DATA.TALENT_MAP[state.selectedTalentId] || DATA.TALENTS[0];
    if (!item) return;
    var curLv = ENGINE.getTalentLevel(state.profile, item.id);
    var maxLv = item.costs.length;
    var maxed = curLv >= maxLv;
    var unlocked = ENGINE.isTalentUnlocked(state.profile, item);
    var cost = maxed ? 0 : item.costs[curLv];
    var canBuy = !maxed && unlocked && state.profile.souls >= cost;

    dom.inspIcon.src = item.icon;
    dom.inspName.textContent = item.name;
    dom.inspLv.textContent = curLv + ' / ' + maxLv + ' 级';
    dom.inspDesc.textContent = item.desc;

    if (!unlocked && item.req.length > 0) {
      var reqs = [];
      for (var r = 0; r < item.req.length; r += 1) {
        var rp = item.req[r].split(':');
        var ro = DATA.TALENT_MAP[rp[0]];
        reqs.push((ro ? ro.name : rp[0]) + ' ' + rp[1] + '级');
      }
      dom.inspReq.textContent = '前置要求：' + reqs.join('、');
    } else {
      dom.inspReq.textContent = '';
    }

    dom.btnBuyTalent.disabled = !canBuy;
    dom.btnBuyTalent.textContent = maxed ? '已达满级' : (!unlocked ? '尚未解锁' : ('消耗 ' + formatZhNum(cost) + ' 魂升级'));
  }

  function buySelectedTalent() {
    var item = DATA.TALENT_MAP[state.selectedTalentId];
    if (!item) return;
    var curLv = ENGINE.getTalentLevel(state.profile, item.id);
    if (curLv >= item.costs.length || !ENGINE.isTalentUnlocked(state.profile, item)) return;
    var cost = item.costs[curLv];
    if (state.profile.souls < cost) return;
    state.profile.souls -= cost;
    state.profile.talents[item.id] = curLv + 1;
    saveProfileToContainer();
    AUDIO.playUpgrade();
    tryVibrate();
    updateTopHud();
    syncTalentGraph();
  }

  /* 关注作者流程 */
  function grantFollowReward(msg) {
    if (!state.profile.followRewardClaimed) {
      state.profile.followRewardClaimed = true;
      state.profile.souls += 50;
    }
    state.profile.followPromptSeen = true;
    saveProfileToContainer();
    dom.followStatusMsg.textContent = msg || '关注成功！已领取 50 灵魂 + 永久每秒 +1 金币！';
    AUDIO.playUpgrade();
    tryVibrate();
    updateTopHud();
    setTimeout(function () { dom.followScreen.classList.add('is-hidden'); }, 900);
  }

  async function checkAndMaybeShowFollowModal() {
    if (state.profile.followRewardClaimed) return;
    var miniTool = global.xhs && global.xhs.miniTool;
    if (miniTool && typeof miniTool.getFollowStatus === 'function') {
      try {
        var st = await miniTool.getFollowStatus();
        if (st && (st.follow_status === 1 || st.follow_status === 2)) {
          state.profile.followRewardClaimed = true;
          state.profile.followPromptSeen = true;
          state.profile.souls += 50;
          saveProfileToContainer();
          updateTopHud();
          return;
        }
      } catch (e) { /* 继续弹出 */ }
    }
    if (!state.profile.followPromptSeen) {
      dom.followStatusMsg.textContent = '';
      dom.followScreen.classList.remove('is-hidden');
    }
  }

  async function handleFollowAction() {
    AUDIO.unlock();
    AUDIO.playClick();
    var buildVersion = await getBuildVersion();
    var miniTool = global.xhs && global.xhs.miniTool;
    if (buildVersion !== null && getClientVersion(buildVersion) < FOLLOW_MIN_CLIENT_VERSION) {
      dom.followStatusMsg.textContent = '当前小红书客户端版本低于 9.51，请升级 App 后再关注领奖。';
      return;
    }
    if (miniTool && typeof miniTool.followAuthor === 'function') {
      dom.followStatusMsg.textContent = '正在拉起小红书关注弹窗...';
      try {
        var res = await miniTool.followAuthor();
        if (res && (res.follow_status === 1 || res.follow_status === 2)) {
          grantFollowReward('关注成功！50 灵魂与永久每秒 +1 金币已到账！');
        } else {
          dom.followStatusMsg.textContent = '未确认关注，请点击关注后再次尝试。';
        }
      } catch (e) {
        dom.followStatusMsg.textContent = '关注弹窗已取消，可随时再点击领取。';
      }
      return;
    }
    grantFollowReward('本地预览未注入端上关注弹窗，已模拟领取 50 灵魂 + 永久产金！');
  }

  /* 排行榜 */
  async function submitBattleScore(level, kills) {
    var score = Math.min(1000000, level * 10000 + Math.min(9999, kills));
    if (score > state.profile.bestScore) {
      state.profile.bestScore = score;
      saveProfileToContainer();
    }
    var buildVersion = await getBuildVersion();
    var miniTool = global.xhs && global.xhs.miniTool;
    if (buildVersion !== null && getClientVersion(buildVersion) < RANK_MIN_CLIENT_VERSION) return;
    if (!miniTool || typeof miniTool.submitScore !== 'function') return;
    try { await miniTool.submitScore({ board: 1, score: score }); } catch (e) { /* 忽略 */ }
  }

  async function openRankModal() {
    dom.rankScreen.classList.remove('is-hidden');
    await refreshRankList();
  }

  async function refreshRankList() {
    var btns = dom.rankTabs.querySelectorAll('[data-period]');
    for (var i = 0; i < btns.length; i += 1) {
      btns[i].classList.toggle('is-active', btns[i].getAttribute('data-period') === state.rankPeriod);
    }
    dom.rankList.innerHTML = '<div class="rank-empty">正在加载王国战绩榜...</div>';
    dom.rankMySummary.textContent = '我的历史最高战绩分：' + formatZhNum(state.profile.bestScore);

    var buildVersion = await getBuildVersion();
    var miniTool = global.xhs && global.xhs.miniTool;
    if (buildVersion !== null && getClientVersion(buildVersion) < RANK_MIN_CLIENT_VERSION) {
      dom.rankList.innerHTML = '<div class="rank-empty">排行榜需要小红书客户端 9.51 及以上版本支持。</div>';
      return;
    }
    if (!miniTool || typeof miniTool.getRankList !== 'function') {
      dom.rankList.innerHTML = '<div class="rank-empty">当前为本地预览环境，真机小红书 9.51+ 容器将自动展示全服前 100 名战绩排行。<br>您的本地最佳战绩分：' + formatZhNum(state.profile.bestScore) + '</div>';
      return;
    }
    try {
      var listRes = await miniTool.getRankList({ board: 1, period: state.rankPeriod });
      var myRes = typeof miniTool.getMyRank === 'function' ? await miniTool.getMyRank({ board: 1, period: state.rankPeriod }) : null;
      if (myRes && myRes.status === 'ok' && myRes.rank > 0) {
        dom.rankMySummary.textContent = '我的排名：第 ' + myRes.rank + ' 名 · 战绩分 ' + formatZhNum(myRes.score);
      }
      var rows = (listRes && Array.isArray(listRes.data)) ? listRes.data : [];
      if (!rows.length) {
        dom.rankList.innerHTML = '<div class="rank-empty">本周期暂无上榜记录，快去通关夺得榜首吧！</div>';
        return;
      }
      var html = '';
      for (var r = 0; r < rows.length; r += 1) {
        var row = rows[r];
        html += '<div class="rank-item' + (row.rank <= 3 ? ' is-top' : '') + '">'
          + '<span class="rank-no">#' + row.rank + '</span>'
          + '<span class="rank-name">' + escapeHtml(row.nickname || '匿名领主') + '</span>'
          + '<span class="rank-score">' + formatZhNum(row.score || 0) + ' 分</span>'
          + '</div>';
      }
      dom.rankList.innerHTML = html;
    } catch (err) {
      if (err && err.errCode === 1005) {
        dom.rankList.innerHTML = '<div class="rank-empty">排行榜功能尚在内测权限配置中，您的个人战绩已保存在本地。</div>';
      } else {
        dom.rankList.innerHTML = '<div class="rank-empty">暂时无法拉取排行榜，请稍后再试。</div>';
      }
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function handleShareReviveAction() {
    if (!state.battle || state.battle.status !== 'revive_prompt') return;
    AUDIO.unlock();
    var posterUrl = RENDERER.buildResultPosterDataUrl(state.battle, false);
    var miniTool = global.xhs && global.xhs.miniTool;
    var buildVersion = await getBuildVersion();

    if (miniTool && typeof miniTool.postNote === 'function') {
      dom.reviveStatusMsg.textContent = '正在唤起小红书笔记发布页...';
      try {
        await miniTool.postNote({
          title: '群尸来压境！我的城墙险些沦陷',
          content: '我正在玩横屏兵海守城小工具《群尸来压境》，亡灵大军太猛啦，快来帮我守住防线！',
          pageType: 'photo_publish',
          mediaInfo: { image_resources: [{ url: posterUrl }] }
        });
        completeRevive();
        return;
      } catch (e) {
        dom.reviveStatusMsg.textContent = '笔记发布已取消，完成分享即可复活清屏。';
        return;
      }
    }
    if (buildVersion !== null && getClientVersion(buildVersion) >= SHARE_MIN_CLIENT_VERSION && miniTool && typeof miniTool.share === 'function') {
      try {
        await miniTool.share({ type: 'image', image_resource: posterUrl });
        completeRevive();
        return;
      } catch (e) {
        dom.reviveStatusMsg.textContent = '分享未完成，请重试。';
        return;
      }
    }
    dom.reviveStatusMsg.textContent = '本地预览模式已模拟笔记分享，圣光复活启动！';
    setTimeout(completeRevive, 400);
  }

  function completeRevive() {
    if (!state.battle) return;
    dom.reviveScreen.classList.add('is-hidden');
    ENGINE.triggerReviveBombWave(state.battle);
    AUDIO.playBombWave();
    tryVibrate();
    enqueueDialogues([{ who: 'king', text: '圣光降临！全军反攻，把亡灵彻底扫平！' }]);
    updateBattleHud();
  }

  function syncSettingsUi() {
    var s = state.profile.settings;
    dom.setMaster.value = String(s.master);
    dom.valMaster.textContent = s.master + '%';
    dom.setSfx.value = String(s.sfx);
    dom.valSfx.textContent = s.sfx + '%';
    dom.setMusic.value = String(s.music);
    dom.valMusic.textContent = s.music + '%';

    var qBtns = dom.setQualityGroup.querySelectorAll('[data-q]');
    for (var i = 0; i < qBtns.length; i += 1) {
      qBtns[i].classList.toggle('is-active', qBtns[i].getAttribute('data-q') === s.quality);
    }
    dom.btnToggleDialogue.classList.toggle('is-on', !!s.showDialogue);
    dom.btnToggleDialogue.textContent = s.showDialogue ? '已开启' : '已关闭';
    dom.btnToggleFloats.classList.toggle('is-on', s.showFloats !== false);
    dom.btnToggleFloats.textContent = s.showFloats !== false ? '已开启' : '已关闭';
    dom.btnToggleVibrate.classList.toggle('is-on', !!s.vibrate);
    dom.btnToggleVibrate.textContent = s.vibrate ? '已开启' : '已关闭';
    state.resetConfirm = false;
    dom.btnResetSave.textContent = '重置存档';
  }

  function createTitleDemoBattle() {
    var demoProfile = ENGINE.createProfile();
    demoProfile.talents = { peasant_production: 2, archer_production: 2, knight_production: 1, mage_production: 1, wall_hp_5000: 5 };
    var b = ENGINE.createBattle(demoProfile, 8, false);
    b.slots[0] = { unitId: 'peasant', level: 2, invested: 0 };
    b.slots[3] = { unitId: 'archer', level: 2, invested: 0 };
    b.slots[6] = { unitId: 'knight', level: 2, invested: 0 };
    b.slots[9] = { unitId: 'mage', level: 1, invested: 0 };
    b.slots[12] = { unitId: 'peasant', level: 2, invested: 0 };
    return { profile: demoProfile, battle: b };
  }

  function showScreen(name) {
    state.mode = name;
    dom.titleScreen.classList.toggle('is-hidden', name !== 'title');
    dom.talentScreen.classList.toggle('is-hidden', name !== 'talents');
    dom.levelScreen.classList.toggle('is-hidden', name !== 'levels');
    dom.resultScreen.classList.toggle('is-hidden', name !== 'result');
    var inBattle = name === 'battle';
    dom.leftHud.classList.toggle('is-hidden', !inBattle);
    dom.battleOverlay.classList.toggle('is-hidden', !inBattle);
  }

  function updateTopHud() {
    var b = state.battle;
    dom.hudLevel.textContent = b ? (b.isTutorial ? '新手教学' : ('第 ' + b.level + ' 关')) : ('第 ' + state.profile.selectedLevel + ' 关');
    dom.hudGold.textContent = formatZhNum(b ? b.gold : 0);
    dom.hudSouls.textContent = formatZhNum(state.profile.souls);
    dom.titleSoulsVal.textContent = formatZhNum(state.profile.souls);
    dom.incomeTag.textContent = state.profile.followRewardClaimed ? ('+' + ENGINE.getGoldPerSecond(state.profile) + '/秒') : '';
    dom.btnStartBattle.textContent = state.profile.tutorialDone ? ('出征第 ' + state.profile.selectedLevel + ' 关') : '开始新手教学';
    dom.followBuffPill.classList.toggle('is-hidden', !state.profile.followRewardClaimed);
    dom.btnReopenFollow.classList.toggle('is-hidden', state.profile.followRewardClaimed);
    dom.storageHint.textContent = state.storageStatusText;
  }

  function updateTutorialBanner() {
    var b = state.battle;
    if (!b || !b.isTutorial) {
      dom.tutorialBanner.classList.add('is-hidden');
      dom.btnSkipTutorial.classList.add('is-hidden');
      return;
    }
    dom.btnSkipTutorial.classList.remove('is-hidden');
    dom.tutorialBanner.classList.remove('is-hidden');
    if (b.tutorialStep === 1) {
      dom.tutStepTitle.textContent = '新手教学 · 第一步：建造兵营';
      dom.tutStepDesc.textContent = '点击左侧闪烁的【+】空位，免费建造第一座【农民小屋】！';
    } else if (b.tutorialStep === 2) {
      dom.tutStepTitle.textContent = '新手教学 · 第二步：升级产兵';
      dom.tutStepDesc.textContent = '农民已自动出兵迎战！现在点击刚才的【农民小屋】消耗 3 金币升级到 2 级！';
    } else {
      dom.tutStepTitle.textContent = '新手教学 · 第三步：击退尸潮';
      dom.tutStepDesc.textContent = '多建几座小屋，击退全部教学亡灵即可获赠 30 灵魂！';
    }
  }

  function updateBattleHud() {
    var b = state.battle;
    if (!b) return;
    var hpPct = Math.max(0, Math.min(100, (b.wallHp / Math.max(1, b.wallMaxHp)) * 100));
    dom.wallHpFill.style.width = hpPct.toFixed(1) + '%';
    dom.wallHpText.textContent = '城墙 ' + formatZhNum(b.wallHp) + '/' + formatZhNum(b.wallMaxHp);
    dom.spawnProgFill.style.width = ((b.tick % 100)).toFixed(0) + '%';

    var livingTotal = ENGINE.getTotalCount(b.living);
    var undeadTotal = ENGINE.getTotalCount(b.undead) + Math.max(0, b.totalEnemies - b.spawnedEnemies);
    dom.livingCount.textContent = formatZhNum(livingTotal);
    dom.undeadCount.textContent = formatZhNum(undeadTotal);

    var remSec = Math.max(0, Math.ceil((b.durationTicks - b.tick) / 10));
    var mm = String(Math.floor(remSec / 60)).padStart(2, '0');
    var ss = String(remSec % 60).padStart(2, '0');
    dom.waveTimer.textContent = mm + ':' + ss;

    if (b.boss && b.boss.hp > 0) {
      dom.bossBar.classList.remove('is-hidden');
      dom.bossHpFill.style.transform = 'scaleX(' + Math.max(0, Math.min(1, b.boss.hp / b.boss.maxHp)).toFixed(4) + ')';
      dom.bossPhase.textContent = '暗影女皇 · ' + (b.boss.phase === 3 ? '狂暴阶段' : (b.boss.phase === 2 ? '受损阶段' : '第一阶段'));
      dom.bossHpText.textContent = formatZhNum(b.boss.hp) + ' / ' + formatZhNum(b.boss.maxHp);
    } else {
      dom.bossBar.classList.add('is-hidden');
    }

    if (b.bossToast) {
      dom.bossToast.textContent = b.bossToast;
      dom.bossToast.classList.remove('is-hidden');
    } else {
      dom.bossToast.classList.add('is-hidden');
    }

    var workers = ENGINE.getTalentLevel(state.profile, 'construction_worker');
    dom.workerStatus.textContent = workers > 0 ? ('施工队×' + workers) : '';
    dom.btnDemolish.classList.toggle('is-hidden', ENGINE.getTalentLevel(state.profile, 'unlock_demolish') <= 0);
    dom.btnDemolish.classList.toggle('is-active', state.demolishMode);
    dom.btnSpeed.textContent = state.speed + '倍速';
    dom.btnPause.textContent = state.paused ? '继续' : '暂停';

    updateTutorialBanner();
    updateTopHud();
    syncBuildingGrid();
    syncUnitPalette();
    syncAbilityBar();
  }

  function startBattle(levelNum, isTutorial) {
    AUDIO.unlock();
    AUDIO.startBgm();
    if (!isTutorial) state.profile.selectedLevel = levelNum;
    state.battle = ENGINE.createBattle(state.profile, levelNum, !!isTutorial);
    state.demolishMode = false;
    state.paused = false;
    state.speed = 1;
    state.accumulatorMs = 0;
    state.lastFrameMs = Date.now();
    state.dialogueQueue = [];
    state.dialogueTimerTicks = 0;
    state.nextBanterTick = 45;
    dom.dialogueBox.classList.add('is-hidden');
    dom.reviveScreen.classList.add('is-hidden');
    for (var i = 0; i < state.slotEls.length; i += 1) state.slotEls[i].lastKey = '';
    showScreen('battle');
    updateBattleHud();
    startLoop();
  }

  function finishBattle() {
    var b = state.battle;
    if (!b) return;
    var isWin = b.status === 'victory';
    state.profile.souls += b.earnedSouls;
    if (b.isTutorial) {
      state.profile.tutorialDone = true;
      state.profile.selectedLevel = 1;
    } else {
      if (isWin && b.level >= state.profile.unlockedLevel && b.level < 30) {
        state.profile.unlockedLevel = b.level + 1;
        state.profile.selectedLevel = state.profile.unlockedLevel;
      }
      submitBattleScore(isWin ? b.level : Math.max(0, b.level - 1), b.kills);
    }
    saveProfileToContainer();

    if (isWin) AUDIO.playVictory();
    else AUDIO.playDefeat();

    if (b.isTutorial) {
      dom.resultTitle.textContent = '新手教学通关！';
      dom.resultDesc.textContent = '你已掌握建造、升级与守城核心技巧！额外获赠 30 灵魂，前往天赋星图强化后迎战第 1 关吧！';
      dom.btnNextLevel.textContent = '出征第 1 关';
      dom.btnNextLevel.classList.remove('is-hidden');
    } else {
      dom.resultTitle.textContent = isWin ? (b.level === 30 ? '史诗通关！暗影女皇已陨落' : '第 ' + b.level + ' 关胜利！') : '城墙陷落';
      dom.resultDesc.textContent = isWin
        ? '灵魂已收入囊中，前往灵魂天赋星图强化军团或直接迎接下一波尸潮！'
        : '亡灵攻破了城墙，但你带回了本场收割的全部灵魂，点亮天赋后再战！';
      dom.btnNextLevel.textContent = '迎战下一关';
      dom.btnNextLevel.classList.toggle('is-hidden', !isWin || b.level >= 30);
    }

    dom.resKills.textContent = formatZhNum(b.kills);
    dom.resSouls.textContent = '+' + formatZhNum(b.earnedSouls);
    dom.resGold.textContent = '+' + formatZhNum(b.earnedGold);

    var miniTool = global.xhs && global.xhs.miniTool;
    dom.btnSavePoster.classList.toggle('is-hidden', !(miniTool && typeof miniTool.saveImageToPhotosAlbum === 'function'));

    dom.dialogueBox.classList.add('is-hidden');
    updateTopHud();
    showScreen('result');
    tryVibrate();
  }

  function renderLevelScreen() {
    dom.levelSummary.textContent = '已解锁至第 ' + state.profile.unlockedLevel + ' 关';
    var html = '';
    for (var i = 0; i < DATA.LEVELS.length; i += 1) {
      var lv = DATA.LEVELS[i];
      var unlocked = lv.level <= state.profile.unlockedLevel;
      var cls = 'level-cell'
        + (lv.level === state.profile.selectedLevel ? ' is-current' : '')
        + (lv.boss ? ' is-boss' : '');
      var sum = 0;
      for (var c = 0; c < lv.counts.length; c += 1) sum += lv.counts[c];
      html += '<button type="button" class="' + cls + '" data-level="' + lv.level + '"' + (unlocked ? '' : ' disabled') + '>'
        + '<span class="level-num">第 ' + lv.level + ' 关' + (lv.boss ? '·王' : '') + '</span>'
        + '<span class="level-meta">敌军 ' + formatZhNum(sum) + '</span>'
        + '</button>';
    }
    dom.levelGrid.innerHTML = html;
  }

  function tickLoop() {
    if (state.pageHidden) return;
    var now = Date.now();
    var dt = Math.min(250, Math.max(0, now - state.lastFrameMs));
    state.lastFrameMs = now;

    if (state.mode === 'battle' && state.battle) {
      if (!state.paused && state.battle.status === 'running') {
        state.accumulatorMs += dt * state.speed;
        var steps = 0;
        while (state.accumulatorMs >= 100 && steps < 4) {
          ENGINE.stepBattle(state.profile, state.battle, false);
          state.accumulatorMs -= 100;
          steps += 1;

          if (state.dialogueTimerTicks > 0) {
            state.dialogueTimerTicks -= 1;
            if (state.dialogueTimerTicks === 0) advanceDialogue();
          }

          if (state.battle.bossEvent) {
            var ev = state.battle.bossEvent;
            state.battle.bossEvent = '';
            if (DATA.BOSS_MORIANA.lines[ev]) enqueueDialogues(DATA.BOSS_MORIANA.lines[ev]);
          }

          if (!state.battle.isTutorial && state.battle.tick >= state.nextBanterTick && state.dialogueTimerTicks <= 0) {
            state.nextBanterTick = state.battle.tick + 160;
            var banter = DATA.BANTERS[Math.floor(Math.random() * DATA.BANTERS.length)];
            enqueueDialogues(banter);
          }

          if (state.battle.status !== 'running') break;
        }
        if (steps > 0) updateBattleHud();
        if (state.battle.status === 'revive_prompt') {
          RENDERER.renderBattle(dom.canvas, state.battle);
          dom.reviveStatusMsg.textContent = '';
          dom.reviveScreen.classList.remove('is-hidden');
          tryVibrate();
        } else if (state.battle.status === 'victory' || state.battle.status === 'defeat') {
          RENDERER.renderBattle(dom.canvas, state.battle);
          finishBattle();
        }
      }
      RENDERER.renderBattle(dom.canvas, state.battle);
    } else {
      if (!state.titleBattle || state.titleBattle.battle.status !== 'running') {
        state.titleBattle = createTitleDemoBattle();
      }
      state.accumulatorMs += dt;
      while (state.accumulatorMs >= 100) {
        ENGINE.stepBattle(state.titleBattle.profile, state.titleBattle.battle, true);
        state.accumulatorMs -= 100;
      }
      RENDERER.renderBattle(dom.canvas, state.titleBattle.battle);
    }

    state.rafId = global.requestAnimationFrame(tickLoop);
  }

  function startLoop() {
    stopLoop();
    state.lastFrameMs = Date.now();
    state.rafId = global.requestAnimationFrame(tickLoop);
  }

  function stopLoop() {
    if (state.rafId) {
      global.cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }
  }

  function bindEvents() {
    global.addEventListener('resize', function () {
      updateLandscapeViewport();
      applyTalentTransform();
    });

    bindTalentPan();
    bindRotatedScroll(dom.levelGrid, 'y');
    bindRotatedScroll(dom.settingsBody, 'y');
    bindRotatedScroll(dom.rankList, 'y');
    bindRotatedScroll(dom.unitPalette, 'x');

    dom.buildingGrid.addEventListener('pointerdown', function (e) {
      var btn = e.target.closest('[data-slot]');
      if (!btn || !state.battle || state.battle.status !== 'running') return;
      e.preventDefault();
      AUDIO.unlock();
      var idx = parseInt(btn.getAttribute('data-slot'), 10);
      var res = ENGINE.tryBuildOrUpgrade(state.profile, state.battle, idx, state.selectedUnitId, state.demolishMode);
      if (res.ok) {
        if (res.action === 'build') AUDIO.playBuild();
        else if (res.action === 'upgrade') AUDIO.playUpgrade();
        else AUDIO.playClick();
        tryVibrate();
        updateBattleHud();
      }
    });

    dom.unitPalette.addEventListener('pointerdown', function (e) {
      var btn = e.target.closest('[data-unit]');
      if (!btn || btn.disabled) return;
      AUDIO.unlock();
      AUDIO.playClick();
      state.selectedUnitId = btn.getAttribute('data-unit');
      state.demolishMode = false;
      updateBattleHud();
    });

    dom.abilityBar.addEventListener('pointerdown', function (e) {
      var btn = e.target.closest('[data-ability]');
      if (!btn || btn.disabled || !state.battle) return;
      AUDIO.unlock();
      if (ENGINE.triggerAbility(state.profile, state.battle, btn.getAttribute('data-ability'))) {
        AUDIO.playAbility();
        tryVibrate();
        updateBattleHud();
      }
    });

    dom.btnStartBattle.addEventListener('click', function () {
      AUDIO.playClick();
      startBattle(state.profile.tutorialDone ? state.profile.selectedLevel : 1, !state.profile.tutorialDone);
    });
    dom.btnOpenTalents.addEventListener('click', function () {
      AUDIO.playClick();
      syncTalentGraph();
      showScreen('talents');
      setTimeout(centerTalentGraphOnRoot, 20);
    });
    dom.btnCloseTalents.addEventListener('click', function () {
      AUDIO.playClick();
      updateTopHud();
      showScreen('title');
    });
    dom.btnTalentCenter.addEventListener('click', function () {
      AUDIO.playClick();
      state.talentZoom = 0.92;
      centerTalentGraphOnRoot();
    });
    dom.btnTalentZoomIn.addEventListener('click', function () {
      AUDIO.playClick();
      state.talentZoom = Math.min(1.35, state.talentZoom + 0.15);
      applyTalentTransform();
    });
    dom.btnTalentZoomOut.addEventListener('click', function () {
      AUDIO.playClick();
      state.talentZoom = Math.max(0.55, state.talentZoom - 0.15);
      applyTalentTransform();
    });

    dom.talentNodes.addEventListener('click', function (e) {
      if (state.talentJustDragged) {
        state.talentJustDragged = false;
        return;
      }
      var btn = e.target.closest('[data-tnode]');
      if (!btn) return;
      AUDIO.playClick();
      var id = btn.getAttribute('data-tnode');
      if (state.selectedTalentId === id) {
        buySelectedTalent();
      } else {
        state.selectedTalentId = id;
        syncTalentGraph();
      }
    });
    dom.btnBuyTalent.addEventListener('click', buySelectedTalent);

    dom.btnSelectLevel.addEventListener('click', function () {
      AUDIO.playClick();
      renderLevelScreen();
      showScreen('levels');
    });
    dom.btnCloseLevels.addEventListener('click', function () {
      AUDIO.playClick();
      updateTopHud();
      showScreen('title');
    });

    function openSettings() {
      AUDIO.playClick();
      if (state.mode === 'battle') state.paused = true;
      syncSettingsUi();
      dom.settingsScreen.classList.remove('is-hidden');
    }
    dom.btnOpenSettings.addEventListener('click', openSettings);
    dom.btnBattleSettings.addEventListener('click', openSettings);
    dom.btnCloseSettings.addEventListener('click', function () {
      AUDIO.playClick();
      saveProfileToContainer();
      dom.settingsScreen.classList.add('is-hidden');
      if (state.mode === 'battle') {
        state.paused = false;
        state.lastFrameMs = Date.now();
        updateBattleHud();
      }
    });

    function bindRange(el, valEl, key) {
      el.addEventListener('input', function () {
        var v = parseInt(el.value, 10) || 0;
        state.profile.settings[key] = v;
        valEl.textContent = v + '%';
        applyRuntimeSettings();
      });
    }
    bindRange(dom.setMaster, dom.valMaster, 'master');
    bindRange(dom.setSfx, dom.valSfx, 'sfx');
    bindRange(dom.setMusic, dom.valMusic, 'music');

    dom.setQualityGroup.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-q]');
      if (!btn) return;
      AUDIO.playClick();
      state.profile.settings.quality = btn.getAttribute('data-q');
      applyRuntimeSettings();
      syncSettingsUi();
    });
    dom.btnToggleDialogue.addEventListener('click', function () {
      state.profile.settings.showDialogue = !state.profile.settings.showDialogue;
      if (!state.profile.settings.showDialogue) dom.dialogueBox.classList.add('is-hidden');
      syncSettingsUi();
    });
    dom.btnToggleFloats.addEventListener('click', function () {
      AUDIO.playClick();
      state.profile.settings.showFloats = !(state.profile.settings.showFloats !== false);
      applyRuntimeSettings();
      syncSettingsUi();
    });
    dom.btnToggleVibrate.addEventListener('click', function () {
      state.profile.settings.vibrate = !state.profile.settings.vibrate;
      syncSettingsUi();
    });
    dom.btnResetSave.addEventListener('click', function () {
      if (!state.resetConfirm) {
        state.resetConfirm = true;
        dom.btnResetSave.textContent = '再次点击确认清空';
        return;
      }
      state.profile = createFullProfile();
      saveProfileToContainer();
      applyRuntimeSettings();
      syncSettingsUi();
      dom.settingsScreen.classList.add('is-hidden');
      state.battle = null;
      updateTopHud();
      showScreen('title');
      dom.followScreen.classList.remove('is-hidden');
    });

    dom.btnOpenRank.addEventListener('click', function () { AUDIO.playClick(); openRankModal(); });
    dom.btnCloseRank.addEventListener('click', function () { AUDIO.playClick(); dom.rankScreen.classList.add('is-hidden'); });
    dom.rankTabs.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-period]');
      if (!btn) return;
      AUDIO.playClick();
      state.rankPeriod = btn.getAttribute('data-period');
      refreshRankList();
    });

    dom.btnDoFollow.addEventListener('click', handleFollowAction);
    dom.btnSkipFollow.addEventListener('click', function () {
      AUDIO.playClick();
      state.profile.followPromptSeen = true;
      saveProfileToContainer();
      dom.followScreen.classList.add('is-hidden');
    });
    dom.btnReopenFollow.addEventListener('click', function () {
      AUDIO.playClick();
      dom.followStatusMsg.textContent = '';
      dom.followScreen.classList.remove('is-hidden');
    });

    dom.btnShareRevive.addEventListener('click', handleShareReviveAction);
    dom.btnGiveUp.addEventListener('click', function () {
      AUDIO.playClick();
      dom.reviveScreen.classList.add('is-hidden');
      if (state.battle) {
        state.battle.status = 'defeat';
        finishBattle();
      }
    });

    dom.btnSkipTutorial.addEventListener('click', function () {
      AUDIO.playClick();
      state.profile.tutorialDone = true;
      saveProfileToContainer();
      startBattle(1, false);
    });

    dom.levelGrid.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-level]');
      if (!btn || btn.disabled) return;
      AUDIO.playClick();
      startBattle(parseInt(btn.getAttribute('data-level'), 10) || 1, false);
    });

    dom.btnSpeed.addEventListener('click', function () {
      AUDIO.playClick();
      var maxSpd = ENGINE.getMaxSpeed(state.profile);
      state.speed = state.speed >= maxSpd ? 1 : state.speed + 1;
      updateBattleHud();
    });
    dom.btnPause.addEventListener('click', function () {
      AUDIO.playClick();
      state.paused = !state.paused;
      state.lastFrameMs = Date.now();
      updateBattleHud();
    });
    dom.btnDemolish.addEventListener('click', function () {
      AUDIO.playClick();
      state.demolishMode = !state.demolishMode;
      updateBattleHud();
    });
    dom.btnSurrender.addEventListener('click', function () {
      if (!state.battle) return;
      AUDIO.playClick();
      state.battle.status = 'defeat';
      finishBattle();
    });

    dom.btnNextLevel.addEventListener('click', function () {
      AUDIO.playClick();
      if (state.battle && state.battle.isTutorial) { startBattle(1, false); return; }
      startBattle(Math.min(30, (state.battle ? state.battle.level : 1) + 1), false);
    });
    dom.btnRetryLevel.addEventListener('click', function () {
      AUDIO.playClick();
      var isTut = state.battle ? state.battle.isTutorial : false;
      startBattle(state.battle && !isTut ? state.battle.level : state.profile.selectedLevel, isTut);
    });
    dom.btnResultTalents.addEventListener('click', function () {
      AUDIO.playClick();
      syncTalentGraph();
      showScreen('talents');
      setTimeout(centerTalentGraphOnRoot, 20);
    });
    dom.btnBackTitle.addEventListener('click', function () {
      AUDIO.playClick();
      state.battle = null;
      updateTopHud();
      showScreen('title');
    });

    dom.btnSavePoster.addEventListener('click', async function () {
      if (!state.battle) return;
      var miniTool = global.xhs && global.xhs.miniTool;
      if (!miniTool || typeof miniTool.saveImageToPhotosAlbum !== 'function') return;
      try {
        var dataUrl = RENDERER.buildResultPosterDataUrl(state.battle, state.battle.status === 'victory');
        if (!dataUrl) return;
        await miniTool.saveImageToPhotosAlbum({ filePath: dataUrl });
        dom.btnSavePoster.textContent = '已保存到相册';
      } catch (e) {
        dom.btnSavePoster.textContent = '保存失败';
      }
    });

    document.addEventListener('visibilitychange', function () {
      state.pageHidden = document.hidden;
      if (state.pageHidden) {
        stopLoop();
        AUDIO.stopBgm();
      } else {
        state.lastFrameMs = Date.now();
        startLoop();
      }
    });
  }

  async function init() {
    dom.stageRoot = $('stage-root');
    dom.stageSafe = $('stage-safe');
    dom.leftHud = $('left-hud');
    dom.mainStage = $('main-stage');
    dom.canvas = $('battle-canvas');
    dom.startupStatus = $('startup-status');
    dom.titleActions = $('title-actions');
    dom.titleSoulsVal = $('title-souls-val');
    dom.followBuffPill = $('follow-buff-pill');
    dom.btnReopenFollow = $('btn-reopen-follow');
    dom.storageHint = $('storage-hint');

    dom.hudLevel = $('hud-level');
    dom.hudGold = $('hud-gold');
    dom.hudSouls = $('hud-souls');
    dom.incomeTag = $('income-tag');
    dom.wallHpFill = $('wall-hp-fill');
    dom.wallHpText = $('wall-hp-text');
    dom.spawnProgFill = $('spawn-prog-fill');
    dom.livingCount = $('living-count');
    dom.undeadCount = $('undead-count');
    dom.waveTimer = $('wave-timer');

    dom.battleOverlay = $('battle-overlay');
    dom.bossBar = $('boss-bar');
    dom.bossPhase = $('boss-phase');
    dom.bossHpFill = $('boss-hp-fill');
    dom.bossHpText = $('boss-hp-text');
    dom.bossToast = $('boss-toast');

    dom.dialogueBox = $('dialogue-box');
    dom.dialoguePortrait = $('dialogue-portrait');
    dom.dialogueSpeaker = $('dialogue-speaker');
    dom.dialogueText = $('dialogue-text');

    dom.tutorialBanner = $('tutorial-banner');
    dom.tutStepTitle = $('tut-step-title');
    dom.tutStepDesc = $('tut-step-desc');
    dom.btnSkipTutorial = $('btn-skip-tutorial');

    dom.titleScreen = $('title-screen');
    dom.followScreen = $('follow-screen');
    dom.followStatusMsg = $('follow-status-msg');
    dom.btnDoFollow = $('btn-do-follow');
    dom.btnSkipFollow = $('btn-skip-follow');

    dom.reviveScreen = $('revive-screen');
    dom.reviveStatusMsg = $('revive-status-msg');
    dom.btnShareRevive = $('btn-share-revive');
    dom.btnGiveUp = $('btn-give-up');

    dom.talentScreen = $('talent-screen');
    dom.talentSoulsVal = $('talent-souls-val');
    dom.talentSummary = $('talent-summary');
    dom.talentViewport = $('talent-viewport');
    dom.talentCanvasWrap = $('talent-canvas-wrap');
    dom.talentLinks = $('talent-links');
    dom.talentNodes = $('talent-nodes');
    dom.inspIcon = $('insp-icon');
    dom.inspName = $('insp-name');
    dom.inspLv = $('insp-lv');
    dom.inspDesc = $('insp-desc');
    dom.inspReq = $('insp-req');
    dom.btnBuyTalent = $('btn-buy-talent');
    dom.btnTalentCenter = $('btn-talent-center');
    dom.btnTalentZoomIn = $('btn-talent-zoom-in');
    dom.btnTalentZoomOut = $('btn-talent-zoom-out');

    dom.levelScreen = $('level-screen');
    dom.levelSummary = $('level-summary');
    dom.levelGrid = $('level-grid');

    dom.settingsScreen = $('settings-screen');
    dom.settingsBody = dom.settingsScreen.querySelector('.settings-body');
    dom.btnOpenSettings = $('btn-open-settings');
    dom.btnBattleSettings = $('btn-battle-settings');
    dom.btnCloseSettings = $('btn-close-settings');
    dom.setMaster = $('set-master');
    dom.valMaster = $('val-master');
    dom.setSfx = $('set-sfx');
    dom.valSfx = $('val-sfx');
    dom.setMusic = $('set-music');
    dom.valMusic = $('val-music');
    dom.setQualityGroup = $('set-quality-group');
    dom.btnToggleDialogue = $('btn-toggle-dialogue');
    dom.btnToggleFloats = $('btn-toggle-floats');
    dom.btnToggleVibrate = $('btn-toggle-vibrate');
    dom.btnResetSave = $('btn-reset-save');

    dom.rankScreen = $('rank-screen');
    dom.btnOpenRank = $('btn-open-rank');
    dom.btnCloseRank = $('btn-close-rank');
    dom.rankMySummary = $('rank-my-summary');
    dom.rankTabs = $('rank-tabs');
    dom.rankList = $('rank-list');

    dom.resultScreen = $('result-screen');
    dom.resultTitle = $('result-title');
    dom.resultDesc = $('result-desc');
    dom.resKills = $('res-kills');
    dom.resSouls = $('res-souls');
    dom.resGold = $('res-gold');
    dom.btnNextLevel = $('btn-next-level');
    dom.btnRetryLevel = $('btn-retry-level');
    dom.btnResultTalents = $('btn-result-talents');
    dom.btnSavePoster = $('btn-save-poster');
    dom.btnBackTitle = $('btn-back-title');

    dom.btnStartBattle = $('btn-start-battle');
    dom.btnOpenTalents = $('btn-open-talents');
    dom.btnCloseTalents = $('btn-close-talents');
    dom.btnSelectLevel = $('btn-select-level');
    dom.btnCloseLevels = $('btn-close-levels');

    dom.btnSpeed = $('btn-speed');
    dom.btnPause = $('btn-pause');
    dom.btnDemolish = $('btn-demolish');
    dom.btnSurrender = $('btn-surrender');
    dom.abilityBar = $('ability-bar');
    dom.workerStatus = $('worker-status');
    dom.buildingGrid = $('building-grid');
    dom.unitPalette = $('unit-palette');

    updateLandscapeViewport();
    initPersistentBattleDom();
    buildTalentGraphOnce();
    bindEvents();

    await Promise.all([loadProfileFromContainer(), RENDERER.preloadAssets()]);
    applyRuntimeSettings();

    state.titleBattle = createTitleDemoBattle();
    dom.startupStatus.classList.add('is-hidden');
    dom.titleActions.classList.remove('is-hidden');
    dom.mainStage.setAttribute('aria-busy', 'false');
    updateTopHud();
    showScreen('title');
    startLoop();
    await checkAndMaybeShowFollowModal();
  }

  init();
})(window);
