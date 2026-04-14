import {
  getWorkOS,
  getSignInUrl,
  getSignUpUrl,
  signOut,
  handleAuth,
  withAuth,
} from "@workos-inc/authkit-nextjs";

// Singleton WorkOS client configured with WORKOS_API_KEY (via SDK env-variables)
export const workos = getWorkOS();

// OAuth client ID
export const clientId = process.env.WORKOS_CLIENT_ID ?? "";

// Re-export SDK helpers used across the app
// Note: the SDK does not export a bare `getUser`; `withAuth` is the equivalent
export { getSignInUrl, getSignUpUrl, signOut, handleAuth };
export const getUser = withAuth;
