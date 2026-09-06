import { ClientScoped } from "@/components/providers/client-scoped";
import { ReportsView } from "@/components/reports/reports-view";

export default function ReportsPage() {
  return <ClientScoped>
        <ReportsView />
      </ClientScoped>;
}
