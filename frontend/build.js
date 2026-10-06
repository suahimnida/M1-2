// Vercel 빌드: src/를 public/으로 복사하고 API_URL 환경변수로 config.js를 만든다.
// 정적 사이트는 브라우저에서 환경변수를 직접 읽을 수 없기 때문.
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "src");
const out = path.join(__dirname, "public");
const apiUrl = (process.env.API_URL || "").replace(/\/$/, "");

if (!apiUrl) {
  console.error("API_URL 환경변수가 없습니다. Vercel 프로젝트 설정에서 추가하세요.");
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
fs.writeFileSync(
  path.join(out, "config.js"),
  `window.APP_CONFIG = { API_URL: ${JSON.stringify(apiUrl)} };\n`
);
console.log(`빌드 완료 (API_URL=${apiUrl})`);
