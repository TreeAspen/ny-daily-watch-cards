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

Both renderers share one set of numbers — `T` in [assets/render.js](assets/render.js) and `T` in [cards.py](cards.py). Change a layout value in both.

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

## 用法

1. **粘 JSON** —— 粘进左边的框，两张卡立刻更新，JSON 里的 `caption` 字段会被单独提取到卡片下方的框里。
2. **贴图** —— 在页面任意位置按 `Ctrl+V`（拖入或点击选择也行）。
3. **拿走** —— 「一键下载两张 PNG」、每张卡的「复制」按钮（可直接 `Ctrl+V` 贴进 Instagram 网页版）、以及「复制 caption」。

卡片文字会自动缩放换行；缩到最小字号仍塞不下时，卡片下方会用红字提示该缩短哪一段。caption 框实时显示字数（上限 2,200），并检查是否符合固定格式。

## 字段

见上方英文表格。`caption` 可以是字符串，也可以是段落数组。粘贴内容允许带 ` ```json ` 代码块标记或末尾多余逗号，会自动清掉。

「复制 AI 提示词」会复制一段提示词，要求模型按这套 JSON 输出（含 caption 写作规范）。把新闻原文贴在提示词下面，再把回复整段粘回来即可。

## caption 规范

提示词和页面检查都按这套走：开场句单独成段（首屏唯一可见的文字）→ 4–6 个短段落（机制、数字、谁说了什么、反方观点或尚未定论之处）→ 点名具体机构或公司而非「officials」→ 时效性新闻带日期 → 结尾固定一句 `Read more at @theNYdailywatch 's bio.` → 最后一行 `Photo: …`。全文 2,200 字符以内，不用 hashtag，不用营销词，不编造引语。

caption 框可以直接改；手改的内容不会被重新解析 JSON 覆盖，只有当 JSON 里的 caption 真的变了才会替换。

## 本地运行与版式参数

见上方英文章节。改版式时记住 `assets/render.js` 和 `cards.py` 两处的 `T` 要同步改。
