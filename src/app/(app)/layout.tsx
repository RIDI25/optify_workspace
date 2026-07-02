import { requireProfile } from "@/lib/auth";
import { ClientProvider } from "@/components/providers/client-context";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <ClientProvider>
      <div className="flex min-h-dvh">
        <Sidebar role={profile.role} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar userName={profile.name} />
          <main className="flex-1 overflow-auto bg-subtle p-6">{children}</main>
        </div>
      </div>
    </ClientProvider>
  );
}
