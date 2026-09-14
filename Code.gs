/**
 * 모두의 게시판 - Google Apps Script API
 *
 * 이 파일 전체를 스프레드시트에 연결된 Apps Script의 Code.gs에 붙여 넣으세요.
 * 스크립트 속성에는 GOOGLE_CLIENT_ID를 등록해야 합니다.
 */

const BOARD_CONFIG = Object.freeze({
  SHEET_NAME: 'posts',
  STATUS_ACTIVE: 'ACTIVE',
  STATUS_DELETED: 'DELETED',
  MAX_TITLE_LENGTH: 100,
  MAX_CONTENT_LENGTH: 5000,
  MAX_LIST_SIZE: 300,
  REQUIRED_HEADERS: [
    'postId',
    'authorId',
    'authorName',
    'title',
    'content',
    'createdAt',
    'updatedAt',
    'status',
  ],
});

/**
 * 배포 주소를 브라우저에서 열었을 때 API 상태를 보여 줍니다.
 */
function doGet() {
  return jsonResponse_({
    ok: true,
    data: {
      service: 'board-api',
      message: '게시판 API가 실행 중입니다.',
    },
  });
}

/**
 * 프론트엔드의 모든 API 요청을 처리합니다.
 */
function doPost(event) {
  try {
    const request = parseRequest_(event);
    let data;

    switch (request.action) {
      case 'list':
        data = listPosts_(optionalUser_(request.credential));
        break;
      case 'get':
        data = getPost_(request.postId, optionalUser_(request.credential));
        break;
      case 'verify':
        data = { user: publicUser_(requireUser_(request.credential)) };
        break;
      case 'create':
        data = createPost_(request, requireUser_(request.credential));
        break;
      case 'update':
        data = updatePost_(request, requireUser_(request.credential));
        break;
      case 'delete':
        data = deletePost_(request.postId, requireUser_(request.credential));
        break;
      default:
        throw appError_('INVALID_ACTION', '지원하지 않는 요청입니다.');
    }

    return jsonResponse_({ ok: true, data: data });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse_({
      ok: false,
      error: {
        code: error.code || 'SERVER_ERROR',
        message: error.code ? error.message : '서버에서 요청을 처리하지 못했습니다.',
      },
    });
  }
}

/**
 * 처음 한 번 직접 실행하여 시트 구성과 권한을 확인하는 함수입니다.
 */
function setupBoard() {
  const sheet = getPostsSheet_();
  const headerMap = getHeaderMap_(sheet);
  validateHeaders_(headerMap);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, BOARD_CONFIG.REQUIRED_HEADERS.length).setFontWeight('bold');
  return '준비 완료: posts 시트와 열 구성을 확인했습니다.';
}

function listPosts_(viewer) {
  const sheet = getPostsSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return { posts: [] };

  const headerMap = headerMapFromRow_(values[0]);
  validateHeaders_(headerMap);

  const posts = values
    .slice(1)
    .filter(function (row) {
      return String(row[headerMap.status]).toUpperCase() === BOARD_CONFIG.STATUS_ACTIVE;
    })
    .map(function (row) {
      return rowToPublicPost_(row, headerMap, viewer);
    })
    .sort(function (a, b) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })
    .slice(0, BOARD_CONFIG.MAX_LIST_SIZE);

  return { posts: posts };
}

function getPost_(postId, viewer) {
  const id = requiredText_(postId, '게시글 번호가 필요합니다.');
  const record = findPostRecord_(id);
  if (!record || record.status !== BOARD_CONFIG.STATUS_ACTIVE) {
    throw appError_('NOT_FOUND', '게시글을 찾을 수 없습니다.');
  }
  return { post: recordToPublicPost_(record, viewer) };
}

function createPost_(request, user) {
  const title = validateTitle_(request.title);
  const content = validateContent_(request.content);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getPostsSheet_();
    const headerMap = getHeaderMap_(sheet);
    validateHeaders_(headerMap);

    const now = new Date().toISOString();
    const row = new Array(sheet.getLastColumn()).fill('');
    row[headerMap.postId] = Utilities.getUuid();
    row[headerMap.authorId] = user.id;
    row[headerMap.authorName] = user.name;
    row[headerMap.title] = title;
    row[headerMap.content] = content;
    row[headerMap.createdAt] = now;
    row[headerMap.updatedAt] = now;
    row[headerMap.status] = BOARD_CONFIG.STATUS_ACTIVE;
    const destination = sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length);
    // 사용자 입력이 '=' 등으로 시작해도 시트 수식으로 실행되지 않도록 텍스트로 저장합니다.
    destination.setNumberFormat('@');
    destination.setValues([row]);

    return {
      post: rowToPublicPost_(row, headerMap, user),
    };
  } finally {
    lock.releaseLock();
  }
}

function updatePost_(request, user) {
  const postId = requiredText_(request.postId, '게시글 번호가 필요합니다.');
  const title = validateTitle_(request.title);
  const content = validateContent_(request.content);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const record = findPostRecord_(postId);
    assertEditable_(record, user);

    const sheet = record.sheet;
    setTextValue_(sheet.getRange(record.rowNumber, record.headerMap.title + 1), title);
    setTextValue_(sheet.getRange(record.rowNumber, record.headerMap.content + 1), content);
    setTextValue_(
      sheet.getRange(record.rowNumber, record.headerMap.updatedAt + 1),
      new Date().toISOString(),
    );

    return getPost_(postId, user);
  } finally {
    lock.releaseLock();
  }
}

function deletePost_(postId, user) {
  const id = requiredText_(postId, '게시글 번호가 필요합니다.');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const record = findPostRecord_(id);
    assertEditable_(record, user);
    setTextValue_(
      record.sheet.getRange(record.rowNumber, record.headerMap.status + 1),
      BOARD_CONFIG.STATUS_DELETED,
    );
    setTextValue_(
      record.sheet.getRange(record.rowNumber, record.headerMap.updatedAt + 1),
      new Date().toISOString(),
    );
    return { postId: id };
  } finally {
    lock.releaseLock();
  }
}

function findPostRecord_(postId) {
  const sheet = getPostsSheet_();
  const values = sheet.getDataRange().getValues();
  if (!values.length) return null;

  const headerMap = headerMapFromRow_(values[0]);
  validateHeaders_(headerMap);

  for (let index = 1; index < values.length; index += 1) {
    if (String(values[index][headerMap.postId]) === postId) {
      const row = values[index];
      return {
        sheet: sheet,
        headerMap: headerMap,
        rowNumber: index + 1,
        row: row,
        id: String(row[headerMap.postId]),
        authorId: String(row[headerMap.authorId]),
        authorName: String(row[headerMap.authorName]),
        title: String(row[headerMap.title]),
        content: String(row[headerMap.content]),
        createdAt: row[headerMap.createdAt],
        updatedAt: row[headerMap.updatedAt],
        status: String(row[headerMap.status]).toUpperCase(),
      };
    }
  }
  return null;
}

function assertEditable_(record, user) {
  if (!record || record.status !== BOARD_CONFIG.STATUS_ACTIVE) {
    throw appError_('NOT_FOUND', '게시글을 찾을 수 없습니다.');
  }
  if (record.authorId !== user.id) {
    throw appError_('FORBIDDEN', '본인이 작성한 글만 수정하거나 삭제할 수 있습니다.');
  }
}

function rowToPublicPost_(row, headerMap, viewer) {
  const authorId = String(row[headerMap.authorId]);
  return {
    id: String(row[headerMap.postId]),
    authorName: String(row[headerMap.authorName]) || '이름 없는 사용자',
    title: String(row[headerMap.title]),
    content: String(row[headerMap.content]),
    createdAt: isoDate_(row[headerMap.createdAt]),
    updatedAt: isoDate_(row[headerMap.updatedAt]),
    canEdit: Boolean(viewer && viewer.id === authorId),
  };
}

function recordToPublicPost_(record, viewer) {
  return {
    id: record.id,
    authorName: record.authorName || '이름 없는 사용자',
    title: record.title,
    content: record.content,
    createdAt: isoDate_(record.createdAt),
    updatedAt: isoDate_(record.updatedAt),
    canEdit: Boolean(viewer && viewer.id === record.authorId),
  };
}

function getPostsSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw appError_(
      'SHEET_NOT_CONNECTED',
      'Apps Script가 스프레드시트에 연결되어 있지 않습니다.',
    );
  }

  const sheet = spreadsheet.getSheetByName(BOARD_CONFIG.SHEET_NAME);
  if (!sheet) {
    throw appError_('SHEET_NOT_FOUND', 'posts 시트를 찾을 수 없습니다.');
  }
  return sheet;
}

function getHeaderMap_(sheet) {
  if (sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) {
    throw appError_('INVALID_SHEET', 'posts 시트의 첫 행에 열 이름을 입력해 주세요.');
  }
  return headerMapFromRow_(sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]);
}

function headerMapFromRow_(headerRow) {
  return headerRow.reduce(function (map, value, index) {
    map[String(value).trim()] = index;
    return map;
  }, {});
}

function validateHeaders_(headerMap) {
  const missing = BOARD_CONFIG.REQUIRED_HEADERS.filter(function (header) {
    return headerMap[header] === undefined;
  });
  if (missing.length) {
    throw appError_('INVALID_HEADERS', 'posts 시트에 필요한 열이 없습니다: ' + missing.join(', '));
  }
}

function parseRequest_(event) {
  const raw = event && event.postData && event.postData.contents;
  if (!raw) throw appError_('INVALID_REQUEST', '요청 내용이 비어 있습니다.');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw appError_('INVALID_JSON', '올바른 JSON 요청이 아닙니다.');
  }
}

function setTextValue_(range, value) {
  range.setNumberFormat('@');
  range.setValue(String(value));
}

function optionalUser_(credential) {
  return credential ? verifyGoogleToken_(credential) : null;
}

function requireUser_(credential) {
  if (!credential) {
    throw appError_('AUTH_REQUIRED', 'Google 로그인이 필요합니다.');
  }
  return verifyGoogleToken_(credential);
}

function verifyGoogleToken_(credential) {
  const clientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
  if (!clientId) {
    throw appError_('AUTH_NOT_CONFIGURED', 'Apps Script에 GOOGLE_CLIENT_ID를 설정해 주세요.');
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = 'google-token-' + sha256Hex_(credential);
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo', {
    method: 'post',
    payload: { id_token: credential },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    throw appError_('INVALID_TOKEN', '로그인 정보가 유효하지 않습니다. 다시 로그인해 주세요.');
  }

  const token = JSON.parse(response.getContentText());
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAt = Number(token.exp || 0);
  const validIssuer = token.iss === 'accounts.google.com' || token.iss === 'https://accounts.google.com';

  if (token.aud !== clientId || !validIssuer || !token.sub) {
    throw appError_('INVALID_TOKEN', '이 사이트에서 발급된 로그인 정보가 아닙니다.');
  }
  if (expiresAt <= nowSeconds) {
    throw appError_('TOKEN_EXPIRED', '로그인이 만료되었습니다. 다시 로그인해 주세요.');
  }

  const user = {
    id: String(token.sub),
    name: cleanDisplayName_(token.name || emailPrefix_(token.email) || 'Google 사용자'),
    picture: safePictureUrl_(token.picture),
  };

  const ttl = Math.max(1, Math.min(600, expiresAt - nowSeconds));
  cache.put(cacheKey, JSON.stringify(user), ttl);
  return user;
}

function publicUser_(user) {
  return { name: user.name, picture: user.picture };
}

function validateTitle_(value) {
  const title = requiredText_(value, '제목을 입력해 주세요.');
  if (title.length > BOARD_CONFIG.MAX_TITLE_LENGTH) {
    throw appError_('TITLE_TOO_LONG', '제목은 100자까지 입력할 수 있습니다.');
  }
  return title;
}

function validateContent_(value) {
  const content = requiredText_(value, '내용을 입력해 주세요.');
  if (content.length > BOARD_CONFIG.MAX_CONTENT_LENGTH) {
    throw appError_('CONTENT_TOO_LONG', '내용은 5,000자까지 입력할 수 있습니다.');
  }
  return content;
}

function requiredText_(value, message) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!text) throw appError_('VALIDATION_ERROR', message);
  return text;
}

function cleanDisplayName_(value) {
  return String(value).replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 50) || 'Google 사용자';
}

function emailPrefix_(email) {
  return email ? String(email).split('@')[0] : '';
}

function safePictureUrl_(value) {
  const url = String(value || '');
  return /^https:\/\//i.test(url) ? url : '';
}

function isoDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function sha256Hex_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value)
    .map(function (byte) {
      return ('0' + (byte & 255).toString(16)).slice(-2);
    })
    .join('');
}

function appError_(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
