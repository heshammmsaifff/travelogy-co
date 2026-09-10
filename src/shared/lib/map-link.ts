/**
 * Coordinates out of a map link.
 *
 * Admins have a Google Maps link in their hand, not a latitude. Typing two
 * seven-decimal numbers is a transcription task with no feedback — a digit
 * dropped from the longitude puts the hotel in the wrong governorate and
 * nothing on the screen says so.
 *
 * So the FIELD is a link and the COORDINATES are derived from it. The numbers
 * are still stored, because a link is a string and coordinates are data: a map
 * pin, a distance sort or a "hotels near the airport" search all need numbers,
 * and none of them can get them back out of a shortened URL later.
 */

export type Coordinates = { latitude: number; longitude: number };

/** Latitude and longitude are only meaningful inside these bounds. */
function inRange(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    // 0,0 is in the Atlantic. It is far more often a parse that went wrong
    // than a hotel, so it is treated as "no coordinates found".
    !(latitude === 0 && longitude === 0)
  );
}

const NUM = "(-?\\d+(?:\\.\\d+)?)";

/**
 * The patterns, in priority order. The first two matter most:
 *
 *  - `!3d<lat>!4d<lng>` is the PLACE PIN in a Google Maps `/data=` payload.
 *  - `@<lat>,<lng>` is the map's VIEWPORT CENTRE, which is near the pin but is
 *    not the pin — it moves if the user scrolled before copying the link.
 *
 * Preferring the pin over the viewport is the difference between the hotel's
 * front door and whatever happened to be in the middle of the screen.
 */
const PATTERNS: RegExp[] = [
  new RegExp(`!3d${NUM}!4d${NUM}`),
  new RegExp(`@${NUM},${NUM}`),
  new RegExp(`[?&](?:q|query|ll|sll|daddr|destination)=(?:loc:)?${NUM},${NUM}`, "i"),
  new RegExp(`#map=\\d+(?:\\.\\d+)?/${NUM}/${NUM}`),
];

/**
 * Reads coordinates out of a map link, or returns null when the link does not
 * carry any.
 *
 * **A shortened link carries none.** `maps.app.goo.gl/…` and `goo.gl/maps/…`
 * are opaque redirects — the coordinates exist only at the other end, and
 * following one would mean an outbound HTTP request from the server on every
 * form submission, to a URL a user supplied. That is a request-forgery surface
 * for a convenience, so it is deliberately not done; the caller is told the
 * link has no coordinates and can ask for the full one.
 */
export function parseMapLink(raw: string | null | undefined): Coordinates | null {
  if (!raw) return null;

  // Percent-encoded links (`%2C` for a comma) are common when a URL has been
  // pasted through a chat app.
  let text = raw.trim();
  try {
    text = decodeURIComponent(text);
  } catch {
    // Malformed escapes: keep the original rather than losing the whole link.
  }

  for (const pattern of PATTERNS) {
    const match = pattern.exec(text);
    if (!match?.[1] || !match[2]) continue;

    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (inRange(latitude, longitude)) {
      // Seven decimals is roughly a centimetre and is what the column stores.
      return {
        latitude: Number(latitude.toFixed(7)),
        longitude: Number(longitude.toFixed(7)),
      };
    }
  }

  return null;
}

/**
 * Whether a string is a URL we are willing to store and later render as a
 * link. Only http(s): a `javascript:` or `data:` URL in an admin-entered field
 * that another admin later clicks is a stored-XSS vector (§12).
 */
export function isSafeHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
