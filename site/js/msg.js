// 전화 · 문자 · 카카오톡 · 연락처 저장
import { kakaoKey, appUrl } from './store.js';

const KAKAO_SDK = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
export const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const digits = n => (n || '').replace(/[^\d+]/g, '');
export const isMobileNo = n => /^01[016789]/.test(digits(n));

// 문자 앱 열기 (여러 명 동시 발송 지원). iOS와 안드로이드의 주소 형식이 다릅니다.
export function smsHref(numbers, body = '') {
  const nums = numbers.map(digits).filter(Boolean);
  const b = body ? encodeURIComponent(body) : '';
  if (isIOS) {
    if (nums.length > 1) return `sms://open?addresses=${nums.join(',')}${b ? '&body=' + b : ''}`;
    return `sms:${nums[0] || ''}${b ? '&body=' + b : ''}`;
  }
  return `sms:${nums.join(',')}${b ? '?body=' + b : ''}`;
}
export const telHref = n => `tel:${digits(n)}`;

let kakaoReady = null;
function loadKakao(key) {
  if (kakaoReady) return kakaoReady;
  kakaoReady = new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = KAKAO_SDK; s.crossOrigin = 'anonymous';
    s.onload = () => { try { if (!window.Kakao.isInitialized()) window.Kakao.init(key); ok(window.Kakao); } catch (e) { no(e); } };
    s.onerror = () => { kakaoReady = null; no(new Error('카카오 SDK를 불러오지 못했습니다')); };
    document.head.appendChild(s);
  });
  return kakaoReady;
}

// 카카오톡 보내기: 카카오 키가 있으면 카카오 친구·채팅방 선택창, 없으면 휴대폰 공유창(카카오톡 선택), 그것도 없으면 복사
// 반환: 'kakao' | 'share' | 'copied' | 'cancel'
export async function sendKakao(text, url = appUrl()) {
  const key = kakaoKey();
  if (key) {
    try {
      const K = await loadKakao(key);
      K.Share.sendDefault({ objectType: 'text', text: text.length > 200 ? text.slice(0, 197) + '…' : text, link: { mobileWebUrl: url, webUrl: url }, buttonTitle: '천경련 앱 열기' });
      return 'kakao';
    } catch (e) { console.warn(e); }
  }
  if (navigator.share) {
    try { await navigator.share({ text: `${text}\n${url}` }); return 'share'; } catch (e) { if (e.name === 'AbortError') return 'cancel'; }
  }
  await copyText(`${text}\n${url}`);
  return 'copied';
}

export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } finally { ta.remove(); }
    return true;
  }
}

const vEsc = s => (s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
export function vcard(m) {
  const family = m.name.slice(0, 1), given = m.name.slice(1);
  const L = ['BEGIN:VCARD', 'VERSION:3.0', `N:${vEsc(family)};${vEsc(given)};;;`, `FN:${vEsc(m.name)}`];
  if (m.company) L.push(`ORG:${vEsc(m.company)}`);
  if (m.title) L.push(`TITLE:${vEsc(m.title)}`);
  if (m.mobile) L.push(`TEL;TYPE=CELL:${m.mobile}`);
  if (m.tel) L.push(`TEL;TYPE=WORK,VOICE:${m.tel}`);
  if (m.fax) L.push(`TEL;TYPE=WORK,FAX:${m.fax}`);
  if (m.email) L.push(`EMAIL;TYPE=INTERNET:${m.email}`);
  if (m.address) L.push(`ADR;TYPE=WORK:;;${vEsc(m.address)};;;;`);
  if (m.website) L.push(`URL:${m.website}`);
  L.push(`NOTE:${vEsc(`천안고 ${m.gisu}회 · 천경련(천안고 경제인 연합회)${m.industry ? ' · ' + m.industry : ''}`)}`, 'END:VCARD');
  return L.join('\r\n');
}
export function downloadVcard(m) {
  const blob = new Blob([vcard(m)], { type: 'text/vcard;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `${m.name}_${m.gisu}회.vcf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export const TEMPLATES = [
  { k: '모임 안내', t: '[천경련] 안녕하십니까, 천안고 경제인 연합회입니다.\n○월 ○일(○) 오후 ○시, ○○에서 정기모임이 있습니다.\n참석 여부를 회신 부탁드립니다.\n근면·강직·검소 — 함께 성장합시다.' },
  { k: '신규회원 환영', t: '[천경련] 신규 회원님의 가입을 진심으로 환영합니다.\n천경련 회원명부 앱에서 동문 명함과 기업 정보를 확인하실 수 있습니다.' },
  { k: '협력 제안', t: '[천경련] 선배님/후배님, 천경련 성장모델 관련하여 협력 말씀을 나누고 싶습니다.\n편하신 시간에 차 한잔 부탁드립니다.' },
  { k: '경조사', t: '[천경련 부고/경사 알림]\n○○회 ○○○ 동문의 ○○ 소식을 전합니다.\n일시·장소: ○○○' },
  { k: '명함 등록 요청', t: '[천경련] 회원명부 앱에서 명함을 촬영해 등록해 주세요. 졸업기수와 추천인을 함께 적어 주시면 됩니다.' },
];
