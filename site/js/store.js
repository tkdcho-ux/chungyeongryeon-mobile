// 데이터 저장소: Google Apps Script(무료 서버) 연결 시 서버 모드, 아니면 로컬 미리보기 모드
import { CONFIG } from './config.js';

export const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장소 사용 불가 */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* 무시 */ } },
};

export const apiUrl = () => (LS.get('cgr.apiUrl', '') || CONFIG.API_URL || '').trim();
export const kakaoKey = () => (LS.get('cgr.kakaoKey', '') || CONFIG.KAKAO_JS_KEY || '').trim();
export const appUrl = () => (CONFIG.APP_URL || location.href.split('#')[0]);
export const isServer = () => !!apiUrl();

export async function call(action, payload = {}) {
  const res = await fetch(apiUrl(), {
    method: 'POST',
    // text/plain 이어야 Apps Script 호출 시 CORS 사전요청이 생기지 않습니다
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, code: LS.get('cgr.code', ''), admin: LS.get('cgr.admin', ''), ...payload }),
  });
  if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
  const j = await res.json();
  if (!j.ok) { const e = new Error(j.error || '요청에 실패했습니다'); e.code = j.code; throw e; }
  return j;
}

async function getJson(url) {
  try { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; }
}

// 회원·분석 데이터를 읽어 옵니다. 서버가 응답하지 않으면 마지막으로 받은 사본을 씁니다.
export async function loadAll() {
  if (isServer()) {
    try {
      const j = await call('bootstrap');
      const data = { mode: 'server', members: j.members, groups: j.groups, profiles: j.profiles || {}, models: j.models || [], meta: j.meta || {}, updated: j.updated };
      LS.set('cgr.cache', data);
      return data;
    } catch (e) {
      if (e.code === 'BAD_CODE') throw e;
      const cached = LS.get('cgr.cache', null);
      if (cached) return { ...cached, mode: 'offline' };
      throw e;
    }
  }
  // 초대 링크 방식: 접근코드로 암호화한 명부 파일(data.enc.json)을 브라우저에서 풉니다
  const bundle = await getJson('./data.enc.json');
  if (bundle) {
    const code = LS.get('cgr.code', '');
    if (!code) { const e = new Error('접근코드가 필요합니다'); e.code = 'NO_CODE'; throw e; }
    let plain;
    try { plain = await decryptBundle(bundle, code); } catch { const e = new Error('접근코드가 맞지 않습니다'); e.code = 'BAD_CODE'; throw e; }
    return { mode: 'bundle', ...plain };
  }
  const [m, p, g] = await Promise.all(['../data/members.json', '../data/profiles.json', '../data/growth-models.json'].map(getJson));
  if (!m) { const e = new Error('서버 주소가 설정되지 않았습니다'); e.code = 'NO_SERVER'; throw e; }
  return { mode: 'local', members: m.members, groups: m.groups, profiles: p?.profiles || {}, models: g?.models || [], meta: { profileBasis: p?.basis, modelBasis: g?.basis, method: g?.method, portfolio: g?.portfolio }, updated: m.updated };
}

// tools/build_bundle.py 와 같은 방식: PBKDF2-SHA256 → AES-256-GCM. 코드는 대소문자·하이픈 무시
export const normCode = c => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
async function decryptBundle(b, code) {
  const bin = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normCode(code)), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: bin(b.salt), iterations: b.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bin(b.iv) }, key, bin(b.data));
  return JSON.parse(new TextDecoder().decode(pt));
}

// ---- 로컬 미리보기 모드용 임시 저장 (이 기기에만 저장) ----
export const localPending = {
  list: () => LS.get('cgr.localPending', []),
  add(rec) { const l = localPending.list(); l.unshift(rec); LS.set('cgr.localPending', l.slice(0, 50)); },
};
export const localPhotos = {
  list: () => LS.get('cgr.localPhotos', []),
  add(rec) { const l = localPhotos.list(); l.unshift(rec); LS.set('cgr.localPhotos', l.slice(0, 12)); },
};
