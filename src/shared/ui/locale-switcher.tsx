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
export function LocaleSwitcher({ current, label }: { current: Locale; label: string }) {
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

  return (
    <div
      className="inline-flex items-center gap-1 rounded-control border border-border bg-surface p-0.5"
      role="group"
      aria-label={label}
    >
      <LuGlobe className="ms-1.5 size-3.5 shrink-0 text-ink-subtle" aria-hidden />
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
              "cursor-pointer rounded-[calc(var(--radius-control)-2px)] px-2.5 py-1 text-xs font-medium",
              "transition-colors duration-150 ease-out-soft",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
              "disabled:cursor-wait",
              isActive
                ? "bg-brand-600 text-ink-inverse"
                : "text-ink-muted hover:bg-surface-hover hover:text-ink",
            )}
          >
            {LOCALE_META[locale].nativeName}
          </button>
        );
      })}
    </div>
  );
}
