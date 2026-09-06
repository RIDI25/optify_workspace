"use client";

import type { ReactNode } from "react";
import { useClientContext } from "@/components/providers/client-context";

/**
 * 고객사가 바뀌면 안쪽 화면을 통째로 새로 그린다 [코덱스 01].
 * 생성 결과·선택한 글·불러온 리포트처럼 이전 고객사의 것이 화면에 남아
 * 다른 고객사 이름으로 저장·전송되는 일을 막는다. (표시용 래퍼 — 레이아웃에는 영향 없음)
 */
export function ClientScoped({ children }: { children: ReactNode }) {
  const { selectedClientId } = useClientContext();
  return (
    <div key={selectedClientId ?? "none"} className="contents">
      {children}
    </div>
  );
}
