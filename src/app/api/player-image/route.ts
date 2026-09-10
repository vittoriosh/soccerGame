import { NextRequest } from "next/server";

const ALLOWED_HOST = "cdn.sofifa.net";

export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get("src");
  if (!src) return new Response("Missing src", { status: 400 });

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return new Response("Invalid src", { status: 400 });
  }

  if (url.protocol !== "https:" || url.hostname !== ALLOWED_HOST) {
    return new Response("Host not allowed", { status: 400 });
  }

  const upstream = await fetch(url, {
    headers: { Referer: "https://sofifa.com/" },
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("Upstream error", { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
