"""회원명부를 접근코드로 암호화해 site/data.enc.json 을 만듭니다 (구글 서버 없이 초대 링크로 쓰는 방식).

사용법:  python tools/build_bundle.py            # data/access-code.txt 의 코드 사용(없으면 새로 만듦)
         python tools/build_bundle.py --new      # 코드를 새로 바꿈 (이전 초대 링크는 더 이상 열리지 않음)

암호화: PBKDF2-SHA256(코드, 무작위 salt, 310,000회) → AES-256-GCM. 브라우저 WebCrypto로 풉니다.
원본 data/*.json 과 접근코드 파일은 공개 저장소에 올라가지 않습니다(.gitignore).
"""
import base64, json, os, secrets, sys, pathlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA, OUT, CODE_FILE = ROOT / "data", ROOT / "site" / "data.enc.json", ROOT / "data" / "access-code.txt"
ITER = 310_000
ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 헷갈리는 0/O, 1/I 제외


def norm(code: str) -> str:
    return "".join(c for c in code.upper() if c.isalnum())


def main():
    if "--new" in sys.argv or not CODE_FILE.exists():
        raw = "".join(secrets.choice(ALPHA) for _ in range(12))
        CODE_FILE.write_text("-".join(raw[i:i + 4] for i in range(0, 12, 4)) + "\n", encoding="utf-8")
    code = CODE_FILE.read_text(encoding="utf-8").strip()
    m = json.loads((DATA / "members.json").read_text(encoding="utf-8"))
    p = json.loads((DATA / "profiles.json").read_text(encoding="utf-8"))
    g = json.loads((DATA / "growth-models.json").read_text(encoding="utf-8"))
    plain = {
        "members": m["members"], "groups": m["groups"], "updated": m.get("updated"),
        "profiles": p.get("profiles", {}), "models": g.get("models", []),
        "meta": {"profileBasis": p.get("basis"), "modelBasis": g.get("basis"), "method": g.get("method"), "portfolio": g.get("portfolio")},
    }
    salt, iv = os.urandom(16), os.urandom(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(norm(code).encode())
    ct = AESGCM(key).encrypt(iv, json.dumps(plain, ensure_ascii=False).encode("utf-8"), None)
    b64 = lambda b: base64.b64encode(b).decode()
    OUT.write_text(json.dumps({"v": 1, "iter": ITER, "salt": b64(salt), "iv": b64(iv), "data": b64(ct)}), encoding="utf-8")
    print(f"만들었습니다: {OUT.relative_to(ROOT)}  (회원 {len(plain['members'])}명)")
    print(f"접근코드: {code}")


if __name__ == "__main__":
    main()
