#!/usr/bin/env python3
"""
NY Daily Watch - Instagram card renderer (CLI)

    python cards.py sample/story.json [outdir]

Produces <slug>-1-photo.png and <slug>-2-dark.png at 1080x1350.

The browser tool (index.html) is the everyday path; this stays for batch runs.
Needs: pip install playwright && playwright install chromium
"""
import json, sys, os, re, base64
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
LOCAL_FONTS = ROOT / "assets" / "fonts"
# Fall back to the @fontsource layout used inside the Claude sandbox.
SANDBOX = Path("/home/claude/node_modules/@fontsource")

DEFAULT_LOGO = ROOT / "assets" / "logo.png"


def font_file(name):
    """name like 'playfair-display-latin-700-normal.woff2'"""
    local = LOCAL_FONTS / name
    if local.exists():
        return local
    family = "playfair-display" if name.startswith("playfair") else "montserrat"
    return SANDBOX / family / "files" / name


def b64(p):
    return base64.b64encode(Path(p).read_bytes()).decode()


def face(family, weight, name):
    return (f"@font-face{{font-family:'{family}';font-weight:{weight};font-style:normal;"
            f"src:url(data:font/woff2;base64,{b64(font_file(name))}) format('woff2');}}")


FONT_CSS = "".join([
    face("Playfair Display", 700, "playfair-display-latin-700-normal.woff2"),
    face("Playfair Display", 400, "playfair-display-latin-400-normal.woff2"),
    face("Montserrat", 300, "montserrat-latin-300-normal.woff2"),
    face("Montserrat", 400, "montserrat-latin-400-normal.woff2"),
    face("Montserrat", 600, "montserrat-latin-600-normal.woff2"),
    face("Montserrat", 700, "montserrat-latin-700-normal.woff2"),
])

# ---- design tokens -------------------------------------------------
T = {
    "W": 1080, "H": 1350,
    "margin": 92,
    "ink": "#121212",
    "gold": "#EFC050",
    "white": "#FFFFFF",
    "cream": "#EADFC2",
    "photo_h": 600,          # photo band height on card one
    "photo_gap": 36,         # gap between photo band and headline
    "date_size": 34,         # bottom-left date, both cards
    "bullet_ratio": 0.82,    # bullet size = ratio x gold heading size
    "logo": 107,
    # card one
    "tag_size": 21, "tag_h": 50,
    "hed_size": 84, "hed_lh": 1.30, "hed_min": 52,
    "sub_size": 46, "sub_lh": 1.34, "sub_min": 30,
    # card two
    "eyebrow_size": 28, "eyebrow_track": "0.02em",
    "head_size": 78, "head_min": 52,
    "bullet_size": None, "bullet_lh": 1.33, "bullet_min": 38,
    "bullet_gap": 40, "head_gap": 64, "max_lines": 4, "bullet_dot": 24, "bullet_indent": 16,
}

T["bullet_size"] = round(T["head_size"] * T["bullet_ratio"])

BASE = f"""
{FONT_CSS}
*{{margin:0;padding:0;box-sizing:border-box;}}
body{{width:{T['W']}px;height:{T['H']}px;background:{T['ink']};overflow:hidden;
  -webkit-font-smoothing:antialiased;}}
.card{{position:relative;width:{T['W']}px;height:{T['H']}px;}}
.date{{position:absolute;left:{T['margin']}px;bottom:66px;
  font:400 {T['date_size']}px/1 'Playfair Display';color:{T['cream']};}}
.logo{{position:absolute;right:34px;bottom:44px;width:{T['logo']}px;height:{T['logo']}px;
  border-radius:50%;object-fit:contain;}}
"""


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def img_src(path):
    if not path or not os.path.exists(path):
        return None
    ext = Path(path).suffix.lstrip(".").lower()
    mime = "jpeg" if ext in ("jpg", "jpeg") else ext
    return f"data:image/{mime};base64,{b64(path)}"


def footer_tags(d):
    out = ""
    date = d.get("date") or d.get("footer")
    if date:
        out += f'<div class="date">{esc(date)}</div>'
    src = img_src(d.get("logo") or DEFAULT_LOGO)
    if src:
        out += f'<img class="logo" src="{src}">'
    return out


# ---- card one : photo ----------------------------------------------
def card_photo(d):
    photo = img_src(d.get("photo"))
    bg = (f'<img src="{photo}" style="width:100%;height:100%;object-fit:cover">'
          if photo else '<div style="width:100%;height:100%;background:#D7D7D7"></div>')
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>{BASE}
.photo{{position:absolute;top:0;left:0;width:{T['W']}px;height:{T['photo_h']}px;overflow:hidden;}}
.tag{{position:absolute;top:38px;left:0;height:{T['tag_h']}px;background:{T['gold']};
  display:flex;align-items:center;padding:0 28px 0 {T['margin']}px;
  font:700 {T['tag_size']}px/1 'Montserrat';color:#fff;letter-spacing:.02em;}}
.body{{position:absolute;top:{T['photo_h']+T['photo_gap']}px;left:0;width:{T['W']}px;
  height:{T['H']-T['photo_h']-T['photo_gap']-160}px;padding:0 {T['margin']}px;}}
.hed{{font-family:'Playfair Display';font-weight:700;color:{T['gold']};
  font-size:{T['hed_size']}px;line-height:{T['hed_lh']};}}
.sub{{font-family:'Montserrat';font-weight:400;color:{T['white']};
  font-size:{T['sub_size']}px;line-height:{T['sub_lh']};margin-top:34px;}}
</style></head><body><div class="card">
<div class="photo">{bg}</div>
<div class="tag">{esc(d['category'])}</div>
<div class="body">
  <div class="hed" id="hed">{esc(d['headline'])}</div>
  <div class="sub" id="sub">{esc(d['subtitle'])}</div>
</div>
{footer_tags(d)}</div></body></html>"""


# ---- card two : dark -----------------------------------------------
def card_dark(d):
    items = "".join(
        f'<li><span class="dot"></span><span class="txt">{esc(b)}</span></li>'
        for b in d["bullets"])
    footer = ""
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>{BASE}
.wrap{{position:absolute;top:69px;left:{T['margin']}px;
  width:{T['W']-2*T['margin']}px;}}
.eyebrow{{font:400 {T['eyebrow_size']}px/1 'Montserrat';color:#EFEAE0;
  letter-spacing:{T['eyebrow_track']};}}
.head{{font-family:'Playfair Display';font-weight:700;color:{T['gold']};
  font-size:{T['head_size']}px;line-height:1.12;margin-top:22px;}}
ul{{list-style:none;position:absolute;left:0;
  width:{T['W']-2*T['margin']}px;
  display:flex;flex-direction:column;justify-content:flex-start;}}
li{{display:flex;align-items:flex-start;margin-bottom:{T['bullet_gap']}px;}}
.wrap{{height:{T['H']}px;}}
li:last-child{{margin-bottom:0;}}
.dot{{flex:0 0 {T['bullet_dot']}px;width:{T['bullet_dot']}px;height:{T['bullet_dot']}px;
  border-radius:50%;background:{T['gold']};
  margin-right:{T['bullet_indent']}px;}}
.dot{{font-size:{T['bullet_size']}px;margin-top:calc(({T['bullet_lh']}em - {T['bullet_dot']}px) / 2);}}
.txt{{font-family:'Montserrat';font-weight:300;color:{T['white']};
  font-size:{T['bullet_size']}px;line-height:{T['bullet_lh']};}}

</style></head><body><div class="card">
<div class="wrap">
  <div class="eyebrow">{esc(d['eyebrow'])}</div>
  <div class="head" id="head">{esc(d.get('heading','Three things to know'))}</div>
  <ul id="list">{items}</ul>
</div>
{footer}{footer_tags(d)}</div></body></html>"""


# ---- autofit -------------------------------------------------------
FIT_ONE = """
(function(){
  const box = %d, minH = %d, minS = %d;
  const body = document.querySelector('.body');
  const content = () => [...body.children].reduce(
      (a,el)=>a+el.getBoundingClientRect().height+parseFloat(getComputedStyle(el).marginTop),0);
  const lines = (el) => Math.round(el.getBoundingClientRect().height /
                                   parseFloat(getComputedStyle(el).lineHeight));
  function shrink(el, min){
    let s = parseFloat(getComputedStyle(el).fontSize);
    while (s > min && content() > box) { s -= 1; el.style.fontSize = s + 'px'; }
    return s;
  }
  // The largest size that fits often leaves one orphan word on a last line;
  // a couple of px less usually buys back a whole line.
  function tighten(el, min, window){
    const start = parseFloat(getComputedStyle(el).fontSize), base = lines(el);
    for (let s = start - 1; s >= Math.max(min, start - window); s--) {
      el.style.fontSize = s + 'px';
      if (content() <= box && lines(el) < base) return s;
    }
    el.style.fontSize = start + 'px';
    return start;
  }
  const hed = document.getElementById('hed'), sub = document.getElementById('sub');
  shrink(hed, minH); shrink(sub, minS);
  const h = tighten(hed, minH, 10), s = tighten(sub, minS, 6);
  return {headline: h, subtitle: s, overflow: content() > box};
})()
"""

FIT_TWO = """
(function(){
  const minB = %d, minH = %d, maxLines = %d;
  const head = document.getElementById('head');
  let hs = parseFloat(getComputedStyle(head).fontSize);
  while (hs > minH && head.scrollHeight > 190) { hs -= 1; head.style.fontSize = hs+'px'; }

  const ul = document.getElementById('list');
  const wrapTop = ul.offsetParent.getBoundingClientRect().top;
  const top = head.getBoundingClientRect().bottom - wrapTop + %d;
  ul.style.top = top + 'px';
  ul.style.height = (%d - wrapTop - top) + 'px';
  const txts = [...document.querySelectorAll('.txt')];
  const lh = parseFloat(getComputedStyle(txts[0]).lineHeight);
  let bs = parseFloat(getComputedStyle(txts[0]).fontSize);

  function lines(t){
    const r = parseFloat(getComputedStyle(t).lineHeight);
    return Math.round(t.getBoundingClientRect().height / r);
  }
  function bad(){
    if (ul.scrollHeight > ul.clientHeight) return true;
    return txts.some(t => lines(t) > maxLines);
  }
  while (bs > minB && bad()) {
    bs -= 1; txts.forEach(t => t.style.fontSize = bs + 'px');
  }
  const items = [...ul.children];
  items.forEach(li => li.style.marginBottom = '0px');
  const content = items.reduce((a,li)=>a+li.getBoundingClientRect().height,0);
  const gap = Math.min(%d, Math.max(28, (ul.clientHeight-content)/(items.length-1)));
  items.forEach((li,i)=> li.style.marginBottom = (i<items.length-1? gap:0)+'px');
  return {heading: hs, bullets: bs, overflow: bad(), gap: gap,
          longest: Math.max(...txts.map(lines))};
})()
"""


def render(html, out, fit_js):
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": T["W"], "height": T["H"]},
                        device_scale_factor=1)
        pg.set_content(html)
        pg.wait_for_timeout(250)
        info = pg.evaluate(fit_js)
        pg.wait_for_timeout(80)
        pg.screenshot(path=out)
        b.close()
    return info


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:48] or "card"


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: cards.py story.json [outdir]")
    d = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    outdir = Path(sys.argv[2] if len(sys.argv) > 2 else ROOT / "out")
    outdir.mkdir(parents=True, exist_ok=True)
    slug = d.get("slug") or slugify(d["headline"])

    # Fit into the real column (down to the date/logo band), not the whole card.
    box_one = T["H"] - T["photo_h"] - T["photo_gap"] - 160
    p1 = outdir / f"{slug}-1-photo.png"
    i1 = render(card_photo(d), str(p1),
                FIT_ONE % (box_one, T["hed_min"], T["sub_min"]))

    p2 = outdir / f"{slug}-2-dark.png"
    i2 = render(card_dark(d), str(p2),
                FIT_TWO % (T["bullet_min"], T["head_min"], T["max_lines"],
                           T["head_gap"], T["H"] - 215, T["bullet_gap"]))

    print(f"{p1}\n  headline {i1['headline']:.0f}px  subtitle {i1['subtitle']:.0f}px")
    print(f"{p2}\n  heading {i2['heading']:.0f}px  bullets {i2['bullets']:.0f}px")
    if i1["overflow"]:
        print("  !! photo card overflows at minimum size - shorten headline/subtitle")
    if i2["overflow"]:
        print(f"  !! dark card: a bullet still runs {i2['longest']} lines - shorten it")


if __name__ == "__main__":
    main()
