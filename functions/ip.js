import { extractPagesClientIP } from "../lib/ip.js";

export async function onRequest(context) {
  const { request } = context;
  const extracted = extractPagesClientIP(request);

  if (!extracted.ok) {
    return new Response("unavailable\n", {
      status: extracted.status_code,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store, max-age=0"
      }
    });
  }

  return new Response(extracted.classification.ip + "\n", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
