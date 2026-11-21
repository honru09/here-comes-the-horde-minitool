/* 《群尸来压境》全量核心数据（兵种 + 30关 + 原作星图坐标天赋树 + 官方中文对话库，严格 ES2017） */
(function (global) {
  'use strict';

  var UNIT_ORDER = ['peasant', 'archer', 'knight', 'mage', 'cavalry', 'paladin', 'archmage'];

  var UNITS = {
    peasant: {
      id: 'peasant', name: '农民', shortName: '农', buildingName: '草叉小屋',
      initiallyUnlocked: true, buildCost: 3, value: 1, health: 50, damage: 10,
      attackRange: 18, attackType: 'melee_single', area: 0, cooldownTicks: 3, radius: 5,
      color: '#d9b97e', undeadColor: '#7ca36b'
    },
    archer: {
      id: 'archer', name: '弓箭手', shortName: '弓', buildingName: '靶场',
      initiallyUnlocked: false, buildCost: 25, value: 5, health: 50, damage: 10,
      attackRange: 175, attackType: 'projectile_single', projectileSpeed: 340, area: 0, cooldownTicks: 11, radius: 6,
      color: '#6ec47e', undeadColor: '#5c8f6e'
    },
    knight: {
      id: 'knight', name: '军士', shortName: '军', buildingName: '军营',
      initiallyUnlocked: false, buildCost: 100, value: 25, health: 250, damage: 50,
      attackRange: 20, attackType: 'melee_single', area: 0, cooldownTicks: 4, radius: 7,
      color: '#7da7d9', undeadColor: '#5d6f8c'
    },
    mage: {
      id: 'mage', name: '法师', shortName: '法', buildingName: '魔塔',
      initiallyUnlocked: false, buildCost: 500, value: 75, health: 150, damage: 50,
      attackRange: 135, attackType: 'projectile_splash', projectileSpeed: 240, area: 28, cooldownTicks: 19, radius: 7,
      color: '#a97ef0', undeadColor: '#7b589c'
    },
    cavalry: {
      id: 'cavalry', name: '骑兵', shortName: '骑', buildingName: '马厩',
      initiallyUnlocked: false, buildCost: 2500, value: 250, health: 500, damage: 150,
      attackRange: 26, attackType: 'melee_triangle', area: 48, cooldownTicks: 8, radius: 9,
      color: '#e69b53', undeadColor: '#966549'
    },
    paladin: {
      id: 'paladin', name: '圣骑士', shortName: '圣', buildingName: '礼拜堂',
      initiallyUnlocked: false, buildCost: 10000, value: 750, health: 750, damage: 200,
      attackRange: 22, attackType: 'melee_splash', area: 34, cooldownTicks: 11, radius: 10,
      color: '#f7df79', undeadColor: '#998952'
    },
    archmage: {
      id: 'archmage', name: '大法师', shortName: '大', buildingName: '奥术圣所',
      initiallyUnlocked: false, buildCost: 50000, value: 2500, health: 500, damage: 150,
      attackRange: 230, attackType: 'projectile_splash', projectileSpeed: 260, area: 46, cooldownTicks: 19, radius: 10,
      color: '#6ce2ff', undeadColor: '#48889e'
    }
  };

  var BOSS_MORIANA = {
    id: 'moriana',
    name: '暗影女皇·莫里亚娜',
    health: 6666666,
    radius: 26,
    rewardSouls: 100000,
    meleeReflectPercent: 1000,
    novaDamage: [5, 10, 15],
    novaIntervalTicks: [150, 100, 50],
    raiseIntervalTicks: [600, 400, 200],
    pulseDamage: 5,
    pulsePeriodTicks: 30,
    lines: {
      opening: [
        { who: 'empress', text: '好啊，非逼我亲自动手是吧。' },
        { who: 'king', text: '成败就看这最后一战！弟兄们，打起精神来！' }
      ],
      phase2: [
        { who: 'empress', text: '这一切还没结束呢！' },
        { who: 'king', text: '也许吧，不过你这条命要结束了！' }
      ],
      phase3: [
        { who: 'empress', text: '接下来可要动真格喽。' },
        { who: 'king', text: '放马过来吧！我的大军时刻准备着！' }
      ],
      resurrection: [
        '起身吧！',
        '你们都归我指挥了。',
        '小兵小将多多益善！',
        '我的尸群不断壮大！'
      ],
      defeat: [
        { who: 'empress', text: '不……不行！这怎么可能！我不能输！' },
        { who: 'king', text: '这一切总算结束了。今晚，我的臣民们终于能睡个安稳觉。' }
      ]
    }
  };

  /* 原作官方中文局内双人互怼对话（移植自 Dialogues.ini + zh-Hans.txt） */
  var BANTERS = [
    [{ who: 'empress', text: '跟我待在一起，开心吗？' }, { who: 'king', text: '别再靠近了，你这妖女！' }],
    [{ who: 'king', text: '我城堡的高墙定能阻挡你的尸群！' }, { who: 'empress', text: '那我可等不及把它们全拆了呢。' }],
    [{ who: 'king', text: '我连火葬台都给你备好了。' }, { who: 'empress', text: '呼呼，气氛好灼热呀。' }],
    [{ who: 'king', text: '我们定会杀光你的喽啰。' }, { who: 'empress', text: '早已死去的物事，又何从杀起呢。' }],
    [{ who: 'empress', text: '建这么多墙，就为了躲我？' }, { who: 'king', text: '我筑起高墙，是为了阻挡你这样的妖魔鬼怪！' }],
    [{ who: 'king', text: '正义就是我们的武器！' }, { who: 'empress', text: '哎呀亲爱的，那可不太够对付我呢。' }],
    [{ who: 'king', text: '我的骑士会摧毁你的尸群。' }, { who: 'empress', text: '你就继续这么骗自己吧。' }],
    [{ who: 'empress', text: '我要将你的灵魂吃干抹净。' }, { who: 'king', text: '此等邪恶定要制止！' }],
    [{ who: 'king', text: '我绝不会在你面前屈膝。' }, { who: 'empress', text: '那看来你不再需要这双腿喽。' }],
    [{ who: 'empress', text: '今天准备了什么新花样呀？' }, { who: 'king', text: '给你的喽啰准备了灭顶之灾！' }],
    [{ who: 'empress', text: '乌云要在你头顶聚集了哦。' }, { who: 'king', text: '区区小雨可吓不倒我，妖女！' }],
    [{ who: 'empress', text: '我率群尸来压境。' }, { who: 'king', text: '你可休想再前进！' }],
    [{ who: 'king', text: '速速滚出我的国度，你这怪物！' }, { who: 'empress', text: '可我好喜欢征服你的感觉。' }],
    [{ who: 'empress', text: '区区一堆砖头，别想阻拦我的脚步。' }, { who: 'king', text: '那就让我忠诚的臣仆来收拾你。' }],
    [{ who: 'king', text: '敢再靠近一步，定叫你粉身碎骨！' }, { who: 'empress', text: '唔哼，越来越刺激了呢。' }],
    [{ who: 'empress', text: '都不铺红毯欢迎一下我吗？' }, { who: 'king', text: '这就给你现铺一张……用你喽啰的骨头！' }],
    [{ who: 'empress', text: '速速跪下求饶吧，趁我还有慈悲之心。' }, { who: 'king', text: '绝不！我们永不屈服！' }],
    [{ who: 'empress', text: '我要把你的宝贝城堡烧个干净。' }, { who: 'king', text: '女士优先，当然先烧你这妖女！' }],
    [{ who: 'empress', text: '小的们，释放混乱吧！' }, { who: 'king', text: '爱释放什么都随意，反正我们绝不退缩！' }],
    [{ who: 'king', text: '你连我的城墙都还没摸着，就会全军覆没。' }, { who: 'empress', text: '都是些空话，空话，空话。' }]
  ];

  var ECONOMY = {
    baseWallHealth: 100,
    playerSpawnIntervalTicks: 100,
    peasantBuildingCosts: [0, 1, 5, 8],
    tierUpgradeScales: [1, 1.2, 1.55, 2.1, 3.05, 4, 5.2],
    buildingCostGrowth: 3,
    upgradeGrowth: 1.82,
    lateUpgradeGrowth: 1.12,
    lateUpgradeStart: 3,
    upgradeBaseMultiplier: 1.05,
    minimumUpgradeCost: 4,
    firstPeasantUpgradeCost: 3,
    globalDiscountFloor: 0.5,
    unitDiscountFloor: 0.2
  };

  var ABILITIES = {
    tornado: { id: 'tornado', name: '龙卷风', cooldownTicks: 200, durationTicks: 60 },
    sheep_explosion: { id: 'sheep_explosion', name: '绵羊爆破', cooldownTicks: 500, durationTicks: 1 },
    rally: { id: 'rally', name: '集结号令', cooldownTicks: 600, durationTicks: 100, strengthPercent: 20 }
  };

  var LEVELS = [
    { level: 1, counts: [33, 0, 0, 0, 0, 0, 0], duration: 60 },
    { level: 2, counts: [66, 0, 0, 0, 0, 0, 0], duration: 66 },
    { level: 3, counts: [100, 20, 0, 0, 0, 0, 0], duration: 72 },
    { level: 4, counts: [200, 40, 0, 0, 0, 0, 0], duration: 78 },
    { level: 5, counts: [300, 60, 10, 0, 0, 0, 0], duration: 84 },
    { level: 6, counts: [400, 80, 20, 0, 0, 0, 0], duration: 90 },
    { level: 7, counts: [600, 100, 40, 0, 0, 0, 0], duration: 96 },
    { level: 8, counts: [800, 200, 60, 10, 0, 0, 0], duration: 102 },
    { level: 9, counts: [1000, 300, 80, 20, 0, 0, 0], duration: 108 },
    { level: 10, counts: [1500, 400, 100, 40, 0, 0, 0], duration: 114 },
    { level: 11, counts: [2000, 600, 200, 60, 0, 0, 0], duration: 120 },
    { level: 12, counts: [3000, 900, 300, 80, 20, 0, 0], duration: 126 },
    { level: 13, counts: [4000, 1200, 400, 100, 40, 0, 0], duration: 132 },
    { level: 14, counts: [6000, 1500, 600, 200, 60, 0, 0], duration: 138 },
    { level: 15, counts: [8000, 2000, 800, 300, 100, 0, 0], duration: 144 },
    { level: 16, counts: [10000, 2500, 1000, 400, 200, 40, 0], duration: 150 },
    { level: 17, counts: [13000, 3000, 1300, 600, 400, 60, 0], duration: 156 },
    { level: 18, counts: [16000, 3500, 1600, 800, 600, 100, 0], duration: 162 },
    { level: 19, counts: [20000, 4000, 2000, 1200, 800, 200, 0], duration: 168 },
    { level: 20, counts: [25000, 5000, 2500, 1600, 1000, 300, 20], duration: 174 },
    { level: 21, counts: [30000, 6000, 3000, 2000, 1500, 400, 60], duration: 180 },
    { level: 22, counts: [35000, 7000, 3500, 2500, 2000, 600, 100], duration: 186 },
    { level: 23, counts: [40000, 8000, 4000, 3000, 2500, 800, 200], duration: 192 },
    { level: 24, counts: [45000, 9000, 5000, 4000, 3000, 1200, 300], duration: 198 },
    { level: 25, counts: [50000, 10000, 6000, 5000, 3500, 1600, 500], duration: 204 },
    { level: 26, counts: [55000, 13000, 8000, 6000, 4000, 2000, 800], duration: 210 },
    { level: 27, counts: [60000, 16000, 10000, 8000, 5000, 2500, 1200], duration: 216 },
    { level: 28, counts: [65000, 20000, 13000, 10000, 6000, 3000, 1700], duration: 222 },
    { level: 29, counts: [70000, 25000, 16000, 12000, 7000, 4000, 2300], duration: 228 },
    { level: 30, counts: [80000, 30000, 20000, 15000, 8000, 5000, 3000], duration: 234, boss: 'moriana' }
  ];

  /* 原作灵魂天赋星图树（按 Talents.ini 主干向上生长布局：gx=0..8, gy=0..8, icon 对应原版贴图） */
  var TALENTS = [
    /* 第 8 层（底部起点：农民主干 + 城墙 + 初始金币） */
    { id: 'peasant_production', gx: 4, gy: 8, icon: './assets/buildings/peasant.webp', name: '草叉暴民', desc: '农民兵营基础产兵 +1 / 级', costs: [1, 50, 100], req: [] },
    { id: 'free_peasant_building', gx: 4, gy: 7, icon: './assets/buildings/peasant.webp', name: '免费小屋', desc: '开局自动赠送 1 座农民小屋 / 级', costs: [10, 50, 125], req: ['peasant_production:1'] },
    { id: 'peasant_discount', gx: 5, gy: 7, icon: './assets/ui/coin.webp', name: '小屋合同', desc: '农民建筑升级费用 -20% / 级', costs: [20, 40, 60, 80], req: ['free_peasant_building:1'] },
    { id: 'peasant_multiplier', gx: 6, gy: 8, icon: './assets/ui/army_living.webp', name: '农民后备队', desc: '农民产兵倍率 +100% / 级', costs: [600, 800, 1000, 1200, 1500], req: ['peasant_discount:1'] },

    /* 城墙防线（向左分支） */
    { id: 'wall_hp_300', gx: 3, gy: 7, icon: './assets/map/wall_tile.webp', name: '石砌城墙', desc: '城墙最大生命 +300 / 级', costs: [10, 20, 30], req: ['free_peasant_building:1'] },
    { id: 'wall_hp_1000', gx: 2, gy: 7, icon: './assets/map/wall_tile.webp', name: '加固城墙', desc: '城墙最大生命 +1000 / 级', costs: [50, 75, 100, 125], req: ['wall_hp_300:3'] },
    { id: 'wall_hp_5000', gx: 1, gy: 7, icon: './assets/map/wall_tile.webp', name: '长城之墙', desc: '城墙最大生命 +5000 / 级', costs: [250, 375, 500, 625, 750], req: ['wall_hp_1000:4'] },
    { id: 'stronghold_thorns', gx: 2, gy: 6, icon: './assets/ui/army_enemy.webp', name: '棘刺城墙', desc: '反弹攻击城墙的亡灵 35% 伤害 / 级', costs: [100, 200, 300, 400, 500], req: ['wall_hp_1000:1'] },
    { id: 'watchers_on_the_wall', gx: 3, gy: 8, icon: './assets/buildings/archer.webp', name: '城墙守望者', desc: '城墙部署自动射击的守卫弓箭手', costs: [225, 350, 500], req: ['wall_hp_300:3'] },
    { id: 'wall_mages', gx: 2, gy: 8, icon: './assets/buildings/mage.webp', name: '城墙奥术塔', desc: '城墙部署自动火球术守卫法师', costs: [2500, 5000], req: ['watchers_on_the_wall:2'] },

    /* 经济分支（向右分支） */
    { id: 'start_gold_10', gx: 6, gy: 7, icon: './assets/ui/coin.webp', name: '铜袋', desc: '每局初始金币 +10 / 级', costs: [10, 15, 20, 25, 30], req: ['peasant_discount:1'] },
    { id: 'start_gold_100', gx: 7, gy: 7, icon: './assets/ui/coin.webp', name: '银柜', desc: '每局初始金币 +100 / 级', costs: [100, 150, 200, 250, 300], req: ['start_gold_10:5'] },
    { id: 'start_gold_1000', gx: 8, gy: 7, icon: './assets/ui/coin.webp', name: '金矿', desc: '每局初始金币 +1000 / 级', costs: [1000, 1500, 2000, 2500, 3000], req: ['start_gold_100:5'] },
    { id: 'unlock_demolish', gx: 6, gy: 6, icon: './assets/ui/demolish.webp', name: '拆除重建', desc: '解锁战斗中拆除建筑返还 50% 造价', costs: [60], req: ['start_gold_10:1'] },
    { id: 'gold_income_5', gx: 7, gy: 6, icon: './assets/ui/coin.webp', name: '稳定税收', desc: '每秒自动获得金币 +5 / 级', costs: [150, 275, 350, 425, 500], req: ['start_gold_100:1'] },
    { id: 'gold_income_50', gx: 8, gy: 6, icon: './assets/ui/coin.webp', name: '王国金库', desc: '每秒自动获得金币 +50 / 级', costs: [1500, 2750, 3500, 4250, 5000], req: ['gold_income_5:5'] },

    /* 弓箭手与绵羊（第 6 层） */
    { id: 'unlock_archer', gx: 4, gy: 6, icon: './assets/buildings/archer.webp', name: '解锁弓箭手', desc: '开放远程兵种：弓箭手', costs: [100], req: ['free_peasant_building:1'] },
    { id: 'archer_production', gx: 3, gy: 6, icon: './assets/buildings/archer.webp', name: '草靶借箭', desc: '弓箭手产兵 +1 / 级', costs: [75, 125, 200], req: ['unlock_archer:1'] },
    { id: 'archer_discount', gx: 3, gy: 5, icon: './assets/ui/coin.webp', name: '靶场合同', desc: '弓箭手升级费用 -20% / 级', costs: [50, 75, 100, 125], req: ['archer_production:1'] },
    { id: 'archer_range', gx: 2, gy: 5, icon: './assets/buildings/archer.webp', name: '百步穿杨', desc: '弓箭手射程 +35% / 级', costs: [400, 800], req: ['archer_discount:1'] },
    { id: 'fire_arrows', gx: 1, gy: 5, icon: './assets/buildings/archer.webp', name: '烈焰火箭', desc: '弓箭手附带火箭特效，伤害 +50%', costs: [1000], req: ['archer_discount:1'] },
    { id: 'sheep', gx: 5, gy: 6, icon: './assets/ui/soul.webp', name: '爆炸绵羊', desc: '敌军阵营有概率刷出可引爆的绵羊', costs: [200, 400, 800, 1600], req: ['unlock_archer:1'] },
    { id: 'unlock_sheep_explosion', gx: 5, gy: 5, icon: './assets/ui/soul.webp', name: '绵羊爆破', desc: '解锁主动技能【绵羊爆破】', costs: [500], req: ['sheep:1'] },

    /* 军士与施工队（第 5 层） */
    { id: 'unlock_knight', gx: 4, gy: 5, icon: './assets/buildings/knight.webp', name: '解锁军士', desc: '开放重甲近战：军士', costs: [300], req: ['unlock_archer:1'] },
    { id: 'knight_production', gx: 6, gy: 5, icon: './assets/buildings/knight.webp', name: '军士轮班', desc: '军士产兵 +1 / 级', costs: [225, 375, 600], req: ['unlock_knight:1'] },
    { id: 'knight_discount', gx: 7, gy: 5, icon: './assets/ui/coin.webp', name: '军营合同', desc: '军士升级费用 -20% / 级', costs: [150, 225, 300, 375], req: ['knight_production:1'] },
    { id: 'construction_worker', gx: 3, gy: 4, icon: './assets/ui/demolish.webp', name: '自动施工队', desc: '雇佣自动升级建筑的工人 +1 / 级', costs: [180, 360, 720], req: ['unlock_knight:1'] },
    { id: 'worker_price_limit', gx: 2, gy: 4, icon: './assets/ui/coin.webp', name: '施工预算', desc: '提升自动施工队可升级的金币上限', costs: [90, 270, 900, 3600, 9000], req: ['construction_worker:1'] },

    /* 法师、龙卷风与宏观协同（第 4 层） */
    { id: 'unlock_mage', gx: 4, gy: 4, icon: './assets/buildings/mage.webp', name: '解锁法师', desc: '开放远程溅射：法师', costs: [1000], req: ['unlock_knight:1'] },
    { id: 'mage_production', gx: 3, gy: 3, icon: './assets/buildings/mage.webp', name: '法师公会', desc: '法师产兵 +1 / 级', costs: [750, 1250, 2000], req: ['unlock_mage:1'] },
    { id: 'mage_discount', gx: 2, gy: 3, icon: './assets/ui/coin.webp', name: '魔塔合同', desc: '法师升级费用 -20% / 级', costs: [500, 750, 1000, 1250], req: ['mage_production:1'] },
    { id: 'unlock_tornado', gx: 5, gy: 4, icon: './assets/ui/soul.webp', name: '龙卷风', desc: '解锁主动技能【龙卷风】', costs: [2500], req: ['unlock_mage:1'] },
    { id: 'tornado_strength', gx: 6, gy: 4, icon: './assets/ui/soul.webp', name: '狂风怒号', desc: '龙卷风伤害与牵引范围大幅提升', costs: [5000, 10000, 15000], req: ['unlock_tornado:1'] },
    { id: 'diversity_hire', gx: 5, gy: 3, icon: './assets/ui/army_living.webp', name: '多元化招聘', desc: '每种不同兵营为全军产兵 +8% / 级', costs: [3000, 6000, 9000], req: ['unlock_mage:1'] },
    { id: 'upgrade_discount', gx: 6, gy: 3, icon: './assets/ui/coin.webp', name: '通用合同工', desc: '全局建筑升级费用 -10% / 级', costs: [2000, 4000, 6000, 8000, 10000], req: ['diversity_hire:1'] },
    { id: 'time_warp', gx: 7, gy: 4, icon: './assets/ui/soul.webp', name: '时间隧道', desc: '解锁更高战斗倍速（最高 3 倍速）', costs: [3000, 15000], req: ['unlock_mage:1'] },

    /* 骑兵（第 3 层） */
    { id: 'unlock_cavalry', gx: 4, gy: 3, icon: './assets/buildings/cavalry.webp', name: '解锁骑兵', desc: '开放扇形突击：骑兵', costs: [2500], req: ['unlock_mage:1'] },
    { id: 'cavalry_production', gx: 5, gy: 2, icon: './assets/buildings/cavalry.webp', name: '弼马温', desc: '骑兵产兵 +1 / 级', costs: [1875, 3125, 5000], req: ['unlock_cavalry:1'] },

    /* 圣骑士与集结号令（第 2 层） */
    { id: 'unlock_paladin', gx: 4, gy: 2, icon: './assets/buildings/paladin.webp', name: '解锁圣骑士', desc: '开放重装范围输出：圣骑士', costs: [7500], req: ['unlock_cavalry:1'] },
    { id: 'paladin_production', gx: 3, gy: 2, icon: './assets/buildings/paladin.webp', name: '批量圣产', desc: '圣骑士产兵 +1 / 级', costs: [5625, 9375], req: ['unlock_paladin:1'] },
    { id: 'unlock_rally', gx: 6, gy: 2, icon: './assets/ui/army_living.webp', name: '集结号令', desc: '解锁主动技能【集结号令】', costs: [10000], req: ['unlock_paladin:1'] },

    /* 大法师巅峰（第 1 层） */
    { id: 'unlock_archmage', gx: 4, gy: 1, icon: './assets/buildings/archmage.webp', name: '解锁大法师', desc: '开放超远大范围奥术：大法师', costs: [25000], req: ['unlock_paladin:1'] },
    { id: 'archmage_production', gx: 4, gy: 0, icon: './assets/buildings/archmage.webp', name: '魔高一杖', desc: '大法师产兵 +1，且产兵倍率 +50%', costs: [18750, 37500], req: ['unlock_archmage:1'] }
  ];

  var TALENT_MAP = {};
  for (var i = 0; i < TALENTS.length; i += 1) {
    TALENT_MAP[TALENTS[i].id] = TALENTS[i];
  }

  global.HORDE_DATA = {
    UNIT_ORDER: UNIT_ORDER,
    UNITS: UNITS,
    BOSS_MORIANA: BOSS_MORIANA,
    BANTERS: BANTERS,
    ECONOMY: ECONOMY,
    ABILITIES: ABILITIES,
    LEVELS: LEVELS,
    TALENTS: TALENTS,
    TALENT_MAP: TALENT_MAP
  };
})(window);
