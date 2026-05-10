"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

/**
 * Renders a dismissable banner when the URL has `?error=unauthorized`.
 * Set by src/lib/page-auth.ts → requirePermissionForPath when a user
 * tries to reach a page they don't have permission for. The `from`
 * query param carries the path that was blocked, so the message can
 * be specific.
 *
 * Wrapped in Suspense at the top because useSearchParams forces the
 * caller into client-side rendering, and Next.js wants that boundary
 * explicit to avoid de-opting the whole tree.
 */
export function UnauthorizedBanner() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const error = params.get("error");
  const from = params.get("from");

  useEffect(() => {
    setOpen(error === "unauthorized");
  }, [error]);

  if (!open || error !== "unauthorized") return null;

  const dismiss = () => {
    setOpen(false);
    // Strip the error/from params from the URL so a refresh doesn't
    // resurrect the banner.
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    url.searchParams.delete("from");
    router.replace(url.pathname + (url.search || ""), { scroll: false });
  };

  return (
    <div
      role="alert"
      className="mb-4 flex items-start justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <div>
        <strong className="font-medium">
          Сизда бу саҳифага рухсат йўқ · You don&apos;t have access to that page
        </strong>
        {from ? (
          <span className="ml-1 text-amber-800/80">
            {" "}
            (<code className="text-xs">{from}</code>)
          </span>
        ) : null}
        <span className="ml-1 text-amber-800/80">
          — sent to <code className="text-xs">{pathname}</code> instead.
        </span>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded px-2 py-0.5 text-amber-900/80 hover:bg-amber-100 hover:text-amber-900"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
