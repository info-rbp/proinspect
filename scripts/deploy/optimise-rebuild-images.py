"""Generate smaller WebP variants at build time; preserve original JPEGs."""
from pathlib import Path
import json
import subprocess

root = Path(__file__).resolve().parents[2]
images = root / "apps/marketing/app/components/images"
out = root / "artifacts/rebuild-navigation"
out.mkdir(parents=True, exist_ok=True)
report = []
for name in ("co-working", "modular", "innovation", "subscription-care"):
    for suffix in ("", "-small"):
        src = images / (name + suffix + ".jpg")
        dest = src.with_suffix(".webp")
        if dest.exists():
            raise RuntimeError(f"Refusing to overwrite existing source asset {dest}")
        subprocess.run(["cwebp", "-quiet", "-q", "82", "-m", "6", str(src), "-o", str(dest)], check=True)
        before, after = src.stat().st_size, dest.stat().st_size
        if after >= before:
            dest.unlink()
            after = before
        report.append({"image": src.name, "originalBytes": before, "servedBytes": after,
                       "savedBytes": before - after, "format": "webp" if dest.exists() else "jpeg"})
result = {"assets": report, "originalBytes": sum(r["originalBytes"] for r in report),
          "servedBytes": sum(r["servedBytes"] for r in report)}
result["savedBytes"] = result["originalBytes"] - result["servedBytes"]
(out / "image-optimisation.json").write_text(json.dumps(result, indent=2) + "\n")
print("IMAGE_OPTIMISATION " + json.dumps(result))
