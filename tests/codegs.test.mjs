import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";

const headers = [
  "postId",
  "authorId",
  "authorName",
  "title",
  "content",
  "createdAt",
  "updatedAt",
  "status",
];
const rows = [headers.slice()];
const cache = new Map();

function makeRange(row, column, rowCount = 1, columnCount = 1) {
  return {
    getValues() {
      return Array.from({ length: rowCount }, (_, rowOffset) =>
        Array.from(
          { length: columnCount },
          (_, columnOffset) => rows[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? "",
        ),
      );
    },
    setValues(values) {
      values.forEach((sourceRow, rowOffset) => {
        const targetIndex = row - 1 + rowOffset;
        if (!rows[targetIndex]) rows[targetIndex] = new Array(headers.length).fill("");
        sourceRow.forEach((value, columnOffset) => {
          rows[targetIndex][column - 1 + columnOffset] = value;
        });
      });
      return this;
    },
    setValue(value) {
      if (!rows[row - 1]) rows[row - 1] = new Array(headers.length).fill("");
      rows[row - 1][column - 1] = value;
      return this;
    },
    setNumberFormat() {
      return this;
    },
    setFontWeight() {
      return this;
    },
  };
}

const sheet = {
  getLastRow: () => rows.length,
  getLastColumn: () => headers.length,
  getDataRange: () => ({ getValues: () => rows.map((row) => row.slice()) }),
  getRange: makeRange,
  setFrozenRows: () => {},
};

const users = {
  "token-owner": {
    aud: "test-client-id",
    iss: "https://accounts.google.com",
    sub: "100000000000000000001",
    name: "작성자",
    picture: "https://example.com/owner.png",
    exp: String(Math.floor(Date.now() / 1000) + 3600),
  },
  "token-other": {
    aud: "test-client-id",
    iss: "accounts.google.com",
    sub: "200000000000000000002",
    name: "다른 사용자",
    exp: String(Math.floor(Date.now() / 1000) + 3600),
  },
};

const context = vm.createContext({
  console: { log: console.log, error: () => {} },
  Date,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Math,
  Error,
  isNaN,
  encodeURIComponent,
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({ getSheetByName: (name) => (name === "posts" ? sheet : null) }),
  },
  LockService: {
    getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }),
  },
  PropertiesService: {
    getScriptProperties: () => ({ getProperty: (name) => (name === "GOOGLE_CLIENT_ID" ? "test-client-id" : null) }),
  },
  CacheService: {
    getScriptCache: () => ({
      get: (key) => cache.get(key) ?? null,
      put: (key, value) => cache.set(key, value),
    }),
  },
  UrlFetchApp: {
    fetch: (_url, options) => {
      const user = users[options.payload.id_token];
      return {
        getResponseCode: () => (user ? 200 : 401),
        getContentText: () => JSON.stringify(user || { error: "invalid_token" }),
      };
    },
  },
  Utilities: {
    getUuid: () => "post-uuid-1",
    DigestAlgorithm: { SHA_256: "sha256" },
    computeDigest: (_algorithm, value) => [...crypto.createHash("sha256").update(value).digest()],
  },
  ContentService: {
    MimeType: { JSON: "application/json" },
    createTextOutput: (content) => ({
      content,
      setMimeType() {
        return this;
      },
    }),
  },
});

vm.runInContext(fs.readFileSync(new URL("../Code.gs", import.meta.url), "utf8"), context);

function request(action, body = {}) {
  const output = context.doPost({
    postData: { contents: JSON.stringify({ action, ...body }) },
  });
  return JSON.parse(output.content);
}

assert.match(context.setupBoard(), /준비 완료/);

const created = request("create", {
  credential: "token-owner",
  title: "=수식처럼 시작하는 안전한 제목",
  content: "첫 번째 게시글입니다.",
});
assert.equal(created.ok, true);
assert.equal(created.data.post.canEdit, true);
assert.equal(rows[1][1], "100000000000000000001");

const anonymousList = request("list");
assert.equal(anonymousList.data.posts.length, 1);
assert.equal(anonymousList.data.posts[0].canEdit, false);
assert.equal("authorId" in anonymousList.data.posts[0], false);

const ownerList = request("list", { credential: "token-owner" });
assert.equal(ownerList.data.posts[0].canEdit, true);

const forbidden = request("update", {
  credential: "token-other",
  postId: "post-uuid-1",
  title: "수정 시도",
  content: "다른 사용자의 수정 시도",
});
assert.equal(forbidden.ok, false);
assert.equal(forbidden.error.code, "FORBIDDEN");

const updated = request("update", {
  credential: "token-owner",
  postId: "post-uuid-1",
  title: "수정된 제목",
  content: "수정된 내용",
});
assert.equal(updated.ok, true);
assert.equal(updated.data.post.title, "수정된 제목");

const deleted = request("delete", {
  credential: "token-owner",
  postId: "post-uuid-1",
});
assert.equal(deleted.ok, true);
assert.equal(request("list").data.posts.length, 0);

console.log("Code.gs 테스트 완료: 공개 조회와 작성자 권한 검사가 정상입니다.");
