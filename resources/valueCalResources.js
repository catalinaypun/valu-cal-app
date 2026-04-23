const promoCategories = [
  { title: "Standard 1st Pitch", codes: ["FLEX LevelUp 1st Pitch: STND no MF / 12M", "FLEX LevelUp 1st Pitch: STND no MF / 24M", "FLEX LevelUp 1st Pitch: STND w/MF / 36M"] },
  { title: "Standard 2nd Pitch", codes: ["FLEX LevelUp 2nd Pitch: STND % DISC / 24M", "FLEX LevelUp 2nd Pitch: STND % DISC / 36M", "FLEX LevelUp 2nd Pitch: STND % DISC / 48M"] },
  { title: "Media", codes: ["FLEX LevelUp PREF % DISC - MEDIA / 12M", "FLEX LevelUp PREF % DISC - MEDIA / 24M", "FLEX LevelUp PREF % DISC - MEDIA / 36M"] },
  { title: "GROUP", codes: ["FLEX LevelUp PREF % DISC - GROUP / 12M", "FLEX LevelUp PREF % DISC - GROUP / 24M", "FLEX LevelUp PREF % DISC - GROUP / 36M"] }
];

const stdRows = [
  { name: "Vehicle Tracking - Standalone", p12: 57.26, p24: 48.63, p36: 44.42, p48: 42.38, p60: 40.75 },
  { name: "Forward/Road Facing Cam", p12: 47.27, p24: 38.14, p36: 33.76, p48: 31.72, p60: 30.09 },
  { name: "Dual Cam", p12: 52.27, p24: 43.14, p36: 38.76, p48: 36.72, p60: 35.09 },
  { name: "Powered Asset Tracking", p12: 34.50, p24: 26.25, p36: 22.17, p48: 20.63, p60: 19.50 }
];

const evcRows = [
  { name: "DVR & Rear Camera Bundle", p12: 69.54, p24: 53.28, p36: 46.51, p48: 43.43, p60: 41.18 },
  { name: "DVR / Rear / Cargo", p12: 89.81, p24: 66.42, p36: 57.27, p48: 53.15, p60: 50.27 },
  { name: "DVR / Rear / 2 Sides", p12: 110.08, p24: 79.56, p36: 68.03, p48: 62.86, p60: 59.36 }
];

const eftRows = [
  { name: "Vehicle Tracking", total: 366, p12: 30.50, p24: 15.25, p36: 10.17, p48: 7.63, p60: 6.10 },
  { name: "Forward/Road Facing Cam", total: 546, p12: 45.50, p24: 22.75, p36: 15.17, p48: 11.38, p60: 9.10 },
  { name: "Dual Cam", total: 582, p12: 48.50, p24: 24.25, p36: 16.17, p48: 12.13, p60: 9.70 },
  { name: "Powered Assets", total: 330, p12: 27.50, p24: 13.75, p36: 9.17, p48: 6.88, p60: 5.50 }
];

const content = document.getElementById("resources-content");
const tabs = Array.from(document.querySelectorAll(".r-tab"));
let activeTab = "promo";

function fmt(n) {
  return typeof n === "number" ? `$${n.toFixed(2)}` : n;
}

function renderTable(rows, includeTotal = false) {
  const head = includeTotal
    ? "<tr><th>Product</th><th>Total</th><th>12M</th><th>24M</th><th>36M</th><th>48M</th><th>60M</th></tr>"
    : "<tr><th>Product</th><th>12M</th><th>24M</th><th>36M</th><th>48M</th><th>60M</th></tr>";
  const body = rows.map((r) => includeTotal
    ? `<tr><td>${r.name}</td><td>${fmt(r.total)}</td><td>${fmt(r.p12)}</td><td>${fmt(r.p24)}</td><td>${fmt(r.p36)}</td><td>${fmt(r.p48)}</td><td>${fmt(r.p60)}</td></tr>`
    : `<tr><td>${r.name}</td><td>${fmt(r.p12)}</td><td>${fmt(r.p24)}</td><td>${fmt(r.p36)}</td><td>${fmt(r.p48)}</td><td>${fmt(r.p60)}</td></tr>`
  ).join("");
  return `<div class="table-wrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function renderPromo() {
  content.innerHTML = `
    <input id="promo-search" class="search" placeholder="Search promo codes..." />
    <div id="promo-list"></div>
  `;
  const search = document.getElementById("promo-search");
  const list = document.getElementById("promo-list");

  function draw() {
    const q = (search.value || "").trim().toLowerCase();
    const filtered = promoCategories
      .map((cat) => ({ ...cat, codes: cat.codes.filter((c) => c.toLowerCase().includes(q)) }))
      .filter((cat) => cat.codes.length > 0);
    if (filtered.length === 0) {
      list.innerHTML = '<div class="empty">No promo codes match this search.</div>';
      return;
    }
    list.innerHTML = filtered.map((cat) => `
      <section class="deck">
        <div class="deck-title">${cat.title}</div>
        ${cat.codes.map((code) => `
          <div class="deck-row">
            <div class="code">${code}</div>
            <button class="copy-btn" data-code="${code.replace(/"/g, "&quot;")}">Copy</button>
          </div>
        `).join("")}
      </section>
    `).join("");

    Array.from(list.querySelectorAll(".copy-btn")).forEach((btn) => {
      btn.addEventListener("click", async () => {
        const code = btn.dataset.code || "";
        try {
          await navigator.clipboard.writeText(code);
          btn.textContent = "Copied";
          setTimeout(() => { btn.textContent = "Copy"; }, 900);
        } catch {
          btn.textContent = "Copy failed";
          setTimeout(() => { btn.textContent = "Copy"; }, 1000);
        }
      });
    });
  }

  search.addEventListener("input", draw);
  draw();
}

function renderActive() {
  if (activeTab === "promo") return renderPromo();
  if (activeTab === "std") {
    content.innerHTML = renderTable(stdRows);
    return;
  }
  if (activeTab === "evc") {
    content.innerHTML = renderTable(evcRows);
    return;
  }
  content.innerHTML = renderTable(eftRows, true);
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activeTab = tab.dataset.tab;
    tabs.forEach((t) => t.classList.toggle("active", t === tab));
    renderActive();
  });
});

renderActive();
