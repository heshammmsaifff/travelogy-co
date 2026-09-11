"use client";

import { useEffect } from "react";
import { Button } from "@/shared/ui/button";
import { LuTriangleAlert, LuRotateCcw, LuHouse } from "react-icons/lu";
import { Link } from "@/shared/i18n/navigation";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Runtime Error Boundary]:", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="mx-auto max-w-md space-y-5">
        <div className="inline-flex size-20 items-center justify-center rounded-full bg-danger-50 text-danger-600 dark:bg-danger-950/50 dark:text-danger-400">
          <LuTriangleAlert className="size-10" aria-hidden />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            حدث خطأ غير متوقع · Something Went Wrong
          </h1>
          <p className="text-sm text-ink-muted">
            نعتذر عن هذا الخطأ. تم تسجيل المشكلة وسيتم العمل على حلها فوراً.
            <br />
            An unexpected error occurred. Please try again or return to the main dashboard.
          </p>
          {error.digest ? (
            <p className="font-mono text-2xs text-ink-muted">
              Error Digest: {error.digest}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button variant="primary" onClick={() => reset()}>
            <LuRotateCcw className="size-4" aria-hidden />
            <span>إعادة المحاولة · Try Again</span>
          </Button>
          <Link href="/">
            <Button variant="secondary">
              <LuHouse className="size-4" aria-hidden />
              <span>الرئيسية · Home</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
