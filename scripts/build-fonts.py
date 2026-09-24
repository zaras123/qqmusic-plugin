# 生成 resources/fonts 里的 CJK 子集（Noto Sans SC → woff2）
#
# 为什么是"子集"而不是原字体：Noto Sans SC 原版 ~8MB/字重，卡片只用到
# GBK 范围内的字 + 常用符号，裁完 ~4.5MB/字重（woff2）。
# 授权：Noto Sans SC 采用 SIL OFL 1.1 —— 允许随软件分发（见同目录 LICENSE-NotoSansSC.txt）。
#
# 跑法：python scripts/build-fonts.py        （需要 fonttools + brotli）
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "resources", "fonts")
# 本机 Noto Sans SC 的位置：Windows 在 C:\Windows\Fonts，Linux 可用 fc-list 查
FONT_DIR = os.environ.get("NOTO_FONT_DIR", r"C:\Windows\Fonts")

PAIRS = [
    ("Noto Sans SC (TrueType).otf", "QQM-CJK-Regular.woff2"),
    ("Noto Sans SC Bold (TrueType).otf", "QQM-CJK-Bold.woff2"),
    # 想要更贴近设计的 500/600 字重再把 Medium 也打开（+4.5MB）
    # ("Noto Sans SC Medium (TrueType).otf", "QQM-CJK-Medium.woff2"),
]

UNICODES = ",".join([
    "U+0020-007E", "U+00A0-00FF", "U+2000-206F", "U+2190-21FF", "U+2460-24FF",
    "U+25A0-25FF", "U+2600-26FF", "U+2E80-2EFF", "U+3000-303F", "U+FE10-FE1F", "U+FF00-FFEF",
])


def gbk_chars() -> str:
    out = set()
    for b1 in range(0x81, 0xFF):
        for b2 in range(0x40, 0xFF):
            try:
                out.add(bytes([b1, b2]).decode("gbk"))
            except Exception:
                pass
    return "".join(sorted(out))


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    text_file = os.path.join(OUT, "_gbk.txt")
    with open(text_file, "w", encoding="utf-8") as fh:
        fh.write(gbk_chars())
    try:
        for src, dst in PAIRS:
            src_path = os.path.join(FONT_DIR, src)
            dst_path = os.path.join(OUT, dst)
            if not os.path.exists(src_path):
                print("缺字体文件: %s" % src_path, file=sys.stderr)
                return 1
            subprocess.run(
                [
                    sys.executable, "-m", "fontTools.subset", src_path,
                    "--text-file=" + text_file,
                    "--unicodes=" + UNICODES,
                    "--layout-features=*",
                    "--flavor=woff2",
                    "--output-file=" + dst_path,
                ],
                check=True,
            )
            print("OK  %s -> %s (%.2f MB)" % (src, dst, os.path.getsize(dst_path) / 1048576))
    finally:
        try:
            os.unlink(text_file)
        except OSError:
            pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())