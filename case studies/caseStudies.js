const CASES = [
  {
    id: "landscaping",
    type: "industry",
    title: "Landscaping",
    color: "#16a34a",
    company: "Apex Landscaping",
    quote: "GPS data helped verify real arrival/departure times and replace paper logs.",
    impact: "Improved verification and reduced manual admin work.",
    painPoints: ["Verify hours", "Prevent side jobs", "Protect equipment"],
    solutions: ["Automated timesheets", "Proof of service", "Asset tracking"],
    link: "https://www.verizonconnect.com/resources/case-study/apex-landscaping/"
  },
  {
    id: "towing",
    type: "industry",
    title: "Towing",
    color: "#f59e42",
    company: "Wrecker Service",
    quote: "PTO monitoring exposed unauthorized work and improved dispatch confidence.",
    impact: "Recovered revenue and improved operational control.",
    painPoints: ["Unauthorized jobs", "ETA pressure", "PTO monitoring"],
    solutions: ["PTO alerts", "Closest-driver dispatch", "Route visibility"],
    link: "https://www.youtube.com/watch?v=Anv6jqcmi34"
  },
  {
    id: "transportation",
    type: "industry",
    title: "Transportation",
    color: "#2563eb",
    company: "Redwey Transport",
    quote: "Geofencing and visibility improved payroll accuracy and compliance.",
    impact: "Better ELD compliance and safer operations.",
    painPoints: ["Passenger safety", "Billable-hour verification", "Compliance pressure"],
    solutions: ["Driver behavior monitoring", "Arrival/departure proof", "Automated reporting"],
    link: "https://www.verizonconnect.com/resources/case-study/redwey-transport/"
  },
  {
    id: "plumbing_hvac",
    type: "industry",
    title: "Plumbing & HVAC",
    color: "#0891b2",
    company: "Bill Howe Plumbing",
    quote: "Fleet visibility helped significantly reduce annual accidents.",
    impact: "Lower risk exposure and improved dispatch efficiency.",
    painPoints: ["Emergency response", "Hours verification", "After-hours usage"],
    solutions: ["Closest-driver routing", "Time verification", "Usage oversight"],
    link: "https://www.verizonconnect.com/resources/case-study/bill-howe-plumbing-decreases-annual-accidents/"
  },
  {
    id: "pest_control",
    type: "industry",
    title: "Pest Control",
    color: "#047857",
    company: "Pest & Termite Consultants",
    quote: "Proof-of-service reporting helped resolve customer disputes instantly.",
    impact: "Higher trust and fewer service disputes.",
    painPoints: ["No-show claims", "Tech tracking", "Route inefficiency"],
    solutions: ["Proof of service", "Route replay", "Faster customer response"],
    link: "https://www.verizonconnect.com/resources/case-study/pest-termite-consultants/"
  },
  {
    id: "construction",
    type: "industry",
    title: "Construction",
    color: "#eab308",
    company: "J&M Contracting",
    quote: "An alert led to quick recovery of high-value equipment.",
    impact: "$50K asset protected from theft loss.",
    painPoints: ["Asset theft", "Unverified usage", "Job cost control"],
    solutions: ["Asset tracking", "Geofences", "Utilization reports"],
    link: "https://www.verizonconnect.com/resources/case-study/jm-contracting/"
  },
  {
    id: "oil_fields",
    type: "industry",
    title: "Oil Fields",
    color: "#374151",
    company: "3C Oilfield Services",
    quote: "Knowing teammate locations improved incident response in remote areas.",
    impact: "Improved lone-worker safety and response readiness.",
    painPoints: ["Remote operations", "Lone worker risk", "Asset maintenance"],
    solutions: ["Live location visibility", "Safer dispatch", "Maintenance scheduling"],
    link: "https://www.verizonconnect.com/resources/case-study/3c-oilfield-services-llc/"
  },
  {
    id: "safety",
    type: "roi",
    title: "Safety & Insurance",
    color: "#1d4ed8",
    company: "B.A.M. Trucking",
    quote: "Video evidence helped contest claims and lower insurance exposure.",
    impact: "Reduced risk and supported claims defense.",
    painPoints: ["False claims", "Insurance costs", "Driver safety"],
    solutions: ["Dashcams", "Safety coaching", "Driver scorecards"],
    link: "https://www.verizonconnect.com/resources/case-study/bam-trucking/"
  },
  {
    id: "theft",
    type: "roi",
    title: "Theft & Asset Recovery",
    color: "#dc2626",
    company: "J&M Contracting",
    quote: "Location data enabled fast police support and asset recovery.",
    impact: "Reduced theft downtime and avoided replacement costs.",
    painPoints: ["Asset theft", "High deductibles", "Unauthorized usage"],
    solutions: ["Movement alerts", "Geofence breaches", "Asset trackers"],
    link: "https://www.verizonconnect.com/resources/case-study/jm-contracting/"
  },
  {
    id: "payroll",
    type: "roi",
    title: "Payroll Savings",
    color: "#15803d",
    company: "Concrete Coring Company",
    quote: "Automated time verification reduced payroll leakage.",
    impact: "Lower labor waste and cleaner time records.",
    painPoints: ["Manual logs", "Rounded timecards", "Overtime uncertainty"],
    solutions: ["Automated timestamps", "Route history checks", "Smart reports"],
    link: "https://www.verizonconnect.com/resources/case-study/fleetmatics-gps-tracking-helps-concrete-coring-company-beat-economic-recession/"
  },
  {
    id: "fuel",
    type: "roi",
    title: "Fuel Savings",
    color: "#4f46e5",
    company: "Tree-care Company",
    quote: "Route and idling controls reduced monthly fuel spend significantly.",
    impact: "Approx. $2,000 monthly fuel savings.",
    painPoints: ["Idling", "Inefficient routes", "Traffic delays"],
    solutions: ["Idling alerts", "Route optimization", "Traffic overlays"],
    link: "https://www.verizonconnect.com/resources/case-study/tree-care-company-cuts-fuel-costs-by-2000-a-month-with-gps-fleet-management/"
  },
  {
    id: "revenue",
    type: "roi",
    title: "Increase Revenue",
    color: "#9333ea",
    company: "Pool Sure",
    quote: "Fleet optimization enabled more daily jobs without adding vehicles.",
    impact: "Higher daily capacity and stronger utilization.",
    painPoints: ["Missed opportunities", "Limited emergency capacity", "Low utilization"],
    solutions: ["Nearest-tech dispatch", "More jobs per day", "Fleet visibility"],
    link: "https://www.verizonconnect.com/resources/case-study/poolsure/"
  }
];

let activeType = "industry";
let searchText = "";
let selected = null;

const grid = document.getElementById("grid");
const search = document.getElementById("search");
const tabs = Array.from(document.querySelectorAll(".tab"));

const detailOverlay = document.getElementById("detail-overlay");
const detailTitle = document.getElementById("detail-title");
const detailCompany = document.getElementById("detail-company");
const detailQuote = document.getElementById("detail-quote");
const detailImpact = document.getElementById("detail-impact");
const detailPains = document.getElementById("detail-pains");
const detailSolutions = document.getElementById("detail-solutions");
const detailLink = document.getElementById("detail-link");
const closeDetail = document.getElementById("close-detail");

function getFiltered() {
  return CASES.filter((item) => item.type === activeType).filter((item) => {
    if (!searchText) return true;
    const s = searchText.toLowerCase();
    return (
      item.title.toLowerCase().includes(s) ||
      item.company.toLowerCase().includes(s) ||
      item.quote.toLowerCase().includes(s) ||
      item.painPoints.some((p) => p.toLowerCase().includes(s))
    );
  });
}

function renderCards() {
  const items = getFiltered();
  if (items.length === 0) {
    grid.innerHTML = '<div class="empty">No case studies found for this filter.</div>';
    return;
  }
  grid.innerHTML = items
    .map(
      (item) => `
      <article class="card" style="border-top-color:${item.color}">
        <div class="meta">${item.type === "industry" ? "Industry" : "ROI / Pain Point"}</div>
        <h3>${item.title}</h3>
        <p class="quote"><strong>${item.company}:</strong> "${item.quote}"</p>
        <div class="tags">${item.painPoints.map((p) => `<span class="tag">${p}</span>`).join("")}</div>
        <button class="view-btn" type="button" data-id="${item.id}">View Details</button>
      </article>
    `
    )
    .join("");

  Array.from(document.querySelectorAll(".view-btn")).forEach((btn) => {
    btn.addEventListener("click", () => openDetail(btn.dataset.id));
  });
}

function openDetail(id) {
  selected = CASES.find((c) => c.id === id);
  if (!selected) return;
  detailTitle.textContent = selected.title;
  detailCompany.textContent = selected.company;
  detailQuote.textContent = `"${selected.quote}"`;
  detailImpact.textContent = `Impact: ${selected.impact}`;
  detailPains.innerHTML = selected.painPoints.map((p) => `<li>${p}</li>`).join("");
  detailSolutions.innerHTML = selected.solutions.map((s) => `<li>${s}</li>`).join("");
  detailLink.href = selected.link || "#";
  detailOverlay.classList.remove("hidden");
}

function closeModal() {
  detailOverlay.classList.add("hidden");
  selected = null;
}

search.addEventListener("input", (e) => {
  searchText = e.target.value.trim();
  renderCards();
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activeType = tab.dataset.tab;
    tabs.forEach((t) => t.classList.toggle("active", t === tab));
    renderCards();
  });
});

closeDetail.addEventListener("click", closeModal);
detailOverlay.addEventListener("click", (e) => {
  if (e.target === detailOverlay) closeModal();
});

renderCards();