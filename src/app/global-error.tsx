"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className="flex min-h-screen items-center justify-center bg-slate-50 p-4 font-sans text-slate-900">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-bold">حدث خطأ بالنظام · System Error</h1>
          <p className="text-sm text-slate-600">
            تعذر تحميل الصفحة بالكامل. يرجى إعادة المحاولة.
          </p>
          <button
            onClick={() => reset()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            إعادة المحاولة · Retry
          </button>
        </div>
      </body>
    </html>
  );
}
