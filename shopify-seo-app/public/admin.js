(function () {
  "use strict";

  const content = document.getElementById("content");

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }

  async function api(path, options = {}) {
    const res = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...options.headers } });
    if (res.status === 401) {
      window.location.href = "/admin/login";
      throw new Error("Not authenticated");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed with status ${res.status}`);
    return data;
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString();
  }

  async function renderShopsTable() {
    const shops = await api("/api/admin/shops");
    const rows = shops
      .map(
        (s) => `
        <tr>
          <td>${escapeHtml(s.shop)}</td>
          <td>${escapeHtml(s.scope || "—")}</td>
          <td>${fmtDate(s.installedAt)}</td>
          <td>${fmtDate(s.updatedAt)}</td>
          <td>${s.hasAccessToken ? "yes" : "no"}</td>
          <td><button class="secondary" data-revoke="${encodeURIComponent(s.shop)}">Revoke locally</button></td>
        </tr>`
      )
      .join("");

    return `
      <div class="card">
        <h3 style="margin-top:0">Installed shops (${shops.length})</h3>
        <table>
          <thead>
            <tr><th>Shop</th><th>Scope</th><th>Installed</th><th>Last updated</th><th>Has token</th><th></th></tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="6">No shops have installed the app yet.</td></tr>`}</tbody>
        </table>
        <p style="font-size:13px;color:var(--color-subdued);margin-top:12px">
          "Revoke locally" deletes this app's stored session for the shop, so it
          will need to reinstall to use the app again. It does not uninstall the
          app from the merchant's store — merchants do that from their Shopify
          admin, which fires the <code>app/uninstalled</code> webhook automatically.
        </p>
      </div>`;
  }

  function renderStatusCard(status) {
    const configuredBadge = status.configured
      ? `<span class="badge good">Configured</span>`
      : `<span class="badge critical">Missing: ${escapeHtml(status.missingEnv.join(", "))}</span>`;
    return `
      <div class="card">
        <h3 style="margin-top:0">App status ${configuredBadge}</h3>
        <table>
          <tbody>
            <tr><td>Public host</td><td>${escapeHtml(status.host)}</td></tr>
            <tr><td>Admin API version</td><td>${escapeHtml(status.apiVersion)}</td></tr>
            <tr><td>Requested scopes</td><td>${escapeHtml(status.scopes.join(", "))}</td></tr>
            <tr><td>Installed shops</td><td>${status.installedShopCount}</td></tr>
          </tbody>
        </table>
      </div>`;
  }

  async function render() {
    try {
      const [status, shopsHtml] = await Promise.all([api("/api/admin/status"), renderShopsTable()]);
      content.innerHTML = renderStatusCard(status) + shopsHtml;

      content.querySelectorAll("[data-revoke]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!window.confirm(`Delete the locally stored session for ${decodeURIComponent(btn.dataset.revoke)}?`)) return;
          btn.disabled = true;
          try {
            await api(`/api/admin/shops/${btn.dataset.revoke}/revoke`, { method: "POST" });
            render();
          } catch (err) {
            alert(`Failed to revoke: ${err.message}`);
            btn.disabled = false;
          }
        });
      });
    } catch (err) {
      content.innerHTML = `<p class="error">${escapeHtml(err.message)}</p>`;
    }
  }

  render();
})();
