function getFlagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return "🌐";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export async function onRequest(context) {
  const { request } = context;
  const cf = request.cf || {};
  let clientIP = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "127.0.0.1";
  if (clientIP.includes(",")) {
    clientIP = clientIP.split(",")[0].trim();
  }

  const isPrivate = clientIP.startsWith("127.") || 
                    clientIP.startsWith("192.168.") || 
                    clientIP.startsWith("10.") || 
                    clientIP === "::1";

  let details = {
    isp: cf.asOrganization || "Local Network",
    asn: cf.asn ? `AS${cf.asn}` : null,
    city: cf.city || "Hồ Chí Minh",
    region: cf.region || "",
    country: cf.country || "Việt Nam",
    country_code: cf.country || "VN",
    flag_emoji: cf.country ? getFlagEmoji(cf.country) : "🇻🇳",
    latitude: cf.latitude || null,
    longitude: cf.longitude || null,
    timezone: cf.timezone || "Asia/Ho_Chi_Minh",
    postal: cf.postalCode || null,
    colo: cf.colo || "SGN"
  };

  // If running locally where cf metadata is empty, fallback gracefully
  if (!cf.city && !isPrivate) {
    try {
      const res = await fetch(`https://ipwho.is/${clientIP}`, { cf: { cacheTtl: 3600 } });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          details.isp = data.connection?.isp || data.isp || details.isp;
          details.asn = data.connection?.asn ? `AS${data.connection.asn}` : details.asn;
          details.city = data.city || details.city;
          details.region = data.region || details.region;
          details.country = data.country || details.country;
          details.country_code = data.country_code || details.country_code;
          details.flag_emoji = data.flag?.emoji || details.flag_emoji;
          details.latitude = data.latitude || details.latitude;
          details.longitude = data.longitude || details.longitude;
          details.timezone = data.timezone?.id || details.timezone;
        }
      }
    } catch (e) {
      // Fallback
    }
  }

  const responseData = {
    status: "success",
    ip: clientIP,
    is_ipv6: clientIP.includes(":"),
    is_private: isPrivate,
    details: details,
    datacenter: cf.colo || "SGN",
    user_agent: request.headers.get("user-agent") || "Unknown",
    timestamp: new Date().toISOString()
  };

  return new Response(JSON.stringify(responseData), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, max-age=0"
    }
  });
}
