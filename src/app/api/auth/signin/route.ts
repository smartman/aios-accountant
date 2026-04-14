import { getSignInUrl } from "@/lib/workos";
import { redirect } from "next/navigation";

export async function GET() {
  const signInUrl = await getSignInUrl();
  redirect(signInUrl);
}
