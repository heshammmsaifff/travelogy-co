"use client";

import { useId, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LuSearch } from "react-icons/lu";
import { isLocale } from "@/shared/i18n/config";
import { routing } from "@/shared/i18n/routing";
import { cn } from "@/shared/lib/cn";
import { getCountries } from "@/shared/lib/countries";

/**
 * Country picker: a search box above a native `<select>` of all 250 countries.
 *
 * WHY A NATIVE SELECT rather than a custom popover listbox: it is the control
 * the platform already implements correctly. Keyboard navigation, type-ahead,
 * screen-reader announcement and — the one that matters most here — the native
 * wheel picker on a phone all come for free, and none of them would come free
 * from a hand-rolled listbox. The project has no popover primitive (§15, 0.3
 * keeps the dependency list short), so building one would have meant owning
 * focus management and ARIA for a field that did not need it.
 *
 * The search box is a FILTER over that select, not a second control: the
 * select still holds and submits the value, so the form works exactly as it
 * did when this was a text input, and it works with JavaScript disabled
 * (the search simply does nothing).
 */
export function CountrySelect({
  name,
  label,
  defaultValue,
  placeholder,
  required,
  hint,
  className,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  className?: string;
}) {
  const t = useTranslations("common");
  // Read from context rather than taking a prop: six forms use this field and
  // none of them had a locale to hand, so threading one through would have
  // been six changes to say what next-intl already knows.
  const active = useLocale();
  const locale = isLocale(active) ? active : routing.defaultLocale;
  const id = useId();
  const searchId = `${id}-search`;
  const hintId = `${id}-hint`;

  const all = useMemo(() => getCountries(locale), [locale]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(defaultValue ?? "");

  const { visible, matched } = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { visible: all, matched: all.length };

    // `search` holds the code and the name in BOTH locales, so an Arabic UI
    // still finds "saudi" typed on a Latin keyboard.
    const matches = all.filter((c) => c.search.includes(q));

    // The chosen country must never vanish from the list: a select whose
    // selected option has been filtered away silently changes its own value,
    // which would submit a country nobody picked. It is pinned to the top and
    // deliberately not counted as a match.
    if (selected && !matches.some((c) => c.code === selected)) {
      const current = all.find((c) => c.code === selected);
      if (current) return { visible: [current, ...matches], matched: matches.length };
    }
    return { visible: matches, matched: matches.length };
  }, [all, query, selected]);

  return (
    <div className={cn("flex w-full flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required ? (
          <span className="ms-0.5 text-danger-600" aria-hidden>
            *
          </span>
        ) : null}
      </label>

      <div className="relative">
        <span
          className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-ink-subtle [&_svg]:size-4"
          aria-hidden
        >
          <LuSearch />
        </span>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchCountry")}
          aria-label={t("searchCountry")}
          aria-controls={id}
          // Not part of the form: it filters the list and nothing more, so it
          // carries no `name` and never reaches the server.
          className="h-9 w-full rounded-control border border-border bg-surface ps-9 pe-3 text-sm text-ink placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:outline-focus"
        />
      </div>

      <select
        id={id}
        name={name}
        required={required}
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        aria-describedby={hint ? hintId : undefined}
        // Eight rows rather than a collapsed select: with a filter above it,
        // seeing the matches without opening anything is the point.
        size={query ? Math.min(8, Math.max(2, visible.length)) : undefined}
        className="w-full cursor-pointer rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        {/* Only when nothing is chosen yet, so a filled field cannot be
            emptied back into a meaningless blank. */}
        {selected ? null : (
          <option value="">
            {placeholder ?? (locale === "ar" ? "— اختر الدولة —" : "— Select country —")}
          </option>
        )}

        {visible.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name} ({c.code})
          </option>
        ))}
      </select>

      {query && matched === 0 ? (
        <p className="text-xs text-ink-muted">{t("noResults")}</p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
