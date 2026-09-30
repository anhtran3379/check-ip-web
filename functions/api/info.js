function getFlagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return "🌐";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

const KNOWN_VPN_HOSTS = [
  "m247", "datacamp", "ovh", "digitalocean", "linode", "vultr", "choopa",
  "hetzner", "leaseweb", "nordvpn", "expressvpn", "surfshark", "proton",
  "fastly", "amazon", "aws", "google llc", "microsoft", "azure", "cloudflare warp",
  "quadranet", "cogent", "zenlayer", "tzulo", "kamatera"
];

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

  let security = {
    is_vpn_or_proxy: false,
    is_hosting: false,
    confidence: "Thấp",
    type: "Dân dụng (Residential / Di động)"
  };

  // Check Cloudflare ASN organization against known VPN/Datacenter hosting providers
  const orgLower = (cf.asOrganization || "").toLowerCase();
  for (const host of KNOWN_VPN_HOSTS) {
    if (orgLower.includes(host)) {
      security.is_vpn_or_proxy = true;
      security.is_hosting = true;
      security.confidence = "Cao";
      security.type = "VPN / Máy chủ Hosting / Proxy";
      break;
    }
  }

  // If not local, enrich with ip-api security intelligence
  if (!isPrivate) {
    try {
      const apiUrl = `http://ip-api.com/json/${clientIP}?fields=status,country,countryCode,city,regionName,timezone,isp,org,as,proxy,hosting,lat,lon`;
      const res = await fetch(apiUrl, { cf: { cacheTtl: 3600 } });
      if (res.ok) {
        const data = await res.json();
        if (data.status === "success") {
          details.isp = data.isp || details.isp;
          details.asn = data.as || details.asn;
          details.city = data.city || details.city;
          details.country = data.country || details.country;
          details.country_code = data.countryCode || details.country_code;
          details.flag_emoji = data.countryCode ? getFlagEmoji(data.countryCode) : details.flag_emoji;
          details.timezone = data.timezone || details.timezone;
          details.latitude = data.lat || details.latitude;
          details.longitude = data.lon || details.longitude;

          if (data.proxy || data.hosting) {
            security.is_vpn_or_proxy = true;
            security.is_hosting = Boolean(data.hosting);
            security.confidence = data.proxy ? "Rất cao" : "Trung bình";
            security.type = data.proxy ? "VPN / Proxy được xác thực" : "IP Trung tâm dữ liệu (Datacenter/Hosting)";
          }
        }
      }
    } catch (e) {
      // Fallback to initial heuristic
    }
  }

  const responseData = {
    status: "success",
    ip: clientIP,
    is_ipv6: clientIP.includes(":"),
    is_private: isPrivate,
    details: details,
    security: security,
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
