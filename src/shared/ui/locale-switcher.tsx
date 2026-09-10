"use client";

import { useTransition } from "react";
import { LuGlobe } from "react-icons/lu";
import { usePathname, useRouter } from "@/shared/i18n/navigation";
import { LOCALE_META, type Locale } from "@/shared/i18n/config";
import { routing } from "@/shared/i18n/routing";
import { cn } from "@/shared/lib/cn";

/**
 * Locale switcher.
 *
 * Uses next-intl's `usePathname`/`useRouter`, which strip and re-apply the
 * locale prefix, so the user stays on the same page when switching rather than
 * being dropped at the home page.
 */
export function LocaleSwitcher({
  current,
  label,
  variant = "light",
  className,
}: {
  current: Locale;
  label: string;
  variant?: "light" | "dark";
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function switchTo(locale: Locale) {
    if (locale === current) return;
    startTransition(() => {
      // `pathname` here is the current path with the locale prefix already
      // stripped and dynamic segments resolved, so switching locale is just a
      // matter of re-prefixing it.
      router.replace(pathname, { locale });
    });
  }

  const isDark = variant === "dark";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-control p-0.5 transition-colors",
        isDark
          ? "border border-[#D8AE4A]/30 bg-[#042D39] shadow-2xs"
          : "border border-border bg-neutral-100/80 shadow-2xs",
        className,
      )}
      role="group"
      aria-label={label}
    >
      <LuGlobe
        className={cn("ms-1.5 size-3.5 shrink-0", isDark ? "text-[#D8AE4A]" : "text-brand-500")}
        aria-hidden
      />
      {routing.locales.map((locale) => {
        const isActive = locale === current;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => switchTo(locale)}
            disabled={isPending}
            // Active state is exposed to assistive tech, not just painted on.
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "rounded-[calc(var(--radius-control)-2px)] px-2.5 py-1 text-xs font-medium",
              "transition-all duration-150 ease-out-soft",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
              "disabled:cursor-wait disabled:opacity-60",
              isActive ? "cursor-default" : "cursor-pointer",
              isDark
                ? isActive
                  ? "bg-[#D8AE4A] text-[#063B4A] font-bold shadow-xs"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
                : isActive
                  ? "bg-brand-600 text-white font-semibold shadow-xs"
                  : "text-ink-muted hover:bg-surface hover:text-ink hover:shadow-2xs",
            )}
          >
            {LOCALE_META[locale].nativeName}
          </button>
        );
      })}
    </div>
  );
}
