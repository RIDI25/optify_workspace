import { ClientOverview } from "@/components/clients/client-overview";

export default async function ClientOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientOverview id={id} />;
}
