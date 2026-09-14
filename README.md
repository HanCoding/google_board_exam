# 모두의 게시판

Google Sheets를 데이터 저장소로 사용하고, Google Apps Script를 API로 사용하는 정적 게시판입니다. 프론트엔드는 HTML, CSS, JavaScript만 사용하며 GitHub와 Cloudflare Pages에 배포할 수 있습니다.

## 포함된 기능

- 로그인하지 않아도 게시글 목록과 내용 조회
- Google 로그인 사용자의 게시글 작성
- 작성자 본인 글 수정 및 소프트 삭제
- 제목·내용 검색, 반응형 화면, 로딩·오류 상태 처리
- 서버 측 Google ID 토큰 확인과 작성자 권한 검사
- HTML을 실행하지 않는 안전한 텍스트 렌더링

## 1. Apps Script 설정

1. `posts` 시트가 있는 스프레드시트에서 **확장 프로그램 → Apps Script**를 엽니다.
2. 기본 `Code.gs` 내용을 모두 지우고 이 저장소의 `Code.gs` 전체를 붙여 넣습니다.
3. Apps Script의 **프로젝트 설정 → 스크립트 속성**에 아래 값을 추가합니다.

   - 속성: `GOOGLE_CLIENT_ID`
   - 값: Google Cloud에서 발급한 웹 애플리케이션 클라이언트 ID

4. 함수 선택 메뉴에서 `setupBoard`를 선택하고 **실행**합니다.
5. 처음 표시되는 Google 권한 요청을 승인합니다.
6. 실행 로그에 준비 완료 메시지가 표시되는지 확인합니다.

`posts` 시트의 첫 행은 다음 열 이름과 정확히 일치해야 합니다.

```text
postId | authorId | authorName | title | content | createdAt | updatedAt | status
```

## 2. Apps Script 웹 앱 배포

1. 오른쪽 위 **배포 → 새 배포**를 누릅니다.
2. 배포 유형으로 **웹 앱**을 선택합니다.
3. 실행 사용자는 **나**, 액세스 권한은 **모든 사용자**로 설정합니다.
4. 배포 후 `/exec`로 끝나는 웹 앱 URL을 복사합니다.
5. 이 URL을 브라우저에서 열어 `게시판 API가 실행 중입니다.`라는 JSON 응답을 확인합니다.

코드를 수정한 뒤에는 **배포 → 배포 관리 → 수정 → 새 버전 → 배포**를 해야 운영 URL에 변경 사항이 반영됩니다.

## 3. Google 로그인 설정

Google Cloud Console에서 웹 애플리케이션용 OAuth 클라이언트 ID를 만듭니다.

승인된 JavaScript 원본에는 실제로 프론트엔드가 실행되는 주소를 등록합니다.

- 로컬 테스트 예시: `http://localhost:5500`
- Cloudflare Pages 예시: `https://프로젝트이름.pages.dev`
- 사용자 도메인이 있다면 해당 HTTPS 주소

경로나 마지막 슬래시는 넣지 않고 원본 주소만 입력합니다. 로컬 파일을 직접 더블 클릭한 `file://` 환경에서는 Google 로그인이 정상 동작하지 않으므로 로컬 웹 서버를 사용해야 합니다.

## 4. 프론트엔드 연결

`config.js`의 두 값을 교체합니다.

```js
window.BOARD_CONFIG = Object.freeze({
  GOOGLE_CLIENT_ID: "발급받은-클라이언트-ID.apps.googleusercontent.com",
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/배포-ID/exec",
});
```

Google 클라이언트 ID와 Apps Script 배포 URL은 비밀번호가 아니며 브라우저에 공개되는 값입니다. `GOOGLE_CLIENT_ID`는 `config.js`와 Apps Script 스크립트 속성에 동일한 값을 입력해야 합니다.

## 5. 로컬 테스트

정적 파일 서버가 있다면 프로젝트 폴더에서 실행한 뒤 브라우저로 접속합니다. 예를 들어 VS Code의 Live Server 확장 기능을 사용할 수 있습니다.

확인할 항목:

1. 로그아웃 상태에서 목록과 상세 내용을 볼 수 있는가
2. 로그인하지 않고 글쓰기 버튼을 누르면 로그인 안내가 나오는가
3. 로그인 후 글 작성이 가능한가
4. 본인 글에만 수정·삭제 버튼이 표시되는가
5. 다른 Google 계정으로 본인 글을 수정하거나 삭제할 수 없는가

## 6. Cloudflare Pages 배포

1. 이 폴더를 GitHub 저장소에 올립니다.
2. Cloudflare 대시보드에서 **Workers & Pages → Create → Pages → Connect to Git**을 선택합니다.
3. GitHub 저장소를 연결합니다.
4. 프레임워크 프리셋은 **None**, 빌드 명령은 비워 두고, 출력 디렉터리는 `/`로 지정합니다.
5. 배포된 `pages.dev` 주소를 Google Cloud의 승인된 JavaScript 원본에 추가합니다.

## 보안 및 운영 참고

- 작성·수정·삭제 요청은 화면 표시와 관계없이 Apps Script에서 Google 토큰과 작성자를 다시 확인합니다.
- `authorId`와 이메일은 공개 API 응답에 포함하지 않습니다.
- 삭제한 행은 실제로 제거하지 않고 `status`를 `DELETED`로 변경합니다.
- `google_sheet_id.txt`는 저장소의 `.gitignore`에 포함되어 있습니다.
- 현재 `Code.gs`는 구현을 단순하게 유지하기 위해 Google의 `tokeninfo` 엔드포인트로 ID 토큰을 확인합니다. 소규모 MVP에는 사용할 수 있지만 Google은 이 엔드포인트를 개발·디버깅 용도로 안내합니다. 공개 사용량이 커지면 Cloudflare Pages Function 또는 Worker에서 Google 공개 키로 토큰 서명을 검증하도록 이전하는 것이 좋습니다.
