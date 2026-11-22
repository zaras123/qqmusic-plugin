"""Build a deployable AstrBot ZIP from an explicit allowlist.

Runtime code stays Python; resources/ carries the shared card themes
(HTML/CSS + art-template browser runtime + CJK fonts) used by the
Chromium renderer.
"""
from pathlib import Path
from hashlib import sha256
from runpy import run_path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
NAME = "astrbot_plugin_qqmusic"
FILES = """__init__.py main.py api.py astrbot_transport.py cards.py delivery.py
features.py quality.py render.py updater.py library_web.py _conf_schema.json
metadata.yaml requirements.txt logo.png LICENSE README.md CHANGELOG.md""".split()
ASSETS = """astrbot_assets/LICENSE-WBNDM astrbot_assets/fonts/LICENSE-NotoSansSC.txt
astrbot_assets/fonts/QQM-CJK-Regular.otf
.astrbot-plugin/i18n/zh-CN.json .astrbot-plugin/i18n/en-US.json
views/library/index.html views/library/app.js views/library/bridge.js views/library/settings.html views/library/settings.js views/library/style.css views/library/logo.png""".split()
ASSETS += sorted(
    path.relative_to(ROOT).as_posix()
    for path in (ROOT / "resources").rglob("*")
    if path.is_file()
)


def main():
    release = run_path(str(ROOT / "updater.py"))
    try:
        release["validate_release_notes"](ROOT)
    except (OSError, ValueError) as exc:
        raise SystemExit(f"不能打包：{exc}") from exc
    output = ROOT / "output" / "astrbot"
    output.mkdir(parents=True, exist_ok=True)
    filename = output / f"{NAME}.zip"
    files = [ROOT / name for name in FILES + ASSETS]
    with ZipFile(filename, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            if path.is_symlink() or not path.resolve().is_relative_to(ROOT):
                raise ValueError(f"Refusing to package a symlink: {path}")
            archive.write(path, f"{NAME}/{path.relative_to(ROOT).as_posix()}")
    with ZipFile(filename) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == {f"{NAME}/{f.relative_to(ROOT).as_posix()}" for f in files}
    digest = sha256(filename.read_bytes()).hexdigest()
    filename.with_suffix(".zip.sha256").write_text(f"{digest}  {filename.name}\n", encoding="ascii")
    print(f"{filename}  {len(files)} entries  SHA256 {digest}")


if __name__ == "__main__":
    main()
