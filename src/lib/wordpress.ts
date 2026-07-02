/** WordPress REST API 클라이언트 (Application Password Basic Auth). 서버 전용. */

function normalize(url: string): string {
  return url.replace(/\/+$/, "");
}

function authHeader(username: string, appPassword: string): string {
  const token = Buffer.from(`${username}:${appPassword}`).toString("base64");
  return `Basic ${token}`;
}

/** 연결 테스트 — GET /wp/v2/users/me */
export async function wpTestConnection(
  url: string,
  username: string,
  appPassword: string,
): Promise<{ ok: boolean; name?: string; error?: string }> {
  try {
    const res = await fetch(`${normalize(url)}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: authHeader(username, appPassword) },
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { name?: string };
    return { ok: true, name: data.name };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "연결 실패" };
  }
}

/** 초안 발행 — POST /wp/v2/posts (status=draft) */
export async function wpCreateDraft(
  url: string,
  username: string,
  appPassword: string,
  title: string,
  contentHtml: string,
): Promise<{ id: number }> {
  const res = await fetch(`${normalize(url)}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      Authorization: authHeader(username, appPassword),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, content: contentHtml, status: "draft" }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WP 발행 실패 (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id: number };
  return { id: data.id };
}
