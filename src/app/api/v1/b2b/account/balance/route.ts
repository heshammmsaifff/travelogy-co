import { type NextRequest } from "next/server";
import { authenticateB2BRequest } from "@/modules/b2b-api/infrastructure/api-auth.guard";
import { b2bError, b2bSuccess } from "@/modules/b2b-api/infrastructure/api-response";
import { getB2BAgencyBalance } from "@/modules/b2b-api/infrastructure/b2b-bookings.service";

export async function GET(request: NextRequest) {
  const auth = await authenticateB2BRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const balance = await getB2BAgencyBalance(auth.context.agencyId);
    return b2bSuccess(balance, { context: auth.context });
  } catch (err) {
    return b2bError(
      "BALANCE_FAILED",
      err instanceof Error ? err.message : "Failed to retrieve account balance.",
      { status: 500, context: auth.context },
    );
  }
}
