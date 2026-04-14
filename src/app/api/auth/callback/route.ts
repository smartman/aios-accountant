import { handleAuth } from "@/lib/workos";

const handler = handleAuth({
  returnPathname: "/dashboard",
  onError: async ({ request }) => {
    const url = new URL("/", request.url);
    url.searchParams.set("error", "auth_failed");
    return Response.redirect(url.toString(), 302);
  },
});

export { handler as GET };
