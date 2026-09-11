import { NextResponse, type NextRequest } from "next/server";
import { generateB2BOpenApiSpec } from "@/modules/b2b-api/application/openapi-spec";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const spec = generateB2BOpenApiSpec(origin);

  return NextResponse.json(spec, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
