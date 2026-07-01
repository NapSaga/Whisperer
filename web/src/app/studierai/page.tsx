import { StudieraiView } from "@/components/studierai-view";
import { getStudierai } from "@/lib/fixtures";

export default function StudieraiPage() {
  const data = getStudierai();
  return <StudieraiView data={data} />;
}
