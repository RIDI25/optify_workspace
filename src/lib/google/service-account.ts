/**
 * GOOGLE_SERVICE_ACCOUNT_KEY(JSON 문자열) 파싱. 서버 전용.
 * GSC/GA4 인증에 공용으로 사용.
 *
 * ⚠️ .env에는 반드시 "한 줄"로 저장해야 한다. 서비스 계정 JSON의 private_key는
 *    여러 줄 PEM이라, 실제 개행이 들어가면 dotenv가 첫 줄에서 값을 잘라버린다.
 *    private_key의 개행은 \n(역슬래시+n) 이스케이프로 넣을 것.
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

  // ① 원본 → 실패 시 실제 제어문자(개행/탭)를 이스케이프로 재변환 후 재시도
  const candidates = [
    raw,
    raw.replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t"),
  ];

  let lastErr: unknown;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as ServiceAccount;
      // JSON 내 \n(이스케이프)은 실제 개행으로 복원 (PEM 서명에 필요)
      if (parsed.private_key?.includes("\\n")) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
      }
      if (!parsed.client_email || !parsed.private_key) {
        throw new Error("client_email / private_key 누락");
      }
      return parsed;
    } catch (e) {
      lastErr = e;
    }
  }

  // ② 원인 특정용 진단 정보 (비밀값 자체는 노출하지 않음)
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  const posMatch = msg.match(/position\s+(\d+)/i);
  const pos = posMatch ? Number(posMatch[1]) : null;
  const around =
    pos != null ? raw.slice(Math.max(0, pos - 25), pos + 25) : "";
  const detail =
    `len=${raw.length}, head="${raw.slice(0, 20)}", tail="${raw.slice(-20)}"` +
    (pos != null ? `, pos=${pos}, around=${JSON.stringify(around)}` : "");
  throw new Error(
    `GOOGLE_SERVICE_ACCOUNT_KEY 파싱 실패: ${msg}. ${detail}. ` +
      `값이 잘렸다면(.env가 여러 줄) JSON을 한 줄로, private_key 개행은 \\n으로 넣으세요.`,
  );
}
