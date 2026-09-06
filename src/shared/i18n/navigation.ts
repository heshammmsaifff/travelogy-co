import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware replacements for next/link and next/navigation.
 * Always import from here rather than from `next/link` directly, otherwise the
 * locale prefix is dropped and the user is bounced through the middleware.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
