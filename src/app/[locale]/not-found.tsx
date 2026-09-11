import { Link } from "@/shared/i18n/navigation";
import { Button } from "@/shared/ui/button";
import { LuHouse, LuArrowRight } from "react-icons/lu";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="mx-auto max-w-md space-y-5">
        <div className="inline-flex size-20 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400">
          <span className="font-mono text-3xl font-bold">404</span>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            الصفحة غير موجودة · Page Not Found
          </h1>
          <p className="text-sm text-ink-muted">
            عذرًا، لم نتمكن من العثور على الصفحة التي تبحث عنها. ربما تم نقلها أو حذفها.
            <br />
            The page you are looking for might have been moved, deleted or does not exist.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link href="/">
            <Button variant="primary">
              <LuHouse className="size-4" aria-hidden />
              <span>الرئيسية · Home</span>
            </Button>
          </Link>
          <Link href="/agent">
            <Button variant="secondary">
              <span>بوابة الوكيل · Agent Portal</span>
              <LuArrowRight className="size-4 rtl:rotate-180" aria-hidden />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
