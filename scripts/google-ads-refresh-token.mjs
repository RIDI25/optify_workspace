// 일회용 스크립트: Google Ads API refresh token 발급 (loopback OAuth 흐름)
//
// 실행:  node scripts/google-ads-refresh-token.mjs
//
// .env.local의 GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET를 읽어
// 브라우저 동의 → 코드 수신 → refresh token 교환까지 자동으로 처리한다.
// 발급된 refresh token을 .env.local의 GOOGLE_ADS_REFRESH_TOKEN=에 붙여넣으면 끝.
//
// 사전 조건:
//  1) 이 OAuth 클라이언트가 "데스크톱 앱" 유형이면 loopback(http://localhost:PORT)이 자동 허용된다.
//     "웹 애플리케이션" 유형이면 아래 REDIRECT_URI를 Google Cloud Console >
//     API 및 서비스 > 사용자 인증 정보 > 해당 클라이언트 > 승인된 리디렉션 URI에 추가해야 한다.
//  2) 동의에 사용하는 Google 계정이 대상 Google Ads 계정(customer 1399195654)에 접근 권한이 있어야 한다.
//  3) OAuth 동의 화면이 "테스트" 상태면 그 계정이 테스트 사용자로 등록돼 있어야 한다.

import http from "node:http";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PORT = 4599;
const REDIRECT_URI = `http://localhost:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/adwords";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

// ── .env.local 파싱 ────────────────────────────────────────
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env.local");
const env = {};
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2];
}

const CLIENT_ID = env.GOOGLE_ADS_CLIENT_ID;
const CLIENT_SECRET = env.GOOGLE_ADS_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "❌ .env.local에서 GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET를 찾지 못했습니다.",
  );
  process.exit(1);
}

const state = crypto.randomBytes(16).toString("hex");
const authUrl =
  `${AUTH_ENDPOINT}?` +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline", // refresh token을 받기 위해 필수
    prompt: "consent", // 매번 refresh token을 확실히 받기 위해
    state,
  }).toString();

function openBrowser(url) {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref();
  } catch {
    // 브라우저 자동 실행 실패 시 사용자가 수동으로 열도록 안내만 함
  }
}

async function exchangeCode(code) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`토큰 교환 실패 (HTTP ${res.status}): ${await res.text()}`);
  }
  return res.json();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (!url.searchParams.has("code") && !url.searchParams.has("error")) {
    res.writeHead(404).end();
    return;
  }

  const err = url.searchParams.get("error");
  if (err) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<h2>인증 거부됨: ${err}</h2><p>터미널로 돌아가세요.</p>`);
    console.error(`\n❌ 인증 거부: ${err}`);
    server.close();
    process.exit(1);
  }

  if (url.searchParams.get("state") !== state) {
    res.writeHead(400).end("state 불일치");
    console.error("\n❌ state 불일치 (CSRF 방지). 다시 실행하세요.");
    server.close();
    process.exit(1);
  }

  try {
    const tokens = await exchangeCode(url.searchParams.get("code"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      "<h2>✅ 완료</h2><p>터미널에 출력된 refresh token을 확인하세요. 이 창은 닫아도 됩니다.</p>",
    );

    if (!tokens.refresh_token) {
      console.error(
        "\n⚠️ refresh_token이 응답에 없습니다. 이미 이 앱에 권한을 부여한 계정이라 그럴 수 있습니다.",
      );
      console.error(
        "   https://myaccount.google.com/permissions 에서 해당 앱 액세스를 제거한 뒤 다시 실행하세요.",
      );
    } else {
      console.log("\n✅ refresh token 발급 성공!\n");
      console.log("아래 값을 .env.local의 GOOGLE_ADS_REFRESH_TOKEN= 에 붙여넣으세요:\n");
      console.log(`GOOGLE_ADS_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    }
  } catch (e) {
    res.writeHead(500).end("토큰 교환 실패 (터미널 확인)");
    console.error(`\n❌ ${e.message}`);
  } finally {
    server.close();
    process.exit(0);
  }
});

server.listen(PORT, () => {
  console.log("1) 아래 URL이 브라우저에서 열립니다(안 열리면 직접 복사해서 여세요):\n");
  console.log(authUrl + "\n");
  console.log("2) Google 계정으로 로그인 → 권한 동의 → 자동으로 이 스크립트가 토큰을 받습니다.");
  console.log(`   (리디렉션 대기 중: ${REDIRECT_URI})\n`);
  openBrowser(authUrl);
});
