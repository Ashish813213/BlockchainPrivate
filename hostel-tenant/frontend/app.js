const $ = (s) => document.querySelector(s);
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "–");

const state = { status: null, rooms: [], accounts: [], actor: null };

async function api(path, opts = {}) {
  const res = await fetch("/api" + path, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch (_) {}
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

let toastTimer;
function toast(msg, err = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast show${err ? " err" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 4000);
}

function busy(btn, label = "Working…") {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  return () => {
    btn.disabled = false;
    btn.textContent = original;
  };
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    $("#tab-" + tab.dataset.tab).classList.add("active");
  });
});

async function loadStatus() {
  const s = await api("/status");
  state.status = s;
  $("#netBadge").textContent = `chain ${s.chainId} · block ${s.blockNumber}`;
  $("#stBlock").textContent = s.blockNumber;
  $("#stRooms").textContent = s.roomCount;
  $("#stBalance").textContent = `${Number(s.contractBalance).toFixed(4)} ETH`;
  $("#contractLabel").textContent = `Contract: ${s.address}`;
  $("#ownerLabel").textContent = `Owner: ${s.owner}`;
  $("#stOccupied").textContent = state.rooms.filter((r) => r.occupied).length;
}

async function loadAccounts() {
  const { accounts } = await api("/accounts");
  state.accounts = accounts;
  if (!state.actor) state.actor = accounts[0]?.address;
  const options = accounts
    .map((a) => `<option value="${a.address}" ${a.address === state.actor ? "selected" : ""}>${a.address} · ${Number(a.eth).toFixed(4)} ETH</option>`)
    .join("");
  $("#actor").innerHTML = options;
  $("#assignTenant").innerHTML = options;
  $("#actorLabel").textContent = short(state.actor);
  $("#accRows").innerHTML = accounts
    .map((a) => `<tr><td>${a.address}</td><td>${Number(a.eth).toFixed(4)}</td></tr>`)
    .join("");
}

function renderRooms() {
  const isOwner = state.actor && state.status && state.actor.toLowerCase() === state.status.owner.toLowerCase();
  $("#stOccupied").textContent = state.rooms.filter((r) => r.occupied).length;
  $("#assignRoom").innerHTML = state.rooms
    .filter((r) => !r.occupied)
    .map((r) => `<option value="${r.id}">Room #${r.id} · ${r.rent} ETH</option>`)
    .join("") || "<option value=''>no free rooms</option>";

  $("#roomGrid").innerHTML = state.rooms.length
    ? state.rooms
        .map((r) => {
          const mine = state.actor && r.tenant.toLowerCase() === state.actor.toLowerCase();
          return `<article class="room ${r.occupied ? "" : "empty"}">
            <header>
              <h3>Room #${r.id}</h3>
              <span class="pill ${r.occupied ? "on" : "off"}">${r.occupied ? "occupied" : "vacant"}</span>
            </header>
            <div class="rent">${r.rent} ETH / month</div>
            <dl>
              <dt>Tenant</dt><dd>${r.occupied ? r.tenantName : "—"}</dd>
              <dt>Wallet</dt><dd>${r.occupied ? short(r.tenant) : "—"}</dd>
              <dt>Months paid</dt><dd>${r.monthsPaid}</dd>
              <dt>Last rent</dt><dd>${r.lastPayment ? new Date(r.lastPayment * 1000).toLocaleDateString() : "—"}</dd>
            </dl>
            <div class="actions">
              ${r.occupied ? `<button class="btn primary" data-pay="${r.id}" title="${mine ? "" : "Switch the acting account to the tenant to pay"}" ${mine ? "" : "disabled"}>Pay rent</button>` : ""}
              ${r.occupied && isOwner ? `<button class="btn danger" data-vacate="${r.id}">Vacate</button>` : ""}
            </div>
          </article>`;
        })
        .join("")
    : "<p class='hint'>No rooms yet — add one in the Manage tab.</p>";

  document.querySelectorAll("[data-pay]").forEach((b) =>
    b.addEventListener("click", () => payRent(Number(b.dataset.pay), b))
  );
  document.querySelectorAll("[data-vacate]").forEach((b) =>
    b.addEventListener("click", () => vacate(Number(b.dataset.vacate), b))
  );
}

async function loadPayments() {
  const { payments } = await api("/payments");
  $("#payRows").innerHTML = payments.length
    ? payments
        .map(
          (p) => `<tr>
            <td>${p.block}</td>
            <td>#${p.roomId}</td>
            <td title="${p.payer}">${short(p.payer)}</td>
            <td>${p.amount}</td>
            <td>${p.monthsPaid}</td>
            <td title="${p.hash}">${short(p.hash)}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="6">No rent paid yet.</td></tr>`;
}

async function payRent(roomId, btn) {
  const done = busy(btn, "Paying…");
  try {
    const r = await api(`/rooms/${roomId}/pay`, { method: "POST", body: { payer: state.actor } });
    toast(`Rent ${r.amount} ETH paid for room #${roomId} · tx ${short(r.hash)}`);
    await Promise.all([loadRooms(), loadPayments(), loadStatus(), loadAccounts()]);
  } catch (e) {
    toast(e.message, true);
  } finally {
    done();
  }
}

async function vacate(roomId, btn) {
  const done = busy(btn, "Vacating…");
  try {
    const r = await api(`/rooms/${roomId}/vacate`, { method: "POST", body: { sender: state.actor } });
    toast(`Room #${roomId} vacated · tx ${short(r.hash)}`);
    await Promise.all([loadRooms(), loadStatus()]);
  } catch (e) {
    toast(e.message, true);
  } finally {
    done();
  }
}

async function loadRooms() {
  const { rooms } = await api("/rooms");
  state.rooms = rooms;
  renderRooms();
}

$("#actor").addEventListener("change", (e) => {
  state.actor = e.target.value;
  $("#actorLabel").textContent = short(state.actor);
  renderRooms();
});

$("#addRoomBtn").addEventListener("click", async (e) => {
  const done = busy(e.currentTarget, "Adding…");
  try {
    const rentEth = $("#newRent").value.trim();
    if (!rentEth) throw new Error("Enter a rent amount");
    const r = await api("/rooms", { method: "POST", body: { rentEth, sender: state.actor } });
    toast(`Room added · tx ${short(r.hash)}`);
    $("#newRent").value = "";
    await Promise.all([loadRooms(), loadStatus()]);
  } catch (err) {
    toast(err.message, true);
  } finally {
    done();
  }
});

$("#assignBtn").addEventListener("click", async (e) => {
  const done = busy(e.currentTarget, "Assigning…");
  try {
    const roomId = $("#assignRoom").value;
    const tenant = $("#assignTenant").value;
    const tenantName = $("#assignName").value.trim();
    if (roomId === "" || !tenantName) throw new Error("Pick a room and enter a tenant name");
    const r = await api(`/rooms/${roomId}/occupy`, { method: "POST", body: { tenant, tenantName, sender: state.actor } });
    toast(`Tenant assigned to room #${roomId} · tx ${short(r.hash)}`);
    $("#assignName").value = "";
    await Promise.all([loadRooms(), loadStatus()]);
  } catch (err) {
    toast(err.message, true);
  } finally {
    done();
  }
});

$("#refreshPay").addEventListener("click", () => loadPayments().catch((e) => toast(e.message, true)));

async function init() {
  try {
    await loadStatus();
    await Promise.all([loadAccounts(), loadRooms(), loadPayments()]);
    renderRooms();
  } catch (e) {
    $("#netBadge").textContent = "backend offline";
    $("#netBadge").className = "badge off";
    toast(e.message, true);
  }
}

init();
setInterval(() => loadStatus().catch(() => {}), 8000);
