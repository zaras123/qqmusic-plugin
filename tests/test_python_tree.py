"""Release invariants: authored code and renderer dependencies are Python."""
import ast
import importlib.util
import subprocess
import tempfile
import unittest
from runpy import run_path
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class SourceBoundary(unittest.TestCase):
    def test_astrbot_working_tree_is_python_only(self):
        tree = subprocess.check_output(
            ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
            cwd=ROOT,
        ).decode("utf8").strip("\0").split("\0")
        live = {name for name in tree if (ROOT / name).is_file()}
        runtime = {"__init__.py", "_conf_schema.json", "main.py", "metadata.yaml", "requirements.txt"}
        prohibited = {".js", ".ts", ".cjs", ".mjs", ".tsx", ".jsx", ".html", ".css", ".vue", ".wasm"}
        self.assertTrue(runtime.issubset(live))
        view_assets = {"views/", ".astrbot-plugin/i18n/"}
        self.assertFalse([
            p for p in live
            if Path(p).suffix.lower() in prohibited
            and not any(p.startswith(prefix) for prefix in view_assets)
        ])
        self.assertTrue({"dist", "apps", "utils", "web"}.isdisjoint(p.split("/", 1)[0] for p in live))
        self.assertTrue({"package.json", "package-lock.json", "tsconfig.json"}.isdisjoint(live))

    def test_release_manifest_and_dependencies(self):
        spec = importlib.util.spec_from_file_location("package_astrbot", ROOT / "scripts/package_astrbot.py")
        packager = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(packager)
        banned = {"jinja2", "playwright", "selenium", "pyppeteer"}
        self.assertTrue(banned.isdisjoint(
            line.split(">", 1)[0].strip().lower()
            for line in (ROOT / "requirements.txt").read_text().splitlines()
        ))
        for path in (p for p in packager.FILES if p.endswith(".py")):
            source = ast.parse((ROOT / path).read_bytes(), filename=path)
            for node in ast.walk(source):
                if isinstance(node, ast.Import):
                    self.assertTrue(banned.isdisjoint(n.name.split(".")[0] for n in node.names), path)
                elif isinstance(node, ast.ImportFrom) and node.module:
                    self.assertNotIn(node.module.split(".")[0], banned, path)
        # Keep the packaged renderer independently usable by verifying font assets.
        self.assertIn("astrbot_assets/fonts/QQM-CJK-Regular.otf", packager.ASSETS)
        self.assertTrue(all((ROOT / f).is_file() for f in packager.FILES + packager.ASSETS))
        self.assertIn("CHANGELOG.md", packager.FILES)

    def test_release_requires_matching_current_version_and_notes(self):
        updater = run_path(str(ROOT / "updater.py"))
        validate = updater["validate_release_notes"]
        self.assertNotEqual(validate(ROOT), "unknown")
        scratch = ROOT / "temp"
        scratch.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch) as path:
            root = Path(path)
            (root / "metadata.yaml").write_text("version: 'v2.1.19'\nshort_desc: 点歌与本地图卡\n", encoding="utf8")
            notes = root / "CHANGELOG.md"
            notes.write_text("## v2.1.18\n- 首个版本。\n", encoding="utf8")
            with self.assertRaisesRegex(ValueError, r"第一条版本记录"):
                validate(root)
            notes.write_text("## v2.1.19\n\n## v2.1.18\n- 首个版本。\n", encoding="utf8")
            with self.assertRaisesRegex(ValueError, "缺少更新内容"):
                validate(root)
            notes.write_text("## v2.1.19\n- 调整图卡。\n\n## v2.1.18\n- 首个版本。\n", encoding="utf8")
            self.assertEqual(validate(root), "2.1.19")
