import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const config = fs.readFileSync(new URL("../config.js", import.meta.url), "utf8");
const appsScript = fs.readFileSync(new URL("../Code.gs", import.meta.url), "utf8");

// Compile scripts without running browser or Apps Script globals.
new Function(app);
new Function(config);
new Function(appsScript);

const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
const elementReferences = new Set(
  [...app.matchAll(/elements\.([A-Za-z0-9_]+)/g)].map((match) => match[1]),
);
const missingIds = [...elementReferences].filter((id) => !htmlIds.has(id));

if (missingIds.length) {
  throw new Error(`index.html에 없는 DOM ID: ${missingIds.join(", ")}`);
}

for (const file of ["styles.css", "config.js", "app.js", "assets/favicon.png"]) {
  if (!html.includes(`./${file}`)) throw new Error(`index.html에 ${file} 연결이 없습니다.`);
}

if (!fs.existsSync(new URL("../assets/favicon.png", import.meta.url))) {
  throw new Error("파비콘 이미지 파일이 없습니다.");
}

console.log(`검증 완료: DOM 요소 ${elementReferences.size}개와 JavaScript 문법이 정상입니다.`);
