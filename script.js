// ---- CONFIGURATION ----
// Replace with your Google Sheet's "Publish to web" CSV link.
// File > Share > Publish to web > select the sheet/tab > CSV > Publish.
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQN0LfbybPNtdHqlPObZYfknfA4pcUI7PiPpP-RJt99XT-64jC6RVeKKhyZjF6U-NMtTruE3Ge852A0/pub?gid=0&single=true&output=csv";

// Expected column headers in the sheet (case-insensitive, order doesn't matter):
// First Name | Last Name | Phone | Email | Address | Ministry Group | Active
// Ministry Group can hold multiple groups separated by commas, e.g. "Choir, Youth Group"
// Active is optional: if the column exists, only checked/TRUE rows are shown.
// If the column doesn't exist at all, everyone shows (nothing to opt into).

// Normalizes to E.164-ish form (+1XXXXXXXXXX). iOS's Messages app can silently
// drop numbers from a multi-recipient sms: link unless they include a country
// code, even though bare 10-digit numbers work fine for tel: and single texts.
function toDialable(phone) {
  const raw = (phone || "").replace(/[^\d+]/g, "");
  if (raw.startsWith("+")) return raw;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  return raw;
}

const searchInput = document.getElementById("searchInput");
const groupFilter = document.getElementById("groupFilter");
const listEl = document.getElementById("directoryList");
const statusEl = document.getElementById("statusMsg");
const lastLoadedEl = document.getElementById("lastLoaded");
const textGroupBtn = document.getElementById("textGroupBtn");
const copyGroupBtn = document.getElementById("copyGroupBtn");
const printBtn = document.getElementById("printBtn");
const copyGroupHint = document.getElementById("copyGroupHint");

let people = [];
let retryBtn = null;

init();

async function init() {
  if (!CSV_URL || CSV_URL.includes("PASTE_YOUR")) {
    statusEl.textContent = "Setup needed: add your Google Sheet CSV link in script.js";
    return;
  }
  statusEl.textContent = "Loading directory...";
  hideRetryButton();
  try {
    const res = await fetchWithTimeout(CSV_URL, { cache: "no-store" }, 10000);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    people = parseCsv(text);
    buildGroupOptions(people);
    render();
    statusEl.textContent = "";
    lastLoadedEl.textContent = "Updated " + new Date().toLocaleString();
  } catch (err) {
    statusEl.textContent = "Couldn't load the directory. Check your connection and try again.";
    showRetryButton();
    console.error(err);
  }
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function showRetryButton() {
  if (!retryBtn) {
    retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "retry-btn";
    retryBtn.textContent = "Retry";
    retryBtn.addEventListener("click", init);
    statusEl.insertAdjacentElement("afterend", retryBtn);
  }
  retryBtn.hidden = false;
}

function hideRetryButton() {
  if (retryBtn) retryBtn.hidden = true;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then((registration) => {
        // The SW itself is checked for updates on load; explicitly nudge it too,
        // in case the browser is being conservative about re-checking sw.js.
        registration.update().catch(() => {});
      })
      .catch((err) => console.error("SW registration failed", err));
  });

  // Once a new service worker takes over (it activates itself immediately via
  // skipWaiting/clients.claim in sw.js), reload once so the page's own HTML/JS
  // catches up too -- otherwise people would still be stuck viewing the old
  // version until they happened to reload or reopen the app themselves.
  let hasReloadedForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloadedForUpdate) return;
    hasReloadedForUpdate = true;
    window.location.reload();
  });
}

// ---- Install prompt ----
const INSTALL_DISMISSED_KEY = "installBannerDismissed";
let deferredInstallPrompt = null;

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function showInstallBanner(kind) {
  if (localStorage.getItem(INSTALL_DISMISSED_KEY) === "1") return;
  if (document.getElementById("installBanner")) return;

  const banner = document.createElement("div");
  banner.id = "installBanner";
  banner.className = "install-banner";

  const text = document.createElement("span");
  text.className = "install-banner-text";
  text.textContent =
    kind === "android"
      ? "Install this app for one-tap access."
      : "Install this app: tap Share ⬆, then \"Add to Home Screen\".";
  banner.appendChild(text);

  if (kind === "android") {
    const installBtn = document.createElement("button");
    installBtn.type = "button";
    installBtn.className = "install-banner-btn";
    installBtn.textContent = "Install";
    installBtn.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      dismissInstallBanner();
    });
    banner.appendChild(installBtn);
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "install-banner-close";
  closeBtn.textContent = "✕";
  closeBtn.setAttribute("aria-label", "Dismiss");
  closeBtn.addEventListener("click", dismissInstallBanner);
  banner.appendChild(closeBtn);

  document.body.appendChild(banner);
  document.body.classList.add("has-install-banner");
}

function dismissInstallBanner() {
  const banner = document.getElementById("installBanner");
  if (banner) banner.remove();
  document.body.classList.remove("has-install-banner");
  localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
}

if (!isStandalone()) {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    showInstallBanner("android");
  });

  window.addEventListener("appinstalled", dismissInstallBanner);

  if (isIOS()) {
    showInstallBanner("ios");
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(field); field = ""; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === '\r') { /* skip */ }
      else { field += c; }
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }

  if (rows.length === 0) return [];

  const headers = rows[0].map(h => h.trim().toLowerCase());
  const idx = {
    first: headers.findIndex(h => h.includes("first")),
    last: headers.findIndex(h => h.includes("last")),
    phone: headers.findIndex(h => h.includes("phone")),
    email: headers.findIndex(h => h.includes("email")),
    address: headers.findIndex(h => h.includes("address")),
    group: headers.findIndex(h => h.includes("group") || h.includes("ministry")),
    active: headers.findIndex(h => h.includes("active")),
  };

  const ACTIVE_VALUES = ["true", "yes", "y", "1", "checked"];

  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    if (cols.every(c => !c || !c.trim())) continue;

    const firstName = idx.first >= 0 ? (cols[idx.first] || "").trim() : "";
    const lastName = idx.last >= 0 ? (cols[idx.last] || "").trim() : "";
    const phone = idx.phone >= 0 ? (cols[idx.phone] || "").trim() : "";
    const email = idx.email >= 0 ? (cols[idx.email] || "").trim() : "";
    const address = idx.address >= 0 ? (cols[idx.address] || "").trim() : "";
    const groupsRaw = idx.group >= 0 ? (cols[idx.group] || "").trim() : "";
    const groups = groupsRaw
      ? groupsRaw.split(/[,;]/).map(g => g.trim()).filter(Boolean)
      : [];

    if (!firstName && !lastName) continue;

    // No Active column at all -> show everyone (backward compatible).
    // Active column present -> only show rows explicitly checked/true.
    if (idx.active >= 0) {
      const activeRaw = (cols[idx.active] || "").trim().toLowerCase();
      if (!ACTIVE_VALUES.includes(activeRaw)) continue;
    }

    out.push({ firstName, lastName, phone, email, address, groups });
  }

  out.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  return out;
}

function buildGroupOptions(people) {
  const groups = new Set();
  people.forEach(p => p.groups.forEach(g => groups.add(g)));
  const sorted = Array.from(groups).sort((a, b) => a.localeCompare(b));

  groupFilter.innerHTML = '<option value="">All Ministry Groups</option>';
  sorted.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    groupFilter.appendChild(opt);
  });
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const groupSel = groupFilter.value;

  const filtered = people.filter(p => {
    const fullName = (p.firstName + " " + p.lastName).toLowerCase();
    const matchesQuery =
      !query ||
      fullName.includes(query) ||
      p.lastName.toLowerCase().startsWith(query) ||
      p.groups.some(g => g.toLowerCase().includes(query));
    const matchesGroup = !groupSel || p.groups.includes(groupSel);
    return matchesQuery && matchesGroup;
  });

  listEl.innerHTML = "";

  if (filtered.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-msg";
    li.textContent = "No matches found.";
    listEl.appendChild(li);
    return;
  }

  filtered.forEach(p => {
    const li = document.createElement("li");
    li.className = "person-card";

    const info = document.createElement("div");
    info.className = "person-info";

    const name = document.createElement("div");
    name.className = "person-name";
    name.textContent = `${p.firstName} ${p.lastName}`.trim();

    const hasDetails = Boolean(p.phone || p.email || p.address || p.groups.length);
    let detailsIcon = null;
    if (hasDetails) {
      detailsIcon = document.createElement("span");
      detailsIcon.className = "address-indicator";
      detailsIcon.textContent = "▾";
      detailsIcon.setAttribute("aria-hidden", "true");
      name.appendChild(detailsIcon);
    }
    info.appendChild(name);

    if (hasDetails) {
      const details = document.createElement("div");
      details.className = "person-details";
      details.hidden = true;

      if (p.phone) {
        const phoneText = document.createElement("a");
        phoneText.className = "person-phone";
        phoneText.href = "tel:" + toDialable(p.phone);
        phoneText.textContent = p.phone;
        details.appendChild(phoneText);
      }

      if (p.email) {
        const emailText = document.createElement("a");
        emailText.className = "person-email";
        emailText.href = "mailto:" + p.email;
        emailText.textContent = p.email;
        details.appendChild(emailText);
      }

      if (p.address) {
        const addressText = document.createElement("div");
        addressText.className = "person-address";
        addressText.textContent = p.address;
        details.appendChild(addressText);
      }

      if (p.groups.length) {
        const groupsWrap = document.createElement("div");
        groupsWrap.className = "person-groups";
        p.groups.forEach(g => {
          const badge = document.createElement("span");
          badge.className = "group-badge";
          badge.textContent = g;
          groupsWrap.appendChild(badge);
        });
        details.appendChild(groupsWrap);
      }

      info.appendChild(details);

      li.classList.add("has-address");
      li.setAttribute("role", "button");
      li.setAttribute("tabindex", "0");
      li.setAttribute("aria-expanded", "false");
      li.setAttribute("aria-label", `View details for ${p.firstName} ${p.lastName}`.trim());

      const toggleDetails = () => {
        details.hidden = !details.hidden;
        detailsIcon.textContent = details.hidden ? "▾" : "▴";
        li.setAttribute("aria-expanded", String(!details.hidden));
      };

      li.addEventListener("click", (e) => {
        if (e.target.closest("a")) return;
        toggleDetails();
      });

      li.addEventListener("keydown", (e) => {
        if (e.target.closest("a")) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleDetails();
        }
      });
    }

    li.appendChild(info);

    if (p.phone) {
      const digits = toDialable(p.phone);
      const actions = document.createElement("div");
      actions.className = "card-actions";

      const textLink = document.createElement("a");
      textLink.className = "text-btn";
      textLink.href = "sms:" + digits;
      textLink.textContent = "Text";
      actions.appendChild(textLink);

      const callLink = document.createElement("a");
      callLink.className = "call-btn";
      callLink.href = "tel:" + digits;
      callLink.textContent = "Call";
      actions.appendChild(callLink);

      li.appendChild(actions);
    }

    listEl.appendChild(li);
  });

  updateTextGroupButton(filtered);
}

function updateTextGroupButton(filtered) {
  const numbers = filtered
    .map(p => toDialable(p.phone))
    .filter(Boolean);

  // iOS Messages reliably ignores all but one recipient from a web link,
  // regardless of number formatting -- it's a platform restriction, not
  // something fixable from here. So on iOS, Copy Numbers is the real
  // primary action, not a hidden fallback nobody notices.
  const iosMode = isIOS();

  if (numbers.length === 0) {
    textGroupBtn.hidden = iosMode;
    textGroupBtn.textContent = "Text This Group (0)";
    textGroupBtn.href = "#";
    textGroupBtn.setAttribute("aria-disabled", "true");
    if (copyGroupBtn) copyGroupBtn.hidden = true;
    return;
  }

  if (iosMode) {
    textGroupBtn.hidden = true;
  } else {
    textGroupBtn.hidden = false;
    textGroupBtn.textContent = `Text This Group (${numbers.length})`;
    textGroupBtn.href = "sms:" + numbers.join(",");
    textGroupBtn.removeAttribute("aria-disabled");
  }

  if (copyGroupBtn) {
    copyGroupBtn.hidden = false;
    copyGroupBtn.textContent = iosMode
      ? `Copy Numbers for Group Text (${numbers.length})`
      : "Copy Numbers";
    copyGroupBtn.className = iosMode ? "copy-group-btn copy-group-btn-primary" : "copy-group-btn";
    copyGroupBtn.dataset.numbers = numbers.join(", ");
  }
}

if (copyGroupBtn) {
  copyGroupBtn.addEventListener("click", async () => {
    const numbers = copyGroupBtn.dataset.numbers || "";
    if (!numbers) return;
    try {
      await navigator.clipboard.writeText(numbers);

      // Can't paste into Messages' recipient field for them -- no website can
      // type into another app's input, on any platform -- but we CAN copy
      // and open Messages to a blank new message in one tap, so the only
      // thing left by hand is a long-press-paste into "To:". This has to run
      // right away, still inside the click handler -- iOS silently blocks
      // scheme navigation like sms: if it's deferred (e.g. via setTimeout)
      // past the original tap's user-activation window.
      if (isIOS()) {
        window.location.href = "sms:";
      }

      const original = copyGroupBtn.textContent;
      copyGroupBtn.textContent = "Copied!";
      if (copyGroupHint) copyGroupHint.hidden = false;
      setTimeout(() => {
        copyGroupBtn.textContent = original;
        if (copyGroupHint) copyGroupHint.hidden = true;
      }, 6000);
    } catch (err) {
      console.error("Clipboard copy failed", err);
    }
  });
}

searchInput.addEventListener("input", render);
groupFilter.addEventListener("change", render);

if (printBtn) {
  printBtn.addEventListener("click", () => window.print());
}
