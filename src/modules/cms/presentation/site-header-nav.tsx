"use client";

import * as React from "react";
import Image from "next/image";
import { LuLayoutDashboard, LuMenu, LuX } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { Link, usePathname } from "@/shared/i18n/navigation";
import { LocaleSwitcher } from "@/shared/ui/locale-switcher";
import { buttonVariants } from "@/shared/ui/button-variants";
import { SignOutButton } from "@/modules/auth/presentation/sign-out-button";
import { Sheet, SheetContent, SheetTitle } from "@/shared/ui/sheet";
import { motion } from "framer-motion";
import { cn } from "@/shared/lib/cn";

export type NavItem = {
  key: string;
  label: string;
  href: string;
};

interface SiteHeaderNavProps {
  locale: Locale;
  navItems: NavItem[];
  user: {
    fullName: string;
    role: { scope: string; nameAr: string; nameEn: string };
  } | null;
  dashboardPath: string | null;
  dashboardLabel: string;
  loginLabel: string;
  registerLabel: string;
  languageLabel: string;
}

export function SiteHeaderNav({
  locale,
  navItems,
  user,
  dashboardPath,
  dashboardLabel,
  loginLabel,
  registerLabel,
  languageLabel,
}: SiteHeaderNavProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const pathname = usePathname();

  // Close drawer upon route transition
  React.useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const sheetSide = locale === "ar" ? "right" : "left";

  return (
    <>
      {/* ── Desktop Navigation (hidden on mobile) ────────────────────────── */}
      <nav aria-label="Main" className="hidden md:flex items-center gap-1">
        <ul className="flex items-center gap-1">
          {navItems.map(({ key, href, label }) => {
            const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <li key={key}>
                <Link
                  href={href}
                  className={cn(
                    "rounded-control px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-[#D8AE4A]",
                    isActive
                      ? "bg-white/15 text-white font-medium shadow-xs"
                      : "text-slate-200 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Desktop Actions ──────────────────────────────────────────────── */}
      <div className="hidden md:flex items-center gap-2.5 ms-auto">
        <LocaleSwitcher current={locale} label={languageLabel} variant="dark" />

        {user && dashboardPath ? (
          <>
            <Link
              href={dashboardPath}
              className={buttonVariants({ variant: "gold", size: "sm" })}
            >
              <LuLayoutDashboard className="size-4" aria-hidden />
              {dashboardLabel}
            </Link>
            <SignOutButton
              locale={locale}
              variant="ghost"
              size="sm"
              className="text-slate-200 hover:bg-white/10 hover:text-white"
            />
          </>
        ) : (
          <>
            <Link
              href="/login"
              className={buttonVariants({
                variant: "ghost",
                size: "sm",
                className: "text-slate-200 hover:bg-white/10 hover:text-white",
              })}
            >
              {loginLabel}
            </Link>
            <Link
              href="/register"
              className={buttonVariants({ variant: "gold", size: "sm" })}
            >
              {registerLabel}
            </Link>
          </>
        )}
      </div>

      {/* ── Mobile Hamburger Trigger & Locale Switcher ────────────────────── */}
      <div className="flex md:hidden items-center gap-2 ms-auto">
        <LocaleSwitcher current={locale} label={languageLabel} variant="dark" />

        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex size-9 cursor-pointer items-center justify-center rounded-control border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-[#D8AE4A]"
          aria-label="Open navigation menu"
          aria-expanded={isOpen}
        >
          <LuMenu className="size-5" />
        </button>
      </div>

      {/* ── Mobile Drawer Sheet ───────────────────────────────────────────── */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side={sheetSide}
          className="w-80 max-w-[85vw] border-[#042D39] bg-[#063B4A] p-0 text-white shadow-2xl flex flex-col justify-between"
          showClose={false}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#042D39] p-4">
            <div className="flex items-center gap-2.5">
              <Image
                src="/logo.png"
                alt="Travelogy"
                width={36}
                height={26}
                className="h-7 w-auto object-contain brightness-110"
              />
              <div className="flex flex-col">
                <SheetTitle className="text-base font-bold text-white leading-none">
                  Travelogy
                </SheetTitle>
                <span className="text-[8px] tracking-widest text-[#D8AE4A] font-semibold uppercase mt-0.5">
                  BOOK · CONNECT · GROW
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-control p-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close menu"
            >
              <LuX className="size-5" />
            </button>
          </div>

          {/* Links Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-2 block">
                {locale === "ar" ? "التنقل" : "Navigation"}
              </span>
              <motion.ul
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: {
                    opacity: 1,
                    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
                  },
                }}
                className="space-y-1"
              >
                {navItems.map(({ key, href, label }) => {
                  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
                  return (
                    <motion.li
                      key={key}
                      variants={{
                        hidden: { opacity: 0, x: locale === "ar" ? 14 : -14 },
                        visible: { opacity: 1, x: 0 },
                      }}
                      transition={{ duration: 0.22, ease: "easeOut" }}
                    >
                      <Link
                        href={href}
                        onClick={() => setIsOpen(false)}
                        className={cn(
                          "flex items-center rounded-control px-3 py-2.5 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-[#D8AE4A] text-[#063B4A] font-bold shadow-xs"
                            : "text-slate-200 hover:bg-white/10 hover:text-white",
                        )}
                      >
                        {label}
                      </Link>
                    </motion.li>
                  );
                })}
              </motion.ul>
            </div>

            {/* Auth CTA in drawer */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.25 }}
              className="border-t border-[#042D39] pt-4 space-y-3"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-2 block">
                {locale === "ar" ? "الحساب" : "Account"}
              </span>

              {user && dashboardPath ? (
                <div className="space-y-2">
                  <div className="rounded-control bg-white/5 border border-white/10 p-3 flex flex-col gap-1">
                    <span className="text-xs text-slate-300">
                      {locale === "ar" ? "مسجل باسم:" : "Signed in as:"}
                    </span>
                    <span className="text-sm font-bold text-white truncate">
                      {user.fullName}
                    </span>
                    <span className="text-[11px] text-[#D8AE4A] font-semibold">
                      {locale === "ar" ? user.role.nameAr : user.role.nameEn}
                    </span>
                  </div>

                  <Link
                    href={dashboardPath}
                    onClick={() => setIsOpen(false)}
                    className={buttonVariants({
                      variant: "gold",
                      size: "md",
                      className: "w-full justify-center",
                    })}
                  >
                    <LuLayoutDashboard className="size-4" aria-hidden />
                    {dashboardLabel}
                  </Link>

                  <SignOutButton
                    locale={locale}
                    variant="ghost"
                    size="md"
                    className="w-full justify-center text-slate-200 hover:bg-white/10 hover:text-white"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Link
                    href="/login"
                    onClick={() => setIsOpen(false)}
                    className={buttonVariants({
                      variant: "outline",
                      size: "md",
                      className: "w-full justify-center border-white/20 text-white hover:bg-white/10",
                    })}
                  >
                    {loginLabel}
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setIsOpen(false)}
                    className={buttonVariants({
                      variant: "gold",
                      size: "md",
                      className: "w-full justify-center shadow-xs",
                    })}
                  >
                    {registerLabel}
                  </Link>
                </div>
              )}
            </motion.div>
          </div>

          {/* Footer of Drawer */}
          <div className="border-t border-[#042D39] p-4 bg-[#042D39]/60 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {languageLabel}:
            </span>
            <LocaleSwitcher current={locale} label={languageLabel} variant="dark" />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
