# NY Daily Watch · Instagram 卡片生成器

把一条新闻做成两张 1080×1350 的 Instagram 卡片：图片卡 + 深色要点卡。

**在线使用：** https://treeaspen.github.io/ny-daily-watch-cards/

## 用法（三步）

1. **粘 JSON** —— 把整条新闻的 JSON 一次性粘进左边的文本框，卡片立刻更新。
2. **贴图** —— 在页面任意位置按 `Ctrl+V` 贴上标题图（也可以拖入或点击选择）。
3. **拿走** —— 点「一键下载两张 PNG」，或用每张卡下面的「复制」按钮直接 `Ctrl+V` 贴进 Instagram 网页版。

文字会自动缩放换行；如果缩到最小字号还塞不下，卡片下方会用红字提示该缩短哪一段。

## JSON 字段

```json
{
  "slug": "polysilicon-solar-chips",
  "category": "Business",
  "headline": "Polysilicon: The Hidden Link Between America's Solar and Chip Industries",
  "subtitle": "New solar tariffs, signed Aug. 6 — but the real target is chips.",
  "eyebrow": "Why chips need solar",
  "heading": "Three things to know",
  "bullets": [
    "Chips use just 2.4% of the world's polysilicon. Solar uses nearly all the rest.",
    "The U.S. had ~50% of global polysilicon capacity in 2005. Under 2% by 2024.",
    "Price floors and a 15% tariff take effect Dec. 4."
  ],
  "date": "AUGUST 12, 2026"
}
```

| 字段 | 用在哪 | 说明 |
| --- | --- | --- |
| `category` | 卡 1 左上金色标签 | 1–2 个词 |
| `headline` | 卡 1 金色大标题 | 84px 起，塞不下自动缩到 52px |
| `subtitle` | 卡 1 白色副标 | 46px 起，最小 30px |
| `eyebrow` | 卡 2 顶部小字 | 固定 28px |
| `heading` | 卡 2 金色大标题 | 默认 `Three things to know` |
| `bullets` | 卡 2 要点列表 | 建议 3 条，每条最多 4 行 |
| `date` | 两张卡左下角 | 建议 `AUGUST 12, 2026` 这种全大写写法 |
| `slug` | 下载文件名 | 省略时按 headline 自动生成 |

多余字段忽略，缺字段按空处理。粘进来的内容允许带 ` ```json ` 代码块标记或末尾多余逗号，会自动清掉。

页面上的「复制 AI 提示词」按钮会复制一段提示词，把新闻原文丢给任意大模型即可让它按上表输出 JSON。

## 输出

- `<slug>-1-photo.png` —— 图片卡：顶部 1080×600 图片带 + 金色分类标签 + 大标题 + 副标
- `<slug>-2-dark.png` —— 深色卡：小字 + 金色标题 + 圆点要点列表

标题图按 `cover` 方式裁进 1080×600；构图不合适时用「纵向裁切」滑块上下移动取景，不必回 Photoshop 重裁。

## 本地运行

页面用了 ES module，必须经 HTTP 打开，直接双击 `index.html` 会被浏览器的 file:// 限制挡住：

```bash
python -m http.server 8000
# 打开 http://127.0.0.1:8000/
```

「复制到剪贴板」需要 https 或 localhost 环境（浏览器限制）；GitHub Pages 上正常可用。下载按钮无此限制。

## Python 命令行版（可选）

需要批量生成时用它，输出与网页版一致：

```bash
pip install playwright && playwright install chromium
python cards.py sample/story.json out/
```

标题图通过 JSON 里的 `photo` 字段给本地文件路径。

## 换 logo

页面「高级设置 → 更换 logo」只对当前这次生成有效。要永久替换：

```bash
python tools/embed_logo.py 新logo.png     # 缩到 320px 并写回 assets/logo.png + logo.js
```

## 设计参数

两个渲染器共用同一套参数（`assets/render.js` 的 `T` 与 `cards.py` 的 `T`），改版式时两边都要改：

画布 1080×1350，左右留白 92，图片带高 600，图片与标题间距 36，正文可用高度 554（到日期/logo 带为止），
金色 `#EFC050`，底色 `#121212`，米色日期 `#EADFC2`，标题 Playfair Display 700，正文 Montserrat 300/400。

字体自托管在 `assets/fonts/`（Playfair Display + Montserrat，来自 fontsource），不依赖 Google Fonts。

## tools/

- `visual-check.html` —— 用示例和一个压力测试用例渲染两张卡，改版式后拿它回归对比
- `dom-reference.html` —— `cards.py` 的 DOM 版复刻，用来验证 canvas 移植与 Playwright 输出一致
- `embed_logo.py` —— 重新生成内嵌 logo

两个检查页都支持 `?case=stress` 切到超长文本用例。
