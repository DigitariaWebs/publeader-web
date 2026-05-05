import { AppShell } from "@/components/AppShell";
import { ChauffeurDetailPro } from "@/screens/ChauffeurDetailPro";

export default async function ChauffeurDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <ChauffeurDetailPro driverId={id} />
    </AppShell>
  );
}
