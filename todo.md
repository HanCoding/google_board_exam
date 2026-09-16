# 작업 정리

모두의 게시판(Google Sheets + Apps Script 기반 정적 게시판)의 진행 상황과 남은 과제입니다.

저장소: <https://github.com/HanCoding/google_board_exam>

---

## 완료한 작업

### 1. Google 로그인 연결 (`355cb51`)

- `config.js`의 `GOOGLE_CLIENT_ID`를 실제 발급값으로 교체
- 로그인 로직 자체는 이미 구현되어 있었음 — 프론트는 `app.js`의 Google Identity Services 연동, 서버는 `Code.gs`의 ID 토큰 검증

### 2. 넷마블 폰트 적용 (`47a957a`)

- `styles.css`에 `@font-face` 3종(300 / 500 / 700) 선언 추가
- `:root`의 폰트 스택 맨 앞에 `"Netmarble"` 배치 — 이 프로젝트는 `:root`에서 폰트를 상속시키는 구조라 한 곳만 고치면 전체 UI에 적용됨
- `index.html`에 `cdn.jsdelivr.net` `preconnect` 추가

### 3. PWA 지원 (`a142daf`)

- `manifest.json` — 이름, 테마색(`#176b45`), `standalone` 설치 설정
- `sw.js` — 앱 셸 캐싱 서비스 워커
  - 화면 이동: 네트워크 우선 → 배포 직후 최신 HTML 반영
  - 정적 자산: 캐시 우선 + 백그라운드 갱신
  - Apps Script API와 Google 로그인은 교차 출처라 **가로채지 않고** 항상 네트워크로 전달
- `assets/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` — 기존 794KB 파비콘에서 규격에 맞게 생성 (maskable은 안드로이드 마스킹에 잘리지 않도록 여백 포함)
- `index.html` — manifest 링크, `theme-color`, iOS 홈 화면 메타
- `app.js` — 서비스 워커 등록 + 새 버전 안내 토스트
- `README.md` — PWA 섹션 추가

**검증 결과:** 로컬 서버를 완전히 종료한 상태에서 새로고침 → 앱 셸이 캐시에서 전부 렌더링(폰트 포함), 게시글 API는 정상 통과해 목록 로드 성공. 콘솔 에러 없음, 기존 테스트 2종 통과.

### 4. Search Console 인증 (`6bbb4c0`)

- `index.html`에 `google-site-verification` 메타 태그 추가

---

## 남은 작업

### A. 설정 확인 — 우선순위 높음

- [ ] **Apps Script 스크립트 속성에 `GOOGLE_CLIENT_ID` 등록**
  `Apps Script에 GOOGLE_CLIENT_ID를 설정해 주세요.` 오류가 났던 항목. 해결 여부 미확인.
  스프레드시트 → 확장 프로그램 → Apps Script → 프로젝트 설정 → 스크립트 속성에서
  `GOOGLE_CLIENT_ID` = `config.js`와 **동일한 값**으로 등록 (앞뒤 공백 주의).
  → 게시글 목록 조회는 로그인 없이도 되므로, 실제 **로그인 후 글 작성**까지 해봐야 검증됨.

- [ ] **Google Cloud 승인된 JavaScript 원본 등록 확인**
  운영 도메인(Cloudflare Pages 주소 등)과 로컬 테스트 주소가 모두 등록되어 있는지 확인.
  경로·끝 슬래시 없이 원본만 입력. `file://`에서는 로그인이 동작하지 않음.

- [ ] **README 5장 체크리스트로 로그인 동선 실제 검증**
  로그인 후 글 작성 / 본인 글만 수정·삭제 버튼 노출 / 다른 계정으로 수정·삭제 차단

### B. 진행 중인 검색 노출 작업

Search Console 인증까지 마쳤으니 이어서 할 것들:

- [x] `robots.txt` 추가 — 전체 허용 + `Sitemap:` 줄
- [x] `sitemap.xml` 추가 — 홈 1개 URL (SPA라 개별 글 URL이 없음)
- [ ] Search Console / 네이버 서치어드바이저에 `sitemap.xml` 제출 (배포 후)
- [ ] Open Graph / Twitter Card 메타 태그 추가 (현재 `og:` 태그 0개) — 링크 공유 시 미리보기 카드
- [ ] 정식 URL(`<link rel="canonical">`) 지정

> 참고: 이 앱은 게시글을 JavaScript로 그리는 SPA 형태라 개별 글은 색인되기 어렵습니다. 글 단위 검색 노출이 목표라면 글마다 고유 URL을 부여하는 구조 변경이 선행되어야 합니다 (아래 D 항목).

### C. 유지보수 시 주의

- [ ] **앱 셸(`index.html`, `styles.css`, `app.js`, `config.js`) 수정 시 `sw.js`의 `CACHE_VERSION` 올리기**
  현재 `v2`. 버전을 올리지 않으면 기존 방문자는 캐시된 예전 파일을 계속 봄.
  (HTML은 네트워크 우선이라 비교적 안전하지만, CSS/JS는 캐시가 먼저 나감)

- [ ] 아이콘 교체 시 `icon-192` / `icon-512` / `icon-maskable-512` 3종 함께 갱신

### D. 개선 과제 — 여유 있을 때

- [ ] **ID 토큰 검증 방식 개선**
  현재 `Code.gs`는 Google `tokeninfo` 엔드포인트로 토큰을 확인하는데, Google은 이를 개발·디버깅 용도로 안내합니다. 사용량이 늘면 Cloudflare Pages Function 또는 Worker에서 Google 공개 키로 서명을 직접 검증하도록 이전 권장. (README 보안 참고 항목)

- [ ] **글마다 고유 URL 부여** (`?post=<id>` 또는 History API)
  현재는 모달로만 열려서 특정 글을 링크로 공유하거나 뒤로가기로 닫을 수 없음. B 항목의 검색 노출과도 직결.

- [ ] **폰트 두께 정리**
  `styles.css`에 `font-weight: 750`, `800`을 쓰는 곳이 있는데 넷마블은 300/500/700만 제공. 브라우저가 700으로 매칭해 깨지지는 않지만, 실제 제공 두께에 맞춰 정리하면 의도가 명확해짐.

- [ ] **`.brand-mark` 로고 폰트 검토**
  "M" 로고만 의도적으로 `Georgia, serif`를 유지 중. 넷마블로 통일할지 결정 필요.

- [ ] **`assets/favicon.png` 용량 정리** (794KB)
  PWA 아이콘은 규격에 맞게 새로 만들었으나 원본 파비콘은 그대로. 파비콘 용도로는 과도한 크기.

- [ ] **테스트 자동화**
  `tests/validate.mjs`, `tests/codegs.test.mjs`가 있으나 수동 실행. GitHub Actions로 push 시 자동 실행 검토.
  (참고: `node --test tests/`는 실패함 — 파일을 직접 지정해야 함: `node --test tests/codegs.test.mjs`)

- [ ] **오프라인 안내 개선**
  현재 오프라인에서는 앱 셸만 뜨고 게시글은 "불러오지 못했습니다" 오류로 표시됨. 오프라인 상태임을 구분해 안내하면 더 친절함.
