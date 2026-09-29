# Scroll-Driven Animations 兼容性演示

纯 HTML/CSS/JS（无框架）演示滚动驱动动画的四种效果，并在浏览器不支持时自动降级。

## 运行

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
```

（使用 ES Module，需通过 HTTP 访问，不能直接 file:// 打开。）

## 功能

- 四种滚动动画：顶部滚动进度条、视差图层、逐帧精灵图（Canvas 运行时生成）、粘性缩放卡片
- 支持性检测：`animation-timeline: scroll()/view()`、`view-timeline-name`、`ScrollTimeline`/`ViewTimeline` 构造器
- 误判修正：静态检测通过后，再用运行时探针验证动画时间线确实为 ScrollTimeline，误报时自动改判降级
- 降级方案：IntersectionObserver（只在可见时更新）+ requestAnimationFrame（lerp 平滑、仅 transform/opacity）
- 性能对比：rAF 采样 FPS 与卡顿帧（>50ms），PerformanceObserver 统计长任务，按方案分别累计对照
- 手动切换：自动 / 原生 SDA / 降级 JS，切换异常自动回退降级方案

## 文件结构

- `index.html` — 演示页面与控制面板
- `css/style.css` — 布局与原生模式下的 CSS 滚动动画（`animation-timeline` / 命名 `view-timeline`）
- `js/support.js` — 静态检测 + 运行时探针（误判修正）
- `js/engine.js` — 动画引擎：原生模式切 class，降级模式 IO + rAF 驱动
- `js/perf.js` — FPS/卡顿帧/长任务监控，分方案累计
- `js/main.js` — 精灵图生成、注册表、检测决策、方案切换、面板渲染

## 验收对照

- 各滚动动画正确：原生模式由 CSS `animation-timeline` 驱动，降级模式由 JS 计算同款进度
- 支持性检测准确：CSS.supports + 构造器检查 + 运行时探针三重验证
- 降级方案一致：降级与原生使用相同的进度模型（document / view / container）
- 滚动平滑：passive 监听、rAF 节流、lerp 缓动、仅合成器属性
- 性能可对照：面板实时显示 FPS/卡顿帧/长任务，并按方案分行累计
- 方案切换不崩：teardown 清理 rAF/IO/内联样式，切换异常 try/catch 回退
