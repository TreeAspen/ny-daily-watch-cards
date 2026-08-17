# NY Daily Watch · Instagram Card Generator

Turns one news story into two 1080×1350 Instagram cards — a photo card and a dark bullet card — plus the post caption, from a single paste.

**Live:** https://treeaspen.github.io/ny-daily-watch-cards/

Interface is English by default; the **中文** button in the top right switches it, and the choice is remembered. `?lang=zh` / `?lang=en` force one.

## How to use

1. **Paste the JSON** into the left box. Both cards render immediately and the `caption` field is lifted out into its own box under them.
2. **Paste the photo** — press `Ctrl+V` anywhere on the page (dragging in or clicking the box also works).
3. **Take it away** — *Download both PNGs*, *Copy card 1* / *Copy card 2* to paste straight into Instagram on the web, and *Copy caption*.

Card text auto-shrinks and re-wraps to fit. If it still will not fit at the minimum size, a red note under the card says which line to shorten. The caption box shows a live character count against Instagram's 2,200 limit and flags anything that breaks the house format.

## JSON

```json
{
  "slug": "polysilicon-solar-chips",
  "category": "Business",
  "headline": "Polysilicon: The Hidden Link Between America's Solar and Chip Industries",
  "subtitle": "New solar tariffs, signed Aug. 6 — but the real target is chips.",
  "eyebrow": "Why chips need solar",
  "heading": "Three things to know",
  "bullets": ["point one", "point two", "point three"],
  "date": "AUGUST 12, 2026",
  "caption": "Opening line.\n\nBody paragraph.\n\nRead more at @theNYdailywatch 's bio.\n\nPhoto: NY Daily Watch"
}
```

| Field | Where it lands | Notes |
| --- | --- | --- |
| `category` | card 1, gold tag | the first one or two words of the pasted story, verbatim |
| `headline` | card 1, gold headline | the source headline as written; starts at 84px, shrinks to 52px if needed |
| `subtitle` | card 1, white subtitle | one sentence under 10 words; starts at 46px, floor 30px |
| `eyebrow` | card 2, small top line | fixed 28px |
| `heading` | card 2, gold headline | defaults to `Three things to know` |
| `bullets` | card 2, bullet list | three of them, four lines each at most |
| `caption` | caption box, not on the cards | string, or an array of paragraphs |
| `date` | bottom left of both cards | `AUGUST 12, 2026` style |
| `slug` | download filenames | derived from the headline if absent |

Unknown fields are ignored, missing ones render empty. Pasted text may carry ` ```json ` fences or trailing commas — both get cleaned up.

**Copy AI prompt** puts a prompt on your clipboard that asks any model for exactly this JSON, caption included. Paste the article under it and paste the reply straight back into the box.

## Caption format

The prompt and the live checks both enforce the house format:

- one opening line alone as its own paragraph — the only text above the fold
- then 4–6 short paragraphs: mechanism, numbers, who said what, and the counterargument or what is unsettled
- named agencies and companies, not "officials"; dates when the story is time-sensitive
- ends with exactly `Read more at @theNYdailywatch 's bio.`
- then a final `Photo: …` credit line
- under 2,200 characters, no hashtags, no marketing words, no invented quotes

The caption box is editable — hand edits survive re-parsing of the JSON, and are only replaced when the JSON supplies a different caption.

## Output

- `<slug>-1-photo.png` — photo band, gold category tag, headline, subtitle
- `<slug>-2-dark.png` — eyebrow, gold heading, gold-dot bullet list

The photo is `cover`-cropped into a 1080×600 band; the **Vertical crop** slider moves the framing up or down without a trip back to Photoshop.

## Studio

[studio.html](studio.html) — linked from the header — holds the pieces that are not the standard two-card post. It shares the language setting with the main page, and `Ctrl+V` drops an image into whichever tab is open.

**Single card.** Either template on its own, each with its own prompt asking only for the fields that card uses — the photo card wants `category` / `headline` / `subtitle` / `date`, the bullet card wants `eyebrow` / `heading` / `bullets` / `date`. Neither prompt asks for a caption; use the main page when you need the whole post.

**Poster 9:16.** A new format: a full-bleed centre-cropped photo at 1080×1920, one bold Montserrat line across the top, the date bottom left and the logo bottom right.

```json
{ "slug": "two-earlier-ai-companies",
  "line": "Two earlier AI companies failed before this one.",
  "date": "August 3, 2026" }
```

The line starts at 82px and gives up size — down to 44px — to land on two lines rather than three, so a normal sentence sets the way the reference does. **Show safe-zone guides** paints red over the strips TikTok and Reels cover with their own caption, buttons and tabs: 250px off the top, 430px off the bottom, 180px off the right. The line and the badge row both sit inside that box, and the guides never appear in the exported PNG.

**Video.** Paste or drop several images, drag the thumbnails into order, and record a vertical slideshow — 30 seconds by default, split evenly across the slides, with a crossfade and a slow zoom on each. A 9:16 image fills the frame; anything else (a 1080×1350 card above all) is fitted inside the safe box over a blurred copy of itself. An **opening title** (2s: logo, wordmark, gold rule, date) and an **end card** (2.4s: logo, `READ MORE AT`, the handle, `LINK IN BIO`) are on by default and can be switched off.

Recording is wall-clock bound — a 30s video takes 30s, because MediaRecorder encodes in real time — so leave the tab in front while it runs. Output is MP4 (H.264) in Chrome, Edge and Safari; Firefox can only produce WebM, which TikTok accepts and Instagram may not.

## Running it locally

The page uses ES modules, so it has to be served over HTTP — double-clicking `index.html` hits the browser's file:// restrictions:

```bash
python -m http.server 8000
# open http://127.0.0.1:8000/
```

Clipboard copy needs https or localhost (a browser rule); it works on GitHub Pages. Downloads have no such restriction.

## Python CLI (optional)

For batch runs. Same layout, same output:

```bash
pip install playwright && playwright install chromium
python cards.py sample/story.json out/
```

Point the JSON's `photo` field at a local file for the cover image.

## Replacing the logo

The **Advanced → Replace logo** button only affects the current session. To change it for good:

```bash
python tools/embed_logo.py new-logo.png    # resizes to 320px, rewrites assets/logo.png and logo.js
```

## Design tokens

The two card renderers share one set of numbers — `T` in [assets/render.js](assets/render.js) and `T` in [cards.py](cards.py). Change a layout value in both. The poster keeps its own tokens (`P`) and the shared `SAFE` box in `render.js`; the slideshow compositor lives in [assets/video.js](assets/video.js) and imports that same `SAFE`.

1080×1350 canvas, 92px side margins, 600px photo band, 36px gap below it, 554px of usable body height (down to the date/logo band). Gold `#EFC050`, ink `#121212`, cream date `#EADFC2`. Playfair Display 700 for headlines, Montserrat 300/400 for body.

Fonts are self-hosted in `assets/fonts/` (Playfair Display and Montserrat, from fontsource) and the logo is inlined, so the page fetches nothing at runtime — no Google Fonts, no CDN.

## tools/

- `visual-check.html` — renders both cards from the sample and from a long-text stress case; use it to eyeball regressions after a layout change
- `dom-reference.html` — a DOM copy of `cards.py`, used to verify the canvas port matches the Playwright output
- `embed_logo.py` — regenerates the inlined logo

Both check pages take `?case=stress`.

---

# 中文说明

把一条新闻做成两张 1080×1350 的 Instagram 卡片（图片卡 + 深色要点卡），外加正文 caption，全部来自一次粘贴。

界面默认英文，右上角 **中文** 按钮切换，选择会被记住；也可以用 `?lang=zh` 直接指定。

## 页面

- [index.html](index.html)：整条帖子——两张卡片 + caption。
- [studio.html](studio.html)：工作台——单张卡片、9:16 竖版海报、视频。顶部按钮互相跳转，语言设置共用。

## 用法

1. **粘 JSON** —— 粘进左边的框，两张卡立刻更新，JSON 里的 `caption` 字段会被单独提取到卡片下方的框里。
2. **贴图** —— 在页面任意位置按 `Ctrl+V`（拖入或点击选择也行）。
3. **拿走** —— 「一键下载两张 PNG」、每张卡的「复制」按钮（可直接 `Ctrl+V` 贴进 Instagram 网页版）、以及「复制 caption」。

卡片文字会自动缩放换行；缩到最小字号仍塞不下时，卡片下方会用红字提示该缩短哪一段。caption 框实时显示字数（上限 2,200），并检查是否符合固定格式。

## 字段

见上方英文表格。`caption` 可以是字符串，也可以是段落数组。粘贴内容允许带 ` ```json ` 代码块标记或末尾多余逗号，会自动清掉。

「复制 AI 提示词」会复制一段提示词，要求模型按这套 JSON 输出（含 caption 写作规范）。把新闻原文贴在提示词下面，再把回复整段粘回来即可。

## 工作台三个功能

**单张卡片**：两个模板各自独立，提示词也各自独立，只问自己用得到的字段（图片卡要 `category`/`headline`/`subtitle`/`date`，要点卡要 `eyebrow`/`heading`/`bullets`/`date`）。这两个提示词不含 caption，需要整条帖子请回主页。

**竖版海报 9:16**：新版式。1080×1920 居中裁切满屏照片，顶部一行 Montserrat 粗体大字，日期左下、logo 右下。JSON 只要 `line` / `date` / `slug` 三个字段。文字从 82px 起，必要时降到 44px 以内，优先排成两行而不是三行。勾选「显示安全区参考线」会用红色标出 TikTok / Reels 会盖住的区域（上 250px、下 430px、右 180px），文字和日期 logo 都在安全区内，参考线不会导出到 PNG。

**视频**：粘贴或拖入多张图，拖动缩略图排序，导出竖版幻灯片视频。默认 30 秒平均分给每张，带交叉淡入和缓慢推镜。9:16 的图铺满整屏，其他比例（比如 1080×1350 的卡片）会放进安全区并用自身的模糊版本垫底。片头（2 秒：logo + 刊名 + 金线 + 日期）和片尾（2.4 秒：logo + READ MORE AT + 账号 + LINK IN BIO）默认开启，可以关掉。

录制按真实时间走——30 秒视频就要录 30 秒，因为 MediaRecorder 是实时编码——录制期间请保持本页在最前。Chrome / Edge / Safari 输出 MP4（H.264）；Firefox 只能输出 WebM，TikTok 收，Instagram 可能不收。

## caption 规范

提示词和页面检查都按这套走：开场句单独成段（首屏唯一可见的文字）→ 4–6 个短段落（机制、数字、谁说了什么、反方观点或尚未定论之处）→ 点名具体机构或公司而非「officials」→ 时效性新闻带日期 → 结尾固定一句 `Read more at @theNYdailywatch 's bio.` → 最后一行 `Photo: …`。全文 2,200 字符以内，不用 hashtag，不用营销词，不编造引语。

caption 框可以直接改；手改的内容不会被重新解析 JSON 覆盖，只有当 JSON 里的 caption 真的变了才会替换。

## 本地运行与版式参数

见上方英文章节。改版式时记住 `assets/render.js` 和 `cards.py` 两处的 `T` 要同步改。
