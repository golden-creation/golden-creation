import { API_BASE_URL, getAdminToken } from "./api";

export function startAdminAuditTracking() {
  let lastPage = "";
  const send = (events) => {
    const token = getAdminToken();
    if (!token || !events.length) return;
    fetch(`${API_BASE_URL}/admin/audit/observations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ events }),
      keepalive: true,
    }).catch(() => {});
  };
  const trackPage = () => {
    const page = `${window.location.pathname}${window.location.search}`;
    if (page === lastPage) return;
    lastPage = page;
    send([{ page, action: "View", label: "page" }]);
  };
  const onClick = (event) => {
    const target = event.target.closest?.("button, a, [role='button']");
    if (!target) return;
    const label = (target.innerText || target.getAttribute("aria-label") || "control").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!label) return;
    send([{ page: window.location.pathname, action: "Click", label }]);
  };
  window.addEventListener("click", onClick, true);
  window.addEventListener("popstate", trackPage);
  const originalPush = history.pushState.bind(history);
  history.pushState = (...args) => {
    const result = originalPush(...args);
    trackPage();
    return result;
  };
  trackPage();
  return () => {
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("popstate", trackPage);
    history.pushState = originalPush;
  };
}
