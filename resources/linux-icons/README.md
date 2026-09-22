# Linux icon set for electron-builder

PNG sizes used by `packages/desktop/electron-builder.yml` (`linux.icon`).

electron-builder installs each file as `usr/share/icons/hicolor/<size>/apps/AionUi.png`
so GTK/Cinnamon can resolve `Icon=AionUi` in the desktop entry.

Regenerate from the master asset:

```bash
python3 - <<'PY'
from PIL import Image
from pathlib import Path
src = Image.open('resources/app.png').convert('RGBA')
out = Path('resources/linux-icons')
for s in [16, 22, 24, 32, 48, 64, 96, 128, 256, 512]:
    p = out / f'{s}x{s}.png'
    src.resize((s, s), Image.LANCZOS).save(p, optimize=True)
    p.chmod(0o644)
    print(p)
PY
```

Requires `python3-pil` (Pillow).
