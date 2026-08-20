(function () {
  "use strict";

  const content = document.getElementById("content");
  const tabsEl = document.getElementById("tabs");

  const RESOURCE_LABELS = {
    product: "Products",
    collection: "Collections",
    page: "Pages",
    article: "Blog posts",
  };

  // ---------------------------------------------------------------------
  // Session token plumbing (App Bridge)
  // ---------------------------------------------------------------------
  function hasAppBridge() {
    return typeof window.shopify !== "undefined" && typeof window.shopify.idToken === "function";
  }

  async function getSessionToken() {
    if (!hasAppBridge()) {
      throw new Error("This app must be opened from inside the Shopify admin.");
    }
    return window.shopify.idToken();
  }

  async function api(path, options = {}) {
    const token = await getSessionToken();
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Request failed with status ${response.status}`);
    }
    return data;
  }

  // ---------------------------------------------------------------------
  // Tiny hash router
  // ---------------------------------------------------------------------
  function parseHash() {
    const hash = window.location.hash.replace(/^#\/?/, "");
    const [view, a, b] = hash.split("/").filter(Boolean);
    return { view: view || "dashboard", type: a, id: b ? decodeURIComponent(b) : undefined };
  }

  function navigate(path) {
    window.location.hash = path;
  }

  window.addEventListener("hashchange", render);

  function setActiveTab(view, type) {
    for (const btn of tabsEl.querySelectorAll(".tab")) {
      const target = btn.dataset.view;
      btn.classList.toggle("active", target === (type || view));
    }
  }

  tabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    const view = btn.dataset.view;
    navigate(view === "dashboard" || view === "sitemap" ? `/${view}` : `/list/${view}`);
  });

  // ---------------------------------------------------------------------
  // Rendering helpers
  // ---------------------------------------------------------------------
  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  function badge(status, text) {
    return `<span class="badge ${status}">${escapeHtml(text)}</span>`;
  }

  function showToast(message) {
    let toast = document.querySelector(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("visible"), 2500);
  }

  function setLoading() {
    content.innerHTML = `<p class="loading">Loading…</p>`;
  }

  function setError(err) {
    content.innerHTML = `<p class="error">${escapeHtml(err.message || String(err))}</p>`;
  }

  // ---------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------
  async function renderDashboard() {
    setActiveTab("dashboard");
    setLoading();
    try {
      const { summary } = await api("/api/dashboard");
      const cards = Object.entries(summary)
        .map(([type, s]) => {
          const scoreClass = s.averageScore == null ? "" : s.averageScore >= 75 ? "good" : s.averageScore >= 50 ? "warning" : "critical";
          return `
            <div class="card stat-card">
              <h3>${escapeHtml(s.label)}</h3>
              <div class="score" style="color: var(--color-${scoreClass || "subdued"})">${s.averageScore ?? "–"}</div>
              <div class="meta">${s.count} item(s) audited · ${s.issues} issue(s) found</div>
              <div class="actions">
                <button class="secondary" data-open-list="${type}">View all</button>
              </div>
            </div>`;
        })
        .join("");

      const worstRows = Object.entries(summary)
        .flatMap(([type, s]) => s.worst.map((w) => ({ type, ...w })))
        .sort((a, b) => a.score - b.score)
        .slice(0, 10)
        .map(
          (w) => `
          <tr class="clickable" data-open-detail="${w.type}/${encodeURIComponent(w.id)}">
            <td>${escapeHtml(RESOURCE_LABELS[w.type])}</td>
            <td>${escapeHtml(w.title)}</td>
            <td>${badgeForScore(w.score)}</td>
          </tr>`
        )
        .join("");

      content.innerHTML = `
        <div class="grid">${cards}</div>
        <div class="card">
          <h3 style="margin-top:0">Lowest-scoring items</h3>
          <table>
            <thead><tr><th>Type</th><th>Title</th><th>Score</th></tr></thead>
            <tbody>${worstRows || `<tr><td colspan="3">Nothing to show yet.</td></tr>`}</tbody>
          </table>
        </div>`;

      content.querySelectorAll("[data-open-list]").forEach((btn) =>
        btn.addEventListener("click", () => navigate(`/list/${btn.dataset.openList}`))
      );
      content.querySelectorAll("[data-open-detail]").forEach((row) =>
        row.addEventListener("click", () => navigate(`/detail/${row.dataset.openDetail}`))
      );
    } catch (err) {
      setError(err);
    }
  }

  function badgeForScore(score) {
    const status = score >= 75 ? "good" : score >= 50 ? "warning" : "critical";
    return badge(status, `${score}`);
  }

  async function renderList(type) {
    setActiveTab(null, type);
    setLoading();
    try {
      const { items } = await api(`/api/${type}`);
      const rows = items
        .map(
          (item) => `
          <tr class="clickable" data-id="${encodeURIComponent(item.id)}">
            <td>${escapeHtml(item.title)}</td>
            <td>${escapeHtml(item.handle)}</td>
            <td>${badgeForScore(item.seo.score)}</td>
            <td>${item.seo.issueCount}</td>
          </tr>`
        )
        .join("");

      content.innerHTML = `
        <h2>${escapeHtml(RESOURCE_LABELS[type] || type)}</h2>
        <table>
          <thead><tr><th>Title</th><th>Handle</th><th>Score</th><th>Issues</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="4">No items found.</td></tr>`}</tbody>
        </table>`;

      content.querySelectorAll("tr[data-id]").forEach((row) =>
        row.addEventListener("click", () => navigate(`/detail/${type}/${row.dataset.id}`))
      );
    } catch (err) {
      setError(err);
    }
  }

  async function renderDetail(type, id) {
    setActiveTab(null, type);
    setLoading();
    try {
      const item = await api(`/api/${type}/${encodeURIComponent(id)}`);
      renderDetailView(type, item);
    } catch (err) {
      setError(err);
    }
  }

  function renderDetailView(type, item) {
    const checksHtml = item.seo.checks
      .map(
        (c) => `
        <div class="check-row">
          <span class="dot ${c.status}"></span>
          <div>
            <strong>${escapeHtml(c.label)}</strong>
            <span>${escapeHtml(c.message)}</span>
          </div>
        </div>`
      )
      .join("");

    const imagesSection =
      type === "product"
        ? `
        <div class="card">
          <h3 style="margin-top:0">Image alt text</h3>
          <p>${item.images.filter((i) => i.alt).length} of ${item.images.length} image(s) have alt text.</p>
          <div class="actions">
            <button class="secondary" id="fix-alt-btn">Auto-fill missing alt text</button>
          </div>
        </div>`
        : "";

    content.innerHTML = `
      <span class="back-link" id="back-link">&larr; Back to ${escapeHtml(RESOURCE_LABELS[type] || type)}</span>
      <h2>${escapeHtml(item.title)}</h2>
      <div class="card">
        <h3 style="margin-top:0">SEO score: ${item.seo.score} (${item.seo.grade})</h3>
        ${checksHtml}
      </div>

      <div class="card">
        <h3 style="margin-top:0">Edit SEO</h3>
        <label for="seo-title">SEO title</label>
        <input type="text" id="seo-title" value="${escapeHtml(item.seoTitle)}" placeholder="${escapeHtml(item.title)}" />
        <div class="char-count"><span id="title-count">${item.seoTitle.length}</span> characters (recommended 30-60)</div>

        <label for="seo-description">Meta description</label>
        <textarea id="seo-description" placeholder="Describe this ${escapeHtml(type)} for search engines">${escapeHtml(item.seoDescription)}</textarea>
        <div class="char-count"><span id="desc-count">${item.seoDescription.length}</span> characters (recommended 70-160)</div>

        <div class="actions">
          <button class="secondary" id="suggest-btn">Use suggested copy</button>
          <button class="primary" id="save-seo-btn">Save SEO title &amp; description</button>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-top:0">URL handle</h3>
        <input type="text" id="handle-input" value="${escapeHtml(item.handle)}" />
        <div class="actions">
          <button class="primary" id="save-handle-btn">Save handle</button>
        </div>
      </div>

      ${imagesSection}
    `;

    document.getElementById("back-link").addEventListener("click", () => navigate(`/list/${type}`));

    const titleInput = document.getElementById("seo-title");
    const descInput = document.getElementById("seo-description");
    titleInput.addEventListener("input", () => {
      document.getElementById("title-count").textContent = titleInput.value.length;
    });
    descInput.addEventListener("input", () => {
      document.getElementById("desc-count").textContent = descInput.value.length;
    });

    document.getElementById("suggest-btn").addEventListener("click", () => {
      titleInput.value = item.suggestions.title;
      descInput.value = item.suggestions.description;
      titleInput.dispatchEvent(new Event("input"));
      descInput.dispatchEvent(new Event("input"));
    });

    document.getElementById("save-seo-btn").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await api(`/api/${type}/${encodeURIComponent(item.id)}/seo`, {
          method: "PUT",
          body: JSON.stringify({ title: titleInput.value, description: descInput.value }),
        });
        showToast("SEO title & description saved.");
        renderDetail(type, item.id);
      } catch (err) {
        showToast(`Failed to save: ${err.message}`);
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById("save-handle-btn").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const handleInput = document.getElementById("handle-input");
      btn.disabled = true;
      try {
        await api(`/api/${type}/${encodeURIComponent(item.id)}/handle`, {
          method: "PUT",
          body: JSON.stringify({ handle: handleInput.value }),
        });
        showToast("Handle updated.");
        renderDetail(type, item.id);
      } catch (err) {
        showToast(`Failed to save: ${err.message}`);
      } finally {
        btn.disabled = false;
      }
    });

    const fixAltBtn = document.getElementById("fix-alt-btn");
    if (fixAltBtn) {
      fixAltBtn.addEventListener("click", async () => {
        fixAltBtn.disabled = true;
        try {
          const result = await api(`/api/product/${encodeURIComponent(item.id)}/images/fix-alt`, { method: "POST" });
          showToast(`Updated alt text on ${result.updated} image(s).`);
          renderDetail(type, item.id);
        } catch (err) {
          showToast(`Failed to fix alt text: ${err.message}`);
        } finally {
          fixAltBtn.disabled = false;
        }
      });
    }
  }

  async function renderSitemap() {
    setActiveTab("sitemap");
    setLoading();
    try {
      const result = await api("/api/sitemap-check");
      const rows = result.checks
        .map(
          (c) => `
          <div class="check-row">
            <span class="dot ${c.status}"></span>
            <div>
              <strong>${escapeHtml(c.id.replace(/_/g, " "))}</strong>
              <span>${escapeHtml(c.message)}</span>
            </div>
          </div>`
        )
        .join("");

      content.innerHTML = `
        <h2>Sitemap &amp; robots.txt</h2>
        <div class="card">
          <p>Checked <strong>${escapeHtml(result.storeUrl)}</strong> — ${result.passed} of ${result.total} checks passed.</p>
          ${rows}
        </div>`;
    } catch (err) {
      setError(err);
    }
  }

  // ---------------------------------------------------------------------
  // Router dispatch
  // ---------------------------------------------------------------------
  async function render() {
    if (!hasAppBridge()) {
      content.innerHTML = `<p class="error">Open this app from inside your Shopify admin (App Bridge is unavailable outside the embedded iframe).</p>`;
      return;
    }

    const { view, type, id } = parseHash();
    if (view === "dashboard") return renderDashboard();
    if (view === "sitemap") return renderSitemap();
    if (view === "list" && type) return renderList(type);
    if (view === "detail" && type && id) return renderDetail(type, id);
    navigate("/dashboard");
  }

  render();
})();
