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
// 모임 사진 서버: 사진만 서버로 모아 여러 회원이 함께 봅니다 (명부는 서버 없이도 됨)
export const photoApiUrl = () => (LS.get('cgr.photoApi', '') || CONFIG.PHOTO_API_URL || '').trim() || apiUrl();
export const isPhotoServer = () => !!photoApiUrl();

export async function call(action, payload = {}, url = apiUrl()) {
  const res = await fetch(url, {
    method: 'POST',
    // text/plain 이어야 Apps Script 호출 시 CORS 사전요청이 생기지 않습니다
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, code: LS.get('cgr.code', '') || globalThis.__CGR_CODE__ || '', admin: LS.get('cgr.admin', ''), ...payload }),
  });
  if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
  const j = await res.json();
  if (!j.ok) { const e = new Error(j.error || '요청에 실패했습니다'); e.code = j.code; throw e; }
  return j;
}
export const callPhoto = (action, payload) => call(action, payload, photoApiUrl());

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
  // 한 파일짜리 HTML(tools/build_single.py)은 명부를 파일 안에 담고 있습니다
  if (globalThis.__CGR_DATA__) return { mode: 'local', ...globalThis.__CGR_DATA__ };
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
// 이 기기를 구별하는 표(사진을 올린 사람만 지울 수 있게 서버에 함께 보냅니다)
export const deviceId = () => {
  let d = LS.get('cgr.device', '');
  if (!d) { d = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()); LS.set('cgr.device', d); }
  return d;
};

// 서버 없이 쓸 때 사진은 이 기기의 IndexedDB에 원래 화질로 보관합니다 (localStorage는 5MB뿐이라 작게 줄여야 했습니다)
const idb = () => new Promise((ok, no) => {
  const r = indexedDB.open('cgr', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' });
  r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
});
const tx = async (mode, fn) => {
  const db = await idb();
  return new Promise((ok, no) => { const t = db.transaction('photos', mode), q = fn(t.objectStore('photos')); t.oncomplete = () => ok(q?.result); t.onerror = () => no(t.error); });
};
export const localPhotos = {
  async list() {
    try {
      // 예전 방식(localStorage)에 남은 작은 사진도 함께 보여 줍니다
      const old = LS.get('cgr.localPhotos', []).map((p, i) => ({ id: 'old' + i, ...p }));
      const l = await tx('readonly', s => s.getAll());
      return [...l.sort((a, b) => (b.at || '').localeCompare(a.at || '')), ...old].map(p => ({ ...p, local: true }));
    } catch { return LS.get('cgr.localPhotos', []).map((p, i) => ({ id: 'old' + i, ...p, local: true })); }
  },
  // IndexedDB를 못 쓰는 환경(카톡에서 받은 파일로 열기 등)에서는 줄인 사진(small())을 localStorage에 둡니다
  async add(rec, small) {
    try { await tx('readwrite', s => s.put({ id: 'L' + Date.now() + Math.random().toString(36).slice(2, 6), ...rec })); }
    catch {
      const l = LS.get('cgr.localPhotos', []); l.unshift(small ? await small() : rec);
      while (l.length) { LS.set('cgr.localPhotos', l); if (JSON.stringify(LS.get('cgr.localPhotos', [])) === JSON.stringify(l)) break; l.pop(); }
      if (!l.length) throw new Error('이 기기에 저장할 공간이 없습니다');
    }
  },
  async remove(id) {
    if (id.startsWith('old')) { const l = LS.get('cgr.localPhotos', []); l.splice(+id.slice(3), 1); LS.set('cgr.localPhotos', l); return; }
    await tx('readwrite', s => s.delete(id));
  },
};
