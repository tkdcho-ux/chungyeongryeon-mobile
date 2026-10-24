// 배포 설정 — 비워 두면 앱의 [설정] 화면에서 기기별로 입력할 수 있습니다.
export const CONFIG = {
  // Google Apps Script 웹앱 주소 (backend/README 참고). 예: https://script.google.com/macros/s/AKfy.../exec
  API_URL: '',
  // 모임 사진만 함께 보는 서버 주소 (backend/Code.gs 배포 URL). 비워 두면 API_URL을 쓰고, 둘 다 비면 사진은 각 휴대폰에만 저장됩니다.
  // 명부는 지금처럼 암호화 파일(data.enc.json)에서 읽습니다.
  PHOTO_API_URL: '',
  // Kakao Developers > 내 애플리케이션 > 앱 키 > JavaScript 키 (플랫폼 Web에 배포 도메인 등록 필요)
  KAKAO_JS_KEY: '',
  // 카카오톡·문자로 공유할 앱 주소. 예: https://<github아이디>.github.io/chungyeongryeon-mobile/
  APP_URL: 'https://tkdcho-ux.github.io/chungyeongryeon-mobile/',
};
