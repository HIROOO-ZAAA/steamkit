import { redirect } from "next/navigation";

/** Keep legacy bookmarks on the integrated alert settings and OBS test flow. */
export default function LegacyAlertBoxPage() {
  redirect("/dashboard/alerts");
}
