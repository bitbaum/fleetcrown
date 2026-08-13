import { notFound } from "next/navigation";
import { PageLayout } from "@/components/ui/page-layout";
import { getRobotDetail } from "@/db/queries/robots";
import { RobotProfile } from "@/components/robots/RobotProfile";
import { requirePageUserId } from "@/lib/session";
import { ROBOT_CLASS_LABEL } from "@/config/actors";

export const metadata = { title: "Robot" };

export default async function RobotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requirePageUserId();
  const { id } = await params;
  const robot = await getRobotDetail(userId, id);
  if (!robot) notFound();

  const classLabel = robot.robotClass ? ROBOT_CLASS_LABEL[robot.robotClass] : "Robot";

  return (
    <PageLayout
      title={robot.name}
      subtitle={classLabel}
      maxWidth="max-w-xl"
    >
      <RobotProfile robot={robot} />
    </PageLayout>
  );
}
