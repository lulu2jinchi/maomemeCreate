# maomemeCreate

<p align="center">
  <img src="./docs/readme-cover.svg" alt="maomemeCreate cover" width="100%" />
</p>

<p align="center">
  <strong>Cat meme asset system + timeline engine + Remotion render/export pipeline</strong>
</p>

<p align="center">
  <a href="./out/track-preview.mp4">Watch Preview</a> ·
  <a href="./track.json">Open Timeline</a> ·
  <a href="./describe.json">Browse Asset Catalog</a>
</p>

把猫 meme 做成一条可复用的视频生产线。

`maomemeCreate` 不是单纯堆素材的仓库，而是一套围绕猫咪 meme 短视频创作搭起来的本地工作流：先整理素材库和场景图库，再给素材写语义描述、给图片打常用度分级，接着用 `track.json` 组织剧情、对白、角色站位和字幕，最后通过 Remotion 直接预览渲染，或者导出到剪映草稿 / FCPXML 继续精修。

当前仓库已经包含一条完整样片数据链路，示例标题为《受害者联盟公司反杀记》。

## 首页预览

<p align="center">
  <img src="./docs/readme-showcase.svg" alt="maomemeCreate showcase" width="100%" />
</p>

如果你是第一次看到这个仓库，最短理解路径就是：

- 先看 [`out/track-preview.mp4`](./out/track-preview.mp4) 感受成片结果
- 再看 [`track.json`](./track.json) 理解它如何用数据描述剧情和时间线
- 最后启动 `catalog-editor`，感受素材库编辑和批量打分的工作方式

## 这个项目能做什么

- 管理猫 meme 视频素材和背景图片素材
- 给素材补充描述、常用度分级，方便后续检索和挑选
- 用 `track.json` 编排角色、背景、对白字幕、标题和音频
- 自动根据字幕字数拉长对白时长，避免“字还没看完镜头已经切走”
- 在 Remotion 中直接预览和渲染竖屏短视频
- 导出剪映草稿和 FCPXML，进入非编继续打磨

## 项目亮点

- `素材库不是死文件夹`
  视频素材在 [`describe.json`](./describe.json) 里带描述和常用度，图片素材在 [`img-describe.json`](./img-describe.json) 里集中管理。
- `有可视化编辑器`
  运行本地服务后，可以在 `catalog-editor` 页面直接预览素材、改描述、改分级、批量给图片打分。
- `角色站位是自动算的`
  背景图可定义 `characterZones`，角色视频会按场景人数自动落位，不用每次手调坐标。
- `对白节奏会自动修正`
  [`scripts/fit-dialogue-timing.js`](./scripts/fit-dialogue-timing.js) 会根据字幕字数和停顿自动拉长时长，并把后续场景整体顺延。
- `成片和工程都能出`
  可以直接渲染 MP4，也可以导出剪映草稿和 FCPXML 接入后续剪辑流程。

## 快速开始

先安装依赖：

```bash
npm install
```

启动 Remotion Studio 预览时间线：

```bash
npm run studio
```

启动素材标注编辑器：

```bash
npm run catalog:editor
```

然后打开：

```text
http://localhost:3030/catalog-editor/
```

## 常用命令

```bash
# 运行测试
npm test

# 根据对白内容自动重算 track 时序
npm run track:fit-dialogue

# 渲染当前样片
npm run render:track

# 导出 Final Cut Pro XML
npm run export:fcpxml

# 导出剪映草稿
npm run export:jianying
```

## 工作流

1. 在素材目录里维护透明角色视频、原始 meme 视频和背景图片。
   透明素材命名已统一为不带 `_去绿幕裁剪` 的最终文件名，例如 `public/lib/webm/可爱猫.webm`。
2. 通过 `catalog-editor` 给视频写 `description`、给图片批量打 `common_level`。
3. 在 [`track.json`](./track.json) 里配置 composition、assets 和 tracks。
4. 执行 `npm run track:fit-dialogue` 让对白节奏自动拉齐。
5. 用 `npm run studio` 预览，确认没问题后渲染或导出到剪映 / FCP。

## 目录结构

```text
.
├── public/
│   ├── lib/                  # 视频素材库
│   ├── img/                  # 背景图片库
│   └── catalog-editor/       # 素材标注编辑器
├── scripts/                  # 时序修正、导出、编辑器服务
├── src/                      # Remotion 合成入口与布局逻辑
├── describe.json             # 视频素材描述库
├── img-describe.json         # 图片素材描述库
└── track.json                # 当前样片时间线
```

## 关键文件

- [`src/TrackComposition.jsx`](./src/TrackComposition.jsx): Remotion 合成主逻辑，负责视频、图片、字幕、音频渲染。
- [`src/layout.jsx`](./src/layout.jsx): 根据背景分区和角色数量自动计算站位。
- [`public/catalog-editor/app.js`](./public/catalog-editor/app.js): 视频素材编辑器前端。
- [`scripts/catalog-editor-server.js`](./scripts/catalog-editor-server.js): 素材编辑器本地服务。
- [`scripts/export-jianying-draft.mjs`](./scripts/export-jianying-draft.mjs): 导出剪映草稿。
- [`scripts/export-fcpxml.mjs`](./scripts/export-fcpxml.mjs): 导出 FCPXML。

## 环境说明

- Node.js
- `ffprobe`
- macOS 自带的 `sips`

说明：
导出脚本会读取媒体尺寸、时长等信息；其中图片信息依赖 `sips`，视频信息依赖 `ffprobe`。如果只使用编辑器和 Remotion 预览，要求会更低。

## 适合谁

- 想把猫 meme 做成连续剧情短片的人
- 想把“素材收藏夹”升级成“可检索、可复用素材库”的人
- 想先程序化出片，再进剪映或 Final Cut 精修的人

## License

目前仓库未单独声明开源许可证。若准备公开发布，建议补充明确的 License 与素材版权说明。
