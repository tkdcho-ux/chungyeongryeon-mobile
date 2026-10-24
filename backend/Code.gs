/**
 * 천경련 회원명부 — 무료 서버 (Google Apps Script + 구글 시트 + 구글 드라이브)
 *
 * 설치: backend/README.md 참고
 *  1) 새 구글 시트 > 확장 프로그램 > Apps Script 에 이 파일과 appsscript.json 붙여넣기
 *  2) 편집기에서 setup 함수 1회 실행 (권한 허용) → 시트·폴더 생성, 접근코드 설정 안내
 *  3) 배포 > 새 배포 > 웹 앱 (실행: 나, 액세스: 모든 사용자) → 웹 앱 URL을 앱 설정에 입력
 *
 * 보안: 모든 요청은 회원 접근코드(ACCESS_CODE)를, 관리 기능은 관리자 코드(ADMIN_CODE)를 확인합니다.
 */

const MEMBER_COLS = ['id', 'name', 'gisu', 'title', 'company', 'industry', 'group', 'mobile', 'tel', 'fax', 'email', 'address', 'website', 'tags', 'memo', 'check', 'recommenderName', 'recommenderGisu', 'photoUrl', 'cardFileId', 'updatedAt'];
const PENDING_COLS = ['regId', 'status', 'createdAt', 'registrant', 'updateOf', 'name', 'gisu', 'title', 'company', 'industry', 'group', 'mobile', 'tel', 'fax', 'email', 'address', 'website', 'memo', 'recommenderName', 'recommenderGisu', 'cardFileId', 'photoFileId'];
const PHOTO_COLS = ['photoId', 'fileId', 'createdAt', 'event', 'caption', 'uploader', 'uploaderGisu', 'ownerKey'];
const DEFAULT_GROUPS = ['반도체·첨단소재', '제조·산업재', '건설·설비·부동산', '환경·순환자원', '전문서비스', '금융·투자', '교육·연구', '식품·외식·유통', '모빌리티·관광', 'IT·스마트인프라', '공공·단체'];

// 초대 링크(#k=…)와 같은 접근코드를 쓰려면 setup 실행 전에 data/access-code.txt 의 코드를 여기에 붙여넣으세요
const INVITE_CODE = '';

const props = () => PropertiesService.getScriptProperties();
const normCode_ = c => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

// ---------- 최초 설정 (편집기에서 1회 실행) ----------
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, '회원', MEMBER_COLS);
  ensureSheet_(ss, '신규등록', PENDING_COLS);
  ensureSheet_(ss, '사진', PHOTO_COLS);
  const p = props();
  if (!p.getProperty('FOLDER_ID')) {
    const root = DriveApp.createFolder('천경련_회원명부_자료');
    p.setProperty('FOLDER_ID', root.getId());
    p.setProperty('CARD_FOLDER_ID', root.createFolder('명함').getId());
    p.setProperty('PHOTO_FOLDER_ID', root.createFolder('모임사진').getId());
    p.setProperty('MEMBER_PHOTO_FOLDER_ID', root.createFolder('회원사진').getId());
  }
  if (INVITE_CODE) p.setProperty('ACCESS_CODE', INVITE_CODE);
  else if (!p.getProperty('ACCESS_CODE')) p.setProperty('ACCESS_CODE', 'cgr' + Math.floor(1000 + Math.random() * 9000));
  if (!p.getProperty('ADMIN_CODE')) p.setProperty('ADMIN_CODE', 'admin' + Math.floor(100000 + Math.random() * 900000));
  if (!p.getProperty('GROUPS')) p.setProperty('GROUPS', JSON.stringify(DEFAULT_GROUPS));
  Logger.log('회원 접근코드: %s  /  관리자 코드: %s', p.getProperty('ACCESS_CODE'), p.getProperty('ADMIN_CODE'));
  Logger.log('코드를 바꾸려면: 프로젝트 설정 > 스크립트 속성에서 ACCESS_CODE / ADMIN_CODE 수정');
}

function ensureSheet_(ss, name, cols) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(cols);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, cols.length).setFontWeight('bold').setBackground('#2a388d').setFontColor('#ffffff');
  }
  return sh;
}

// ---------- 요청 처리 ----------
function doGet() {
  return json_({ ok: true, service: '천경련 회원명부 서버', time: new Date().toISOString() });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: '잘못된 요청입니다' }); }
  const p = props();
  // 앱과 같은 방식으로 대소문자·하이픈을 무시하고 비교합니다 (초대 링크 #k= 코드)
  if (!req.code || normCode_(req.code) !== normCode_(p.getProperty('ACCESS_CODE'))) return json_({ ok: false, code: 'BAD_CODE', error: '접근코드가 맞지 않습니다' });
  const admin = !!req.admin && String(req.admin).trim() === p.getProperty('ADMIN_CODE');
  const adminOnly = ['pending', 'approve', 'reject', 'updateMember', 'importData'];
  if (adminOnly.indexOf(req.action) >= 0 && !admin) return json_({ ok: false, code: 'NOT_ADMIN', error: '관리자 코드가 필요합니다' });
  try {
    switch (req.action) {
      case 'bootstrap': return json_(bootstrap_(admin));
      case 'register': return json_(register_(req));
      case 'ocr': return json_(ocr_(req.image));
      case 'uploadPhoto': return json_(uploadPhoto_(req));
      case 'photos': return json_(listPhotos_(req.device));
      case 'deletePhoto': return json_(deletePhoto_(req, admin));
      case 'pending': return json_(listPending_());
      case 'approve': return json_(approve_(req.regId));
      case 'reject': return json_(setPendingStatus_(req.regId, '반려'));
      case 'updateMember': return json_(updateMember_(req.member));
      case 'importData': return json_(importData_(req));
      default: return json_({ ok: false, error: '알 수 없는 요청: ' + req.action });
    }
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
const sheet_ = name => SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);

function rows_(sh) {
  const v = sh.getDataRange().getValues();
  const head = v.shift();
  return v.filter(r => r.join('') !== '').map(r => Object.fromEntries(head.map((h, i) => [h, r[i] instanceof Date ? r[i].toISOString() : r[i]])));
}
function toRow_(cols, o) { return cols.map(c => o[c] == null ? '' : (Array.isArray(o[c]) ? o[c].join(', ') : o[c])); }

// ---------- 조회 ----------
function bootstrap_(admin) {
  const members = rows_(sheet_('회원')).map(m => ({ ...m, gisu: Number(m.gisu) || 0, tags: String(m.tags || '').split(',').map(s => s.trim()).filter(Boolean) }));
  const p = props();
  const prof = readJsonFile_('PROFILES_FILE_ID'), mod = readJsonFile_('MODELS_FILE_ID');
  return {
    ok: true,
    members,
    groups: JSON.parse(p.getProperty('GROUPS') || '[]'),
    profiles: prof ? prof.profiles : {},
    models: mod ? mod.models : [],
    meta: { profileBasis: prof && prof.basis, modelBasis: mod && mod.basis, method: mod && mod.method, portfolio: mod && mod.portfolio, sheetUrl: admin ? SpreadsheetApp.getActiveSpreadsheet().getUrl() : '' },
    updated: p.getProperty('UPDATED') || '',
  };
}

function readJsonFile_(key) {
  const id = props().getProperty(key);
  if (!id) return null;
  const cache = CacheService.getScriptCache(), hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const txt = DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8');
  if (txt.length < 95000) cache.put(key, txt, 3600);
  return JSON.parse(txt);
}
function writeJsonFile_(key, name, obj) {
  const p = props(), txt = JSON.stringify(obj);
  const id = p.getProperty(key);
  if (id) DriveApp.getFileById(id).setContent(txt);
  else p.setProperty(key, DriveApp.getFolderById(p.getProperty('FOLDER_ID')).createFile(name, txt, 'application/json').getId());
  CacheService.getScriptCache().remove(key);
}

// ---------- 파일 저장 ----------
function saveImage_(base64, folderKey, name, share) {
  if (!base64) return '';
  if (base64.length > 12 * 1024 * 1024) throw new Error('사진 용량이 너무 큽니다');
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg', name + '.jpg');
  const f = DriveApp.getFolderById(props().getProperty(folderKey)).createFile(blob);
  if (share) f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return f.getId();
}
const thumb_ = (id, w) => id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + (w || 800) : '';
const stamp_ = () => Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd_HHmmss');

// ---------- 신규회원 등록 (누구나, 접근코드 필요) ----------
function register_(req) {
  const m = req.member || {};
  if (!m.name || !m.gisu || !m.mobile) throw new Error('성명·기수·휴대폰은 필수입니다');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const regId = 'R' + stamp_() + Math.floor(Math.random() * 90 + 10);
    const base = m.name + '_' + m.gisu + '회_' + stamp_();
    const rec = Object.assign({}, m, {
      regId, status: '승인대기', createdAt: new Date(),
      cardFileId: saveImage_(req.cardImage, 'CARD_FOLDER_ID', '명함_' + base, false),
      photoFileId: saveImage_(req.photo, 'MEMBER_PHOTO_FOLDER_ID', '사진_' + base, true),
    });
    sheet_('신규등록').appendRow(toRow_(PENDING_COLS, rec));
    return { ok: true, regId };
  } finally { lock.releaseLock(); }
}

// ---------- 명함 OCR ----------
// 1순위: Claude(AI)가 명함 사진을 보고 항목까지 나눠 줍니다 — 스크립트 속성 ANTHROPIC_API_KEY 가 있을 때 (명함 1장 약 1~2센트)
// 2순위: 구글 드라이브 문자인식 (무료, 글자만 돌려주고 항목은 앱이 나눕니다)
function ocr_(base64) {
  if (!base64) throw new Error('이미지가 없습니다');
  const key = props().getProperty('ANTHROPIC_API_KEY');
  if (key) {
    try { return claudeCard_(base64, key); } catch (err) { console.warn('Claude 명함 인식 실패, 구글 OCR로 넘어갑니다: ' + err); }
  }
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg', 'ocr.jpg');
  const doc = Drive.Files.create({ name: 'ocr_tmp_' + stamp_(), mimeType: 'application/vnd.google-apps.document' }, blob, { ocrLanguage: 'ko' });
  try {
    return { ok: true, engine: 'Google OCR', text: DocumentApp.openById(doc.id).getBody().getText() };
  } finally {
    Drive.Files.remove(doc.id);
  }
}

const CARD_FIELDS = {
  name: '성명. 한글 이름이면 띄어쓰기 없이 (예: 홍길동)',
  title: '직위·직책. 부서가 함께 적혀 있으면 함께 (예: 영업본부 부장)',
  company: '회사·기관명. ㈜, 주식회사 등 표기는 명함 그대로',
  industry: '하는 일(업종)을 명함 내용으로 짧게 (예: 자동차부품 제조). 알 수 없으면 빈 문자열',
  mobile: '휴대폰 번호, 010-1234-5678 형식',
  tel: '회사 전화, 041-123-4567 / 02-123-4567 / 1588-1234 형식',
  fax: '팩스 번호, 전화와 같은 형식',
  email: '이메일 주소',
  address: '회사 주소 한 줄 (우편번호 제외)',
  website: '홈페이지 주소',
  text: '명함에 적힌 글자 전체를 줄 단위로 그대로 옮겨 적은 것',
};
function claudeCard_(base64, key) {
  const schema = { type: 'object', additionalProperties: false, required: Object.keys(CARD_FIELDS), properties: {} };
  Object.keys(CARD_FIELDS).forEach(k => { schema.properties[k] = { type: 'string', description: CARD_FIELDS[k] }; });
  const body = {
    model: props().getProperty('CLAUDE_MODEL') || 'claude-opus-5-5',
    max_tokens: 4000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: schema } },
    fallbacks: 'default',
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
        { type: 'text', text: '한국 명함 사진입니다. 명함에 적힌 정보를 항목별로 정확히 옮겨 주세요. ' +
          '명함에 없는 항목은 빈 문자열로 두고, 추측해서 지어내지 마세요(업종만 명함 내용으로 짧게 요약). ' +
          '휴대폰(010·011 등)과 회사 전화·팩스를 T/F/M/HP 같은 표시로 구분하세요. 명함이 아니면 모든 항목을 빈 문자열로 두세요.' },
      ],
    }],
  };
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, payload: JSON.stringify(body),
    headers: { 'x-api-key': key, 'anthropic-version': '2026-10-21', 'anthropic-beta': 'server-side-fallback-2026-07-01' },
  });
  const j = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) throw new Error('Claude API ' + res.getResponseCode() + ': ' + (j.error && j.error.message));
  if (j.stop_reason === 'refusal' || j.stop_reason === 'max_tokens') throw new Error('Claude 응답 중단: ' + j.stop_reason);
  const block = (j.content || []).filter(b => b.type === 'text')[0];
  if (!block) throw new Error('Claude 응답에 내용이 없습니다');
  const f = JSON.parse(block.text), text = f.text || '';
  delete f.text;
  return { ok: true, engine: 'Claude AI', fields: f, text: text };
}

// ---------- 모임 사진 ----------
// 올린 기기의 표는 그대로 두지 않고 해시로만 보관합니다 (본인 사진 삭제 확인용)
const ownerKey_ = device => device ? Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'cgr:' + device)) : '';
// 예전에 만든 시트에 새 열(ownerKey 등)이 없으면 머리글을 덧붙입니다
function ensureCols_(sh, cols) {
  const head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  cols.forEach(c => { if (head.indexOf(c) < 0) { head.push(c); sh.getRange(1, head.length).setValue(c).setFontWeight('bold').setBackground('#2a388d').setFontColor('#ffffff'); } });
}
function uploadPhoto_(req) {
  if (!req.image) throw new Error('사진이 없습니다');
  ensureCols_(sheet_('사진'), PHOTO_COLS);
  const fileId = saveImage_(req.image, 'PHOTO_FOLDER_ID', (req.event || '모임') + '_' + (req.uploader || '') + '_' + stamp_(), true);
  const rec = { photoId: 'P' + stamp_() + Math.floor(Math.random() * 90 + 10), fileId, createdAt: new Date(), event: req.event || '', caption: req.caption || '', uploader: req.uploader || '', uploaderGisu: req.uploaderGisu || '', ownerKey: ownerKey_(req.device) };
  sheet_('사진').appendRow(toRow_(PHOTO_COLS, rec));
  return { ok: true, photoId: rec.photoId };
}
function listPhotos_(device) {
  const me = ownerKey_(device);
  const list = rows_(sheet_('사진')).reverse().slice(0, 300)
    .map(p => ({ id: p.photoId, url: thumb_(p.fileId, 600), full: thumb_(p.fileId, 2048), event: p.event, caption: p.caption, uploader: p.uploader, uploaderGisu: p.uploaderGisu, at: p.createdAt, mine: !!me && p.ownerKey === me }));
  return { ok: true, photos: list };
}
// 사진 삭제: 올린 기기 또는 관리자만. 드라이브 파일은 휴지통으로(30일 안에 되살릴 수 있음)
function deletePhoto_(req, admin) {
  const sh = sheet_('사진'), row = findRow_(sh, 'photoId', req.photoId);
  if (row < 0) throw new Error('사진을 찾을 수 없습니다');
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], v = sh.getRange(row, 1, 1, head.length).getValues()[0];
  const rec = Object.fromEntries(head.map((h, i) => [h, v[i]]));
  if (!admin && (!rec.ownerKey || rec.ownerKey !== ownerKey_(req.device))) throw new Error('사진을 올린 휴대폰이나 관리자만 지울 수 있습니다');
  try { DriveApp.getFileById(rec.fileId).setTrashed(true); } catch (err) { console.warn(err); }
  sh.deleteRow(row);
  return { ok: true };
}

// ---------- 관리자 ----------
function listPending_() {
  const list = rows_(sheet_('신규등록')).filter(r => r.status === '승인대기').map(r => Object.assign(r, {
    cardUrl: r.cardFileId ? 'https://drive.google.com/file/d/' + r.cardFileId + '/view' : '',
    cardThumb: r.cardFileId ? thumbAsData_(r.cardFileId) : '',
  }));
  return { ok: true, pending: list };
}
// 명함 이미지는 공개 링크가 없으므로 관리자 화면용 작은 미리보기를 직접 만들어 보냅니다
function thumbAsData_(id) {
  try { return 'data:image/png;base64,' + Utilities.base64Encode(DriveApp.getFileById(id).getThumbnail().getBytes()); } catch (e) { return ''; }
}

function findRow_(sh, col, val) {
  const v = sh.getDataRange().getValues(), ci = v[0].indexOf(col);
  for (let i = 1; i < v.length; i++) if (String(v[i][ci]) === String(val)) return i + 1;
  return -1;
}
function setPendingStatus_(regId, status) {
  const sh = sheet_('신규등록'), r = findRow_(sh, 'regId', regId);
  if (r < 0) throw new Error('신청을 찾을 수 없습니다');
  sh.getRange(r, PENDING_COLS.indexOf('status') + 1).setValue(status);
  return { ok: true };
}
function approve_(regId) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const rec = rows_(sheet_('신규등록')).find(r => r.regId === regId);
    if (!rec) throw new Error('신청을 찾을 수 없습니다');
    const m = Object.assign({}, rec, { photoUrl: thumb_(rec.photoFileId, 400), updatedAt: new Date() });
    if (rec.updateOf && findRow_(sheet_('회원'), 'id', rec.updateOf) > 0) {
      m.id = rec.updateOf;
      upsertMember_(m, true);
    } else {
      m.id = 'N' + stamp_().slice(2, 8) + Math.floor(Math.random() * 900 + 100);
      sheet_('회원').appendRow(toRow_(MEMBER_COLS, m));
    }
    setPendingStatus_(regId, '승인');
    touch_();
    return { ok: true, id: m.id };
  } finally { lock.releaseLock(); }
}
// keepEmpty=false 이면 빈 값으로 기존 값을 지우지 않습니다 (변경 신청 병합용)
function upsertMember_(m, mergeOnlyFilled) {
  const sh = sheet_('회원'), r = findRow_(sh, 'id', m.id);
  if (r < 0) { sh.appendRow(toRow_(MEMBER_COLS, m)); return; }
  const cur = sh.getRange(r, 1, 1, MEMBER_COLS.length).getValues()[0];
  const next = MEMBER_COLS.map((c, i) => {
    const v = m[c];
    if (v == null || (mergeOnlyFilled && v === '')) return cur[i];
    return Array.isArray(v) ? v.join(', ') : v;
  });
  sh.getRange(r, 1, 1, MEMBER_COLS.length).setValues([next]);
}
function updateMember_(m) {
  if (!m || !m.id) throw new Error('회원 정보가 없습니다');
  m.updatedAt = new Date();
  upsertMember_(m, false);
  touch_();
  return { ok: true };
}
function importData_(req) {
  if (req.members) {
    const sh = sheet_('회원');
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
    const rows = req.members.map(m => toRow_(MEMBER_COLS, Object.assign({}, m, { updatedAt: new Date() })));
    if (rows.length) sh.getRange(2, 1, rows.length, MEMBER_COLS.length).setValues(rows);
  }
  if (req.groups) props().setProperty('GROUPS', JSON.stringify(req.groups));
  if (req.profiles) writeJsonFile_('PROFILES_FILE_ID', 'profiles.json', req.profiles);
  if (req.models) writeJsonFile_('MODELS_FILE_ID', 'growth-models.json', req.models);
  touch_();
  return { ok: true };
}
function touch_() { props().setProperty('UPDATED', Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd')); }
