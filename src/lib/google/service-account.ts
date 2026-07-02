/**
 * GOOGLE_SERVICE_ACCOUNT_KEY(JSON 문자열) 파싱. 서버 전용.
 * GSC/GA4 인증에 공용으로 사용.
 */
export interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

export function getServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_KEY 미설정 — 서비스 계정 JSON을 .env에 입력하세요.",
    );
  }
  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY 파싱 실패 — JSON 형식 확인");
  }
  // 일부 환경에서 private_key의 개행이 \\n으로 이스케이프되어 들어옴
  if (parsed.private_key?.includes("\\n")) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
}
