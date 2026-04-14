import { authkitProxy } from "@workos-inc/authkit-nextjs";

export const proxy = authkitProxy({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ["/", "/api/auth/signin", "/api/auth/callback"],
  },
});

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/api/auth/signin",
    "/api/auth/callback",
    "/api/import-invoice",
  ],
};
