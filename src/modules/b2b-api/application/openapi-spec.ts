const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
});

/** Responses every authenticated endpoint can return. */
const authResponses = {
  401: errorResponse("AUTH_REQUIRED or INVALID_API_KEY — the key is missing, wrong, disabled or expired."),
  403: errorResponse("AGENCY_SUSPENDED or IP_NOT_ALLOWED."),
  429: errorResponse("RATE_LIMIT_EXCEEDED — see the Retry-After header."),
  503: errorResponse("AUTH_UNAVAILABLE — authentication could not be checked; retry."),
};

export function generateB2BOpenApiSpec(baseUrl = "https://travelogy.co") {
  return {
    openapi: "3.1.0",
    info: {
      title: "Last Line Travel B2B REST API",
      version: "1.0.0",
      description:
        "Lets connected buyer systems search the platform's contracted hotel inventory, book against their agency's credit account, manage those bookings, and read their balance. " +
        "Prices are sell prices for the agency that owns the API key. There is no online payment: bookings are charged to the agency's credit account.",
    },
    servers: [
      {
        url: baseUrl,
        description: "Current environment",
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyHeader: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "Agency secret API key (llt_live_...). Shown once when generated.",
        },
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API-Key",
          description: "Alternative: the same key as `Authorization: Bearer <key>`.",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: {
              type: "object",
              properties: {
                code: { type: "string", example: "OFFER_UNAVAILABLE" },
                message: { type: "string", example: "That offer is no longer available." },
                details: { type: "object" },
              },
              required: ["code", "message"],
            },
            meta: {
              type: "object",
              properties: {
                timestamp: { type: "string", format: "date-time" },
              },
            },
          },
        },
        HotelSearchResult: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            code: { type: "string" },
            name: {
              type: "object",
              properties: {
                ar: { type: "string", example: "فندق شيراتون الرياض" },
                en: { type: "string", example: "Sheraton Riyadh Hotel" },
              },
            },
            city: {
              type: "object",
              properties: {
                ar: { type: "string", example: "الرياض" },
                en: { type: "string", example: "Riyadh" },
              },
            },
            countryCode: { type: "string", example: "SA" },
            starRating: { type: "number", example: 5 },
            coverUrl: { type: "string", nullable: true },
            supplier: {
              type: "object",
              properties: {
                key: { type: "string", example: "internal" },
                multiSupplierAvailable: { type: "boolean", example: false },
                totalSuppliers: { type: "integer", example: 1 },
              },
            },
            offers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  roomTypeId: { type: "string", format: "uuid" },
                  ratePlanId: { type: "string", format: "uuid" },
                  offerId: { type: "string" },
                  bookable: {
                    type: "boolean",
                    description: "True when this offer can be booked through POST /bookings.",
                  },
                  roomName: {
                    type: "object",
                    properties: { ar: { type: "string" }, en: { type: "string" } },
                  },
                  ratePlanName: {
                    type: "object",
                    properties: { ar: { type: "string" }, en: { type: "string" } },
                  },
                  mealPlan: { type: "string", example: "BB" },
                  isRefundable: { type: "boolean", example: true },
                  roomsAvailable: { type: "integer", example: 5 },
                  nights: { type: "integer", example: 3 },
                  pricing: {
                    type: "object",
                    properties: {
                      currency: { type: "string", example: "SAR" },
                      sellTotal: {
                        type: "number",
                        example: 2500.0,
                        description:
                          "For all requested rooms and nights, BEFORE tax and promo codes. The booking response carries the final total.",
                      },
                      sellPerNight: {
                        type: "number",
                        example: 416.67,
                        description: "Per room, per night.",
                      },
                      roomsBooked: { type: "integer", example: 2 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    security: [{ ApiKeyHeader: [] }, { BearerAuth: [] }],
    paths: {
      "/api/v1/b2b/hotels/search": {
        get: {
          summary: "Search available hotels & rates",
          description:
            "Returns properties with every night of the stay priced and available, at the key's agency sell prices, lowest first. " +
            "`meta.partialResults` is true when a supplier failed to answer — treat that as fewer hotels than exist, not as sold out.",
          parameters: [
            { name: "checkIn", in: "query", required: true, schema: { type: "string", format: "date", example: "2026-10-15" } },
            { name: "checkOut", in: "query", required: true, schema: { type: "string", format: "date", example: "2026-10-18" } },
            { name: "adults", in: "query", schema: { type: "integer", default: 2, minimum: 1, maximum: 10 } },
            { name: "children", in: "query", schema: { type: "integer", default: 0, minimum: 0, maximum: 6 } },
            { name: "rooms", in: "query", schema: { type: "integer", default: 1, minimum: 1, maximum: 9 } },
            { name: "city", in: "query", schema: { type: "string", example: "Riyadh" } },
            { name: "countryCode", in: "query", schema: { type: "string", example: "SA" } },
            { name: "q", in: "query", schema: { type: "string", example: "Hilton" } },
          ],
          responses: {
            200: { description: "Search results." },
            400: errorResponse("INVALID_QUERY_PARAMS or INVALID_DATES."),
            ...authResponses,
            500: errorResponse("SEARCH_FAILED."),
          },
        },
      },
      "/api/v1/b2b/hotels/{id}": {
        get: {
          summary: "Get hotel content & details",
          parameters: [
            { name: "id", in: "path", required: true, description: "Hotel UUID or hotel code", schema: { type: "string" } },
          ],
          responses: {
            200: { description: "Hotel details." },
            404: errorResponse("HOTEL_NOT_FOUND."),
            ...authResponses,
          },
        },
      },
      "/api/v1/b2b/bookings": {
        post: {
          summary: "Create a booking",
          description:
            "Books rooms from a search offer where `bookable` is true. The price is re-derived on the server at booking time, the agency's available credit is checked, and the rooms are held — all in one transaction. " +
            "A new booking is `pending` until the operator confirms it.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["roomTypeId", "ratePlanId", "checkIn", "checkOut", "guest"],
                  properties: {
                    roomTypeId: { type: "string", format: "uuid" },
                    ratePlanId: { type: "string", format: "uuid" },
                    checkIn: { type: "string", format: "date", example: "2026-10-15" },
                    checkOut: { type: "string", format: "date", example: "2026-10-18" },
                    adults: { type: "integer", default: 2 },
                    children: { type: "integer", default: 0 },
                    rooms: { type: "integer", default: 1 },
                    guest: {
                      type: "object",
                      required: ["name"],
                      properties: {
                        name: { type: "string", example: "Ahmed Al-Mansoor" },
                        email: { type: "string", format: "email", example: "ahmed@example.com" },
                        phone: { type: "string", example: "+966501234567" },
                      },
                    },
                    specialRequests: { type: "string", example: "Late check-in requested" },
                    promoCode: { type: "string", nullable: true },
                    clientReference: {
                      type: "string",
                      maxLength: 100,
                      example: "OTA-REF-9921",
                      description:
                        "Your own reference, unique per agency. Send the same value when retrying a request that timed out: a second booking is refused with DUPLICATE_CLIENT_REFERENCE instead of being created.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Booking created with status `pending`; returns its reference and final total." },
            400: errorResponse("VALIDATION_ERROR, INVALID_DATES or INVALID_STAY."),
            402: errorResponse("CREDIT_LIMIT_EXCEEDED."),
            409: errorResponse("OFFER_UNAVAILABLE (price or availability changed) or DUPLICATE_CLIENT_REFERENCE."),
            422: errorResponse("PROMO_CODE_REJECTED."),
            ...authResponses,
            500: errorResponse("BOOKING_FAILED."),
          },
        },
      },
      "/api/v1/b2b/bookings/{idOrRef}": {
        get: {
          summary: "Get booking details",
          parameters: [
            {
              name: "idOrRef",
              in: "path",
              required: true,
              description: "Booking UUID or reference (e.g. LLT-B-000123)",
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Booking details." },
            404: errorResponse("BOOKING_NOT_FOUND — including bookings that belong to another agency."),
            ...authResponses,
          },
        },
      },
      "/api/v1/b2b/bookings/{idOrRef}/cancel": {
        post: {
          summary: "Cancel a booking",
          description: "Cancels a pending or confirmed booking, releasing the room hold and the credit obligation.",
          parameters: [{ name: "idOrRef", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reason: { type: "string", maxLength: 500, example: "Client requested change of dates" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Booking cancelled." },
            404: errorResponse("BOOKING_NOT_FOUND."),
            409: errorResponse("BOOKING_NOT_CANCELLABLE — already cancelled or completed."),
            ...authResponses,
          },
        },
      },
      "/api/v1/b2b/account/balance": {
        get: {
          summary: "Get agency credit & balance",
          description:
            "`balance` is what the agency owes now (standing bookings minus recorded payments). `availableCredit` is the headroom the booking endpoint checks against.",
          responses: {
            200: { description: "Balance details." },
            ...authResponses,
          },
        },
      },
    },
  };
}
