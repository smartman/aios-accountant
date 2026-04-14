import { sealData, unsealData } from "iron-session";
import { NextRequest, NextResponse } from "next/server";
import { clientId, workos } from "@/lib/workos";

const AUTH_CALLBACK_FALLBACK_PATH = "/dashboard";
const PKCE_COOKIE_NAME = "wos-auth-verifier";
const SESSION_COOKIE_NAME = "wos-session";
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

function getCookiePassword(): string {
  const password = process.env.WORKOS_COOKIE_PASSWORD ?? "";
  if (password.length < 32) {
    throw new Error("WORKOS_COOKIE_PASSWORD must be at least 32 characters.");
  }
  return password;
}

function getCookieOptions(request: NextRequest) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: request.nextUrl.protocol === "https:",
  };
}

async function getPkceState(cookieValue: string) {
  return unsealData<{
    codeVerifier: string;
    returnPathname?: string;
  }>(cookieValue, {
    password: getCookiePassword(),
  });
}

async function createSessionCookieValue(session: {
  accessToken: string;
  refreshToken: string;
  user: Awaited<
    ReturnType<typeof workos.userManagement.authenticateWithCode>
  >["user"];
  impersonator?: Awaited<
    ReturnType<typeof workos.userManagement.authenticateWithCode>
  >["impersonator"];
}) {
  return sealData(session, {
    password: getCookiePassword(),
    ttl: 0,
  });
}

function createErrorResponse(request: NextRequest) {
  const url = new URL("/", request.url);
  url.searchParams.set("error", "auth_failed");

  const response = NextResponse.redirect(url);
  response.cookies.set(PKCE_COOKIE_NAME, "", {
    ...getCookieOptions(request),
    expires: new Date(0),
    maxAge: 0,
  });

  return response;
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const pkceCookie = request.cookies.get(PKCE_COOKIE_NAME)?.value;

    if (!code || !state || !pkceCookie || state !== pkceCookie) {
      throw new Error("Invalid auth callback parameters.");
    }

    const pkceState = await getPkceState(pkceCookie);
    const authResponse = await workos.userManagement.authenticateWithCode({
      clientId,
      code,
      codeVerifier: pkceState.codeVerifier,
    });

    if (!authResponse.accessToken || !authResponse.refreshToken) {
      throw new Error("Auth response is missing tokens.");
    }

    const sessionCookieValue = await createSessionCookieValue({
      accessToken: authResponse.accessToken,
      refreshToken: authResponse.refreshToken,
      user: authResponse.user,
      impersonator: authResponse.impersonator,
    });

    const destination = new URL(
      pkceState.returnPathname ?? AUTH_CALLBACK_FALLBACK_PATH,
      request.url,
    );

    const response = NextResponse.redirect(destination);

    response.cookies.set(SESSION_COOKIE_NAME, sessionCookieValue, {
      ...getCookieOptions(request),
      maxAge: SESSION_COOKIE_MAX_AGE,
    });
    response.cookies.set(PKCE_COOKIE_NAME, "", {
      ...getCookieOptions(request),
      expires: new Date(0),
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error("[Auth callback error]", error);
    return createErrorResponse(request);
  }
}
