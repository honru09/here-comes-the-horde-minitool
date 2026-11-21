# 《群尸来压境》小红书小工具版（Here Comes the Horde Minitool）

将《群尸来压境》核心玩法移植为符合**小红书小工具规范（离线 H5 / ES2017 / Chrome 61 基线）**的横屏兵海守城游戏。本项目仅用于学习交流与非商用体验。

## 项目结构

- `here-comes-the-horde.zip`：已通过 `minitool-zip-builder` 规范审计的可直接上传离线包（**823.5 KiB / 0.80 MiB**，`index.html` 位于根目录）。
- `horde-minitool/`：完整离线源码与优化后的 WebP 素材目录（共 78 个文件，零外部网络请求、零第三方运行时依赖）：
  - `index.html` / `styles.css`：自动横屏旋转适配 + 小红书胶囊安全区避让 + 原作皇家蓝金 UI
  - `data.js`：7 大兵种、爆炸绵羊、30 关战役波次、41 节点灵魂天赋星图、20 组原作中文双人互怼对话与 Boss 台词
  - `engine.js`：10 TPS 确定性模拟核心、3×5 城墙兵营与相邻协同加成、自动施工队、城墙守卫、3 大主动技能、新手教学关、复活全屏圣光炸弹波
  - `renderer.js`：离屏缓存 Canvas 2D 等比无拉伸渲染器（春季绿野、平铺城墙、4×4 十六帧精灵图集、真实 VFX 贴图与画质分档）
  - `audio.js`：纯离线 Web Audio 战斗音效与背景战鼓
  - `app.js`：持久化零延迟 DOM 交互、旋转手势 1:1 映射、容器 `Storage` / `followAuthor` / `postNote` / `submitScore` / `getRankList` / `saveImageToPhotosAlbum` 接入
  - `assets/`：优化后的角色立绘、中文定制 Logo、兵营卡牌、16 帧精灵图集、地形与特效贴图

## 使用方式

### 1. 直接上传到小红书创服平台
下载仓库根目录下的 `here-comes-the-horde.zip`，在小红书创作服务平台小工具管理页直接上传，随后在平台 PC 模拟器、Android 真机与 iOS 真机完成扫码验证。

### 2. 本地模拟器调试
使用小红书小工具 CLI（`redapp`）指向 `horde-minitool/` 目录即可启动本地工作台预览：

```bash
redapp dev --dir "./horde-minitool" --agent
```

### 3. 普通静态服务器预览
```bash
python -m http.server 8080 -d "./horde-minitool"
```
> 注：普通浏览器中无法触发小红书原生容器端能力（`Storage` / `followAuthor` / `postNote` / 排行榜），完整端能力请在小红书模拟器或真机容器内验证。
