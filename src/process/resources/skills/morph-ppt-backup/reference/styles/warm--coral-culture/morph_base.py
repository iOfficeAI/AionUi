"""
morph_base.py — Shared helpers for all morph-template build scripts.
Import this from v6_build.py, v7_build.py, etc.
"""
import subprocess, json, sys, os

OCLI = r"C:\Users\Jiang\AppData\Local\OfficeCli\officecli.exe"
EMU  = 360000  # 1 cm = 360,000 EMU

SUBPROCESS_TEXT = {
    "capture_output": True,
    "text": True,
    "encoding": "utf-8",
    "errors": "replace",
}

def cmd(deck, *args):
    r = subprocess.run([OCLI] + list(args), **SUBPROCESS_TEXT)
    tag = ' '.join(list(args)[:3])
    if r.returncode != 0:
        print(f"  ERR [{tag}]: {r.stderr.strip()[:300]}", file=sys.stderr)
    else:
        print(f"  OK  [{tag}]")
    return r

def ocmd(*args):
    """Run officecli with any args (deck embedded in args)."""
    r = subprocess.run([OCLI] + list(args), **SUBPROCESS_TEXT)
    tag = ' '.join(str(a) for a in args[:4])
    if r.returncode != 0:
        print(f"  ERR [{tag}]: {r.stderr.strip()[:300]}", file=sys.stderr)
    else:
        print(f"  OK  [{tag}]")
    return r

def batch(deck, ops):
    r = subprocess.run([OCLI, "batch", deck], input=json.dumps(ops),
                       **SUBPROCESS_TEXT)
    if r.returncode != 0:
        print(f"  BATCH ERR ({len(ops)} ops):\n{r.stderr.strip()[:500]}", file=sys.stderr)
    else:
        print(f"  BATCH OK  ({len(ops)} ops)")
    return r

def s(slide, **kw):
    return {"command": "add", "parent": f"/slide[{slide}]", "type": "shape",
            "props": {k: str(v) for k, v in kw.items()}}

def t(slide, text, x, y, w, h, font, size, color, bold=False, **kw):
    p = dict(text=text, font=font, size=str(size), color=color, fill="none",
             x=x, y=y, width=w, height=h)
    if bold:
        p["bold"] = "true"
    p.update({k: str(v) for k, v in kw.items()})
    return {"command": "add", "parent": f"/slide[{slide}]", "type": "shape", "props": p}

def raw_geom(deck, slide, name, xml):
    """Replace prstGeom with custGeom XML via raw-set."""
    xpath = f"//p:sp[p:nvSpPr/p:cNvPr[@name='{name}']]/p:spPr/a:prstGeom"
    r = subprocess.run(
        [OCLI, "raw-set", deck, f"/slide[{slide}]",
         "--xpath", xpath, "--action", "replace", "--xml", xml],
        **SUBPROCESS_TEXT)
    if r.returncode != 0:
        print(f"  RAW ERR [{name}@{slide}]: {r.stderr.strip()[:300]}", file=sys.stderr)
    else:
        print(f"  RAW OK  [{name}@slide{slide}]")
    return r

def chamfer_xml(w_cm, h_cm, c_cm=0.8):
    """Chamfered rectangle: top-right corner cut. c_cm = chamfer size."""
    W = round(w_cm * EMU); H = round(h_cm * EMU); C = round(c_cm * EMU)
    pts = (f'<a:moveTo><a:pt x="0" y="0"/></a:moveTo>'
           f'<a:lnTo><a:pt x="{W-C}" y="0"/></a:lnTo>'
           f'<a:lnTo><a:pt x="{W}" y="{C}"/></a:lnTo>'
           f'<a:lnTo><a:pt x="{W}" y="{H}"/></a:lnTo>'
           f'<a:lnTo><a:pt x="0" y="{H}"/></a:lnTo>'
           f'<a:close/>')
    return (f'<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/>'
            f'<a:rect l="0" t="0" r="r" b="b"/>'
            f'<a:pathLst><a:path w="{W}" h="{H}">{pts}</a:path></a:pathLst>'
            f'</a:custGeom>')

def trapezoid_xml(w_cm, h_cm, tan=0.7, is_para=False):
    """Right-trapezoid or parallelogram."""
    W = round(w_cm * EMU); H = round(h_cm * EMU)
    off = min(round(tan * h_cm * EMU), W - 10)
    if is_para:
        pts = (f'<a:moveTo><a:pt x="{off}" y="0"/></a:moveTo>'
               f'<a:lnTo><a:pt x="{W}" y="0"/></a:lnTo>'
               f'<a:lnTo><a:pt x="{W-off}" y="{H}"/></a:lnTo>'
               f'<a:lnTo><a:pt x="0" y="{H}"/></a:lnTo>'
               f'<a:close/>')
    else:
        pts = (f'<a:moveTo><a:pt x="0" y="0"/></a:moveTo>'
               f'<a:lnTo><a:pt x="{W}" y="0"/></a:lnTo>'
               f'<a:lnTo><a:pt x="{W-off}" y="{H}"/></a:lnTo>'
               f'<a:lnTo><a:pt x="0" y="{H}"/></a:lnTo>'
               f'<a:close/>')
    return (f'<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/>'
            f'<a:rect l="0" t="0" r="r" b="b"/>'
            f'<a:pathLst><a:path w="{W}" h="{H}">{pts}</a:path></a:pathLst>'
            f'</a:custGeom>')

# ── Theme → Font mapping ──────────────────────────────────────────────────────
# Usage: fonts = get_fonts("bold_geometric")  →  fonts.title / fonts.body / fonts.mono
# lang: "en" / "zh" / "bilingual"
class FontSet:
    def __init__(self, title, body, mono=None, accent=None):
        self.title  = title
        self.body   = body
        self.mono   = mono   or "Courier New"
        self.accent = accent or title

THEME_FONTS = {
    # ── Modern tech / SaaS / bento ───────────────────────────────────────────
    "tech":            FontSet("Outfit",            "Inter"),
    "tech_zh":         FontSet("HarmonyOS Sans",    "思源黑体 Regular"),
    # ── Bold geometric / Bauhaus / brutalist ─────────────────────────────────
    "bold_geometric":  FontSet("Bebas Neue",        "Barlow"),
    "bold_geometric_zh": FontSet("演示斜黑体",       "思源黑体 Regular"),
    # ── Aurora dark / creative portfolio ─────────────────────────────────────
    "aurora":          FontSet("Space Grotesk",     "DM Sans"),
    "aurora_zh":       FontSet("阿里巴巴普惠体 Bold", "思源黑体 Regular"),
    # ── Warm editorial / coaching / lifestyle ────────────────────────────────
    "warm":            FontSet("Playfair Display",  "Lora"),
    "warm_zh":         FontSet("思源宋体 Heavy",     "霞鹜文楷"),
    # ── Edu / soft / friendly ────────────────────────────────────────────────
    "edu":             FontSet("Nunito",            "Inter"),
    "edu_zh":          FontSet("站酷酷黑",           "阿里巴巴普惠体"),
    # ── Data / infographic / editorial ───────────────────────────────────────
    "data":            FontSet("Segoe UI Black",    "Segoe UI"),
    "data_zh":         FontSet("思源黑体 Heavy",     "思源黑体 Regular"),
    # ── Luxury / high-end / minimal ──────────────────────────────────────────
    "luxury":          FontSet("Cormorant Garamond","Montserrat Light"),
    "luxury_zh":       FontSet("方正兰亭超细黑",     "方正兰亭纤黑"),
    # ── Acid / zine / high-contrast ──────────────────────────────────────────
    "acid":            FontSet("Impact",            "Arial Narrow"),
    "acid_zh":         FontSet("站酷酷黑",           "思源黑体 Regular"),
}

def get_fonts(style: str, lang: str = "en") -> FontSet:
    """
    Return FontSet for the given style and language.
    lang="zh" appends "_zh" suffix; lang="bilingual" returns zh set (title)
    + en set (body) merged.

    Example:
        F = get_fonts("bold_geometric", "zh")
        t(1, "标题", ..., font=F.title, ...)
        t(1, "Body text", ..., font=F.body, ...)
    """
    if lang in ("zh", "bilingual"):
        key = style + "_zh"
        if key in THEME_FONTS:
            fs = THEME_FONTS[key]
            if lang == "bilingual":
                en_fs = THEME_FONTS.get(style)
                # bilingual: zh title + en body (mixing is common in CN decks)
                return FontSet(fs.title, en_fs.body if en_fs else fs.body,
                               fs.mono, fs.accent)
            return fs
    return THEME_FONTS.get(style, THEME_FONTS["tech"])

# ─────────────────────────────────────────────────────────────────────────────

def validate_and_outline(deck):
    print("\n[Validate]")
    r = subprocess.run([OCLI, "validate", deck], **SUBPROCESS_TEXT)
    print(r.stdout or r.stderr)
    print("\n[Outline]")
    r = subprocess.run([OCLI, "view", deck, "outline"], **SUBPROCESS_TEXT)
    print(r.stdout or r.stderr)
