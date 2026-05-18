import { headers } from "next/headers";
import { requirePermissionForPath } from "@/lib/page-auth";
import GalleryClient from "./GalleryClient";

export default async function GalleryPage() {
  const h = headers();
  await requirePermissionForPath(h.get("x-pathname") || "/gallery");
  return <GalleryClient />;
}
