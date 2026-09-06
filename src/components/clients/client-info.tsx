"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useClientContext } from "@/components/providers/client-context";
import { ClientServicesSection } from "@/components/settings/client-services";
import { ChannelAccountsSection, ClientCard, DangerZone, WordpressTab } from "@/components/clients/client-info-sections";
import { clientPath } from "@/lib/nav";
import type { Profile } from "@/types/database";

/**
 * 고객사 카드 › 기본정보. 설정 메뉴에 있던 고객사 항목(계약·기본 정보·온보딩·채널 계정·워드프레스)을 이리로 옮겼다.
 * 블록마다 그 자리에서 수정한다. (2차: 콘텐츠 기준 폼, 추적 설정 편집)
 */
export function ClientInfo({ id }: { id: string }) {
  const { clients, refreshClients } = useClientContext();
  const router = useRouter();
  const client = clients.find((c) => c.id === id) ?? null;
  const [profiles, setProfiles] = useState<Profile[]>([]);
  useEffect(() => {
    let active = true;
    createClient()
      .from("profiles")
      .select("*")
      .then(({ data }) => {
        if (active) setProfiles((data ?? []) as Profile[]);
      });
    return () => {
      active = false;
    };
  }, []);
  if (!client) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-ink">계약 서비스</h2>
        <p className="text-xs text-muted">항목을 더하고 기간·금액·상태를 그 자리에서 고칩니다. 끝난 계약은 지우지 말고 종료로 두면 이력이 남습니다.</p>
        <ClientServicesSection key={client.id} clientId={client.id} readOnly={false} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-ink">기본 정보 · 온보딩</h2>
        <ClientCard client={client} readOnly={false} onSaved={() => void refreshClients()} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-ink">채널 계정</h2>
        <ChannelAccountsSection key={client.id} clientId={client.id} profiles={profiles} readOnly={false} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-ink">워드프레스 연결</h2>
        <WordpressTab key={client.id} clients={[client]} readOnly={false} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-ink">콘텐츠 기준 · 추적 설정</h2>
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted">
          <p>
            말투·독자·꼭 넣을 것·금지 표현 네 칸짜리 폼은 2차에서 이 자리에 들어옵니다. 지금은 채널 계정의 <b>카테고리</b> 칸이 외부 고객사 글에 반영됩니다.
          </p>
          <p className="mt-1">
            AI 질문·검색어·경쟁사(추적 설정)는 아직 맥의 옵티파이 트래커 앱에서 고칩니다. 측정 결과는{" "}
            <Link href={clientPath(client.id, "geo")} className="text-accent-deep hover:underline">
              GEO
            </Link>{" "}
            ·{" "}
            <Link href={clientPath(client.id, "seo")} className="text-accent-deep hover:underline">
              SEO
            </Link>{" "}
            탭에서 봅니다.
          </p>
        </div>
      </section>

      {!client.is_internal && (
        <DangerZone
          client={client}
          onDeleted={() => {
            void refreshClients();
            router.push("/clients");
          }}
        />
      )}
    </div>
  );
}
