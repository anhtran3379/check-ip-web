let currentIP = "";

document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();
  detectBrowserAndScreen();
  fetchData();
  updateCurlUrls();
});

function detectBrowserAndScreen() {
  const ua = navigator.userAgent;
  let browser = "Khác";
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Safari/")) browser = "Safari";
  else if (ua.includes("OPR/") || ua.includes("Opera/")) browser = "Opera";

  let os = "Khác";
  if (ua.includes("Win")) os = "Windows";
  else if (ua.includes("Mac")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("like Mac")) os = "iOS";

  const browserEl = document.getElementById("detail-browser");
  const screenEl = document.getElementById("detail-screen");

  if (browserEl) browserEl.innerText = `${browser} trên ${os}`;
  if (screenEl) screenEl.innerText = `Màn hình: ${window.screen.width} × ${window.screen.height} px`;
}

function updateCurlUrls() {
  const origin = window.location.origin;
  const curlPlain = document.getElementById("curl-plain");
  const curlJson = document.getElementById("curl-json");
  if (curlPlain) curlPlain.innerText = `curl -s ${origin}/ip`;
  if (curlJson) curlJson.innerText = `curl -s ${origin}/api/json`;
}

async function fetchData() {
  const refreshIcon = document.getElementById("refresh-icon");
  if (refreshIcon) refreshIcon.classList.add("animate-spin");

  try {
    const res = await fetch("/api/info");
    if (!res.ok) throw new Error("Lỗi khi tải dữ liệu IP");
    const data = await res.json();
    renderUI(data);
  } catch (err) {
    console.error("Fetch error:", err);
    showToast("Không thể tải thông tin IP: " + err.message);
  } finally {
    if (refreshIcon) {
      setTimeout(() => refreshIcon.classList.remove("animate-spin"), 400);
    }
  }
}

function renderUI(data) {
  const ip = data.ip || "127.0.0.1";
  currentIP = ip;
  const details = data.details || {};

  // Hero Card
  const heroIp = document.getElementById("client-ip-hero");
  if (heroIp) heroIp.innerText = ip;

  const typeBadge = document.getElementById("ip-type-badge");
  if (typeBadge) typeBadge.innerText = ip.includes(":") ? "IPv6" : "IPv4";

  const heroIsp = document.getElementById("hero-isp");
  if (heroIsp) heroIsp.innerText = details.isp || "Không rõ ISP";

  const heroFlag = document.getElementById("hero-flag");
  if (heroFlag) heroFlag.innerText = details.flag_emoji || "🌐";

  const heroLocation = document.getElementById("hero-location");
  if (heroLocation) {
    const parts = [details.city, details.country].filter(Boolean);
    heroLocation.innerText = parts.length > 0 ? parts.join(", ") : "Không có vị trí";
  }

  // Latency
  const latencyBadge = document.getElementById("header-latency");
  if (latencyBadge) {
    if (data.latency_ms > 0) {
      latencyBadge.innerText = `Ping: ${data.latency_ms} ms`;
    } else {
      latencyBadge.innerText = "Ping: OK";
    }
  }

  // Detail Cards
  const detailIsp = document.getElementById("detail-isp");
  if (detailIsp) detailIsp.innerText = details.isp || "Không xác định";

  const detailOrg = document.getElementById("detail-org");
  if (detailOrg) detailOrg.innerText = details.organization || "Mạng công cộng";

  const detailCity = document.getElementById("detail-city");
  if (detailCity) detailCity.innerText = details.city || "Không xác định";

  const detailCountry = document.getElementById("detail-country");
  if (detailCountry) detailCountry.innerText = `${details.flag_emoji || ''} ${details.country || 'Việt Nam'}`;

  const detailTz = document.getElementById("detail-tz");
  if (detailTz) detailTz.innerText = details.timezone || "Asia/Ho_Chi_Minh";

  const detailCoords = document.getElementById("detail-coords");
  if (detailCoords) {
    if (details.latitude && details.longitude) {
      detailCoords.innerText = `Tọa độ: ${details.latitude.toFixed(4)}, ${details.longitude.toFixed(4)}`;
    } else {
      detailCoords.innerText = "Tọa độ: Đang ẩn";
    }
  }

  lucide.createIcons();
}

function copyHeroIP() {
  if (currentIP) copyText(currentIP);
}

function copyText(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(`Đã sao chép: ${text}`);
  }).catch(() => {
    const input = document.createElement("input");
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
    showToast(`Đã sao chép: ${text}`);
  });
}

function showToast(message) {
  const toast = document.getElementById("toast");
  const toastMsg = document.getElementById("toast-message");
  if (!toast || !toastMsg) return;

  toastMsg.innerText = message;
  toast.classList.remove("translate-y-20", "opacity-0");
  toast.classList.add("translate-y-0", "opacity-100");

  setTimeout(() => {
    toast.classList.remove("translate-y-0", "opacity-100");
    toast.classList.add("translate-y-20", "opacity-0");
  }, 2500);
}
