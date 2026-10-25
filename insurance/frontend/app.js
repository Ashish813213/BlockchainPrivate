const $ = (s) => document.querySelector(s);
const state = { accounts: [], status: null };
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
async function api(path, opts = {}) {
  const res = await fetch("/api" + path, { method: opts.method || "GET", headers: { "Content-Type": "application/json" }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
function toast(message, error = false) { const el = $("#toast"); el.textContent = message; el.className = error ? "show error" : "show"; setTimeout(() => el.className = "", 3500); }
async function load() {
  state.status = await api("/status");
  $("#net").textContent = `chain ${state.status.chainId} · block ${state.status.blockNumber}`;
  $("#count").textContent = state.status.policyCount;
  $("#balance").textContent = `${state.status.balance} ETH`;
  $("#block").textContent = state.status.blockNumber;
  state.accounts = (await api("/accounts")).accounts;
  $("#holder").innerHTML = state.accounts.map((a) => `<option value="${a.address}">${short(a.address)} · ${Number(a.eth).toFixed(3)} ETH</option>`).join("");
  const { policies } = await api("/policies");
  state.policies = policies;
  $("#policies").innerHTML = policies.length ? policies.map((p) => `<article><h3>Policy #${p.id} <span>${p.active ? "active" : "paid"}</span></h3><p>Holder: ${short(p.holder)} · Premium: ${p.premium} ETH · Coverage: ${p.coverage} ETH</p><p>${p.claimed ? "Claim submitted" : "No claim submitted"}</p><div>${!p.claimed && p.active ? `<button data-claim="${p.id}">Submit claim</button>` : ""}${p.claimed && p.active ? `<button data-approve="${p.id}">Approve payout</button>` : ""}</div></article>`).join("") : "<p class='hint'>No policies yet.</p>";
  document.querySelectorAll("[data-claim]").forEach((b) => b.onclick = () => claim(Number(b.dataset.claim)));
  document.querySelectorAll("[data-approve]").forEach((b) => b.onclick = () => approve(Number(b.dataset.approve)));
}
async function claim(id) {
  const amount = prompt("Claim amount in ETH (up to the coverage amount):", "0.05");
  if (!amount) return;
  try { await api(`/policies/${id}/claims`, { method: "POST", body: { holder: state.policies[id].holder, amount } }); toast("Claim submitted"); await load(); } catch (e) { toast(e.message, true); }
}
async function approve(id) {
  const amount = prompt("Payout amount in ETH:", "0.05");
  if (!amount) return;
  try { await api(`/policies/${id}/approve`, { method: "POST", body: { owner: state.status.owner, amount } }); toast("Claim paid"); await load(); } catch (e) { toast(e.message, true); }
}
$("#buy").onclick = async () => {
  try { await api("/policies", { method: "POST", body: { holder: $("#holder").value, premium: $("#premium").value, coverage: $("#coverage").value } }); toast("Policy purchased"); await load(); } catch (e) { toast(e.message, true); }
};
load().catch((e) => toast(e.message, true));
