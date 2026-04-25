import { authkit, handleAuthkitHeaders } from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";

const AUTH_CALLBACK_PATH = "/api/auth/callback";

function getRedirectUri(request: NextRequest): string {
  return new URL(AUTH_CALLBACK_PATH, request.url).toString();
}

async function authProxy(request: NextRequest) {
  const { session, headers, authorizationUrl } = await authkit(request, {
    redirectUri: getRedirectUri(request),
  });

  if (
    request.nextUrl.pathname.startsWith("/dashboard") &&
    !session.user &&
    authorizationUrl
  ) {
    return handleAuthkitHeaders(request, headers, {
      redirect: authorizationUrl,
    });
  }

  return handleAuthkitHeaders(request, headers);
}

export default authProxy;
export { authProxy as proxy };

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/api/auth/signin",
    "/api/auth/callback",
    "/api/import-invoice/:path*",
  ],
};
