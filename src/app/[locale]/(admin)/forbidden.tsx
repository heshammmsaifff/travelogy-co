import { getTranslations } from "next-intl/server";
import { LuShieldAlert } from "react-icons/lu";
import { Card, CardBody } from "@/shared/ui/card";

/**
 * Rendered when a back-office page calls forbidden() — the user is signed in
 * and in the right area, but lacks the permission for this particular screen.
 *
 * Deliberately distinct from a 404: pretending the page does not exist would
 * leave a staff member guessing whether they mistyped a URL or need access.
 */
export default async function Forbidden() {
  const t = await getTranslations("access.forbidden");

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <Card>
        <CardBody className="space-y-3 p-8 text-center">
          <LuShieldAlert className="mx-auto size-8 text-warning-600" aria-hidden />
          <h1 className="text-lg font-semibold text-ink">{t("title")}</h1>
          <p className="text-sm text-ink-muted">{t("body")}</p>
        </CardBody>
      </Card>
    </main>
  );
}
