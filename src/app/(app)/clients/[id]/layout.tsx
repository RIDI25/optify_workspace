import { ClientShell } from "@/components/clients/client-shell";

/** 고객사 카드 — /clients/[id]/[탭]. 머리(이름·계약·담당)와 탭은 모든 탭에서 공통 */
export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClientShell id={id}>{children}</ClientShell>;
}
