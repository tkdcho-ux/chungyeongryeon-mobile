// 명함 이미지 처리와 OCR
// 1순위: 서버(Google 드라이브 OCR, 무료·한글 정확도 높음)  2순위: 브라우저 내 Tesseract.js(kor+eng)
import { isServer, call } from './store.js';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

// 사진을 축소한 JPEG으로 변환 (업로드 용량 절감). 반환: { dataUrl, base64, width, height }
export async function toJpeg(file, max = 1600, quality = 0.85) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  const src = bmp || await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = URL.createObjectURL(file); });
  const w0 = src.width, h0 = src.height, k = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL('image/jpeg', quality);
  return { dataUrl, base64: dataUrl.split(',')[1], width: c.width, height: c.height };
}

function loadScript(url) {
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = url; s.onload = ok; s.onerror = () => no(new Error('OCR 엔진을 불러오지 못했습니다')); document.head.appendChild(s); });
}

export async function recognize(img, onProgress = () => {}) {
  if (isServer()) {
    try {
      onProgress(0.2, '서버(구글) 문자 인식 중…');
      const j = await call('ocr', { image: img.base64 });
      if (j.text && j.text.trim().length > 5) { onProgress(1, '인식 완료'); return { text: j.text, engine: 'Google OCR' }; }
    } catch (e) { console.warn('server OCR failed', e); }
  }
  onProgress(0.05, 'OCR 엔진 준비 중… (처음 한 번은 시간이 걸립니다)');
  if (!window.Tesseract) await loadScript(TESSERACT_URL);
  const worker = await window.Tesseract.createWorker('kor+eng', 1, {
    logger: m => { if (m.status === 'recognizing text') onProgress(0.3 + m.progress * 0.7, `글자 읽는 중… ${Math.round(m.progress * 100)}%`); },
  });
  try {
    const { data } = await worker.recognize(img.dataUrl);
    onProgress(1, '인식 완료');
    return { text: data.text, engine: 'Tesseract' };
  } finally { await worker.terminate(); }
}

const TITLES = ['대표이사', '공동대표', '대표', '회장', '부회장', '사장', '부사장', '전무이사', '전무', '상무이사', '상무', '이사', '감사', '본부장', '지점장', '센터장', '소장', '원장', '국장', '부장', '차장', '과장', '팀장', '실장', '교수', '위원장', '변호사', '노무사', '세무사', '회계사', '감정평가사', '법무사', '변리사', '매니저', '대리', '주임', '총장', 'CEO', 'CTO', 'President', 'Director', 'Manager'];
const COMPANY_RE = /(㈜|\(주\)|주식회사|\(유\)|유한회사|법인|협회|연합회|조합|센터|대학교|농협|병원|사무소|상사|산업|건설|전기|환경|테크|텍|솔루션|무역|모터스|그룹|컴퍼니|INC|CO\.|LTD|Corp)/i;
const ADDR_RE = /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|충청|전북|전남|전라|경북|경남|경상|제주|천안|아산|당진|청주|평택)/;
const ADDR_TAIL = /(로|길|동|읍|면|리|번지|층|호|빌딩|타워|프라자)\s*\d*/;

const normDigits = s => s.replace(/[Oo]/g, '0').replace(/[lI|]/g, '1');
const fmtPhone = d => {
  if (d.startsWith('82')) d = '0' + d.slice(2);
  if (/^02/.test(d)) return d.replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3');
  if (/^1\d{3}/.test(d) && d.length === 8) return d.replace(/^(\d{4})(\d{4})$/, '$1-$2');
  return d.replace(/^(0\d{2})(\d{3,4})(\d{4})$/, '$1-$2-$3');
};

// OCR 텍스트에서 명함 항목 추출
export function parseCard(text) {
  const out = { name: '', title: '', company: '', mobile: '', tel: '', fax: '', email: '', address: '', website: '' };
  // OCR이 ㈜를 @ 로 읽는 경우가 많아 줄 머리에서 바로잡습니다
  const lines = text.split(/\r?\n/).map(s => s.replace(/[|·•]/g, ' ').replace(/\s{2,}/g, ' ').trim().replace(/^@\s*(?=[가-힣])/, '㈜')).filter(Boolean);
  const all = lines.join('\n');

  const em = all.match(/[A-Za-z0-9._%+-]+\s?@\s?[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/);
  if (em) out.email = em[0].replace(/\s/g, '').toLowerCase();
  const web = all.match(/(https?:\/\/)?(www\.)[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+[^\s]*/i);
  if (web) out.website = web[0];

  for (const line of lines) {
    const norm = normDigits(line);
    for (const hit of norm.matchAll(/(\+?82[\s.-]?)?\(?0?\d{1,3}\)?[\s.)-]*\d{3,4}[\s.-]*\d{4}/g)) {
      const d = hit[0].replace(/\D/g, '');
      if (d.length < 8 || d.length > 12) continue;
      const num = fmtPhone(d);
      // 번호 바로 앞(앞 번호가 끝난 뒤)의 표시로 종류를 판단: T. / F. / M. / 휴대 / 팩스
      const before = line.slice(0, hit.index).split(/\d{4}/).pop().toLowerCase();
      const isFax = /(fax|팩스|f\s*[.:)]|^\s*f\b)/i.test(before);
      const isMobile = /^(\+?82)?0?1[016789]/.test(d) || /(mobile|m\s*[.:)]|h\.?p|휴대|핸드폰|cell|c\.?p)/i.test(before);
      if (isFax && !out.fax) out.fax = num;
      else if (isMobile && !out.mobile && /^0?1[016789]/.test(d.replace(/^82/, '0'))) out.mobile = num;
      else if (!isFax && !out.tel) out.tel = num;
    }
  }

  const addrIdx = lines.findIndex(l => ADDR_RE.test(l) && ADDR_TAIL.test(l));
  if (addrIdx >= 0) {
    let a = lines[addrIdx].replace(/^(주소|address|addr|a)\s*[.:)]?\s*/i, '');
    const nxt = lines[addrIdx + 1];
    if (nxt && /^\(?[\d가-힣-]+\s*(층|호|동)\)?/.test(nxt) && !/\d{3,4}[-.]\d{4}/.test(nxt)) a += ' ' + nxt;
    out.address = a.replace(/(tel|fax|전화|팩스).*$/i, '').trim();
  }

  const used = new Set();
  for (const l of lines) {
    if (!out.company && COMPANY_RE.test(l) && !/@[A-Za-z]|\d{3,4}[-.]\d{4}/.test(l) && l.length <= 30 && !ADDR_RE.test(l)) { out.company = l; used.add(l); }
  }
  for (const l of lines) {
    if (used.has(l)) continue;
    const t = TITLES.find(t => l.includes(t));
    const hangul = l.replace(/[^가-힣\s]/g, '').trim();
    if (t) {
      if (!out.title) out.title = t;
      const rest = hangul.replace(t, '').replace(/\s/g, '');
      if (!out.name && /^[가-힣]{2,4}$/.test(rest)) out.name = rest;
    }
  }
  if (!out.name) {
    const cand = lines.map(l => l.replace(/\s/g, '')).find(l => /^[가-힣]{2,4}$/.test(l) && !TITLES.includes(l) && !COMPANY_RE.test(l));
    if (cand) out.name = cand;
  }
  // 회사명 표시어가 없으면 명함 첫 줄(이름·직위·연락처가 아닌 짧은 줄)을 회사명 후보로 씁니다
  if (!out.company) {
    const first = lines.find(l => !/\d|@/.test(l) && l.length <= 20 && l.replace(/\s/g, '') !== out.name && !TITLES.some(t => l.includes(t)));
    if (first) out.company = first;
  }
  return out;
}
