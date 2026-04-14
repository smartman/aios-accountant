import { getSignInUrl } from "@/lib/workos";
import { redirect } from "next/navigation";

const AUTH_CALLBACK_PATH = "/api/auth/callback";

export async function GET(request: Request) {
  const signInUrl = await getSignInUrl({
    redirectUri: new URL(AUTH_CALLBACK_PATH, request.url).toString(),
  });
  redirect(signInUrl);
}
