import { AppShell } from "@/components/AppShell";
import { CampagneDetailGlass } from "@/screens/CampagneDetailGlass";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CampagneDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <AppShell>
      <CampagneDetailGlass id={id} />
    </AppShell>
  );
}
