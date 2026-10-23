// 천경련 디지털 회원명부 — 화면과 동작
import { LS, loadAll, call, isServer, apiUrl, kakaoKey, appUrl, localPending, localPhotos } from './store.js';
import { toJpeg, recognize, parseCard } from './ocr.js';
import { smsHref, telHref, sendKakao, copyText, downloadVcard, isMobileNo, isIOS, TEMPLATES } from './msg.js';

// ---------- 공통 ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const view = $('#view'), topbar = $('#topbar');

const S = {
  data: null, byId: {}, q: '', group: '전체', band: '전체', pickMode: false, picked: new Set(),
  compose: { ids: [], body: '' }, reg: null, photos: null, installEvt: null, custom: new Set(),
};

const nm = m => `${m.name}(${m.gisu}회)`;
const nmHtml = (m, inv) => `${esc(m.name)}<span class="gisu${inv ? ' inv' : ''}">${esc(m.gisu)}회</span>`;
const byGisu = (a, b) => a.gisu - b.gisu || a.name.localeCompare(b.name, 'ko');
const isAdmin = () => !!LS.get('cgr.admin', '');
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const I = {
  phone: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  sms: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H8l-4 4z"/><path d="M8 10h8M8 13h5"/></svg>',
  kakao: '<svg viewBox="0 0 24 24"><path d="M12 4C7 4 3 7.1 3 11c0 2.5 1.7 4.7 4.2 5.9L6.4 20l3.6-2.4c.6.1 1.3.2 2 .2 5 0 9-3.1 9-6.9S17 4 12 4z" fill="currentColor" stroke="none"/></svg>',
  mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  save: '<svg viewBox="0 0 24 24"><circle cx="10" cy="8" r="4"/><path d="M3 20c.8-3.5 3.6-5 7-5 1.3 0 2.5.2 3.5.7M18 14v6M15 17h6"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8 7l1.5-2.5h5L16 7"/></svg>',
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
  report: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 15v2M12 11v6M16 8v9"/></svg>',
  print: '<svg viewBox="0 0 24 24"><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3"/><rect x="7" y="14" width="10" height="7"/></svg>',
  users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.5 3.2-5 6.5-5s5.9 1.5 6.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.5 0 4 1.3 4.5 4"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
};

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function setTop({ title, back = true, navy = false, right = '' } = {}) {
  topbar.className = 'topbar' + (navy ? ' on-navy' : '');
  if (!title) {
    topbar.innerHTML = `<a class="brand" href="#/home"><img src="assets/logo-emblem.svg" alt=""><span><b>천경련 회원명부</b><small>천안고 경제인 연합회</small></span></a>
      <a class="icon-btn" href="#/settings" aria-label="설정">${I.gear}</a>`;
    return;
  }
  topbar.innerHTML = `${back ? `<button class="icon-btn" data-act="back" aria-label="뒤로">${I.back}</button>` : ''}<h1>${esc(title)}</h1>${right}
    <a class="icon-btn" href="#/home" aria-label="홈으로">${I.home}</a>`;
}
function setTab(t) { $$('#tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === t)); }

// ---------- 시작 ----------
async function boot() {
  applyTextSize();
  // 초대 링크(…/#k=접근코드)로 들어오면 코드를 저장하고 주소창에서 지웁니다
  const inv = location.hash.match(/^#k=([\w-]+)/);
  if (inv) { LS.set('cgr.code', inv[1]); history.replaceState(null, '', location.pathname + '#/home'); }
  try {
    S.data = await loadAll();
  } catch (e) {
    $('#tabbar').style.display = 'none';
    return renderGate(e);
  }
  $('#tabbar').style.display = '';
  S.data.members.sort(byGisu);
  S.byId = Object.fromEntries(S.data.members.map(m => [m.id, m]));
  window.addEventListener('hashchange', route);
  route();
}

function renderGate(err) {
  topbar.style.display = 'none';
  const needServer = err.code === 'NO_SERVER';
  view.innerHTML = `<div class="gate">
    <img class="emb" src="assets/logo-emblem.svg" alt="천경련">
    <div><div style="font-size:30px;font-weight:900;letter-spacing:2px">천경련 회원명부</div>
      <div style="opacity:.85">천안고 경제인 연합회 · 회원 전용</div></div>
    <div class="card" style="color:var(--ink);text-align:left">
      ${needServer ? `<div class="field"><label>서버 주소 (총무에게 받은 주소)</label><input id="g-api" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(apiUrl())}"></div>` : ''}
      <p class="small muted" style="margin:0 0 12px">단톡방에서 받은 <b>초대 링크</b>를 누르면 자동으로 들어옵니다. 코드를 직접 넣으셔도 됩니다.</p>
      <div class="field"><label for="g-code">접근코드 (예: ABCD-EFGH-JKLM)</label><input id="g-code" inputmode="text" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="접근코드 입력" value=""></div>
      ${err.code === 'BAD_CODE' ? '<p style="color:var(--danger);font-weight:700;margin:0 0 10px">접근코드가 맞지 않습니다. 총무에게 확인해 주세요.</p>' : ''}
      ${err.code && !['BAD_CODE', 'NO_SERVER', 'NO_CODE'].includes(err.code) || (!err.code && err.message) ? `<p class="small" style="color:var(--danger)">${esc(err.message)}</p>` : ''}
      <button class="btn primary block" id="g-go">입장하기</button>
    </div>
    <div class="school"><img src="assets/school-logo.png" alt="천안고등학교"></div>
  </div>`;
  $('#g-go').onclick = () => {
    const api = $('#g-api')?.value.trim();
    if (api) LS.set('cgr.apiUrl', api);
    LS.set('cgr.code', $('#g-code').value.trim());
    location.reload();
  };
}

function route() {
  const [r, arg] = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  window.scrollTo(0, 0);
  S.pickMode = r === 'cards' ? S.pickMode : false;
  $('.pickbar')?.remove();
  const fn = ({ home: vHome, cards: vCards, m: vMember, report: vReport, models: vModels, model: vModel, custom: vCustom, register: vRegister, photos: vPhotos, compose: vCompose, settings: vSettings, install: vInstall, admin: vAdmin, edit: vEdit })[r] || vHome;
  fn(arg ? decodeURIComponent(arg) : undefined);
}

// 이벤트 위임
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  if (act === 'back') { history.length > 1 ? history.back() : (location.hash = '#/home'); }
  else if (act === 'kakao-member') { const m = S.byId[id]; shareKakao(cardText(m)); }
  else if (act === 'vcard') { downloadVcard(S.byId[id]); toast('연락처 파일을 열어 저장하세요'); }
  else if (act === 'pick') { togglePick(id, el); }
  else if (act === 'compose') { S.compose.ids = (el.dataset.ids || '').split(',').filter(Boolean); S.compose.body = ''; location.hash = '#/compose'; }
  else if (act === 'print') { window.print(); }
  else if (act === 'lightbox') { lightbox(el.dataset.src, el.dataset.cap); }
});

async function shareKakao(text) {
  const r = await sendKakao(text);
  if (r === 'copied') toast('내용을 복사했습니다. 카카오톡 대화방에 붙여넣기 하세요');
}
const cardText = m => [`[천경련 명함] ${nm(m)}`, [m.company, m.title].filter(Boolean).join(' '), m.industry, m.mobile && `휴대폰 ${m.mobile}`, m.tel && `전화 ${m.tel}`, m.email && `이메일 ${m.email}`, m.address && `주소 ${m.address}`].filter(Boolean).join('\n');

// ---------- 홈(대시보드) ----------
function vHome() {
  setTop(); setTab('home');
  const { members, models, groups } = S.data;
  const gisus = members.map(m => m.gisu);
  const bands = [10, 20, 30, 40].map(b => ({ b, n: members.filter(m => Math.floor(m.gisu / 10) * 10 === b).length }));
  const maxBand = Math.max(...bands.map(x => x.n), 1);
  const gc = groups.map(g => ({ g, n: members.filter(m => m.group === g).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
  const maxG = Math.max(...gc.map(x => x.n), 1);
  const pend = isServer() ? '' : localPending.list().length;
  // 첫 화면에서 바로 회원을 찾고, 큰 버튼 4개로 주요 기능에 들어가게 합니다. 통계는 맨 아래 접어 둡니다.
  view.innerHTML = `
  <section class="hero slim">
    <div class="slogan">함<i>·</i>께<i>·</i>천<i>·</i>고</div>
    <div class="sub">천안고 경제인 연합회 · 회원 ${members.length}명</div>
  </section>
  <div class="home-search">
    <label class="search big">${I.search}<input id="hq" type="search" enterkeyhint="search" placeholder="회원 이름이나 기수 입력" value="${esc(S.q)}" aria-label="회원 찾기"></label>
  </div>
  <div class="section">
    <div id="hres"></div>
    <div id="hmenu">
      <div class="menu-grid">
        ${bigTile('#/cards', '회원 찾기', 'var(--navy)', I.users)}
        ${bigTile('#/register', '회원 등록', 'var(--cyan-dark)', I.camera)}
        ${bigTile('#/cards', '단체 문자', 'var(--sms)', I.sms, 'pickstart')}
        ${bigTile('#/photos', '모임 사진', 'var(--call)', I.image)}
      </div>
      <a class="wide-btn" href="#/models">${I.report}<span class="grow"><b>동문 성장모델 ${models.length}가지</b><small>함께 할 수 있는 사업 제안</small></span>›</a>
      ${!standalone() ? `<a class="wide-btn install" href="#/install"><img src="assets/icon-192.png" alt=""><span class="grow"><b>휴대폰 바탕화면에 아이콘 만들기</b><small>한 번만 해 두면 바로 열립니다</small></span>›</a>` : ''}
      <div class="section-title">공지</div>
      <div class="notice"><span class="ico">馬</span><div><b>청마장학재단</b><div class="small muted">제25회부터 연 1,100만 원 장학금 지원 재개 · CMS 월 1만 원 이상 후원 모집 중 (네이버 '청마장학회')</div></div></div>
      ${pend ? `<div class="notice" style="margin-top:10px"><span class="ico">!</span><div><b>이 휴대폰에 저장된 신규 등록 ${pend}건</b><div class="small muted">총무에게 카톡으로 알려 주세요.</div></div></div>` : ''}
      <details class="fold">
        <summary>천경련 한눈에 보기 (기수별·업종별 회원 수)</summary>
        <div class="card" style="margin-top:10px"><div class="cols">
          ${bands.map(x => `<a class="col" href="#/cards" data-band="${x.b}"><b>${x.n}명</b><span class="v" style="height:${Math.max(6, x.n / maxBand * 80)}px"></span>${x.b}회대</a>`).join('')}
        </div><div class="small muted center">기수 ${Math.min(...gisus)}회 ~ ${Math.max(...gisus)}회</div></div>
        <div class="card bars" style="margin-top:10px">
          ${gc.map(x => `<a class="bar-row" href="#/cards" data-group="${esc(x.g)}"><span class="lbl">${esc(x.g)}</span><span class="track"><span class="fill" style="display:block;width:${x.n / maxG * 100}%"></span></span><span class="num">${x.n}</span></a>`).join('')}
        </div>
      </details>
    </div>
  </div>
  ${schoolFoot()}`;
  $$('[data-band]').forEach(a => a.addEventListener('click', () => { S.band = a.dataset.band; S.group = '전체'; S.q = ''; }));
  $$('[data-group]').forEach(a => a.addEventListener('click', () => { S.group = a.dataset.group; S.band = '전체'; S.q = ''; }));
  $('[data-pickstart]')?.addEventListener('click', () => { S.pickMode = true; S.picked.clear(); S.band = '전체'; S.group = '전체'; S.q = ''; });
  // 홈에서 바로 검색: 입력하면 결과가 메뉴 자리에 나타납니다
  const drawRes = () => {
    const q = S.q.trim();
    $('#hmenu').style.display = q ? 'none' : '';
    if (!q) { $('#hres').innerHTML = ''; return; }
    const list = filterMembers(q);
    $('#hres').innerHTML = `<div class="res-head">찾은 회원 ${list.length}명 <button class="btn sm" id="hclear">지우기</button></div>
      ${list.map(memberRow).join('') || '<div class="empty">찾는 회원이 없습니다.<br>이름 한 글자나 기수 숫자만 넣어 보세요.</div>'}`;
    $('#hclear').onclick = () => { S.q = ''; $('#hq').value = ''; drawRes(); $('#hq').focus(); };
  };
  $('#hq').addEventListener('input', e => { S.q = e.target.value; drawRes(); });
  drawRes();
}
const bigTile = (href, t, color, icon, flag) => `<a class="menu-tile" href="${href}" ${flag ? `data-${flag}` : ''} style="background:${color}">${icon}<b>${t}</b></a>`;
function filterMembers(raw, group = '전체', band = '전체') {
  const q = raw.trim().toLowerCase().replace(/\s*회$/, '');
  return S.data.members.filter(m => (group === '전체' || m.group === group) && (band === '전체' || Math.floor(m.gisu / 10) * 10 === +band) &&
    (!q || (/^\d+$/.test(q) ? String(m.gisu) === q : [m.name, m.company, m.industry, m.title, m.group, ...(m.tags || [])].join(' ').toLowerCase().includes(q))));
}
const schoolFoot = () => `<div class="school-foot"><img src="assets/school-logo.png" alt="천안고등학교 CHEONAN HIGH SCHOOL"><div>천안고등학교 동문 기업인 네트워크 · 천경련<br>회원 전용 · 외부 공유 금지</div></div>`;
// 회원에게는 기술 용어 안내를 띄우지 않습니다(연결 상태는 설정 화면에서 확인). 오프라인일 때만 알립니다.
function modeBanner() {
  if (S.data.mode === 'offline') return '<div class="mode-banner">인터넷 연결이 없어 마지막으로 받은 명부를 보여 드립니다.</div>';
  return '';
}

// ---------- 명함첩 ----------
function vCards() {
  setTop({ title: S.pickMode ? '단체 문자 — 받는 사람 고르기' : '회원 찾기', back: false }); setTab('cards');
  const groups = ['전체', ...S.data.groups.filter(g => S.data.members.some(m => m.group === g))];
  const bands = ['전체', '10', '20', '30', '40'];
  // 필터는 옆으로 숨지 않게 한 줄(기수대)만 버튼으로 두고, 업종은 선택 상자로 둡니다.
  view.innerHTML = `
  <div class="searchbar"><label class="search">${I.search}<input id="q" type="search" enterkeyhint="search" placeholder="이름, 회사, 기수(예: 46)" value="${esc(S.q)}" aria-label="회원 검색"></label></div>
  <div class="pad" style="padding-top:4px;padding-bottom:0">
    ${S.pickMode ? `<div class="pick-help">받을 회원을 눌러 <b>체크</b>하세요. 아래 기수대를 고르면 그 기수 전체를 한 번에 고를 수 있습니다.${S.group !== '전체' ? `<br><b style="color:var(--danger)">업종: ${esc(S.group)}만 보는 중</b>` : ''}</div>` : ''}
    <div class="seg" id="bandChips">${bands.map(b => `<button class="${S.band === b ? 'on' : ''}" data-v="${b}">${b === '전체' ? '전체' : b + '회대'}</button>`).join('')}</div>
    <div class="row" style="margin-top:8px;gap:8px">
      <select id="groupSel" class="sel-big grow" aria-label="업종">${groups.map(g => `<option value="${esc(g)}" ${S.group === g ? 'selected' : ''}>${g === '전체' ? '업종 전체' : esc(g)}</option>`).join('')}</select>
      ${S.pickMode ? '' : `<button class="btn sms-outline" id="pickToggle">${I.sms}단체 문자</button>`}
    </div>
  </div>
  <div class="list" id="mlist"></div>`;
  const draw = () => {
    const list = filterMembers(S.q, S.group, S.band);
    let last = null, html = '';
    for (const m of list) {
      if (m.gisu !== last) { html += `<div class="gisu-head">${m.gisu}회 · ${list.filter(x => x.gisu === m.gisu).length}명</div>`; last = m.gisu; }
      html += memberRow(m);
    }
    $('#mlist').innerHTML = html || '<div class="empty">찾는 회원이 없습니다.<br>이름 한 글자나 기수 숫자만 넣어 보세요.</div>';
    drawPickbar();
  };
  $('#q').addEventListener('input', e => { S.q = e.target.value; draw(); });
  $('#bandChips').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.band = b.dataset.v; vCards(); });
  $('#groupSel').onchange = e => { S.group = e.target.value; vCards(); };
  // 명함첩에서 기수대·업종을 고른 뒤 [단체 문자]를 누르면 그 조건의 회원을 모두 체크한 채로 시작합니다
  $('#pickToggle') && ($('#pickToggle').onclick = () => {
    S.pickMode = true; S.picked.clear();
    if (S.band !== '전체' || S.group !== '전체' || S.q.trim()) filterMembers(S.q, S.group, S.band).forEach(m => S.picked.add(m.id));
    vCards();
  });
  $('#mlist').classList.toggle('picking', S.pickMode);
  draw();
}
function memberRow(m) {
  const line2 = esc([m.company, m.title].filter(Boolean).join(' · ') || m.industry);
  if (S.pickMode) {
    return `<div class="m-item ${S.picked.has(m.id) ? 'picked' : ''}" data-act="pick" data-id="${m.id}" role="checkbox" aria-checked="${S.picked.has(m.id)}">
      <span class="sel"></span>
      <div class="grow"><div class="nm">${nmHtml(m)}</div><div class="co">${line2}</div>
      ${m.mobile ? '' : '<div class="small" style="color:var(--danger)">휴대폰 번호 없음</div>'}</div></div>`;
  }
  const mob = m.mobile && isMobileNo(m.mobile);
  return `<div class="m-item" onclick="location.hash='#/m/${m.id}'">
    <div class="grow"><div class="nm">${nmHtml(m)}</div><div class="co">${line2}</div></div>
    ${mob ? `<span class="quick" onclick="event.stopPropagation()"><a class="call" href="${telHref(m.mobile)}" aria-label="${esc(m.name)}에게 전화">${I.phone}<span>전화</span></a><a class="sms" href="${smsHref([m.mobile])}" aria-label="${esc(m.name)}에게 문자">${I.sms}<span>문자</span></a></span>` : '<span class="nophone-tag">번호<br>없음</span>'}
  </div>`;
}
function togglePick(id, el) {
  S.picked.has(id) ? S.picked.delete(id) : S.picked.add(id);
  el.classList.toggle('picked'); el.setAttribute('aria-checked', S.picked.has(id));
  drawPickbar();
}
function drawPickbar() {
  $('.pickbar')?.remove();
  if (!S.pickMode) return;
  const bar = document.createElement('div');
  bar.className = 'pickbar';
  const shown = filterMembers(S.q, S.group, S.band);
  const scope = [S.band !== '전체' && `${S.band}회대`, S.group !== '전체' && S.group].filter(Boolean).join(' ') || '전체';
  const allOn = shown.length && shown.every(m => S.picked.has(m.id));
  bar.innerHTML = `<div class="grow"><b>${S.picked.size}명 선택</b><button class="linkish" data-cancel>그만두기</button></div>
    <button class="btn" data-all>${allOn ? '모두 해제' : `${esc(scope)} ${shown.length}명 모두`}</button>
    <button class="btn sms" data-go ${S.picked.size ? '' : 'disabled'}>문자 쓰기</button>`;
  document.body.appendChild(bar);
  $('[data-all]', bar).onclick = () => { shown.forEach(m => allOn ? S.picked.delete(m.id) : S.picked.add(m.id)); vCards(); };
  $('[data-cancel]', bar).onclick = () => { S.pickMode = false; S.picked.clear(); vCards(); };
  $('[data-go]', bar).onclick = () => { S.compose.ids = [...S.picked]; S.compose.body = ''; location.hash = '#/compose'; };
}

// ---------- 디지털 명함 ----------
function vMember(id) {
  const m = S.byId[id];
  if (!m) return notFound();
  setTop({ title: nm(m) }); setTab('cards');
  const p = S.data.profiles[id];
  const models = S.data.models.filter(g => g.members.includes(id));
  const mob = m.mobile && isMobileNo(m.mobile) ? m.mobile : '';
  view.innerHTML = `<div class="pad">
    <div class="bizcard">
      <img class="emb" src="assets/logo-emblem.svg" alt="">
      <div class="org">天高 經濟人 聯合會 · 천경련</div>
      <div class="name">${esc(m.name)}<span class="gisu inv">${m.gisu}회</span></div>
      <div class="title">${esc(m.title)}</div>
      <div class="company">${esc(m.company || '')}</div>
      <div class="ind">${esc(m.industry)}</div>
      ${m.photoUrl ? `<div class="photo-ring"><img src="${esc(m.photoUrl)}" alt=""></div>` : ''}
    </div>
    ${mob || m.tel ? `<a class="btn call block big" href="${telHref(mob || m.tel)}" style="margin-top:14px">${I.phone}전화 걸기 <span class="num">${esc(mob || m.tel)}</span></a>` : '<div class="check-note" style="margin-top:14px">등록된 전화번호가 없습니다.</div>'}
    <div class="stack" style="margin-top:10px">
      ${mob ? `<a class="btn sms block big" href="${smsHref([mob])}">${I.sms}문자 보내기</a>` : ''}
      <button class="btn kakao block big" data-act="kakao-member" data-id="${m.id}">${I.kakao}카톡으로 이 명함 보내기</button>
    </div>
    <div class="btn-row" style="margin-top:10px">
      <button class="btn" data-act="vcard" data-id="${m.id}">${I.save}내 폰에 저장</button>
      ${m.email ? `<a class="btn" href="mailto:${esc(m.email)}">${I.mail}메일 보내기</a>` : ''}
    </div>
    <a class="wide-btn" href="#/report/${m.id}" style="margin-top:12px">${I.report}<span class="grow"><b>기업 소개서 보기</b><small>이 회원의 회사 소개와 강점</small></span>›</a>
    <div class="card" style="margin-top:12px">
      <dl class="kv">
        <dt>성명</dt><dd><b>${nmHtml(m)}</b></dd>
        ${m.title ? `<dt>직위</dt><dd>${esc(m.title)}</dd>` : ''}
        ${m.company ? `<dt>회사</dt><dd>${esc(m.company)}</dd>` : ''}
        ${m.industry ? `<dt>하는 일</dt><dd>${esc(m.industry)}</dd>` : ''}
        <dt>휴대폰</dt><dd>${m.mobile ? `<a href="${telHref(m.mobile)}">${esc(m.mobile)}</a>` : '<span class="faint">아직 없음</span>'}</dd>
        ${m.tel ? `<dt>회사전화</dt><dd><a href="${telHref(m.tel)}">${esc(m.tel)}</a></dd>` : ''}
        ${m.fax ? `<dt>팩스</dt><dd>${esc(m.fax)}</dd>` : ''}
        ${m.email ? `<dt>이메일</dt><dd><a href="mailto:${esc(m.email)}">${esc(m.email)}</a></dd>` : ''}
        ${m.address ? `<dt>주소</dt><dd><a href="https://map.naver.com/p/search/${encodeURIComponent(m.address)}" target="_blank" rel="noopener">${esc(m.address)}</a><div class="small faint">누르면 지도가 열립니다</div></dd>` : ''}
        ${m.website ? `<dt>홈페이지</dt><dd><a href="${esc(/^https?:/.test(m.website) ? m.website : 'https://' + m.website)}" target="_blank" rel="noopener">${esc(m.website)}</a></dd>` : ''}
        ${m.recommenderName ? `<dt>추천인</dt><dd>${esc(m.recommenderName)}${m.recommenderGisu ? `<span class="gisu">${esc(m.recommenderGisu)}회</span>` : ''}</dd>` : ''}
      </dl>
      ${m.memo ? `<div class="hr"></div><div class="small muted">${esc(m.memo)}</div>` : ''}
      ${m.check && isAdmin() ? `<div class="check-note">자료 확인 필요: ${esc(m.check)}</div>` : ''}
    </div>
    ${p || models.length ? `<details class="fold"><summary>이 회원과 협력할 만한 동문 보기</summary>
      ${p ? p.partners.map(x => partnerRow(x)).join('') : ''}${models.length ? `<div class="section-title">함께 하는 성장모델</div>${models.map(gmItem).join('')}` : ''}</details>` : ''}
    ${isAdmin() ? `<a class="btn block" href="#/edit/${m.id}" style="margin-top:14px">회원 정보 수정 (관리자)</a>` : `<a class="btn block" href="#/register" style="margin-top:16px">정보가 바뀌었나요? 새 명함 올리기</a>`}
  </div>`;
}
const partnerRow = x => { const o = S.byId[x.id]; return o ? `<a class="partner card" href="#/m/${o.id}" style="padding:12px 14px"><b>${nmHtml(o)}</b><span class="grow small muted">${esc(x.why)}</span>›</a>` : ''; };
function notFound() { setTop({ title: '찾을 수 없음' }); view.innerHTML = '<div class="empty">해당 정보를 찾을 수 없습니다.</div>'; }

// ---------- 기업역량 보고서 (스토리보드) ----------
function vReport(id) {
  const m = S.byId[id], p = S.data.profiles[id];
  if (!m) return notFound();
  setTop({ title: `${nm(m)} 기업 소개서` }); setTab('cards');
  if (!p) { view.innerHTML = `<div class="empty">아직 분석 자료가 없습니다.<br>관리자가 분석 자료를 올리면 표시됩니다.</div>`; return; }
  const topCap = [...p.caps].sort((a, b) => b.v - a.v)[0];
  const scenes = [
    { light: false, h: '1. 한 줄 소개', narr: `천안고 <b>${m.gisu}회</b> ${esc(m.name)} ${esc(m.title)}입니다. "${esc(p.headline)}"`,
      frame: `<div class="small" style="opacity:.85">천안고 ${m.gisu}회 · ${esc(m.group)}</div><div class="big-name">${esc(m.name)}</div><div style="font-weight:800;font-size:19px">${esc(m.company || m.industry)}</div><div style="margin-top:8px;font-size:18px;color:var(--sky2);font-weight:700">"${esc(p.headline)}"</div>` },
    { light: true, h: '2. 하는 일', narr: esc(p.business),
      frame: `<div style="font-size:24px;font-weight:900;color:var(--navy)">${esc(m.industry)}</div><div style="margin-top:6px">${(m.tags || []).map(t => `<span class="tag" style="background:#fff">#${esc(t)}</span>`).join('')}</div>` },
    { light: false, h: '3. 강점 3가지', narr: '현재 사업에서 확인되는 강점입니다.',
      frame: p.strengths.map((s, i) => `<div class="strength"><b>${i + 1}</b><span>${esc(s)}</span></div>`).join('') },
    { light: true, h: '4. 역량 점수 (5점 만점)', narr: `가장 높은 항목은 <b>${esc(topCap.k)}(${topCap.v}점)</b>입니다. 명단·명함 정보 기반의 정성 평가입니다.`,
      frame: p.caps.map(c => `<div class="capbar"><span>${esc(c.k)}</span><span class="t">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= c.v ? 'on' : ''}"></i>`).join('')}</span><b style="color:var(--navy)">${c.v}</b></div>`).join('') },
    { light: false, h: '5. 기회와 과제', narr: '지역 시장 환경에서 본 기회와 보완할 점입니다.',
      frame: `<div class="strength" style="display:block"><div style="color:var(--cyan);font-size:14px">기회</div>${esc(p.market)}</div><div class="strength" style="display:block"><div style="color:#ffd27a;font-size:14px">과제</div>${esc(p.risk)}</div>` },
    { light: true, h: '6. 동문과 함께 할 일', narr: `<b>동문께 드리는 말씀:</b> ${esc(p.ask)}`,
      frame: `${p.partners.map(x => { const o = S.byId[x.id]; return o ? `<a class="partner" href="#/m/${o.id}"><b>${nmHtml(o)}</b><span class="grow small">${esc(x.why)}</span></a>` : ''; }).join('')}
        <div style="margin-top:8px;font-size:14px">${p.growth.map((g, i) => `<div><b style="color:var(--navy)">${['단기', '중기', '장기'][i]}</b> ${esc(g)}</div>`).join('')}</div>` },
  ];
  view.innerHTML = `
    <div class="pad no-print" style="padding-bottom:0"><div class="btn-row"><button class="btn kakao" id="rk0">${I.kakao}카톡 보내기</button><button class="btn" data-act="print">${I.print}인쇄·PDF</button></div>
      <p class="muted small" style="margin:12px 0 0">아래로 내리며 보세요 (6쪽)</p></div>
    <div class="sb-wrap" id="sb">${scenes.map((s, i) => `<article class="scene">
      <div class="frame ${s.light ? 'light' : ''}"><span class="scene-no">${i + 1} / ${scenes.length}</span>${s.frame}</div>
      <div class="cap"><h3>${s.h}</h3><div class="narr">${s.narr}</div></div></article>`).join('')}</div>
    <div class="pad no-print">
      <div class="btn-row"><button class="btn kakao" id="rk">${I.kakao}카톡 보내기</button><button class="btn" data-act="print">${I.print}인쇄·PDF</button></div>
      <p class="disclaimer" style="margin-top:12px">${esc(S.data.meta?.profileBasis || '회원명단·명함 정보 기반 정성 분석입니다. 재무자료는 반영하지 않았습니다.')}</p>
    </div>`;
  $('#rk').onclick = $('#rk0').onclick = () => shareKakao(`[천경련 기업역량 보고서] ${nm(m)} ${m.company || ''}\n"${p.headline}"\n강점: ${p.strengths.join(' / ')}\n성장: ${p.growth[0]}`);
}

// ---------- 성장모델 ----------
const total = g => Object.values(g.scores).reduce((a, b) => a + b, 0);
function gmItem(g) {
  const t = total(g);
  return `<a class="gm-item" href="#/model/${g.id}"><div class="row">
    <div class="grow"><div class="small faint" style="font-weight:800">동문 ${g.members.length}명이 함께</div><h3>${esc(g.title)}</h3><div class="small muted">${esc(g.tagline)}</div></div>
    <div class="score-ring" style="--p:${t}" title="실현 가능성 점수(100점)"><span>${t}<small>점</small></span></div></div>
    <div class="people">${g.members.map(id => S.byId[id] ? `<span>${esc(nm(S.byId[id]))}</span>` : '').join('')}</div></a>`;
}
function vModels() {
  setTop({ title: '동문 성장모델' }); setTab('models');
  const meta = S.data.meta || {};
  view.innerHTML = `<div class="pad">
    <div class="card" style="background:var(--sky);box-shadow:none;border-color:var(--sky2)">
      <b style="color:var(--navy);font-size:19px">동문끼리 함께 할 수 있는 사업 ${S.data.models.length}가지</b>
      <p class="small" style="margin:6px 0 0">Claude가 회원 회사 정보를 분석해 2~4명이 협력할 사업을 제안했습니다. 오른쪽 숫자는 <b>실현 가능성 점수(100점 만점)</b>입니다.</p>
      <details style="margin-top:6px"><summary class="small muted">분석 방법 자세히</summary><p class="small muted">${esc(meta.portfolio || '')}</p><p class="small faint">${esc(meta.method || '')}</p></details>
    </div>
    <a class="btn cyan block" href="#/custom" style="margin:12px 0">${I.users} 동문 2~4명 직접 골라 분석하기</a>
    ${[...S.data.models].sort((a, b) => total(b) - total(a)).map(gmItem).join('') || '<div class="empty">성장모델 자료가 아직 없습니다.</div>'}
    <p class="disclaimer">${esc(meta.modelBasis || '')}</p>
  </div>`;
}
function vModel(id) {
  const g = S.data.models.find(x => x.id === id);
  if (!g) return notFound();
  setTop({ title: g.title }); setTab('models');
  const ms = g.members.map(i => S.byId[i]).filter(Boolean);
  const sc = g.scores, label = { feasibility: '실현성', market: '시장성', synergy: '시너지', speed: '속도' };
  const sec = (t, body) => `<div class="section-title">${t}</div><div class="card">${body}</div>`;
  view.innerHTML = `
  <section class="gm-hero">
    <div class="tiny" style="opacity:.8;font-weight:800">${esc(g.id)} · ${ms.length}인 성장모델 · 총점 ${total(g)}/100</div>
    <h2>${esc(g.title)}</h2><div style="opacity:.92">${esc(g.tagline)}</div>
    <div class="people">${ms.map(m => `<a href="#/m/${m.id}">${esc(nm(m))}</a>`).join('')}</div>
    <div class="score-grid">${Object.keys(label).map(k => `<div><b>${sc[k]}</b>${label[k]}/25</div>`).join('')}</div>
  </section>
  <div class="section">
    <div class="btn-row" style="margin-top:14px"><button class="btn sms" data-act="compose" data-ids="${g.members.join(',')}">${I.sms}참여 회원에게 문자</button><button class="btn kakao" id="gk">${I.kakao}카톡 공유</button></div>
    ${sec('문제와 해법', `<b>문제</b><p class="small" style="margin:4px 0 10px">${esc(g.problem)}</p><b>해법</b><p class="small" style="margin:4px 0 0">${esc(g.solution)}</p>`)}
    <div class="section-title">참여 기업 분석</div>
    ${g.companyAnalysis.map(c => { const m = S.byId[c.id]; return `<div class="ca card"><h4><a href="#/m/${c.id}" style="text-decoration:none">${m ? nmHtml(m) : esc(c.id)}</a> <span class="small muted">${esc(m?.company || '')}</span></h4>
      <dl><dt>역할</dt><dd><b>${esc(c.role)}</b></dd><dt>핵심역량</dt><dd>${esc(c.core)}</dd><dt>얻는 것</dt><dd>${esc(c.gain)}</dd><dt>보완점</dt><dd>${esc(c.gap)}</dd></dl></div>`; }).join('')}
    ${sec('가치 흐름', `<ol class="flow">${g.flow.map(f => `<li>${esc(f)}</li>`).join('')}</ol>`)}
    ${sec('비즈니스 모델', `<div class="bmc">
      <div class="wide"><h4>가치 제안</h4>${esc(g.bmc.value)}</div>
      <div><h4>목표 고객</h4>${esc(g.bmc.customers)}</div><div><h4>채널</h4>${esc(g.bmc.channels)}</div>
      <div><h4>수익원</h4>${g.bmc.revenue.map(esc).join('<br>')}</div><div><h4>주요 비용</h4>${esc(g.bmc.costs)}</div>
      <div class="wide"><h4>외부 파트너</h4>${esc(g.bmc.partners)}</div></div>`)}
    ${sec('수익 시뮬레이션 (가정)', `<ul class="bul">${g.financials.assumptions.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
      <table class="fin"><thead><tr><th>항목</th><th>1년차</th><th>2년차</th></tr></thead><tbody>${g.financials.rows.map(r => `<tr><td>${esc(r.item)}</td><td>${esc(r.y1)}</td><td>${esc(r.y2)}</td></tr>`).join('')}</tbody></table>
      <p class="tiny faint" style="margin:8px 0 0">${esc(g.financials.note)}</p>`)}
    ${sec('실행 로드맵', `<div class="road">${g.roadmap.map(r => `<div class="ph"><b>${esc(r.phase)}</b> <span class="small muted">${esc(r.period)}</span><ul>${r.tasks.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}</div>`)}
    ${sec('정부·공공 지원 연계', g.support.map(s => `<div class="risk"><b>${esc(s.name)}</b><span class="small muted">${esc(s.org)}</span><span class="small">${esc(s.fit)}</span></div>`).join(''))}
    ${sec('리스크와 대응', g.risks.map(r => `<div class="risk"><b>⚠ ${esc(r.risk)}</b><span class="small">→ ${esc(r.mitigation)}</span></div>`).join(''))}
    ${sec('성과 지표 (KPI)', `<ul class="bul">${g.kpis.map(k => `<li>${esc(k)}</li>`).join('')}</ul>`)}
    ${sec('첫 미팅 준비', `<b>의제</b><ul class="bul">${g.firstMeeting.agenda.map(a => `<li>${esc(a)}</li>`).join('')}</ul><b style="display:block;margin-top:8px">준비 자료</b><ul class="bul">${g.firstMeeting.prep.map(a => `<li>${esc(a)}</li>`).join('')}</ul>`)}
    <p class="disclaimer" style="margin-top:14px">${esc(S.data.meta?.modelBasis || '')}</p>
    <button class="btn block" data-act="print" style="margin-top:8px">${I.print}인쇄·PDF로 저장</button>
  </div>`;
  $('#gk').onclick = () => shareKakao(`[천경련 성장모델] ${g.title}\n${g.tagline}\n참여: ${ms.map(nm).join(', ')}\n첫 미팅 의제: ${g.firstMeeting.agenda.join(' / ')}`);
}

// 직접 조합 → Claude 분석 요청문 생성
function vCustom() {
  setTop({ title: '동문 조합 분석' }); setTab('models');
  view.innerHTML = `<div class="pad">
    <p class="muted" style="margin-top:0">함께 사업을 해 볼 동문을 <b>2~4명</b> 고르면, Claude에게 보낼 심층분석 요청문을 만들어 드립니다.</p>
    <label class="search" style="margin-bottom:10px">${I.search}<input id="cq" type="search" placeholder="이름·회사·업종 검색"></label>
    <div id="csel" class="recips" style="margin-bottom:10px"></div>
    <div id="clist"></div>
    <div style="position:sticky;bottom:calc(96px + var(--safe-b));padding-top:8px"><button class="btn primary block" id="cgo" disabled>Claude 분석 요청문 만들기</button></div>
    <div id="cout"></div></div>`;
  const draw = () => {
    const q = $('#cq').value.trim().toLowerCase();
    $('#csel').innerHTML = [...S.custom].map(id => `<span>${esc(nm(S.byId[id]))}</span>`).join('') || '<span class="faint" style="background:none">아직 고른 동문이 없습니다</span>';
    $('#clist').innerHTML = S.data.members.filter(m => !q || [m.name, m.company, m.industry, m.gisu].join(' ').toLowerCase().includes(q)).slice(0, 60)
      .map(m => `<div class="m-item ${S.custom.has(m.id) ? 'picked' : ''}" data-cid="${m.id}"><span class="avatar">${esc(m.name[0])}</span><div class="grow"><div class="nm">${nmHtml(m)}</div><div class="co ellipsis">${esc(m.company || m.industry)}</div></div><span class="sel"></span></div>`).join('');
    $('#cgo').disabled = S.custom.size < 2;
    $('#cgo').textContent = S.custom.size < 2 ? '2명 이상 골라 주세요' : `${S.custom.size}명 조합 · Claude 분석 요청문 만들기`;
  };
  $('#cq').oninput = draw;
  $('#clist').onclick = e => {
    const it = e.target.closest('[data-cid]'); if (!it) return;
    const id = it.dataset.cid;
    if (S.custom.has(id)) S.custom.delete(id); else if (S.custom.size < 4) S.custom.add(id); else return toast('최대 4명까지 고를 수 있습니다');
    draw();
  };
  $('#cgo').onclick = () => {
    const ms = [...S.custom].map(id => S.byId[id]);
    const lines = ms.map(m => { const p = S.data.profiles[m.id]; return `- ${nm(m)} / ${m.company || '-'} / ${m.title || '-'} / 업종: ${m.industry}${p ? ` / 강점: ${p.strengths.join(', ')} / 사업: ${p.business}` : ''}`; });
    const prompt = `당신은 충남 천안·아산 지역 중소기업 전문 경영컨설턴트입니다. 천안고등학교 동문 기업인 모임(천경련) 회원 ${ms.length}명이 함께 할 수 있는 실현 가능한 비즈니스 모델을 심층 분석해 주세요.\n\n[참여 회원]\n${lines.join('\n')}\n\n[요청 사항]\n1. 각 회원 기업의 핵심 역량·보완점 분석\n2. 협업 비즈니스 모델 1~2개 (가치제안, 목표고객, 수익구조, 역할 분담)\n3. 1~2년차 수익 시뮬레이션 (가정과 계산식 명시, 보수적으로)\n4. 0~3개월 / 3~6개월 / 6~12개월 실행 로드맵\n5. 활용 가능한 실제 정부·지자체 지원사업 (공고 확인 필요 표시)\n6. 리스크와 대응, 첫 미팅 의제\n사실이 확인되지 않은 내용은 가정으로 표시해 주세요.`;
    $('#cout').innerHTML = `<div class="card" style="margin-top:12px"><b>Claude 분석 요청문</b><textarea class="ocr-raw" style="width:100%;min-height:220px;border:0;font-size:14px" readonly>${esc(prompt)}</textarea>
      <div class="btn-row" style="margin-top:10px"><button class="btn" id="ccopy">${I.copy}복사</button><a class="btn primary" href="https://claude.ai/new?q=${encodeURIComponent(prompt)}" target="_blank" rel="noopener">Claude에서 열기</a></div>
      <p class="tiny faint" style="margin:8px 0 0">Claude 앱이 열리면 요청문이 입력되어 있습니다. 바로 [보내기]를 누르세요. 개인 연락처는 요청문에 넣지 않았습니다.</p></div>`;
    $('#ccopy').onclick = async () => { await copyText(prompt); toast('복사했습니다'); };
    $('#cout').scrollIntoView({ behavior: 'smooth' });
  };
  draw();
}

// ---------- 신규회원 등록 ----------
const EMPTY_REG = () => ({ card: null, photo: null, ocrText: '', engine: '', f: { name: '', gisu: '', title: '', company: '', industry: '', group: '', mobile: '', tel: '', fax: '', email: '', address: '', website: '', memo: '', recommended: false, recommenderName: '', recommenderGisu: '', registrant: LS.get('cgr.me', {}).name || '' } });
function vRegister() {
  setTop({ title: '회원 등록', back: false }); setTab('register');
  S.reg ||= EMPTY_REG();
  const R = S.reg, f = R.f;
  const groups = S.data.groups;
  const fld = (k, label, attrs = '', req = false) => `<div class="field"><label for="f-${k}">${label}${req ? ' <span class="req">*</span>' : ''}</label><input id="f-${k}" name="${k}" value="${esc(f[k])}" ${attrs}></div>`;
  view.innerHTML = `<div class="pad">
    <div class="section-title" style="margin-top:4px">① 명함 사진 찍기</div>
    <div class="scan-box">
      <label class="scan-btn primary">${I.camera}명함 촬영<small>카메라가 열립니다</small><input type="file" accept="image/*" capture="environment" id="in-card-cam"></label>
      <label class="scan-btn">${I.image}사진첩에서 고르기<small>찍어 둔 명함 사진</small><input type="file" accept="image/*" id="in-card"></label>
    </div>
    <p class="small" style="margin:10px 2px 0;color:var(--navy);font-weight:700">찍으면 이름·전화·회사가 아래에 자동으로 채워집니다.</p>
    <label class="scan-btn" style="margin-top:10px;grid-auto-flow:column;justify-content:center;padding:12px">${I.save}<span>얼굴 사진 넣기 <small>(안 해도 됩니다)</small></span><input type="file" accept="image/*" id="in-photo"></label>
    <div id="ocrState"></div>
    <div class="preview-row">${R.card ? `<figure><img src="${R.card.dataUrl}" alt="명함"><figcaption>명함</figcaption></figure>` : ''}${R.photo ? `<figure><img src="${R.photo.dataUrl}" alt="사진"><figcaption>프로필 사진</figcaption></figure>` : ''}</div>
    ${R.ocrText ? `<details style="margin-top:10px"><summary class="small muted">인식된 글자 보기 (${esc(R.engine)})</summary><div class="ocr-raw">${esc(R.ocrText)}</div></details>` : ''}

    <form id="regForm" autocomplete="off">
      <div class="section-title">② 회원 정보</div>
      <p class="small muted" style="margin:-4px 0 12px">${R.card ? '명함에서 자동으로 채운 내용이 맞는지 확인하세요.' : '명함 사진이 없으면 직접 입력해도 됩니다. <b>*</b> 표시만 꼭 채우세요.'}</p>
      <div class="field-2 name-gisu">${fld('name', '성명', 'required autocomplete="off"', true)}
        <div class="field"><label for="f-gisu">졸업기수 <span class="req">*</span></label><div class="suffix" data-suffix="회"><input id="f-gisu" name="gisu" type="number" inputmode="numeric" min="1" max="99" required value="${esc(f.gisu)}" placeholder="예: 46"></div></div></div>
      ${fld('mobile', '휴대폰', 'type="tel" inputmode="tel" required placeholder="010-0000-0000"', true)}
      ${fld('company', '회사명', '', true)}
      ${fld('title', '직위', 'placeholder="예: 대표이사"')}
      <details class="fold" id="moreFields" ${['tel', 'fax', 'email', 'address', 'website', 'industry', 'memo'].some(k => f[k]) ? 'open' : ''}>
        <summary>추가 정보 넣기 (선택)</summary>
        <div style="margin-top:12px">
          ${fld('tel', '회사 전화', 'type="tel" inputmode="tel"')}
          ${fld('email', '이메일', 'type="email" inputmode="email"')}
          ${fld('address', '회사 주소')}
          ${fld('industry', '하는 일(업종)', 'placeholder="예: 자동차부품 제조"')}
          <div class="field"><label for="f-group">업종 분류</label><select id="f-group" name="group"><option value="">선택 안 함</option>${groups.map(g => `<option ${f.group === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
          ${fld('fax', '팩스', 'type="tel" inputmode="tel"')}
          ${fld('website', '홈페이지')}
          <div class="field"><label for="f-memo">회사 소개·한마디</label><textarea id="f-memo" name="memo" placeholder="주요 제품, 거래처, 동문께 드리는 말씀">${esc(f.memo)}</textarea></div>
        </div>
      </details>

      <div class="section-title">③ 추천인 (있을 때만)</div>
      <label class="toggle"><input type="checkbox" name="recommended" id="f-rec" ${f.recommended ? 'checked' : ''}> 다른 동문의 추천으로 가입합니다</label>
      <div id="recBox" style="${f.recommended ? '' : 'display:none'};margin-top:10px">
        <div class="field-2">
          <div class="field"><label for="f-recName">추천인 성명 <span class="req">*</span></label><input id="f-recName" name="recommenderName" list="memberNames" value="${esc(f.recommenderName)}" placeholder="예: 홍길동"></div>
          <div class="field"><label for="f-recGisu">추천인 기수 <span class="req">*</span></label><div class="suffix" data-suffix="회"><input id="f-recGisu" name="recommenderGisu" type="number" inputmode="numeric" min="1" max="99" value="${esc(f.recommenderGisu)}" placeholder="예: 46"></div></div>
        </div>
        <datalist id="memberNames">${S.data.members.map(m => `<option value="${esc(m.name)}">${esc(nm(m))}</option>`).join('')}</datalist>
      </div>

      <details class="fold" ${f.registrant && f.registrant !== f.name ? 'open' : ''}><summary>다른 분 명함을 대신 올리는 경우</summary><div style="margin-top:12px">
      ${fld('registrant', '대신 올리는 분(나)의 성함')}</div></details>
      <label class="consent big" style="margin:16px 0 14px"><input type="checkbox" id="f-agree" required> <span><b>명함 주인이 명부 공개에 동의했습니다</b><small>성명·기수·연락처·회사 정보를 천경련 회원에게만 공개합니다.</small></span></label>
      <button class="btn primary block" type="submit" style="min-height:60px;font-size:20px">등록 신청하기</button>
      <p class="center" style="margin-top:14px"><button class="linkish" type="button" id="regReset">입력한 내용 모두 지우기</button></p>
    </form>
  </div>`;

  const form = $('#regForm');
  const sync = () => { for (const el of form.elements) if (el.name) f[el.name] = el.type === 'checkbox' ? el.checked : el.value; };
  form.addEventListener('input', sync);
  $('#f-rec').onchange = e => { $('#recBox').style.display = e.target.checked ? '' : 'none'; };
  $('#f-recName').addEventListener('change', e => { const hit = S.data.members.filter(m => m.name === e.target.value.trim()); if (hit.length === 1 && !$('#f-recGisu').value) { $('#f-recGisu').value = hit[0].gisu; sync(); } });
  $('#regReset').onclick = () => { if (confirm('입력한 내용을 모두 지울까요?')) { S.reg = EMPTY_REG(); vRegister(); } };
  const onCard = async e => {
    const file = e.target.files[0]; if (!file) return;
    sync();
    R.card = await toJpeg(file, 1800, 0.88);
    vRegister();
    await runOcr();
  };
  $('#in-card-cam').onchange = onCard; $('#in-card').onchange = onCard;
  $('#in-photo').onchange = async e => { const file = e.target.files[0]; if (!file) return; sync(); R.photo = await toJpeg(file, 640, 0.85); vRegister(); };

  form.onsubmit = async e => {
    e.preventDefault(); sync();
    if (!f.name.trim() || !f.gisu || !f.company.trim() || !f.mobile.trim()) return toast('성명·졸업기수·회사명·휴대폰은 꼭 입력해 주세요');
    if (f.recommended && (!f.recommenderName.trim() || !f.recommenderGisu)) return toast('추천인 성명과 기수를 입력해 주세요');
    if (!$('#f-agree').checked) return toast('개인정보 수집·이용에 동의해 주세요');
    const dup = S.data.members.find(m => m.name === f.name.trim() && +m.gisu === +f.gisu);
    if (dup && !confirm(`${nm(dup)} 회원이 이미 있습니다. 정보 변경으로 신청할까요?`)) return;
    const member = { ...f, name: f.name.trim(), gisu: +f.gisu, recommenderGisu: f.recommended ? +f.recommenderGisu : '', updateOf: dup?.id || '' };
    delete member.recommended;
    const btn = form.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = '보내는 중…';
    try {
      if (isServer()) await call('register', { member, cardImage: R.card?.base64 || '', photo: R.photo?.base64 || '' });
      else localPending.add({ ...member, at: new Date().toISOString(), card: R.card ? (await shrink(R.card.dataUrl)) : '' });
      const done = { ...member };
      S.reg = EMPTY_REG();
      regDone(done);
    } catch (err) { toast('등록 실패: ' + err.message); btn.disabled = false; btn.textContent = '등록 신청하기'; }
  };
}
async function runOcr() {
  const R = S.reg, box = $('#ocrState');
  box.innerHTML = `<div class="card" style="margin-top:12px"><b id="ocrMsg">명함 글자를 읽는 중…</b><div class="progress"><i id="ocrBar"></i></div></div>`;
  try {
    const { text, engine } = await recognize(R.card, (p, msg) => { const b = $('#ocrBar'); if (b) b.style.width = Math.round(p * 100) + '%'; const t = $('#ocrMsg'); if (t) t.textContent = msg; });
    R.ocrText = text; R.engine = engine;
    const parsed = parseCard(text);
    let n = 0;
    for (const [k, v] of Object.entries(parsed)) if (v && !R.f[k]) { R.f[k] = v; n++; }
    vRegister();
    toast(n ? `명함에서 ${n}개 항목을 읽었습니다. 내용을 확인하세요` : '글자를 읽지 못했습니다. 직접 입력해 주세요');
  } catch (e) {
    box.innerHTML = `<div class="check-note">자동 인식에 실패했습니다(${esc(e.message)}). 아래에 직접 입력해 주세요.</div>`;
  }
}
async function shrink(dataUrl) { const b = await (await fetch(dataUrl)).blob(); return (await toJpeg(b, 480, 0.7)).dataUrl; }
function regDone(m) {
  setTop({ title: '등록 신청 완료', back: false });
  const msg = `[천경련 신규회원 등록 신청]\n${m.name}(${m.gisu}회) ${m.company} ${m.title}\n휴대폰 ${m.mobile}${m.recommenderName ? `\n추천인 ${m.recommenderName}(${m.recommenderGisu}회)` : ''}`;
  view.innerHTML = `<div class="pad center">
    <img src="assets/logo-emblem.svg" alt="" width="96" height="96" style="margin:20px auto 10px;display:block">
    <h2 style="color:var(--navy);margin:0">${esc(m.name)}<span class="gisu">${m.gisu}회</span> 등록 신청 완료</h2>
    <p class="muted">${isServer() ? '총무(관리자)가 확인하면 명함첩에 올라갑니다.' : '아래 노란 버튼을 눌러 총무에게 카톡으로 보내 주세요. 총무가 확인 후 명부에 올립니다.'}</p>
    <div class="stack" style="text-align:left">
      <button class="btn kakao block" id="dk">${I.kakao}총무에게 카톡으로 알리기</button>
      <a class="btn primary block" href="#/register">${I.camera}다른 명함 이어서 등록</a>
      <a class="btn block" href="#/home">홈으로</a>
    </div></div>`;
  $('#dk').onclick = () => shareKakao(msg);
}

// ---------- 사진첩 ----------
const defaultEvent = () => { const d = new Date(); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 모임`; };
function vPhotos() {
  setTop({ title: '모임 사진', back: false }); setTab('photos');
  const me = LS.get('cgr.me', {});
  view.innerHTML = `<div class="pad">
    ${modeBanner()}
    <div class="scan-box one">
      <label class="scan-btn primary big">${I.image}앨범에서 사진 고르기<small>여러 장을 한 번에 고를 수 있습니다</small><input type="file" accept="image/*" multiple id="p-files"></label>
      <label class="scan-btn">${I.camera}지금 찍어서 올리기<input type="file" accept="image/*" capture="environment" id="p-cam"></label>
    </div>
    <div id="upState"></div>
    <details class="fold" ${me.name ? '' : 'open'}>
      <summary>올리는 분: ${me.name ? `${esc(me.name)}${me.gisu ? `(${esc(me.gisu)}회)` : ''}` : '성함을 적어 주세요'} · ${esc(LS.get('cgr.lastEvent', '') || defaultEvent())}</summary>
      <div style="margin-top:12px">
        <div class="field-2 name-gisu"><div class="field"><label for="p-name">올리는 분 성함</label><input id="p-name" value="${esc(me.name || '')}"></div>
          <div class="field"><label for="p-gisu">기수</label><div class="suffix" data-suffix="회"><input id="p-gisu" type="number" inputmode="numeric" value="${esc(me.gisu || '')}"></div></div></div>
        <div class="field"><label for="p-event">모임 이름</label><input id="p-event" value="${esc(LS.get('cgr.lastEvent', '') || defaultEvent())}"></div>
      </div>
    </details>
    <div class="section-title">모임 사진 <span class="more" id="pcount"></span></div>
  </div>
  <div class="gallery" id="gal"><div class="empty" style="grid-column:1/-1">사진을 불러오는 중…</div></div>`;
  const up = async e => {
    const files = [...e.target.files]; if (!files.length) return;
    const ev = $('#p-event').value.trim(), gisu = $('#p-gisu').value, cap = '';
    let who = $('#p-name').value.trim();
    if (!who) who = (prompt('올리시는 분 성함을 적어 주세요 (처음 한 번만)') || '').trim();
    if (!who) { e.target.value = ''; return; }
    LS.set('cgr.me', { name: who, gisu }); LS.set('cgr.lastEvent', ev);
    const st = $('#upState');
    let ok = 0;
    for (const [i, file] of files.entries()) {
      st.innerHTML = `<div style="margin-top:12px"><b>${i + 1}/${files.length}장 올리는 중…</b><div class="progress"><i style="width:${(i / files.length) * 100}%"></i></div></div>`;
      try {
        const img = await toJpeg(file, 1600, 0.82);
        if (isServer()) await call('uploadPhoto', { image: img.base64, event: ev, caption: cap, uploader: who, uploaderGisu: gisu });
        else localPhotos.add({ url: (await toJpeg(file, 420, 0.7)).dataUrl, event: ev, caption: cap, uploader: who, uploaderGisu: gisu, at: new Date().toISOString(), local: true });
        ok++;
      } catch (err) { toast(`${i + 1}번째 사진 실패: ${err.message}`); }
    }
    st.innerHTML = `<p class="small" style="color:var(--ok);font-weight:800;margin:12px 0 0">${ok}장 올렸습니다.</p>`;
    e.target.value = ''; S.photos = null; drawGallery();
  };
  $('#p-cam').onchange = up; $('#p-files').onchange = up;
  drawGallery();
}
async function drawGallery() {
  const gal = $('#gal'); if (!gal) return;
  let list = [];
  if (isServer()) {
    try { S.photos ||= (await call('photos')).photos; list = S.photos; } catch (e) { gal.innerHTML = `<div class="empty" style="grid-column:1/-1">사진을 불러오지 못했습니다: ${esc(e.message)}</div>`; return; }
  } else list = localPhotos.list();
  $('#pcount') && ($('#pcount').textContent = `${list.length}장`);
  gal.innerHTML = list.length ? list.map(p => {
    const cap = `${p.event || ''}${p.caption ? ' · ' + p.caption : ''} — ${p.uploader || ''}${p.uploaderGisu ? `(${p.uploaderGisu}회)` : ''}`;
    return `<a href="javascript:void 0" data-act="lightbox" data-src="${esc(p.full || p.url)}" data-cap="${esc(cap)}"><img loading="lazy" src="${esc(p.url)}" alt="${esc(cap)}">${p.local ? '<span class="badge local local-mark">이 기기</span>' : ''}</a>`;
  }).join('') : '<div class="empty" style="grid-column:1/-1">아직 올라온 사진이 없습니다.<br>첫 사진을 올려 주세요!</div>';
}
function lightbox(src, cap) {
  const d = document.createElement('div');
  d.className = 'lightbox';
  d.innerHTML = `<div><img src="${esc(src)}" alt=""><div class="cap">${esc(cap)}</div><div class="center" style="margin-top:12px"><button class="btn">닫기</button></div></div>`;
  d.onclick = () => d.remove();
  document.body.appendChild(d);
}

// ---------- 문자·카톡 보내기 ----------
function vCompose() {
  const ms = S.compose.ids.map(id => S.byId[id]).filter(Boolean);
  setTop({ title: '단체 문자 보내기' }); setTab('cards');
  if (!ms.length) { view.innerHTML = '<div class="empty">받는 사람이 없습니다.<br><a href="#/cards">명함첩에서 선택하기</a></div>'; return; }
  const withPhone = ms.filter(m => isMobileNo(m.mobile));
  view.innerHTML = `<div class="pad">
    <div class="card"><b>받는 사람 ${ms.length}명</b> <span class="small muted">(휴대폰 있는 ${withPhone.length}명에게 문자)</span>
      <div class="recips" style="margin-top:8px">${ms.map(m => `<span class="${isMobileNo(m.mobile) ? '' : 'nophone'}">${esc(nm(m))}</span>`).join('')}</div>${withPhone.length < ms.length ? `<p class="small" style="margin:8px 0 0;color:var(--danger)">줄 그어진 ${ms.length - withPhone.length}명은 휴대폰 번호가 없어 문자에서 빠집니다.</p>` : ''}</div>
    <div class="section-title">① 문구 고르기</div>
    <p class="small muted" style="margin:-4px 0 8px">누르면 아래 내용 칸에 채워집니다.</p>
    <div class="tpl">${TEMPLATES.map((t, i) => `<button class="chip" data-tpl="${i}">${esc(t.k)}</button>`).join('')}</div>
    <div class="field" style="margin-top:8px"><label for="body">② 보낼 내용 (고쳐 써도 됩니다)</label><textarea id="body" style="min-height:180px">${esc(S.compose.body)}</textarea></div>
    ${withPhone.length > 20 ? `<div class="check-note" style="font-size:17px;margin-bottom:10px"><b>${withPhone.length}명</b>은 한 번에 보내면 실패할 수 있습니다. 아래에서 <b>20명씩 ${Math.ceil(withPhone.length / 20)}번</b> 나눠 보내세요.</div>` : ''}
    <div class="stack">
      ${withPhone.length > 20 ? chunk(withPhone, 20).map((g, i) => `<a class="btn sms block" data-chunk="${i}" style="min-height:60px;font-size:19px">${I.sms}문자 ${i + 1}번째 묶음 (${g.length}명)</a>`).join('') : ''}
      <a class="btn sms block" id="goSms" ${withPhone.length > 20 ? 'hidden' : ''} style="min-height:60px;font-size:19px">${I.sms}문자 보내기 (${withPhone.length}명)</a>
      <button class="btn kakao block" id="goKakao" style="min-height:60px;font-size:19px">${I.kakao}카카오톡으로 보내기</button>
      <button class="btn block" id="goCopy">${I.copy}내용 복사</button>
    </div>
    <p class="small muted" style="margin-top:12px">문자 앱이 열리면 <b>[보내기]</b>만 누르세요. 카톡은 친구나 단톡방을 골라 보냅니다.</p>
  </div>`;
  const body = $('#body');
  const groups = chunk(withPhone, 20);
  const upd = () => {
    S.compose.body = body.value; $('#goSms').href = smsHref(withPhone.map(m => m.mobile), body.value);
    $$('[data-chunk]').forEach(a => { a.href = smsHref(groups[+a.dataset.chunk].map(m => m.mobile), body.value); });
  };
  body.oninput = upd; upd();
  $$('[data-tpl]').forEach(b => b.onclick = () => { body.value = TEMPLATES[+b.dataset.tpl].t; upd(); $$('[data-tpl]').forEach(x => x.classList.toggle('on', x === b)); });
  if (!withPhone.length) $('#goSms').classList.add('disabled');
  $('#goKakao').onclick = () => shareKakao(body.value || '[천경련]');
  $('#goCopy').onclick = async () => { await copyText(body.value); toast('복사했습니다'); };
}

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

// ---------- 바탕화면 아이콘 설치 ----------
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvt = e; if (location.hash.startsWith('#/install')) vInstall(); });
function vInstall() {
  setTop({ title: '바탕화면에 아이콘 만들기' }); setTab('home');
  const ua = navigator.userAgent;
  const inKakao = /KAKAOTALK/i.test(ua), samsung = /SamsungBrowser/i.test(ua), android = /Android/i.test(ua);
  const url = location.href.split('#')[0];
  let how;
  if (standalone()) how = `<div class="notice"><span class="ico">✓</span><div><b>이미 바탕화면 앱으로 실행 중입니다.</b></div></div>`;
  else if (inKakao) how = `<div class="card"><b style="font-size:19px;color:var(--danger)">카카오톡 안에서는 아이콘을 만들 수 없습니다</b>
      <ol class="steps"><li>${android ? '오른쪽 위(또는 아래) <b>⋮ 점 세 개</b>' : '오른쪽 아래 <b>공유(⇪) 또는 ⋯</b>'} 를 누르세요</li><li><b>${android ? '다른 브라우저로 열기' : 'Safari로 열기'}</b>를 누르세요</li><li>열린 화면에서 이 안내를 다시 따라 하세요</li></ol>
      ${android ? `<a class="btn primary block" style="margin-top:12px" href="intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;end">크롬으로 바로 열기</a>` : ''}</div>`;
  else if (S.installEvt) how = `<button class="btn primary block" id="doInstall" style="min-height:66px;font-size:21px">바탕화면에 천경련 아이콘 추가</button><p class="small muted center">버튼을 누르고 [설치] 또는 [추가]를 누르면 끝납니다.</p>`;
  else if (isIOS) how = `<div class="card"><b style="font-size:19px">아이폰 (Safari)</b><ol class="steps"><li>화면 아래 가운데 <b>공유 버튼(□↑)</b>을 누르세요</li><li>목록을 올려 <b>홈 화면에 추가</b>를 누르세요</li><li>오른쪽 위 <b>추가</b>를 누르면 바탕화면에 <b>천경련</b> 아이콘이 생깁니다</li></ol></div>`;
  else if (samsung) how = `<div class="card"><b style="font-size:19px">삼성 인터넷</b><ol class="steps"><li>아래쪽 <b>메뉴(≡)</b>를 누르세요</li><li><b>현재 페이지 추가</b> → <b>홈 화면</b>을 누르세요</li><li><b>추가</b>를 누르면 끝납니다</li></ol></div>`;
  else how = `<div class="card"><b style="font-size:19px">${android ? '안드로이드 (크롬)' : '컴퓨터 (크롬·엣지)'}</b><ol class="steps"><li>오른쪽 위 <b>⋮ 점 세 개</b>를 누르세요</li><li><b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 누르세요</li><li><b>설치/추가</b>를 누르면 바탕화면에 아이콘이 생깁니다</li></ol></div>`;
  view.innerHTML = `<div class="pad">
    <div class="install-card" style="margin-bottom:16px"><img src="assets/icon-192.png" alt=""><div><b style="font-size:20px">천경련</b><div class="small muted">바탕화면에 이 아이콘이 생깁니다</div></div></div>
    ${how}
    <div class="section-title">다른 회원에게 앱 주소 보내기</div>
    <div class="btn-row"><button class="btn kakao" id="shareApp">${I.kakao}카톡으로 보내기</button><button class="btn" id="copyApp">${I.copy}주소 복사</button></div>
    <p class="small muted" style="word-break:break-all">${esc(url)}</p>
  </div>`;
  $('#doInstall') && ($('#doInstall').onclick = async () => { S.installEvt.prompt(); const r = await S.installEvt.userChoice; S.installEvt = null; toast(r.outcome === 'accepted' ? '바탕화면에 추가했습니다' : '취소했습니다'); vInstall(); });
  $('#shareApp').onclick = () => shareKakao('[천경련 회원명부] 천안고 경제인 연합회 디지털 회원명부입니다. 링크를 열고 [바탕화면에 아이콘 만들기]를 눌러 주세요.', url);
  $('#copyApp').onclick = async () => { await copyText(url); toast('주소를 복사했습니다'); };
}

// ---------- 설정 ----------
function applyTextSize() { document.documentElement.classList.toggle('size-lg', LS.get('cgr.size', 'md') === 'lg'); }
function vSettings() {
  setTop({ title: '설정' }); setTab('');
  const me = LS.get('cgr.me', {}), size = LS.get('cgr.size', 'md');
  view.innerHTML = `<div class="pad">
    <div class="section-title" style="margin-top:4px">글자 크기</div>
    <div class="textsize"><button class="btn grow ${size === 'md' ? 'primary' : ''}" data-size="md">보통</button><button class="btn grow ${size === 'lg' ? 'primary' : ''}" data-size="lg" style="font-size:21px">아주 크게</button></div>
    <div class="section-title">내 정보 (사진 올릴 때 사용)</div>
    <div class="field-2"><div class="field"><label>성명</label><input id="s-name" value="${esc(me.name || '')}"></div><div class="field"><label>기수</label><div class="suffix" data-suffix="회"><input id="s-gisu" type="number" inputmode="numeric" value="${esc(me.gisu || '')}"></div></div></div>
    <a class="btn block" href="#/install">바탕화면에 아이콘 만들기</a>
    <div class="section-title">연결 설정 <span class="tiny faint">(총무 안내에 따라 입력)</span></div>
    <div class="field"><label>서버 주소 (Google Apps Script)</label><input id="s-api" value="${esc(LS.get('cgr.apiUrl', ''))}" placeholder="${esc(apiUrl() || 'https://script.google.com/macros/s/…/exec')}"></div>
    <div class="field"><label>회원 접근코드</label><input id="s-code" value="${esc(LS.get('cgr.code', ''))}"></div>
    <div class="field"><label>카카오 JavaScript 키 (선택)</label><input id="s-kakao" value="${esc(LS.get('cgr.kakaoKey', ''))}" placeholder="${kakaoKey() ? '배포 설정에 입력됨' : '비워 두면 휴대폰 공유창 사용'}"></div>
    <div class="field"><label>관리자 코드 (총무 전용)</label><input id="s-admin" type="password" value="${esc(LS.get('cgr.admin', ''))}"></div>
    <button class="btn primary block" id="s-save">저장</button>
    ${isAdmin() ? '<a class="btn block" href="#/admin" style="margin-top:10px">관리자 메뉴 (승인·데이터 올리기)</a>' : ''}
    <div class="section-title">정보</div>
    <div class="card small"><div>명부 기준일: <b>${esc(S.data.updated || '-')}</b> · 회원 ${S.data.members.length}명</div><div>연결 상태: <b>${{ server: '서버 연결됨', bundle: '초대 명부(암호화 파일)', local: '미리보기(서버 미연결)', offline: '오프라인 사본' }[S.data.mode]}</b></div>
      <div class="faint" style="margin-top:6px">천안고 경제인 연합회(천경련) · 회원 전용 서비스입니다. 명부 내용을 외부에 공유하지 마세요.</div></div>
    <button class="btn ghost block" id="s-reset" style="margin-top:10px;color:var(--danger)">이 기기의 저장 내용 지우기</button>
  </div>`;
  $$('[data-size]').forEach(b => b.onclick = () => { LS.set('cgr.size', b.dataset.size); applyTextSize(); vSettings(); });
  $('#s-save').onclick = () => {
    LS.set('cgr.me', { name: $('#s-name').value.trim(), gisu: $('#s-gisu').value });
    const before = [LS.get('cgr.apiUrl', ''), LS.get('cgr.code', '')].join();
    LS.set('cgr.apiUrl', $('#s-api').value.trim()); LS.set('cgr.code', $('#s-code').value.trim());
    LS.set('cgr.kakaoKey', $('#s-kakao').value.trim()); LS.set('cgr.admin', $('#s-admin').value.trim());
    toast('저장했습니다');
    if (before !== [LS.get('cgr.apiUrl', ''), LS.get('cgr.code', '')].join()) setTimeout(() => location.reload(), 600); else vSettings();
  };
  $('#s-reset').onclick = () => { if (confirm('이 기기에 저장된 설정·임시 등록·사진을 모두 지울까요?')) { localStorage.clear(); location.reload(); } };
}

// ---------- 관리자 ----------
function vAdmin() {
  setTop({ title: '관리자 메뉴' });
  if (!isAdmin()) { view.innerHTML = '<div class="empty">설정에서 관리자 코드를 먼저 입력하세요.</div>'; return; }
  view.innerHTML = `<div class="pad">
    <div class="section-title" style="margin-top:4px">승인 대기 신규회원</div><div id="pend"><div class="empty">불러오는 중…</div></div>
    <div class="section-title">명부·분석 자료 올리기</div>
    <div class="card"><p class="small muted" style="margin-top:0">PC의 <b>data</b> 폴더에 있는 파일을 골라 서버(구글 시트·드라이브)에 올립니다. 회원 명부는 구글 시트에서 직접 고쳐도 됩니다.</p>
      <div class="field"><label>members.json (회원 명부 · 처음 한 번)</label><input type="file" id="a-m" accept=".json,application/json"></div>
      <div class="field"><label>profiles.json (기업역량 분석)</label><input type="file" id="a-p" accept=".json,application/json"></div>
      <div class="field"><label>growth-models.json (성장모델)</label><input type="file" id="a-g" accept=".json,application/json"></div>
      <button class="btn primary block" id="a-up" ${isServer() ? '' : 'disabled'}>서버에 올리기</button>
      ${S.data.meta?.sheetUrl ? `<a class="btn block" style="margin-top:8px" href="${esc(S.data.meta.sheetUrl)}" target="_blank" rel="noopener">구글 시트 열기</a>` : ''}
    </div></div>`;
  drawPending();
  $('#a-up').onclick = async () => {
    const read = async id => { const f = $(id).files[0]; return f ? JSON.parse(await f.text()) : null; };
    try {
      const [m, p, g] = await Promise.all([read('#a-m'), read('#a-p'), read('#a-g')]);
      if (!m && !p && !g) return toast('올릴 파일을 고르세요');
      if (m && m.members?.length && !confirm(`회원 ${m.members.length}명으로 서버 명부를 덮어씁니다. 계속할까요?`)) return;
      await call('importData', { members: m?.members || null, groups: m?.groups || null, profiles: p || null, models: g || null });
      toast('올렸습니다. 새로 불러옵니다'); setTimeout(() => location.reload(), 800);
    } catch (e) { toast('실패: ' + e.message); }
  };
}
async function drawPending() {
  const box = $('#pend');
  let list;
  try { list = isServer() ? (await call('pending')).pending : localPending.list().map((r, i) => ({ ...r, regId: 'local-' + i })); } catch (e) { box.innerHTML = `<div class="check-note">${esc(e.message)}</div>`; return; }
  if (!list.length) { box.innerHTML = '<div class="empty">대기 중인 신청이 없습니다.</div>'; return; }
  box.innerHTML = list.map(r => `<div class="card" style="margin-bottom:10px">
    <div class="row"><div class="grow"><b style="font-size:19px">${esc(r.name)}<span class="gisu">${esc(r.gisu)}회</span></b><div class="small muted">${esc([r.title, r.company].filter(Boolean).join(' · '))} · ${esc(r.mobile)}</div>
    ${r.recommenderName ? `<div class="small">추천인: ${esc(r.recommenderName)}(${esc(r.recommenderGisu)}회)</div>` : ''}
    ${r.updateOf ? `<div class="small" style="color:var(--warn)">기존 회원 정보 변경 신청</div>` : ''}
    <div class="tiny faint">${esc(r.registrant ? '등록자 ' + r.registrant + ' · ' : '')}${esc((r.at || r.createdAt || '').slice(0, 16).replace('T', ' '))}</div></div>
    ${r.cardUrl || r.card ? `<a href="${esc(r.cardUrl || r.card)}" target="_blank" rel="noopener"><img src="${esc(r.cardThumb || r.card)}" alt="명함" style="width:90px;border-radius:8px"></a>` : ''}</div>
    ${isServer() ? `<div class="btn-row" style="margin-top:10px"><button class="btn primary sm" data-ok="${esc(r.regId)}">승인</button><button class="btn sm" data-no="${esc(r.regId)}">반려</button></div>` : '<p class="tiny faint">서버 연결 후 승인할 수 있습니다.</p>'}</div>`).join('');
  $$('[data-ok],[data-no]', box).forEach(b => b.onclick = async () => {
    const ok = !!b.dataset.ok;
    if (!ok && !confirm('이 신청을 반려할까요?')) return;
    try { await call(ok ? 'approve' : 'reject', { regId: b.dataset.ok || b.dataset.no }); toast(ok ? '승인했습니다' : '반려했습니다'); if (ok) { S.data = await loadAll(); S.data.members.sort(byGisu); S.byId = Object.fromEntries(S.data.members.map(m => [m.id, m])); } drawPending(); } catch (e) { toast('실패: ' + e.message); }
  });
}
function vEdit(id) {
  const m = S.byId[id];
  if (!m || !isAdmin()) return notFound();
  setTop({ title: `${nm(m)} 수정` });
  const keys = [['name', '성명'], ['gisu', '기수'], ['title', '직위'], ['company', '회사명'], ['industry', '업종'], ['mobile', '휴대폰'], ['tel', '회사 전화'], ['fax', '팩스'], ['email', '이메일'], ['address', '주소'], ['website', '홈페이지'], ['memo', '메모']];
  view.innerHTML = `<form class="pad" id="ef">${keys.map(([k, l]) => `<div class="field"><label>${l}</label><input name="${k}" value="${esc(m[k] ?? '')}" ${k === 'gisu' ? 'type="number"' : ''}></div>`).join('')}
    <div class="field"><label>업종 분류</label><select name="group">${S.data.groups.map(g => `<option ${m.group === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></div>
    <button class="btn primary block" ${isServer() ? '' : 'disabled'}>저장</button>${isServer() ? '' : '<p class="small faint">서버 연결 후 저장할 수 있습니다.</p>'}</form>`;
  $('#ef').onsubmit = async e => {
    e.preventDefault();
    const upd = Object.fromEntries(new FormData(e.target)); upd.gisu = +upd.gisu;
    try { await call('updateMember', { member: { ...m, ...upd } }); Object.assign(m, upd); toast('저장했습니다'); location.hash = `#/m/${id}`; } catch (err) { toast('실패: ' + err.message); }
  };
}

// ---------- 서비스워커 (바탕화면 앱·오프라인) ----------
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
boot();
