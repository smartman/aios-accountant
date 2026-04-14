import type { NextConfig } from "next";

const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : undefined;

const branchUrl = process.env.VERCEL_BRANCH_URL
  ? `https://${process.env.VERCEL_BRANCH_URL}`
  : undefined;

const appUrl = productionUrl ?? branchUrl ?? "http://localhost:3000";

const nextConfig: NextConfig = {
  env: {
    WORKOS_REDIRECT_URI: `${appUrl}/api/auth/callback`,
  },
};

export default nextConfig;
