"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The Calculator moved to /calculations. Anything still linking here gets
 * forwarded.
 */
export default function NewProjectRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/calculations");
  }, [router]);
  return (
    <div className="text-muted-foreground p-4">
      Redirecting to <span className="font-mono">/calculations</span>…
    </div>
  );
}
