let currentData = null;
let qrInstance = null;

// Initialize Lucide icons on load
document.addEventListener("DOMContentLoaded", () => {
  lucide.createIcons();
  fetchData();
  // Auto refresh every 60 seconds
  setInterval(() => {
    fetchData(false);
  }, 60000);
});

async function fetchData(force = false) {
  const refreshBtn = document.getElementById("refresh-btn");
  const refreshIcon = document.getElementById("refresh-icon");
  if (refreshIcon) refreshIcon.classList.add("animate-spin");

  try {
    const url = force ? "/api/info?refresh=true" : "/api/info";
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to load network info");
    const data = await res.json();
    currentData = data;
    renderUI(data);
  } catch (err) {
    console.error("Error fetching network data:", err);
    showToast("Không thể tải thông tin mạng: " + err.message);
  } finally {
    if (refreshIcon) {
      setTimeout(() => refreshIcon.classList.remove("animate-spin"), 400);
    }
  }
}

function renderUI(data) {
  // Client IP & Scope
  const clientIpEl = document.getElementById("client-ip");
  const clientScopeEl = document.getElementById("client-scope");
  if (clientIpEl) clientIpEl.innerText = data.client_ip;
  if (clientScopeEl) {
    if (data.client_ip === "127.0.0.1" || data.client_ip === "::1") {
      clientScopeEl.innerText = "Máy chủ nội bộ (Localhost)";
      clientScopeEl.className = "text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30";
    } else if (data.client_ip.startsWith("192.168.") || data.client_ip.startsWith("10.") || data.client_ip.startsWith("172.")) {
      clientScopeEl.innerText = "Thiết bị cùng mạng LAN / Wi-Fi";
      clientScopeEl.className = "text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30";
    } else {
      clientScopeEl.innerText = "Thiết bị từ Internet";
      clientScopeEl.className = "text-xs bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/30";
    }
  }

  // Hostname & Time
  const hostnameEl = document.getElementById("hostname-text");
  if (hostnameEl) hostnameEl.innerText = data.hostname;

  const timeEl = document.getElementById("last-updated");
  if (timeEl) timeEl.innerText = new Date().toLocaleTimeString();

  // Public IPv4
  const pub = data.public || {};
  const pubIpv4El = document.getElementById("public-ipv4");
  if (pubIpv4El) pubIpv4El.innerText = pub.ipv4 || "Không xác định";

  const pubIspEl = document.getElementById("public-isp");
  if (pubIspEl) pubIspEl.innerText = pub.isp || pub.organization || "Không rõ";

  const pubLocEl = document.getElementById("public-location");
  if (pubLocEl) {
    const locParts = [pub.flag_emoji, pub.city, pub.country].filter(Boolean);
    pubLocEl.innerText = locParts.length > 0 ? locParts.join(" ") : "Không có dữ liệu vị trí";
  }

  // Primary Local IP
  const localIpEl = document.getElementById("local-ip");
  if (localIpEl) localIpEl.innerText = data.primary_local_ip || "127.0.0.1";

  const gatewayEl = document.getElementById("gateway-ip");
  if (gatewayEl) gatewayEl.innerText = data.default_gateway || "Không tìm thấy";

  const lanUrlEl = document.getElementById("lan-url");
  const lanUrl = `http://${data.primary_local_ip}:8000`;
  if (lanUrlEl) lanUrlEl.innerText = lanUrl;

  // cURL samples
  const curlPub = document.getElementById("curl-pub");
  if (curlPub) curlPub.innerText = `curl -s ${lanUrl}/api/raw`;

  const curlLocal = document.getElementById("curl-local");
  if (curlLocal) curlLocal.innerText = `curl -s ${lanUrl}/api/raw?type=local`;

  // Public IPv6
  const pubIpv6El = document.getElementById("public-ipv6");
  const ipv6Badge = document.getElementById("ipv6-status-badge");
  const ipv6Desc = document.getElementById("ipv6-desc");
  const copyIpv6Btn = document.getElementById("copy-ipv6-btn");

  if (pub.ipv6) {
    if (pubIpv6El) pubIpv6El.innerText = pub.ipv6;
    if (ipv6Badge) {
      ipv6Badge.innerText = "Có hỗ trợ";
      ipv6Badge.className = "text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
    }
    if (ipv6Desc) ipv6Desc.innerText = "Kết nối IPv6 trực tiếp";
    if (copyIpv6Btn) copyIpv6Btn.style.display = "block";
  } else {
    if (pubIpv6El) pubIpv6El.innerText = "Không phát hiện";
    if (ipv6Badge) {
      ipv6Badge.innerText = "Không khả dụng";
      ipv6Badge.className = "text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700";
    }
    if (ipv6Desc) ipv6Desc.innerText = "Mạng chưa cấp phát IPv6";
    if (copyIpv6Btn) copyIpv6Btn.style.display = "none";
  }

  const tzEl = document.getElementById("public-tz");
  if (tzEl) tzEl.innerText = pub.timezone || "Asia/Ho_Chi_Minh";

  // Latency / Ping
  updatePingDisplay(data.latency_ms);

  // Network Adapters List
  renderAdapters(data.interfaces || [], data.primary_local_ip);

  // Refresh lucide icons for newly rendered content
  lucide.createIcons();
}

function updatePingDisplay(latency) {
  const latencyText = document.getElementById("latency-text");
  if (!latencyText) return;

  if (latency > 0) {
    latencyText.innerText = `${latency} ms`;
    if (latency < 50) {
      latencyText.className = "text-emerald-400 font-bold";
    } else if (latency < 120) {
      latencyText.className = "text-amber-400 font-bold";
    } else {
      latencyText.className = "text-rose-400 font-bold";
    }
  } else {
    latencyText.innerText = "Timeout";
    latencyText.className = "text-slate-400 font-bold";
  }
}

async function measurePing() {
  const latencyText = document.getElementById("latency-text");
  if (latencyText) latencyText.innerText = "...";
  try {
    const res = await fetch("/api/ping");
    const data = await res.json();
    updatePingDisplay(data.latency_ms);
    showToast(`Độ trễ mạng tới DNS Google (8.8.8.8): ${data.latency_ms} ms`);
  } catch (err) {
    console.error(err);
  }
}

function renderAdapters(interfaces, primaryIp) {
  const container = document.getElementById("adapters-list");
  if (!container) return;

  if (!interfaces || interfaces.length === 0) {
    container.innerHTML = '<div class="text-center py-6 text-slate-500">Không tìm thấy card mạng nào</div>';
    return;
  }

  let html = "";
  interfaces.forEach((iface, index) => {
    const isUp = iface.is_up;
    const isPrimary = iface.is_primary;

    const statusBadge = isUp
      ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> UP</span>`
      : `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700/60"><span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span> DOWN</span>`;

    const primaryBadge = isPrimary
      ? `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">Cổng chính (Default Route)</span>`
      : "";

    // Format IPv4s
    let ipv4Html = "";
    if (iface.ipv4 && iface.ipv4.length > 0) {
      ipv4Html = iface.ipv4.map(ipObj => `
        <div class="flex items-center gap-2 mt-1">
          <span class="mono text-xs font-bold text-slate-100 bg-slate-900/80 px-2 py-1 rounded border border-slate-800">${ipObj.ip}</span>
          <span class="text-[11px] text-slate-500">Mask: ${ipObj.netmask || '255.255.255.0'}</span>
          <button onclick="copyText('${ipObj.ip}')" title="Copy IP" class="p-1 hover:text-white text-slate-400 transition">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      `).join("");
    } else {
      ipv4Html = `<span class="text-xs text-slate-500 italic">Không có IPv4</span>`;
    }

    // Format IPv6s (pick first non-link-local if available, or list)
    let ipv6Html = "";
    if (iface.ipv6 && iface.ipv6.length > 0) {
      const topIpv6 = iface.ipv6[0].ip;
      ipv6Html = `
        <div class="flex items-center gap-2 mt-1">
          <span class="mono text-[11px] text-slate-300 bg-slate-900/80 px-2 py-1 rounded border border-slate-800 truncate max-w-[280px] sm:max-w-md">${topIpv6}</span>
          ${iface.ipv6.length > 1 ? `<span class="text-[10px] text-slate-500">+${iface.ipv6.length - 1} khác</span>` : ''}
          <button onclick="copyText('${topIpv6}')" title="Copy IPv6" class="p-1 hover:text-white text-slate-400 transition">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      `;
    } else {
      ipv6Html = `<span class="text-xs text-slate-500 italic">Không có IPv6</span>`;
    }

    // Speed display
    const speedText = iface.speed_mbps > 0 ? `${iface.speed_mbps} Mbps` : 'Không xác định';

    html += `
      <div class="bg-slate-900/60 border ${isPrimary ? 'border-indigo-500/40 bg-indigo-950/10' : 'border-slate-800/80'} rounded-xl p-4 transition hover:border-slate-700">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-3">
          <div class="flex items-center gap-2.5">
            <div class="p-2 rounded-lg ${isPrimary ? 'bg-indigo-600/20 text-indigo-400' : 'bg-slate-800 text-slate-400'}">
              <i data-lucide="${iface.name.toLowerCase().includes('wi-fi') ? 'wifi' : 'network'}" class="w-4 h-4"></i>
            </div>
            <div>
              <span class="font-bold text-sm text-white">${iface.name}</span>
              ${primaryBadge}
            </div>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs text-slate-400">Tốc độ: <strong class="text-slate-300">${speedText}</strong></span>
            ${statusBadge}
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 text-xs">
          <div>
            <span class="text-slate-400 block font-medium">Địa chỉ IPv4:</span>
            ${ipv4Html}
          </div>

          <div>
            <span class="text-slate-400 block font-medium">Địa chỉ IPv6:</span>
            ${ipv6Html}
          </div>

          <div>
            <span class="text-slate-400 block font-medium">Địa chỉ MAC (Vật lý):</span>
            <div class="flex items-center gap-2 mt-1">
              <span class="mono text-xs text-slate-300 bg-slate-900/80 px-2 py-1 rounded border border-slate-800">${iface.mac}</span>
              ${iface.mac !== 'N/A' ? `
                <button onclick="copyText('${iface.mac}')" title="Copy MAC" class="p-1 hover:text-white text-slate-400 transition">
                  <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Copy Utilities
function copyToClipboard(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  copyText(el.innerText.trim());
}

function copyText(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(`Đã sao chép: ${text}`);
  }).catch(err => {
    // Fallback
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

// QR Code Modal
function openQrModal() {
  const modal = document.getElementById("qr-modal");
  const qrcodeBox = document.getElementById("qrcode-box");
  const qrUrlText = document.getElementById("qr-url-text");
  if (!modal || !currentData) return;

  const url = `http://${currentData.primary_local_ip}:8000`;
  qrUrlText.innerText = url;

  qrcodeBox.innerHTML = "";
  try {
    qrInstance = new QRCode(qrcodeBox, {
      text: url,
      width: 180,
      height: 180,
      colorDark: "#0f172a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  } catch (err) {
    console.error("QR Code Error:", err);
  }

  modal.classList.remove("hidden");
  lucide.createIcons();
}

function closeQrModal() {
  const modal = document.getElementById("qr-modal");
  if (modal) modal.classList.add("hidden");
}
