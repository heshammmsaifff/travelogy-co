"use client";

import { useTranslations } from "next-intl";
import { LuPrinter } from "react-icons/lu";
import { Button } from "@/shared/ui/button";

/**
 * The only client JavaScript on a document page.
 *
 * `window.print()` hands the page to the browser's own print pipeline, which
 * is what produces the PDF — and which lays out Arabic correctly, unlike the
 * PDF library evaluated for this phase (§15).
 */
export function PrintButton() {
  const t = useTranslations("documents");
  return (
    <Button size="sm" onClick={() => window.print()}>
      <LuPrinter aria-hidden />
      {t("print")}
    </Button>
  );
}
