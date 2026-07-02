import { requireProfile } from "@/lib/auth";
import { SettingsView } from "@/components/settings/settings-view";

export default async function SettingsPage() {
  const profile = await requireProfile();
  return <SettingsView role={profile.role} />;
}
