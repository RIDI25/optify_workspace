import { ClientInfo } from "@/components/clients/client-info";

export default async function ClientInfoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientInfo id={id} />;
}
