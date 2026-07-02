import { requireProfile } from "@/lib/auth";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export default async function SettingsPage() {
  const profile = await requireProfile();
  const readOnly = profile.role !== "owner";

  return (
    <div className="space-y-3">
      {readOnly && (
        <p className="mx-auto max-w-4xl rounded-md bg-tint px-3 py-2 text-sm text-accent-deep">
          멤버 권한은 설정을 조회만 할 수 있습니다. 편집은 관리자(owner) 전용입니다.
        </p>
      )}
      <PagePlaceholder
        title="설정"
        description="클라이언트 관리, 채널 프리셋 편집, WP 연결 정보, 팀원 관리, API 사용량 상세."
        phase="Phase 2 (15단계)"
      />
    </div>
  );
}
