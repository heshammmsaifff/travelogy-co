import { type NextRequest } from "next/server";
import { authenticateB2BRequest } from "@/modules/b2b-api/infrastructure/api-auth.guard";
import { b2bError, b2bSuccess } from "@/modules/b2b-api/infrastructure/api-response";
import { getB2BHotelDetails } from "@/modules/b2b-api/infrastructure/b2b-hotels.service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateB2BRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  if (!id) {
    return b2bError("HOTEL_ID_REQUIRED", "Hotel ID or code must be specified in the URL.", {
      status: 400,
      context: auth.context,
    });
  }

  try {
    const hotel = await getB2BHotelDetails(id);
    if (!hotel) {
      return b2bError("HOTEL_NOT_FOUND", `Hotel '${id}' was not found.`, {
        status: 404,
        context: auth.context,
      });
    }

    return b2bSuccess(hotel, { context: auth.context });
  } catch (err) {
    return b2bError(
      "FETCH_FAILED",
      err instanceof Error ? err.message : "Failed to retrieve hotel details.",
      { status: 500, context: auth.context },
    );
  }
}
