import { NextResponse, type NextRequest } from "next/server";

// This only enables CORS for the packaged iPhone UI. Every API route still
// checks its own bearer session, role, organization, location, and family access.
// Public information pages never enter this proxy or an auth redirect.
const NATIVE_ORIGIN = "capacitor://localhost";

export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin !== NATIVE_ORIGIN) return request.method === "OPTIONS"
    ? new NextResponse(null, { status: 403 }) : NextResponse.next();
  const response = request.method === "OPTIONS" ? new NextResponse(null, { status: 204 }) : NextResponse.next();
  response.headers.set("Access-Control-Allow-Origin", NATIVE_ORIGIN);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Cache-Control, Pragma, X-Requested-With");
  response.headers.set("Access-Control-Expose-Headers", "Content-Disposition");
  response.headers.set("Access-Control-Max-Age", "600");
  response.headers.append("Vary", "Origin");
  return response;
}

export const config = { matcher: "/api/:path*" };
