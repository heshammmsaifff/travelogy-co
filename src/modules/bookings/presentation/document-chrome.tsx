import { getTranslations } from "next-intl/server";
import { LuArrowLeft, LuArrowRight } from "react-icons/lu";
import { LOCALE_META, type Locale } from "@/shared/i18n/config";
import { Link } from "@/shared/i18n/navigation";
import { can } from "@/modules/auth/domain/user";
import { getCurrentUser } from "@/modules/auth/infrastructure/current-user";

/**
 * The "back" link on a document page.
 *
 * Which side to return to depends on who is looking: an agent belongs in the
 * portal, back-office staff in the admin list. Resolved from the caller rather
 * than passed in, so a link cannot send someone to a page they cannot open.
 */
export async function BackToBooking({
  bookingId,
  locale,
}: {
  bookingId: string;
  locale: Locale;
}) {
  const t = await getTranslations("bookings");
  const user = await getCurrentUser();
  const { dir } = LOCALE_META[locale];
  const Back = dir === "rtl" ? LuArrowRight : LuArrowLeft;

  const href =
    user && can(user, "bookings.view_all") && user.role.scope === "admin"
      ? `/admin/bookings/${bookingId}`
      : `/agent/bookings/${bookingId}`;

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
    >
      <Back className="size-4" aria-hidden />
      {t("backToList")}
    </Link>
  );
}
