// 명함 이미지 처리와 OCR (리멤버 방식)
// ① 명함 테두리를 찾아 반듯하게 펴기  ② 글자 읽기: 서버 AI(Claude, 항목까지 판독) → 서버 구글 OCR → 브라우저 Tesseract.js
import { isServer, call } from './store.js';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

// ---------- 이미지 기본 ----------
const newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// 파일·Blob을 (사진 방향을 바로잡은) 캔버스로. 긴 변이 max를 넘지 않게 줄입니다
export async function loadCanvas(file, max = 2400) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  const src = bmp || await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('사진을 열 수 없습니다')); im.src = URL.createObjectURL(file); });
  return fitCanvas(src, max);
}
export function fitCanvas(src, max) {
  const w0 = src.videoWidth || src.width, h0 = src.videoHeight || src.height, k = Math.min(1, max / Math.max(w0, h0));
  const c = newCanvas(Math.round(w0 * k), Math.round(h0 * k));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c;
}
// 캔버스 → 업로드용 JPEG. 반환: { dataUrl, base64, width, height }
export function canvasToJpeg(canvas, max = 1600, quality = 0.85) {
  const c = Math.max(canvas.width, canvas.height) > max ? fitCanvas(canvas, max) : canvas;
  const dataUrl = c.toDataURL('image/jpeg', quality);
  return { dataUrl, base64: dataUrl.split(',')[1], width: c.width, height: c.height };
}
export async function toJpeg(file, max = 1600, quality = 0.85) { return canvasToJpeg(await loadCanvas(file, max), max, quality); }

export function rotate90(canvas) {
  const c = newCanvas(canvas.height, canvas.width), g = c.getContext('2d');
  g.translate(c.width, 0); g.rotate(Math.PI / 2); g.drawImage(canvas, 0, 0);
  return c;
}

// ---------- ① 명함 테두리 찾기 ----------
// 사진을 작게 줄여 명함(가운데 덩어리)과 배경을 밝기로 나눈 뒤, 가운데와 이어진 영역의 네 모서리를 찾습니다.
// 반환: [좌상, 우상, 우하, 좌하] 각 {x,y} (원본 좌표) 또는 못 찾으면 null
export function findCard(canvas) {
  const S = 320 / Math.max(canvas.width, canvas.height);
  const w = Math.max(1, Math.round(canvas.width * S)), h = Math.max(1, Math.round(canvas.height * S));
  const px = fitCanvas(canvas, 320).getContext('2d').getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h), hist = new Array(256).fill(0);
  for (let i = 0; i < w * h; i++) { const v = (px[i * 4] * 77 + px[i * 4 + 1] * 151 + px[i * 4 + 2] * 28) >> 8; gray[i] = v; hist[v]++; }
  const th = otsu(hist, w * h);
  // 명함 쪽 밝기: 가운데 40% 구역에서 많은 쪽 (글자는 소수라 무시됩니다)
  let bright = 0, tot = 0;
  for (let y = Math.round(h * .3); y < h * .7; y++) for (let x = Math.round(w * .3); x < w * .7; x++) { tot++; if (gray[y * w + x] > th) bright++; }
  const cardIsBright = bright > tot / 2;
  const inCard = i => (gray[i] > th) === cardIsBright;
  // 글자 구멍을 메우고 가는 연결을 끊기 위해 3x3 다수결로 다듬습니다
  const mask = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += inCard((y + dy) * w + x + dx);
    mask[y * w + x] = n >= 5;
  }
  // 가운데에서 가장 가까운 명함 화소부터 채우기
  let seed = -1;
  for (let r = 0; r < Math.min(w, h) / 3 && seed < 0; r++) {
    for (let a = 0; a < 16 && seed < 0; a++) {
      const x = Math.round(w / 2 + r * Math.cos(a * Math.PI / 8)), y = Math.round(h / 2 + r * Math.sin(a * Math.PI / 8));
      if (mask[y * w + x]) seed = y * w + x;
    }
  }
  if (seed < 0) return null;
  const seen = new Uint8Array(w * h), stack = [seed]; seen[seed] = 1;
  let area = 0, border = 0, tl = [1e9, 0, 0], br = [-1e9, 0, 0], tr = [-1e9, 0, 0], bl = [1e9, 0, 0];
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i - x) / w; area++;
    if (x <= 1 || y <= 1 || x >= w - 2 || y >= h - 2) border++;
    if (x + y < tl[0]) tl = [x + y, x, y];
    if (x + y > br[0]) br = [x + y, x, y];
    if (x - y > tr[0]) tr = [x - y, x, y];
    if (x - y < bl[0]) bl = [x - y, x, y];
    for (const j of [i - 1, i + 1, i - w, i + w]) if (j >= 0 && j < w * h && !seen[j] && mask[j]) { seen[j] = 1; stack.push(j); }
  }
  const quad = [tl, tr, br, bl].map(([, x, y]) => ({ x: x / S, y: y / S }));
  const qa = polyArea(quad), full = canvas.width * canvas.height;
  // 배경과 한 덩어리가 됐거나(가장자리에 넓게 닿음) 너무 작거나 찌그러지면 실패로 봅니다
  if (border > (w + h) * 0.6 || qa < full * 0.12 || qa > full * 0.97 || area < qa * S * S * 0.75 || !convex(quad)) return null;
  return quad;
}
function otsu(hist, n) {
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = 0, th = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue; const wF = n - wB; if (!wF) break;
    sB += t * hist[t]; const d = sB / wB - (sum - sB) / wF, v = wB * wF * d * d;
    if (v > best) { best = v; th = t; }
  }
  return th;
}
const polyArea = q => Math.abs(q.reduce((s, p, i) => { const r = q[(i + 1) % q.length]; return s + p.x * r.y - r.x * p.y; }, 0)) / 2;
function convex(q) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 1e-6) return false;
    if (sign && Math.sign(z) !== sign) return false; sign = Math.sign(z);
  }
  return true;
}

// ---------- 비스듬한 명함을 반듯한 직사각형으로 펴기 (원근 보정) ----------
export function warpCard(canvas, quad, maxSide = 1600) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let W = Math.max(d(quad[0], quad[1]), d(quad[3], quad[2])), H = Math.max(d(quad[0], quad[3]), d(quad[1], quad[2]));
  const k = Math.min(maxSide / Math.max(W, H), 2);
  W = Math.round(W * k); H = Math.round(H * k);
  // 결과 화소(u,v) → 원본 좌표(x,y) 사상
  const m = homography([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }], quad);
  const sw = canvas.width, sh = canvas.height, src = canvas.getContext('2d').getImageData(0, 0, sw, sh).data;
  const out = newCanvas(W, H), og = out.getContext('2d'), img = og.createImageData(W, H), o = img.data;
  for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
    const z = m[6] * u + m[7] * v + 1, x = (m[0] * u + m[1] * v + m[2]) / z, y = (m[3] * u + m[4] * v + m[5]) / z;
    const x0 = Math.max(0, Math.min(sw - 2, x | 0)), y0 = Math.max(0, Math.min(sh - 2, y | 0)), fx = Math.min(1, Math.max(0, x - x0)), fy = Math.min(1, Math.max(0, y - y0));
    const i = (y0 * sw + x0) * 4, j = (v * W + u) * 4;
    for (let c = 0; c < 3; c++) {
      const a = src[i + c] + (src[i + 4 + c] - src[i + c]) * fx, b = src[i + sw * 4 + c] + (src[i + sw * 4 + 4 + c] - src[i + sw * 4 + c]) * fx;
      o[j + c] = a + (b - a) * fy;
    }
    o[j + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  return out;
}
function homography(from, to) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i], { x: X, y: Y } = to[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
  }
  for (let c = 0; c < 8; c++) { // 가우스 소거
    let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  return b.map((v, i) => v / A[i][i]);
}

// 사진 한 장 → 명함 부분만 반듯하게. 테두리를 못 찾으면 원본 그대로 (quad: null)
export function autoCrop(canvas) {
  const quad = findCard(canvas);
  return { quad, card: quad ? warpCard(canvas, quad) : canvas };
}

// ---------- 글자 인식용 보정 (그림자·조명 얼룩 제거, 대비 높이기, 어두운 명함 반전) ----------
export function enhance(canvas) {
  const k = Math.min(2, Math.max(1, 1800 / Math.max(canvas.width, canvas.height)));
  const c = newCanvas(Math.round(canvas.width * k), Math.round(canvas.height * k)), g = c.getContext('2d');
  g.imageSmoothingQuality = 'high'; g.drawImage(canvas, 0, 0, c.width, c.height);
  const W = c.width, H = c.height, n = W * H, im = g.getImageData(0, 0, W, H), d = im.data;
  const lum = new Float32Array(n), hist0 = new Array(256).fill(0);
  for (let p = 0, i = 0; p < n; p++, i += 4) { const v = (d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8; lum[p] = v; hist0[v]++; }
  // 바탕이 어두우면(남색·검정 명함에 흰 글씨) 뒤집어서 '밝은 바탕에 어두운 글씨'로 맞춥니다
  let acc = 0, median = 0; for (; median < 256; median++) { acc += hist0[median]; if (acc > n / 2) break; }
  if (median < 110) for (let p = 0; p < n; p++) lum[p] = 255 - lum[p];
  // 배경 밝기 지도: 칸마다 가장 밝은 값(글씨는 어두우니 굵은 글씨도 배경으로 오인하지 않습니다) → 이웃 칸과 고르게
  const bs = Math.max(12, Math.round(Math.max(W, H) / 40)), bw = Math.ceil(W / bs), bh = Math.ceil(H / bs), bm = new Float32Array(bw * bh);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const j = ((y / bs) | 0) * bw + ((x / bs) | 0), v = lum[y * W + x]; if (v > bm[j]) bm[j] = v; }
  const sm = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    let t = 0, m = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && xx >= 0 && yy < bh && xx < bw) { t += bm[yy * bw + xx]; m++; } }
    sm[y * bw + x] = t / m;
  }
  const hist = new Array(256).fill(0), vals = new Float32Array(n);
  for (let y = 0; y < H; y++) {
    const fy = Math.min(bh - 1.001, Math.max(0, y / bs - 0.5)), y0 = fy | 0, ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = Math.min(bw - 1.001, Math.max(0, x / bs - 0.5)), x0 = fx | 0, tx = fx - x0;
      const y1 = Math.min(bh - 1, y0 + 1), x1 = Math.min(bw - 1, x0 + 1);
      const bg = (sm[y0 * bw + x0] * (1 - tx) + sm[y0 * bw + x1] * tx) * (1 - ty) + (sm[y1 * bw + x0] * (1 - tx) + sm[y1 * bw + x1] * tx) * ty;
      const r = Math.min(255, (lum[y * W + x] / Math.max(16, bg)) * 255); vals[y * W + x] = r; hist[r | 0]++;
    }
  }
  // 하위 1%~상위 5% 밝기를 0~255로 늘립니다
  let lo = 0, hi = 255; acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.01) { lo = i; break; } }
  acc = 0; for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * 0.05) { hi = i; break; } }
  const span = Math.max(30, hi - lo);
  for (let p = 0, i = 0; p < n; p++, i += 4) { const v = Math.max(0, Math.min(255, (vals[p] - lo) * 255 / span)); d[i] = d[i + 1] = d[i + 2] = v; }
  g.putImageData(im, 0, 0);
  return c;
}

// ---------- ② 글자 읽기 ----------
function loadScript(url) {
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = url; s.onload = ok; s.onerror = () => no(new Error('글자 인식 엔진을 내려받지 못했습니다. 인터넷 연결을 확인해 주세요')); document.head.appendChild(s); });
}
let workerP = null, onLog = () => {};
function getWorker() {
  // 엔진(약 10MB)은 한 번만 내려받고 다음 명함부터 다시 씁니다
  workerP ||= (async () => {
    if (!window.Tesseract) await loadScript(TESSERACT_URL);
    // 파일로 열린 경우 브라우저 저장소가 막혀 있어 엔진 자료를 저장하지 않고 씁니다
    return window.Tesseract.createWorker('kor+eng', 1, { logger: m => onLog(m), cacheMethod: /^https?:$/.test(location.protocol) ? 'write' : 'none' });
  })().catch(e => { workerP = null; throw e; });
  return workerP;
}

// 명함 이미지 → { text, fields?, lines?, engine }
// card: 반듯하게 편 명함 캔버스
export async function recognize(card, onProgress = () => {}) {
  if (isServer()) {
    try {
      onProgress(0.25, 'AI가 명함을 읽는 중…');
      const j = await call('ocr', { image: canvasToJpeg(card, 1600, 0.9).base64 });
      if (j.fields && Object.values(j.fields).some(Boolean)) { onProgress(1, '인식 완료'); return { text: j.text || '', fields: j.fields, engine: j.engine || 'AI' }; }
      if (j.text && j.text.trim().length > 5) { onProgress(1, '인식 완료'); return { text: j.text, engine: j.engine || 'Google OCR' }; }
    } catch (e) { console.warn('server OCR failed', e); }
  }
  onProgress(0.05, '글자 인식 엔진 준비 중… (처음 한 번은 1분 정도 걸립니다)');
  onLog = m => {
    if (m.status === 'recognizing text') onProgress(0.35 + m.progress * 0.6, `글자 읽는 중… ${Math.round(m.progress * 100)}%`);
    else if (/load|initiali/.test(m.status) && m.progress) onProgress(0.05 + m.progress * 0.25, '글자 인식 엔진 내려받는 중…');
  };
  const worker = await getWorker();
  const img = enhance(card);
  const run = async (src, psm) => {
    await worker.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(src, {}, { text: true, blocks: true });
    const lines = (data.blocks || []).flatMap(b => b.paragraphs.flatMap(p => p.lines)).map(l => ({ text: l.text.trim(), h: l.bbox.y1 - l.bbox.y0, conf: l.confidence }))
      .filter(l => l.text && (l.conf > 35 || l.text.length > 3));
    const text = lines.length ? lines.map(l => l.text).join('\n') : data.text;
    const fields = parseCard(text, lines);
    return { text, lines, fields, score: Object.values(fields).filter(Boolean).length * 10 + data.confidence / 10 };
  };
  // 여러 방식으로 읽고 결과를 합칩니다: 가장 잘 읽힌 판독을 바탕으로, 빈 항목은 다른 판독에서 채웁니다
  //  ① 보정 사진·자동 배치  ② 보정 사진·흩어진 글자 모드  ③ 원본 사진 (이름·회사가 끝까지 비었을 때)
  const runs = [await run(img, '3')];
  const merged = () => {
    const sorted = runs.slice().sort((a, b) => b.score - a.score), out = { ...sorted[0].fields };
    for (const r of sorted.slice(1)) for (const [k, v] of Object.entries(r.fields)) if (!out[k] && v) out[k] = v;
    return { out, best: sorted[0] };
  };
  const weak = f => !f.name || !f.company || Object.values(f).filter(Boolean).length < 6;
  if (weak(merged().out)) { onProgress(0.7, '한 번 더 꼼꼼히 읽는 중…'); runs.push(await run(img, '11')); }
  if (!merged().out.name || !merged().out.company) { onProgress(0.85, '원본 사진으로 다시 확인하는 중…'); runs.push(await run(card, '3')); }
  const { out, best } = merged();
  onProgress(1, '인식 완료');
  return { text: best.text, lines: best.lines, fields: out, engine: 'Tesseract' };
}

// ---------- ③ 읽은 글자에서 항목 나누기 ----------
const TITLES = ['대표이사', '공동대표', '부회장', '회장', '부사장', '사장', '대표', '전무이사', '전무', '상무이사', '상무', '이사장', '이사', '감사', '본부장', '지점장', '센터장', '소장', '원장', '국장', '부장', '차장', '과장', '팀장', '실장', '교수', '위원장', '변호사', '노무사', '세무사', '회계사', '감정평가사', '법무사', '변리사', '매니저', '대리', '주임', '사원', '총장', '고문', '대표원장', 'CEO', 'CTO', 'COO', 'CFO', 'President', 'Director', 'Manager'];
const COMPANY_RE = /(㈜|\(주\)|주식회사|\(유\)|유한회사|법인|협회|연합회|조합|센터|대학교|농협|병원|의원|사무소|사무실|상사|산업|건설|전기|전자|환경|테크|텍|솔루션|시스템|무역|모터스|물산|그룹|컴퍼니|엔지니어링|기술|정밀|화학|식품|INC|CO\.|LTD|Corp)/i;
const ADDR_RE = /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|충청|전북|전남|전라|경북|경남|경상|제주|천안|아산|당진|청주|평택|서산|공주|논산|예산|홍성)/;
const ADDR_TAIL = /(로|길|동|읍|면|리|번지|층|호|빌딩|타워|프라자|센터)\s*\d*/;
const LABEL_RE = /^(tel|t|fax|f|mobile|m|h\.?p|c\.?p|e-?mail|e|주소|address|addr|a|전화|팩스|휴대폰|핸드폰|휴대전화|이메일|web|homepage|홈페이지)\s*[.:)]?\s*/i;

const normDigits = s => s.replace(/(?<=\d[\s.-]?)[Oo]|[Oo](?=[\s.-]?\d)/g, '0').replace(/(?<=\d)[lI|]|[lI|](?=\d)/g, '1');
const fmtPhone = d => {
  if (d.startsWith('82')) d = '0' + d.slice(2);
  if (/^02/.test(d)) return d.replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3');
  if (/^1\d{3}/.test(d) && d.length === 8) return d.replace(/^(\d{4})(\d{4})$/, '$1-$2');
  if (/^0505|^050\d/.test(d) && d.length === 12) return d.replace(/^(\d{4})(\d{4})(\d{4})$/, '$1-$2-$3');
  return d.replace(/^(0\d{2})(\d{3,4})(\d{4})$/, '$1-$2-$3');
};
const hangulOnly = s => s.replace(/[^가-힣]/g, '');

// OCR 텍스트에서 명함 항목 추출. lines([{text,h}])가 있으면 글자 크기도 참고합니다 (이름은 보통 가장 큰 글씨)
export function parseCard(text, lines0) {
  const out = { name: '', title: '', company: '', mobile: '', tel: '', fax: '', email: '', address: '', website: '' };
  // 명함에서 자주 틀리는 글자 바로잡기: 디표→대표, 5증→5층, .cokr→.co.kr
  const clean = s => s.replace(/[|·•¦]/g, ' ').replace(/\s{2,}/g, ' ').trim().replace(/^[@©®]\s*(?=[가-힣])/, '㈜')
    .replace(/[디대][표포](?=이사|$|\s)/g, '대표').replace(/(\d)\s?증/g, '$1층').replace(/\.(co|or|go|ac|ne)kr\b/gi, '.$1.kr');
  const lines = (lines0?.length ? lines0 : String(text || '').split(/\r?\n/).map(t => ({ text: t, h: 0 })))
    .map(l => ({ ...l, text: clean(l.text) })).filter(l => l.text);
  const all = lines.map(l => l.text).join('\n');

  // 이메일: OCR이 @를 ©·®·(at) 등으로 읽는 경우도 받아 줍니다
  const emSrc = all.replace(/\s?[©®]\s?|\s?\(at\)\s?/gi, '@').replace(/([A-Za-z0-9._-])\s*\n\s*@/g, '$1@');
  const em = emSrc.match(/[A-Za-z0-9._%+-]+\s?@\s?[A-Za-z0-9-]+(\s?[A-Za-z0-9-]+)?(\s?\.\s?[A-Za-z0-9-]+)+/);
  if (em) out.email = em[0].replace(/\s/g, '').toLowerCase().replace(/\.(co|or|go|ac|ne|re)kr$/, '.$1.kr');
  const web = all.match(/(https?:\/\/)?(www\.|[A-Za-z0-9-]+\.)?[A-Za-z0-9-]+\.(co\.kr|or\.kr|com|kr|net|org|biz)(\/[^\s]*)?/gi)?.find(w => !out.email.includes(w.toLowerCase().replace(/^https?:\/\//, '')));
  if (web) out.website = web;

  for (const { text: line } of lines) {
    const norm = normDigits(line);
    for (const hit of norm.matchAll(/(\+?82[\s.-]?)?\(?0?\d{1,4}\)?[\s.)-]*\d{3,4}[\s.-]*\d{4}/g)) {
      const d = hit[0].replace(/\D/g, '');
      if (d.length < 8 || d.length > 12) continue;
      const num = fmtPhone(d);
      // 번호 바로 앞(앞 번호가 끝난 뒤)의 표시로 종류를 판단: T. / F. / M. / 휴대 / 팩스
      const before = norm.slice(0, hit.index).split(/\d{4}/).pop().toLowerCase();
      const isFax = /(fax|팩스|f\s*[.:)]|^\s*f\b)/i.test(before);
      const isMobile = /^(\+?82)?0?1[016789]/.test(d) || /(mobile|m\s*[.:)]|h\.?p|휴대|핸드폰|cell|c\.?p)/i.test(before);
      if (isFax && !out.fax) out.fax = num;
      else if (isMobile && !out.mobile && /^0?1[016789]/.test(d.replace(/^82/, '0'))) out.mobile = num;
      else if (!isFax && !isMobile && !out.tel) out.tel = num;
    }
  }

  const addrIdx = lines.findIndex(l => ADDR_RE.test(l.text) && ADDR_TAIL.test(l.text) && !/@/.test(l.text));
  if (addrIdx >= 0) {
    let a = lines[addrIdx].text.replace(LABEL_RE, '');
    const nxt = lines[addrIdx + 1]?.text;
    if (nxt && /^\(?[\d가-힣-]+\s*(층|호|동)\)?/.test(nxt) && !/\d{3,4}[-.]\d{4}/.test(nxt)) a += ' ' + nxt;
    out.address = a.replace(/\s*(tel|t\.|fax|f\.|전화|팩스|우\s*\)?\s*\d{5}).*$/i, '').replace(/^\(?우?\s*\d{5}\)?\s*/, '').trim();
  }

  const isInfo = s => /@|\d{3,4}[-.\s]\d{4}|www\.|\.com|\.kr/i.test(s) || (ADDR_RE.test(s) && ADDR_TAIL.test(s));
  for (const { text: l } of lines) {
    if (!out.company && COMPANY_RE.test(l) && !isInfo(l) && l.length <= 30) out.company = l.replace(LABEL_RE, '');
  }
  // 직위가 들어 있는 줄에서 직위와 이름 찾기
  const nameCands = [];
  for (const l of lines) {
    if (l.text === out.company || isInfo(l.text)) continue;
    const t = TITLES.find(t => l.text.includes(t));
    if (t && !out.title) out.title = t;
    const rest = hangulOnly(t ? l.text.split(/\s+/).filter(w => !TITLES.some(tt => w.includes(tt))).join('') : l.text);
    if (/^[가-힣]{2,4}$/.test(rest) && !COMPANY_RE.test(rest)) nameCands.push({ name: rest, h: l.h || 0, withTitle: !!t, len: l.text.replace(/\s/g, '').length });
  }
  if (nameCands.length) {
    // 글자 크기를 알면 가장 큰 글씨, 모르면 직위와 같은 줄 → 짧은 줄 순서
    nameCands.sort((a, b) => (b.h - a.h) || (b.withTitle - a.withTitle) || (a.len - b.len));
    out.name = nameCands[0].name;
  }
  if (out.title && !lines.some(l => l.text.includes(out.title) && hangulOnly(l.text).includes(out.name)) && out.name) {
    // 직위가 이름과 다른 줄이면 '영업본부 부장'처럼 부서까지 함께 씁니다
    const tl = lines.find(l => l.text.includes(out.title));
    if (tl && tl.text.length <= 20 && !isInfo(tl.text) && tl.text !== out.company) out.title = tl.text.replace(/^[^가-힣]{1,3}\s+/, '').trim();
  }
  // 회사명 표시어가 없으면 이름·직위·연락처가 아닌 짧은 줄 중 가장 큰 글씨(없으면 첫 줄)를 회사명 후보로 씁니다
  if (!out.company) {
    const c = lines.filter(l => !/\d|@/.test(l.text) && l.text.length <= 20 && hangulOnly(l.text) !== out.name && !TITLES.some(t => l.text.includes(t)) && hangulOnly(l.text).length >= 2);
    const pick = c.slice().sort((a, b) => b.h - a.h)[0];
    if (pick) out.company = (lines0?.length ? pick : c[0]).text;
  }
  return out;
}
