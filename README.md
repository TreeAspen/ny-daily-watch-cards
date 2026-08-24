# NY Daily Watch · Instagram Card Generator

Turns one news story into two 1080×1350 Instagram cards — a photo card and a dark bullet card — plus the post caption, from a single paste. A studio page adds single cards, a full-bleed poster, charts and a vertical video cut.

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

**Poster.** A full-bleed centre-cropped photo with one bold Montserrat line across the top, the date bottom left and the logo bottom right — at 9:16 (1080×1920), 4:5 (1080×1350) or 16:9 (1920×1080).

```json
{ "slug": "two-earlier-ai-companies",
  "line": "Two earlier AI companies failed before this one.",
  "date": "August 3, 2026" }
```

The line starts at 82px and gives up size — down to 44px — to land on two lines rather than three, so a normal sentence sets the way the reference does. **Show safe-zone guides** paints red over the strips TikTok and Reels cover with their own caption, buttons and tabs: 250px off the top, 430px off the bottom, 180px off the right. The line and the badge row both sit inside that box, and the guides never appear in the exported PNG.

**Charts.** Numbers from the story as an image, at 4:5, 9:16 or 16:9. Seven forms — columns, bars, line, area, scatter, donut, and a stat tile for when the story is a single number — each labelled in the picker with the job it does.

```json
{ "type": "bar",
  "title": "America's polysilicon capacity collapsed",
  "subtitle": "US share of world polysilicon capacity",
  "unit": "%",
  "categories": ["2005", "2010", "2015", "2020", "2024"],
  "series": [{ "name": "US share", "values": [50, 34, 12, 4, 1.8] }],
  "source": "Source: Commerce Department" }
```

`emphasis` takes the index of the one series that matters and greys the rest; `points` replaces categories/series for a scatter; `value` / `delta` / `label` / `body` replace them for a stat — `body` being the two or three sentences that read the number, without which the frame is mostly empty and the tile warns you about it. `xLabel` and `yLabel` are both set horizontally, so nothing has to be read sideways.

Because the output is a still, there is no tooltip to fall back on — every value has to be on the image. Value labels are therefore on by default, only the last point of a line is labelled, and only the extremes of a scatter are named.

**The palette** is six colours in a fixed order, the first being a brand gold. It was chosen by searching orderings and running Anthropic's data-viz validator against the ink surface, which measures how far apart colourblind readers see each neighbouring pair: worst adjacent CVD ΔE 14.8, worst adjacent normal-vision ΔE 19.7, every slot inside the dark lightness band and over 3:1 contrast, and the first three clearing the all-pairs gate that scatter needs. Colours you add or edit are checked by the same code — [assets/validate_palette.js](assets/validate_palette.js) is that validator, vendored — and the panel says in plain words what a reader would struggle with. Past the sixth slot extra series go grey rather than repeat a hue, since a repeated colour claims two series are one.

**Video.** Paste or drop images **and MP4/MOV clips**, drag the thumbnails into order, type a subtitle under any of them, and record a vertical slideshow — 30 seconds by default, split evenly across the slides. **Motion** sets what each slide does: still, push in, pull out, alternating (the default — a long reel stops feeling like one repeated move), or a slow upward drift. It is a rate, not a distance: a slide twice as long travels twice as far rather than moving half as fast, which is what kept frames from repeating. Footage is left alone — it moves on its own, and a slow zoom over it only fights the shot. **Transition** sets the handover: crossfade, hard cut, through black, or push up. An **opening title** (2s: logo, wordmark, gold rule, date) and an **end card** (2.4s: logo, `READ MORE AT`, the handle, `LINK IN BIO`) are on by default and can be switched off.

Every slide runs the full width of the frame — never pillarboxed. A 9:16 still fills the height too; anything shorter keeps its full width and leaves blurred bands above and below, sitting a little high in the frame so the app's own caption covers blur rather than picture.

A **clip** takes the same slot as any still and plays at its own speed inside it, looping if it is shorter than the slot and cut off if it is longer — so set the total seconds against the footage you have.

Past a minute, that arithmetic stops making sense: a clip that long is not an illustration of the story, it is the story, and trimming it to a 30-second setting would throw most of it away. So once any clip runs **a minute or more the cut fits itself to the footage** — every clip plays in full at its own length, a still holds 5s, and the running time becomes the sum of those plus the opening title and end card. The seconds field locks and shows the computed total. Its sound is recorded too, unless **Keep clip audio** is off; stills are silent either way. Only formats the browser itself can play are accepted, which in practice means MP4 (H.264) and MOV.

Nothing is uploaded — the file never leaves the page — but opening and decoding a long clip is a visible wait, so a bar under the drop zone reports it. It advances on the steps the file actually goes through (opening, metadata, buffered fraction, first frame, thumbnail) across the whole batch, rather than a timer pretending to be progress.

**Subtitles** are typed under each thumbnail, **one line per cue**, and burned into the frame in Montserrat bold, each line on its own backing pill — over footage nobody controls, a scrim is a guess and a pill is a guarantee. A slide with several cues shows them in turn across its slot, sharing the time out by length so a long line gets longer to be read, with a floor of 1.2s so a short one never flashes past; the strip reports the count and the shortest span, in red if the floor could not be met. Cues hard-cut into each other, because two pill-backed lines crossfading would just stack two dark boxes. They hold one fixed position for the whole cut rather than moving with the picture, which also means a subtitle on a full card slide lands over the card's own footer: put subtitles on photos and clips.

The export takes its **frame rate from the footage** — the longest clip sets it, a still-only reel stays at 30 — so 24, 25, 30 and 60fps sources all map one source frame to one output frame instead of being resampled onto a grid that does not divide evenly. Each clip's own rate is measured as it comes in, and every frame is sampled 30% of the way into the source frame rather than at its edge or its middle — a source frame's real boundary sits a little later than its nominal time, so the middle tips into the next frame once a second on 25fps footage. Sweeping that offset against clips of known rate, 0.2–0.35 hits every frame at 24, 25, 30, 50 and 60fps. End to end, repeated frames went from 17.5 / 15 / 30.8 / 0 per cent (24 / 25 / 30 / 60fps) to 1.1 / 0 / 0 / 0.5.

Export composes every frame deliberately and hands it to a WebCodecs encoder — [assets/export.js](assets/export.js), muxed with the vendored [mp4-muxer](assets/mp4-muxer.mjs) (MIT). Nothing is filmed off a clock, so a backgrounded tab cannot drop frames, and the export usually finishes in less time than the video runs (a 30s cut measured 21s of stills, 27s with a clip, in software rendering with no GPU). The clip audio for the whole timeline is rendered in one offline pass and encoded as AAC alongside.

Where a browser has no frame-by-frame encoder the old real-time capture still runs as a fallback, and there the tab does have to stay in front. **Cancel** aborts either one and writes nothing. Output is MP4 (H.264) in Chrome, Edge and Safari; Firefox falls back and can only produce WebM, which TikTok accepts and Instagram may not.

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

The two card renderers share one set of numbers — `T` in [assets/render.js](assets/render.js) and `T` in [cards.py](cards.py). Change a layout value in both. The poster keeps its own tokens (`P`) and the shared `SAFE` box in `render.js`; the slideshow compositor lives in [assets/video.js](assets/video.js) and imports that same `SAFE`; charts keep their own tokens and the validated palette in [assets/chart.js](assets/chart.js).

1080×1350 canvas, 92px side margins, 600px photo band, 36px gap below it, 554px of usable body height (down to the date/logo band). Gold `#EFC050`, ink `#121212`, cream date `#EADFC2`. Playfair Display 700 for headlines, Montserrat 300/400 for body.

Fonts are self-hosted in `assets/fonts/` (Playfair Display and Montserrat, from fontsource) and the logo is inlined, so the page fetches nothing at runtime — no Google Fonts, no CDN.

## tools/

- `visual-check.html` — renders both cards from the sample and from a long-text stress case; use it to eyeball regressions after a layout change
- `dom-reference.html` — a DOM copy of `cards.py`, used to verify the canvas port matches the Playwright output
- `embed_logo.py` — regenerates the inlined logo

[guide.html](guide.html) is the illustrated manual: every picture on it is drawn at page load by the same renderers the tool uses, so it cannot fall out of step with the output.

Both check pages take `?case=stress`.

---

# 中文说明

把一条新闻做成两张 1080×1350 的 Instagram 卡片（图片卡 + 深色要点卡），外加正文 caption，全部来自一次粘贴。

界面默认英文，右上角 **中文** 按钮切换，选择会被记住；也可以用 `?lang=zh` 直接指定。

## 页面

- [index.html](index.html)：整条帖子——两张卡片 + caption。
- [studio.html](studio.html)：工作台——单张卡片、海报、数据图表、视频。
- [guide.html](guide.html)：带插图的使用说明，插图是用工具本身的代码现画的。

顶部按钮互相跳转，语言设置三个页面共用。

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

**海报**：居中裁切的满屏照片，顶部一行 Montserrat 粗体大字，日期左下、logo 右下；可选 9:16（1080×1920）、4:5（1080×1350）、16:9（1920×1080）。JSON 只要 `line` / `date` / `slug` 三个字段。文字从 82px 起，必要时降到 44px 以内，优先排成两行而不是三行。勾选「显示安全区参考线」会用红色标出 TikTok / Reels 会盖住的区域（上 250px、下 430px、右 180px），文字和日期 logo 都在安全区内，参考线不会导出到 PNG。

**图表**：把新闻里的数字做成图，可选 4:5 / 9:16 / 16:9。七种图形——柱状、条形、折线、面积、散点、环形，以及「数字卡」（故事本身就是一个数字时用它）——下拉框里每一项都写清楚了它适合干什么。

```json
{ "type": "bar",
  "title": "America's polysilicon capacity collapsed",
  "subtitle": "US share of world polysilicon capacity",
  "unit": "%",
  "categories": ["2005", "2010", "2015", "2020", "2024"],
  "series": [{ "name": "US share", "values": [50, 34, 12, 4, 1.8] }],
  "source": "Source: Commerce Department" }
```

`emphasis` 填要强调的系列序号，其余画成灰色；散点图用 `points` 代替 categories/series；数字卡用 `value` / `delta` / `label` / `body`——`body` 是解析这个数字的两三句话，不写的话画面大半是空的，卡片下方也会提示你补上。`xLabel` 和 `yLabel` 都是横排的，不用歪头看。

因为输出是静态图，没有鼠标悬停可以兜底——每个数都必须印在图上。所以数值标签默认开启，折线只标最后一个点，散点只标极值点。

**配色**是六个固定顺序的颜色，第一个是品牌金。这个顺序是穷举排列后用 Anthropic 数据可视化规范里的验证器在深色底上逐项检查选出来的：最差相邻对色盲 ΔE 14.8、常视 ΔE 19.7，六个颜色全部落在深色明度区间内且对比度超过 3:1，前三个还通过了散点图需要的全对检查。你自己加或改的颜色会用同一份代码检查——[assets/validate_palette.js](assets/validate_palette.js) 就是那个验证器（已随项目一起收录）——面板会用大白话告诉你读者会在哪里读不出来。超过第六个之后，多出来的系列会变灰而不是重复用色，因为重复的颜色等于在说这两个系列是同一个。

**视频**：粘贴或拖入图片**以及 MP4 / MOV 视频片段**，拖动缩略图排序，可以在每张下面写字幕，导出竖版幻灯片视频。默认 30 秒平均分给每张。「画面动效」选每张图自己怎么动：静止、缓慢推近、缓慢拉远、推近/拉远交替（默认，多张连播不会显得一直在重复同一个动作）、缓慢上移。它是一个**速率**而不是固定行程：时段长一倍的素材走的距离也长一倍，而不是把速度放慢一半——这正是之前出现重复帧的原因。视频片段不加动效，它本身就在动，再叠一层推镜只会和镜头本身打架。「转场」选两张之间怎么切：交叉淡入、硬切、黑场过渡、向上推移。片头（2 秒：logo + 刊名 + 金线 + 日期）和片尾（2.4 秒：logo + READ MORE AT + 账号 + LINK IN BIO）默认开启，可以关掉。

每张素材都横向满屏，两侧不留黑边。9:16 的图连高度一起铺满；比例更矮的保持满宽，只在上下留模糊填充，并且整体略微上移，让平台的文案盖住模糊带而不是画面本身。

**视频片段**和静态图分到同样长的时段，在这个时段里按自己的速度播放：短了自动循环，长了会被截断——所以总秒数要按手里的素材来设。

超过一分钟就不该这么算了：这么长的片段不是给报道配的插图，它本身就是报道，硬塞进 30 秒的设定等于把大部分内容扔掉。所以只要素材里有**一分钟及以上的片段，整条片子就改为按素材自适应**——每段视频都按自身长度完整播放，静态图各占 5 秒，总长就是它们加上片头和片尾。此时秒数输入框会锁定并显示算好的总时长。片段的原声也会录进去，除非关掉「保留片段原声」；静态图本来就没有声音。只接受浏览器自己能播放的格式，实际上就是 MP4（H.264）和 MOV。

文件不会上传到任何地方——始终留在页面里——但打开和解码长片段是一段看得见的等待，所以投放区下面有一条进度条。它按文件真实经过的步骤推进（打开、读元数据、已缓冲比例、第一帧、缩略图），整批文件共用一条进度，而不是拿计时器假装成进度。

**字幕**在每张缩略图下面直接输入，**每行一条**，用 Montserrat 粗体烧录进画面，每行带一块深色底——素材千变万化，渐变遮罩只是猜测，底块才是保证。一张素材写多条时，它们会在这张的时段里依次出现，时间按字数分配（长句读起来慢，就给它更长），每条至少 1.2 秒，短句不会一闪而过；缩略图下面会显示条数和最短那条的秒数，凑不够 1.2 秒时标红。条与条之间是硬切，因为两块半透明底叠在一起只会更糊。字幕位置全片固定，不会跟着画面跳动；也因此，给整张卡片配字幕会压到卡片自己的页脚，字幕更适合配照片和视频片段。

导出的**帧率跟随素材**——由最长的那段片段决定，纯静态图仍是 30fps——所以 24 / 25 / 30 / 60fps 的片源都是一帧对一帧，而不是重采样到一个除不尽的网格上。每段片段进来时会实测自己的帧率，取帧位置落在源帧的 30% 处——既不是边界也不是正中：源帧的实际边界比标称时间略晚，取正中会在 25fps 素材上每秒越界一次。对已知帧率的测试片扫描这个偏移，0.2–0.35 在 24 / 25 / 30 / 50 / 60fps 下都能逐帧命中。端到端实测，重复帧从 17.5 / 15 / 30.8 / 0 %（24 / 25 / 30 / 60fps）降到 1.1 / 0 / 0 / 0.5 %。

导出是把每一帧单独画好、交给 WebCodecs 编码器——见 [assets/export.js](assets/export.js)，用随项目收录的 [mp4-muxer](assets/mp4-muxer.mjs)（MIT）封装。全程不看墙钟，所以切到后台也不会掉帧，而且通常比片长更快完成（无 GPU 的软件渲染下实测：30 秒的纯静态图片子用 21 秒，带视频片段用 27 秒）。片段的音频会先离线渲染成整条时间轴的一条音轨，再按 AAC 编码一起封装。

浏览器不支持逐帧编码时，会退回原来的实时录制，那种情况下才需要保持本页在最前。中途点「取消」两种方式都会立即中断且不产出文件。Chrome / Edge / Safari 输出 MP4（H.264）；Firefox 会退回并只能输出 WebM，TikTok 收，Instagram 可能不收。

## caption 规范

提示词和页面检查都按这套走：开场句单独成段（首屏唯一可见的文字）→ 4–6 个短段落（机制、数字、谁说了什么、反方观点或尚未定论之处）→ 点名具体机构或公司而非「officials」→ 时效性新闻带日期 → 结尾固定一句 `Read more at @theNYdailywatch 's bio.` → 最后一行 `Photo: …`。全文 2,200 字符以内，不用 hashtag，不用营销词，不编造引语。

caption 框可以直接改；手改的内容不会被重新解析 JSON 覆盖，只有当 JSON 里的 caption 真的变了才会替换。

## 本地运行与版式参数

见上方英文章节。改版式时记住 `assets/render.js` 和 `cards.py` 两处的 `T` 要同步改。
