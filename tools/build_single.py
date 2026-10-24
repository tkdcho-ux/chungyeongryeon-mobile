"""앱 전체를 HTML 파일 하나로 묶습니다 (인터넷 주소 없이 PC·휴대폰에서 파일로 열어 보는 용도).

사용법:  python tools/build_single.py [출력 경로]
명부(data/*.json)가 파일 안에 그대로 들어가므로 회원 외에는 보내지 마세요. 공개 저장소에는 올리지 않습니다.
"""
import base64, json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE, DATA = ROOT / "site", ROOT / "data"
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist" / "천경련 디지털 회원명부_v3.html"


def read(p):
    return (SITE / p).read_text(encoding="utf-8")


def data_uri(p):
    mime = {"svg": "image/svg+xml", "png": "image/png"}[p.rsplit(".", 1)[1]]
    return f"data:{mime};base64," + base64.b64encode((SITE / p).read_bytes()).decode()


def strip_module(src):
    # 파일을 이어 붙이므로 import 줄은 지우고 export 키워드만 뗍니다
    src = re.sub(r"^import [^;]+;\n", "", src, flags=re.M)
    return re.sub(r"^export (?=(const|function|async function|let) )", "", src, flags=re.M)


def main():
    m = json.loads((DATA / "members.json").read_text(encoding="utf-8"))
    p = json.loads((DATA / "profiles.json").read_text(encoding="utf-8"))
    g = json.loads((DATA / "growth-models.json").read_text(encoding="utf-8"))
    data = {"members": m["members"], "groups": m["groups"], "updated": m.get("updated"), "profiles": p.get("profiles", {}),
            "models": g.get("models", []), "meta": {"profileBasis": p.get("basis"), "modelBasis": g.get("basis"), "method": g.get("method"), "portfolio": g.get("portfolio")}}
    js = "\n".join(strip_module(read(f"js/{n}.js")) for n in ["config", "store", "ocr", "msg", "app"])
    js = js.replace("navigator.serviceWorker", "navigator.__noSW")  # 파일로 열 때는 서비스워커를 쓰지 않습니다
    html = read("index.html")
    html = html.replace('<link rel="stylesheet" href="css/app.css">', "<style>\n" + read("css/app.css") + "\n</style>")
    html = re.sub(r'\s*<link rel="manifest"[^>]*>', "", html)
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    html = html.replace('<script type="module" src="js/app.js"></script>',
                        f"<script>globalThis.__CGR_DATA__ = {payload};</script>\n<script type=\"module\">\n{js}\n</script>")
    for asset in sorted({a for a in re.findall(r"assets/[\w.-]+\.(?:svg|png)", html)}):
        html = html.replace(asset, data_uri(asset))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"만들었습니다: {OUT}  ({OUT.stat().st_size // 1024} KB, 회원 {len(data['members'])}명)")


if __name__ == "__main__":
    main()
