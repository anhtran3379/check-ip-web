// Only local UI text is translated; IPs, ISP names and API payloads stay intact.
const TRANSLATIONS = {
  "vi": {
    "tagline": "Kiểm tra địa chỉ IP miễn phí",
    "checking": "Đang kiểm tra...",
    "refresh": "Làm mới",
    "connectionIP": "Địa chỉ IP kết nối của bạn",
    "identifying": "Đang xác định...",
    "checkingShort": "Đang kiểm tra",
    "loadingISP": "Đang tải ISP...",
    "loadingLocation": "Đang tải vị trí...",
    "loadingStatus": "Đang kiểm tra trạng thái...",
    "securityHeading": "Đánh Giá Tín Hiệu VPN, Proxy & Loại Mạng",
    "collecting": "Đang thu thập thông tin kết nối để đánh giá...",
    "timezoneNote": "Thông tin phụ: Múi giờ thiết bị khác với múi giờ theo IP.",
    "observedStatus": "Trạng thái ghi nhận:",
    "ispHeading": "Nhà mạng (ISP)",
    "locationHeading": "Vị trí ước tính",
    "timezoneHeading": "Múi giờ & Tọa độ",
    "browserHeading": "Trình duyệt & Màn hình",
    "terminalHeading": "API & Lệnh Terminal (Dành Cho Lập Trình Viên)",
    "terminalIntro": "Lấy nhanh IP kết nối từ Command Prompt, PowerShell hoặc Linux Terminal",
    "plainIP": "Lấy IP dạng Plain Text:",
    "jsonDetails": "Lấy chi tiết dạng JSON:",
    "guideHeading": "Hướng Dẫn Chi Tiết Về Địa Chỉ IP & Kết Nối Mạng",
    "guideIntro": "Tìm hiểu cách địa chỉ IP hoạt động, sự khác biệt giữa các loại IP và giới hạn của dữ liệu tra cứu.",
    "whatIP": "1. Địa chỉ IP là gì và tại sao nó lại quan trọng?",
    "ipTerm": "Địa chỉ IP (Internet Protocol Address)",
    "ipExplanation": "là một chuỗi định danh kỹ thuật số được cấp cho thiết bị hoặc cổng mạng khi kết nối Internet. Nhờ có địa chỉ IP, các máy chủ và thiết bị mạng mới biết cách định tuyến gói dữ liệu đến đúng nơi nhận.",
    "publicPrivateHeading": "2. Phân biệt IP Public và IP Private",
    "publicPrivateIntro": "Trong mạng máy tính, có hai nhóm địa chỉ IP phổ biến cần phân biệt:",
    "publicTerm": "IP Public (IP công cộng):",
    "publicExplanation": "Là địa chỉ do nhà cung cấp dịch vụ mạng (ISP) cấp cho modem/router để giao tiếp trên mạng Internet công cộng.",
    "privateTerm": "IP Private (IP nội bộ):",
    "privateExplanation": "Là địa chỉ dùng trong mạng nội bộ LAN/Wi-Fi (như",
    "loopbackExplanation": ") hoặc địa chỉ loopback (",
    "localExplanation": "). Khi bạn truy cập ứng dụng chạy trực tiếp trong mạng nội bộ, máy chủ sẽ thấy địa chỉ nội bộ của kết nối đó.",
    "versionsHeading": "3. So sánh IPv4 và IPv6",
    "comparisonCriterion": "Tiêu chí",
    "addressLength": "Độ dài",
    "addressCount": "Số lượng địa chỉ",
    "v4Count": "Khoảng 4,3 tỷ",
    "v6Count": "Rất lớn (~3.4×10³⁸)",
    "exampleFormat": "Định dạng mẫu",
    "faqHeading": "Câu Hỏi Thường Gặp (FAQ)",
    "hideIP": "Làm thế nào để ẩn hoặc đổi địa chỉ IP của tôi?",
    "hideIPAnswer": "Bạn có thể sử dụng mạng riêng ảo (VPN), máy chủ Proxy hoặc trình duyệt Tor. Lưu lượng truy cập sẽ đi qua máy chủ trung gian thay vì kết nối trực tiếp từ địa chỉ IP nhà mạng của bạn.",
    "homeAddress": "Người khác có thể biết chính xác số nhà của tôi qua IP không?",
    "homeAddressAnswer": "Không. Dữ liệu định vị qua IP chỉ mang tính ước tính theo khu vực hoặc trạm định tuyến của nhà mạng (ISP), có thể lệch giữa các thành phố hoặc vùng miền.",
    "privacyQuestion": "Trang web xử lý dữ liệu tra cứu IP như thế nào?",
    "privacyStart": "Mã nguồn ứng dụng không tự lưu trữ tệp nhật ký cá nhân dài hạn, nhưng giữ bộ nhớ đệm (cache) kết quả tra cứu tạm thời trong bộ nhớ/edge (tối đa 1 giờ) để giảm tải. Khi tra cứu IP công cộng, địa chỉ IP sẽ được gửi tới dịch vụ tra cứu bên thứ ba (",
    "privacyEnd": "). Ngoài ra, máy chủ web hoặc hạ tầng hosting (như Cloudflare hoặc Uvicorn) có thể ghi nhận access log tiêu chuẩn tùy thuộc vào cấu hình vận hành.",
    "footer": "© 2026 CheckIP.vn • Công cụ kiểm tra thông tin IP trực tuyến",
    "copiedInitial": "Đã sao chép vào bộ nhớ tạm!",
    "unknown": "Không xác định",
    "other": "Khác",
    "browserOS": "{browser} trên {os}",
    "screen": "Màn hình: {width} × {height} px",
    "screenUnknown": "Màn hình: Không xác định",
    "serverError": "Lỗi phản hồi từ máy chủ ({status})",
    "unavailable": "Thông tin IP hiện không khả dụng",
    "timeout": "Quá thời gian chờ phản hồi từ máy chủ",
    "networkError": "Lỗi kết nối mạng",
    "loadError": "Không thể tải thông tin IP: {message}",
    "localIPLabel": "Địa chỉ IP nội bộ (Local IP) của bạn",
    "publicIPLabel": "Địa chỉ IP công cộng (Public IP) của bạn",
    "privateFamily": "{family} (Nội bộ)",
    "localNetwork": "Mạng nội bộ",
    "local": "Nội bộ",
    "hcmEdge": "TP.HCM (SGN)",
    "hanoiEdge": "Hà Nội (HAN)",
    "directServer": "Máy chủ trực tiếp",
    "asn": "Số hiệu mạng: {asn}",
    "notApplicable": "Không áp dụng",
    "localCountry": "🌐 Mạng nội bộ",
    "unknownCountry": "🌐 Không xác định",
    "coordinates": "Tọa độ: {lat}, {lon}",
    "coordinatesUnknown": "Tọa độ: Không xác định",
    "timezoneMismatch": "Thông tin phụ: Múi giờ thiết bị ({device}) khác với múi giờ theo IP ({ip}).",
    "suspected": "Có dấu hiệu VPN/Proxy",
    "suspectedDescription": "Dữ liệu tra cứu ghi nhận dấu hiệu kết nối qua VPN, Proxy hoặc nút mạng trung gian. Kết quả chỉ mang tính tham khảo kỹ thuật.",
    "suspectedHosting": "Có dấu hiệu VPN/Proxy (Kèm tín hiệu Hosting)",
    "notDetectedHosting": "Chưa phát hiện dấu hiệu VPN/Proxy (IP Hosting)",
    "hostingSignal": "Tín hiệu IP Hosting",
    "hostingDescription": "Chưa phát hiện dấu hiệu VPN/Proxy từ cờ proxy, nhưng địa chỉ IP thuộc dải trung tâm dữ liệu/hosting. Dữ liệu tra cứu có giới hạn, không thể kết luận chắc chắn.",
    "hostingType": "Tín hiệu IP Hosting / Trung tâm dữ liệu",
    "notDetected": "Chưa phát hiện dấu hiệu VPN/Proxy",
    "notDetectedDescription": "Chưa phát hiện dấu hiệu VPN/Proxy trong dữ liệu tra cứu hiện tại. Kết quả có giới hạn theo cơ sở dữ liệu nguồn và không khẳng định tuyệt đối.",
    "localIP": "IP nội bộ",
    "localDescription": "Địa chỉ thuộc phạm vi mạng nội bộ hoặc dải đặc biệt; không áp dụng đánh giá VPN/Proxy công cộng.",
    "insufficient": "Chưa đủ dữ liệu để đánh giá",
    "unknownHostingDescription": "Ghi nhận tín hiệu mạng lưu trữ (Hosting/ASN), nhưng chưa đủ dữ liệu tra cứu để đánh giá trạng thái VPN/Proxy.",
    "unknownDescription": "Chưa đủ dữ liệu để đánh giá trạng thái VPN/Proxy do thông tin tra cứu không đầy đủ hoặc tạm thời gián đoạn.",
    "unknownHostingType": "Tín hiệu IP Hosting (Chưa đủ dữ liệu VPN/Proxy)",
    "copyNoData": "Không có dữ liệu hợp lệ để sao chép",
    "copied": "Đã sao chép: {value}",
    "copyFailed": "Không thể sao chép tự động. Vui lòng sao chép thủ công.",
    "copyNoIP": "Chưa có địa chỉ IP hợp lệ để sao chép",
    "copyIP": "Sao chép IP",
    "copyCommand": "Sao chép lệnh",
    "language": "Ngôn ngữ",
    "meta.title": "Kiểm Tra IP Của Tôi - Xem Địa Chỉ IP, ISP & Vị Trí Ước Tính Miễn Phí",
    "meta.description": "Kiểm tra địa chỉ IP kết nối hiện tại của bạn nhanh chóng. Xem thông tin nhà mạng (ISP), vị trí địa lý ước tính (Thành phố, Quốc gia), phân tích IPv4, IPv6, trình duyệt và tín hiệu mạng miễn phí.",
    "meta.language": "Vietnamese",
    "meta.og:title": "Kiểm Tra IP Của Tôi - Xem Địa Chỉ IP & Nhà Mạng Nhanh Chóng",
    "meta.og:description": "Xem địa chỉ IP kết nối của bạn, vị trí địa lý ước tính, nhà mạng cung cấp dịch vụ Internet (ISP) và các tín hiệu kỹ thuật của kết nối.",
    "meta.twitter:title": "Kiểm Tra IP Của Tôi - Xem Địa Chỉ IP & Vị Trí Ước Tính",
    "meta.twitter:description": "Công cụ tra cứu IP miễn phí, hiển thị thông tin nhà mạng, khu vực địa lý ước tính và tín hiệu kết nối mạng của bạn.",
    "pageTitle": "Kiểm Tra IP Của Tôi - Xem Địa Chỉ IP, ISP & Vị Trí Ước Tính Miễn Phí"
  },
  "en": {
    "tagline": "Free IP address checker",
    "checking": "Checking...",
    "refresh": "Refresh",
    "connectionIP": "Your connection IP address",
    "identifying": "Identifying...",
    "checkingShort": "Checking",
    "loadingISP": "Loading ISP...",
    "loadingLocation": "Loading location...",
    "loadingStatus": "Checking status...",
    "securityHeading": "VPN, Proxy & Network Signals",
    "collecting": "Gathering connection information...",
    "timezoneNote": "Additional information: your device and IP time zones differ.",
    "observedStatus": "Observed status:",
    "ispHeading": "Internet provider (ISP)",
    "locationHeading": "Estimated location",
    "timezoneHeading": "Time zone & Coordinates",
    "browserHeading": "Browser & Screen",
    "terminalHeading": "API & Terminal Commands (For Developers)",
    "terminalIntro": "Get your connection IP from Command Prompt, PowerShell or a Linux terminal",
    "plainIP": "Get IP as plain text:",
    "jsonDetails": "Get details as JSON:",
    "guideHeading": "A Guide to IP Addresses & Network Connections",
    "guideIntro": "Learn how IP addresses work, how address types differ, and the limitations of lookup data.",
    "whatIP": "1. What is an IP address and why does it matter?",
    "ipTerm": "An IP address (Internet Protocol address)",
    "ipExplanation": "is a numerical identifier assigned to a device or network gateway when it connects to the Internet. IP addresses allow servers and network devices to route data packets to the correct destination.",
    "publicPrivateHeading": "2. Public and private IP addresses",
    "publicPrivateIntro": "There are two common types of IP addresses to distinguish:",
    "publicTerm": "Public IP:",
    "publicExplanation": "An address assigned by your Internet service provider (ISP) to your modem/router for communication over the public Internet.",
    "privateTerm": "Private IP:",
    "privateExplanation": "An address used within a local LAN/Wi-Fi network (such as",
    "loopbackExplanation": ") or a loopback address (",
    "localExplanation": "). When you access an application running directly on your local network, the server sees the local address of that connection.",
    "versionsHeading": "3. IPv4 and IPv6 compared",
    "comparisonCriterion": "Feature",
    "addressLength": "Length",
    "addressCount": "Number of addresses",
    "v4Count": "About 4.3 billion",
    "v6Count": "Very large (~3.4×10³⁸)",
    "exampleFormat": "Example format",
    "faqHeading": "Frequently Asked Questions (FAQ)",
    "hideIP": "How can I hide or change my IP address?",
    "hideIPAnswer": "You can use a virtual private network (VPN), a proxy server or the Tor browser. Your traffic passes through an intermediary server instead of connecting directly from your ISP-assigned IP address.",
    "homeAddress": "Can someone find my exact home address from my IP?",
    "homeAddressAnswer": "No. IP geolocation only estimates a region or an ISP routing location and may be inaccurate across cities or regions.",
    "privacyQuestion": "How does this website handle IP lookup data?",
    "privacyStart": "The application does not itself keep long-term personal log files, but temporarily caches lookup results in memory or at the edge (for up to 1 hour) to reduce load. Public IP lookups send the IP address to a third-party lookup service (",
    "privacyEnd": "). The web server or hosting infrastructure (such as Cloudflare or Uvicorn) may also record standard access logs depending on its configuration.",
    "footer": "© 2026 CheckIP.vn • Online IP information checker",
    "copiedInitial": "Copied to clipboard!",
    "unknown": "Unknown",
    "other": "Other",
    "browserOS": "{browser} on {os}",
    "screen": "Screen: {width} × {height} px",
    "screenUnknown": "Screen: Unknown",
    "serverError": "Server response error ({status})",
    "unavailable": "IP information is currently unavailable",
    "timeout": "The server response timed out",
    "networkError": "Network connection error",
    "loadError": "Could not load IP information: {message}",
    "localIPLabel": "Your local IP address",
    "publicIPLabel": "Your public IP address",
    "privateFamily": "{family} (Local)",
    "localNetwork": "Local network",
    "local": "Local",
    "hcmEdge": "Ho Chi Minh City (SGN)",
    "hanoiEdge": "Hanoi (HAN)",
    "directServer": "Direct server",
    "asn": "ASN: {asn}",
    "notApplicable": "Not applicable",
    "localCountry": "🌐 Local network",
    "unknownCountry": "🌐 Unknown",
    "coordinates": "Coordinates: {lat}, {lon}",
    "coordinatesUnknown": "Coordinates: Unknown",
    "timezoneMismatch": "Additional information: your device time zone ({device}) differs from the IP time zone ({ip}).",
    "suspected": "VPN/Proxy signals detected",
    "suspectedDescription": "Lookup data indicates a possible VPN, proxy or intermediary network node. This result is for technical reference only.",
    "suspectedHosting": "VPN/Proxy signals detected (with hosting signals)",
    "notDetectedHosting": "No VPN/Proxy signals detected (Hosting IP)",
    "hostingSignal": "Hosting IP signal",
    "hostingDescription": "The proxy flag shows no VPN/Proxy signals, but this IP belongs to a hosting/data center range. Lookup data is limited and cannot provide a definitive conclusion.",
    "hostingType": "Hosting / Data center IP signal",
    "notDetected": "No VPN/Proxy signals detected",
    "notDetectedDescription": "No VPN/Proxy signals were found in the current lookup data. The result is limited by the source database and is not conclusive.",
    "localIP": "Local IP",
    "localDescription": "This address belongs to a local network or special-use range; public VPN/Proxy assessment does not apply.",
    "insufficient": "Insufficient data to assess",
    "unknownHostingDescription": "Hosting/ASN signals are present, but there is not enough lookup data to assess VPN/Proxy status.",
    "unknownDescription": "There is not enough data to assess VPN/Proxy status because lookup information is incomplete or temporarily unavailable.",
    "unknownHostingType": "Hosting IP signal (Insufficient VPN/Proxy data)",
    "copyNoData": "No valid data to copy",
    "copied": "Copied: {value}",
    "copyFailed": "Could not copy automatically. Please copy manually.",
    "copyNoIP": "No valid IP address to copy",
    "copyIP": "Copy IP",
    "copyCommand": "Copy command",
    "language": "Language",
    "meta.title": "What Is My IP - Free IP Address, ISP & Estimated Location Checker",
    "meta.description": "Check your current connection IP address, Internet provider (ISP), estimated city and country, IPv4, IPv6, browser details and network signals for free.",
    "meta.language": "English",
    "meta.og:title": "What Is My IP - Check Your IP Address & Internet Provider",
    "meta.og:description": "See your connection IP address, estimated location, Internet provider (ISP) and technical network signals.",
    "meta.twitter:title": "What Is My IP - IP Address & Estimated Location",
    "meta.twitter:description": "A free IP lookup tool showing your Internet provider, estimated region and network connection signals.",
    "pageTitle": "What Is My IP - Free IP Address, ISP & Estimated Location Checker"
  }
};

const LANGUAGE_STORAGE_KEY = "checkip-language";
let currentLanguage = "vi";
let languageInitialized = false;
let originalStructuredData = null;

function t(key, values = {}) {
  const template = TRANSLATIONS[currentLanguage][key] ?? TRANSLATIONS.vi[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
  );
}

function updateStructuredData() {
  const element = document.getElementById("structured-data");
  if (!element) return;
  try {
    if (!originalStructuredData) originalStructuredData = JSON.parse(element.textContent);
    const schema = JSON.parse(JSON.stringify(originalStructuredData));
    const application = schema["@graph"].find(item => item["@type"] === "WebApplication");
    application.inLanguage = currentLanguage;
    if (currentLanguage === "en") {
      application.name = t("pageTitle");
      application.description = t("meta.description");
      const faq = schema["@graph"].find(item => item["@type"] === "FAQPage");
      const questions = [
        ["What is an IP address?", t("ipTerm") + " " + t("ipExplanation")],
        ["What is the difference between public and private IP addresses?",
          t("publicTerm") + " " + t("publicExplanation") + " " + t("privateTerm") + " " +
          t("privateExplanation") + " 192.168.x.x, 10.x.x.x, 172.16.x.x - 172.31.x.x" +
          t("loopbackExplanation") + "127.0.0.1, ::1" + t("localExplanation")],
        ["How do IPv4 and IPv6 differ?", "IPv4 uses 32-bit addresses (for example, 192.0.2.1). IPv6 uses 128-bit hexadecimal addresses (for example, 2001:db8::1) to provide a much larger address space."],
        [t("hideIP"), t("hideIPAnswer")],
        [t("homeAddress"), t("homeAddressAnswer")]
      ];
      faq.mainEntity = questions.map(([name, text]) => ({
        "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text }
      }));
    }
    element.textContent = JSON.stringify(schema);
  } catch {
    // Metadata must never block the IP checker.
  }
}

function setLanguage(language, persist = true) {
  if (language !== "vi" && language !== "en") return false;
  currentLanguage = language;
  document.documentElement.lang = language;
  for (const [marker, attribute] of [
    ["data-i18n", null], ["data-i18n-content", "content"],
    ["data-i18n-title", "title"], ["data-i18n-aria-label", "aria-label"]
  ]) {
    for (const element of document.querySelectorAll(`[${marker}]`)) {
      const text = t(element.getAttribute(marker));
      if (attribute) element.setAttribute(attribute, text);
      else element.textContent = text;
    }
  }
  const select = document.getElementById("language-select");
  if (select) select.value = language;
  if (persist) {
    try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language); }
    catch { /* Language switching also works when storage is blocked. */ }
  }
  updateStructuredData();
  if (typeof renderCurrentLanguage === "function") renderCurrentLanguage();
  return true;
}

function initializeLanguage() {
  if (languageInitialized) return;
  languageInitialized = true;
  let saved = null;
  try { saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY); }
  catch { /* Keep Vietnamese as the default. */ }
  setLanguage(saved === "en" ? "en" : "vi", false);
  const select = document.getElementById("language-select");
  if (select) select.addEventListener("change", event => setLanguage(event.target.value));
}
