import {
  getWorkOS,
  getSignInUrl,
  getSignUpUrl,
  signOut,
  handleAuth,
  withAuth,
} from "@workos-inc/authkit-nextjs";
import { cookies } from "next/headers";
import { unsealData } from "iron-session";
import { decodeJwt } from "jose";
import type { User } from "@workos-inc/node";

// Singleton WorkOS client configured with WORKOS_API_KEY (via SDK env-variables)
export const workos = getWorkOS();

// OAuth client ID
export const clientId = process.env.WORKOS_CLIENT_ID ?? "";

// Re-export SDK helpers used across the app
export { getSignInUrl, getSignUpUrl, signOut, handleAuth };

type LocalSession = {
  accessToken: string;
  refreshToken: string;
  user: User;
  impersonator?: {
    email: string;
    reason: string | null;
  };
};

type AccessTokenClaims = {
  sid: string;
  org_id?: string;
  role?: string;
  roles?: string[];
  permissions?: string[];
  entitlements?: string[];
  feature_flags?: string[];
};

export async function getUser() {
  try {
    const cookieStore = await cookies();
    const sealedSession = cookieStore.get("wos-session")?.value;

    if (!sealedSession) {
      return { user: null };
    }

    const password = process.env.WORKOS_COOKIE_PASSWORD ?? "";
    if (password.length < 32) {
      throw new Error("WORKOS_COOKIE_PASSWORD must be at least 32 characters.");
    }

    const session = await unsealData<LocalSession>(sealedSession, {
      password,
    });

    if (!session?.accessToken || !session.user) {
      return { user: null };
    }

    const claims = decodeJwt<AccessTokenClaims>(session.accessToken);

    return {
      sessionId: claims.sid,
      user: session.user,
      organizationId: claims.org_id,
      role: claims.role,
      roles: claims.roles,
      permissions: claims.permissions,
      entitlements: claims.entitlements,
      featureFlags: claims.feature_flags,
      impersonator: session.impersonator,
      accessToken: session.accessToken,
    };
  } catch {
    return { user: null };
  }
}

export { withAuth };
