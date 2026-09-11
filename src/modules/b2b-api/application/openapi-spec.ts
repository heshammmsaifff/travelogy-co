export function generateB2BOpenApiSpec(baseUrl = "https://travelogy.co") {
  return {
    openapi: "3.1.0",
    info: {
      title: "Travelogy B2B Hub REST API",
      version: "1.0.0",
      description:
        "Last Line Travel B2B Hub API enables connected buyers, OTAs, and tour operators to search aggregated hotel bedbanks, query live availability, create bookings against agency credit balances, manage reservations, and monitor account balances programmatically.",
      contact: {
        name: "Travelogy B2B Developer Support",
        email: "api-support@travelogy.co",
      },
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
          description: "Agency secret API Key (e.g. llt_live_...)",
        },
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API-Key",
          description: "Alternative authorization using standard Bearer header.",
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
                code: { type: "string", example: "RATE_LIMIT_EXCEEDED" },
                message: { type: "string", example: "Request quota exceeded." },
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
            code: { type: "string", example: "HTL001" },
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
                key: { type: "string", example: "hotelbeds" },
                multiSupplierAvailable: { type: "boolean", example: true },
                totalSuppliers: { type: "integer", example: 3 },
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
                  roomName: {
                    type: "object",
                    properties: {
                      ar: { type: "string" },
                      en: { type: "string" },
                    },
                  },
                  ratePlanName: {
                    type: "object",
                    properties: {
                      ar: { type: "string" },
                      en: { type: "string" },
                    },
                  },
                  mealPlan: { type: "string", example: "BB" },
                  isRefundable: { type: "boolean", example: true },
                  roomsAvailable: { type: "integer", example: 5 },
                  nights: { type: "integer", example: 3 },
                  pricing: {
                    type: "object",
                    properties: {
                      currency: { type: "string", example: "SAR" },
                      sellTotal: { type: "number", example: 1250.0 },
                      sellPerNight: { type: "number", example: 416.67 },
                      roomsBooked: { type: "integer", example: 1 },
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
          summary: "Search Available Hotels & Rates",
          description:
            "Returns available properties with aggregated sell rates across internal inventory and external Bedbanks (Hotelbeds, Webbeds, TBO, RateHawk, iTrip, Within Earth) scoped by buyer supplier preferences.",
          parameters: [
            {
              name: "checkIn",
              in: "query",
              required: true,
              schema: { type: "string", format: "date", example: "2026-10-15" },
            },
            {
              name: "checkOut",
              in: "query",
              required: true,
              schema: { type: "string", format: "date", example: "2026-10-18" },
            },
            {
              name: "adults",
              in: "query",
              schema: { type: "integer", default: 2, example: 2 },
            },
            {
              name: "children",
              in: "query",
              schema: { type: "integer", default: 0, example: 0 },
            },
            {
              name: "rooms",
              in: "query",
              schema: { type: "integer", default: 1, example: 1 },
            },
            {
              name: "city",
              in: "query",
              schema: { type: "string", example: "Riyadh" },
            },
            {
              name: "countryCode",
              in: "query",
              schema: { type: "string", example: "SA" },
            },
            {
              name: "q",
              in: "query",
              schema: { type: "string", example: "Hilton" },
            },
          ],
          responses: {
            200: {
              description: "Search results returned successfully.",
            },
            400: { description: "Invalid search query parameters." },
            401: { description: "Authentication failed or missing API Key." },
            429: { description: "Rate limit exceeded." },
          },
        },
      },
      "/api/v1/b2b/hotels/{id}": {
        get: {
          summary: "Get Hotel Content & Details",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Hotel UUID or Hotel Code",
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Hotel details returned successfully." },
            404: { description: "Hotel not found." },
          },
        },
      },
      "/api/v1/b2b/bookings": {
        post: {
          summary: "Create Programmatic Booking",
          description:
            "Reserves one or more rooms for a stay. Performs real-time inventory hold and deduction against the agency credit limit.",
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
                    clientReference: { type: "string", example: "OTA-REF-9921" },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "Booking confirmed/pending successfully." },
            400: { description: "Validation error or rate moved." },
            402: { description: "Credit limit exceeded." },
            409: { description: "Inventory allotment exhausted." },
          },
        },
      },
      "/api/v1/b2b/bookings/{idOrRef}": {
        get: {
          summary: "Get Booking Details",
          parameters: [
            {
              name: "idOrRef",
              in: "path",
              required: true,
              description: "Booking UUID or Reference (e.g. LLT-2026-0012)",
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Booking details returned." },
            404: { description: "Booking not found." },
          },
        },
      },
      "/api/v1/b2b/bookings/{idOrRef}/cancel": {
        post: {
          summary: "Cancel Booking",
          description: "Cancels an existing booking and releases the credit obligation and room hold.",
          parameters: [
            {
              name: "idOrRef",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    reason: { type: "string", example: "Client requested change of dates" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Booking cancelled successfully." },
            400: { description: "Booking cannot be cancelled." },
            404: { description: "Booking not found." },
          },
        },
      },
      "/api/v1/b2b/account/balance": {
        get: {
          summary: "Get Agency Credit & Balance",
          description: "Returns the agency's credit facility limit, current balance, and available headroom.",
          responses: {
            200: { description: "Balance details returned." },
          },
        },
      },
    },
  };
}
