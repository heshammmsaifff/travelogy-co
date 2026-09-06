"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { LuLogOut } from "react-icons/lu";
import type { Locale } from "@/shared/i18n/config";
import { Button } from "@/shared/ui/button";
import { signOutAction } from "./actions";

export function SignOutButton({
  locale,
  variant = "secondary",
  className,
}: {
  locale: Locale;
  variant?: "secondary" | "ghost";
  className?: string;
}) {
  const t = useTranslations("auth");
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant={variant}
      className={className}
      loading={pending}
      onClick={() => startTransition(() => signOutAction(locale))}
    >
      {!pending ? <LuLogOut aria-hidden /> : null}
      {t("signOut")}
    </Button>
  );
}
