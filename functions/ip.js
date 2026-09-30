export async function onRequest(context) {
  const { request } = context;
  let clientIP = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "127.0.0.1";
  if (clientIP.includes(",")) {
    clientIP = clientIP.split(",")[0].trim();
  }

  return new Response(clientIP + "\n", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
