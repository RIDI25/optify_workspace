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

/** 미디어 업로드 — POST /wp/v2/media (바이너리) + alt_text 설정. 미디어 id 반환. */
export async function wpUploadMedia(
  url: string,
  username: string,
  appPassword: string,
  bytes: Buffer,
  filename: string,
  mime: string,
  alt: string,
): Promise<{ id: number }> {
  const base = normalize(url);
  const res = await fetch(`${base}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: authHeader(username, appPassword),
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    body: new Uint8Array(bytes),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`미디어 업로드 실패 (HTTP ${res.status}): ${text.slice(0, 150)}`);
  }
  const data = (await res.json()) as { id: number };

  // alt_text 설정(실패는 무시)
  if (alt) {
    await fetch(`${base}/wp-json/wp/v2/media/${data.id}`, {
      method: "POST",
      headers: {
        Authorization: authHeader(username, appPassword),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ alt_text: alt }),
    }).catch(() => undefined);
  }
  return { id: data.id };
}

/** 초안 발행 — POST /wp/v2/posts (status=draft). featuredMediaId 있으면 썸네일 지정. */
export async function wpCreateDraft(
  url: string,
  username: string,
  appPassword: string,
  title: string,
  contentHtml: string,
  featuredMediaId?: number,
): Promise<{ id: number }> {
  const payload: Record<string, unknown> = {
    title,
    content: contentHtml,
    status: "draft",
  };
  if (featuredMediaId) payload.featured_media = featuredMediaId;

  const res = await fetch(`${normalize(url)}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      Authorization: authHeader(username, appPassword),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WP 발행 실패 (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id: number };
  return { id: data.id };
}
