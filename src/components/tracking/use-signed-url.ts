"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "tracker";

/** Storage 'tracker' 버킷(비공개)의 파일을 1시간짜리 서명 URL 로. 경로가 없거나 아직이면 null. */
export function useSignedUrl(path: string | null | undefined): string | null {
  const [state, setState] = useState<{ path: string | null | undefined; url: string | null }>({
    path: undefined,
    url: null,
  });
  useEffect(() => {
    if (!path) return;
    let active = true;
    createClient()
      .storage.from(BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (active) setState({ path, url: data?.signedUrl ?? null });
      });
    return () => {
      active = false;
    };
  }, [path]);
  return state.path === path ? state.url : null;
}
