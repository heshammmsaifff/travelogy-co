import { type NextRequest } from "next/server";
import { authenticateB2BRequest } from "@/modules/b2b-api/infrastructure/api-auth.guard";
import { b2bError, b2bSuccess } from "@/modules/b2b-api/infrastructure/api-response";
import {
  B2BApiError,
  getB2BAgencyBalance,
} from "@/modules/b2b-api/infrastructure/b2b-bookings.service";

export async function GET(request: NextRequest) {
  const auth = await authenticateB2BRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const balance = await getB2BAgencyBalance(auth.context.agencyId);
    return b2bSuccess(balance, { context: auth.context });
  } catch (err) {
    if (err instanceof B2BApiError) {
      return b2bError(err.code, err.message, { status: err.status, context: auth.context });
    }
    console.error("[b2b-api] GET /account/balance:", err);
    return b2bError("BALANCE_FAILED", "The account balance could not be retrieved.", {
      status: 500,
      context: auth.context,
    });
  }
}
