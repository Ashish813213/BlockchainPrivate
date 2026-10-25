const $ = (s) => document.querySelector(s);
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "–");

const state = {
  mode: "api",
  status: null,
  abis: null,
  addresses: null,
  accounts: [],
  selectedAccount: null,
  wallet: { account: null, provider: null, token: null, poll: null },
};

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
function toast(message, isError = false) {
  const el = $("#toast");
  el.textContent = message;
  el.className = `toast show${isError ? " err" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.className = "toast", 4000);
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

/* ---------- tabs ---------- */
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    $("#tab-" + tab.dataset.tab).classList.add("active");
  });
});

/* ---------- reads ---------- */
async function loadStatus() {
  const status = await api("/status");
  state.status = status;
  state.addresses = status.contracts;
  $("#netBadge").textContent = `chain ${status.chainId} · block ${status.blockNumber}`;
  $("#netBadge").className = "badge";
  $("#statBlock").textContent = status.blockNumber;
  $("#statChain").textContent = status.chainId;
  $("#statSupply").textContent = `${Number(status.token.totalSupply).toLocaleString()} ${status.token.symbol}`;
  $("#statProposals").textContent = status.proposalCount;
  $("#ctAddr").textContent = status.contracts.ChainToken.address;
  $("#ctName").textContent = `${status.token.name} (${status.token.symbol})`;
  $("#ctSym").textContent = status.token.decimals;
  $("#ctOwner").textContent = status.token.owner;
  $("#pollAddr").textContent = status.contracts.Poll.address;
  $("#pollOwner").textContent = status.deployer;
  $("#pollDate").textContent = new Date(status.deployedAt).toLocaleString();
}

async function loadAccounts() {
  const { accounts } = await api("/accounts");
  state.accounts = accounts;
  if (!state.selectedAccount && accounts.length) state.selectedAccount = accounts[0].address;

  $("#transferFrom").innerHTML = accounts
    .map((a) => `<option value="${a.address}" ${a.address === state.selectedAccount ? "selected" : ""}>${short(a.address)} · ${Number(a.token).toLocaleString()} token</option>`)
    .join("");

  $("#accountRows").innerHTML = accounts
    .map(
      (a) => `<tr>
        <td class="addr">${a.address}</td>
        <td>${Number(a.eth).toFixed(4)}</td>
        <td>${Number(a.token).toLocaleString()}</td>
        <td><button class="btn small" data-use="${a.address}">${a.address === state.selectedAccount ? "selected" : "use"}</button></td>
      </tr>`
    )
    .join("");

  document.querySelectorAll("[data-use]").forEach((b) =>
    b.addEventListener("click", () => {
      state.selectedAccount = b.dataset.use;
      loadAccounts();
      renderFooter();
      toast(`Sender set to ${short(b.dataset.use)}`);
    })
  );
}

async function loadTransfers() {
  const { transfers } = await api("/token/transfers");
  $("#transferRows").innerHTML = transfers.length
    ? transfers
        .map(
          (t) => `<tr>
            <td>${t.block}</td>
            <td class="addr" title="${t.from}">${short(t.from)}</td>
            <td class="addr" title="${t.to}">${short(t.to)}</td>
            <td>${Number(t.value).toLocaleString()}</td>
            <td class="addr" title="${t.hash}">${short(t.hash)}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="5">No transfers yet.</td></tr>`;
}

async function loadProposals() {
  const data = await api("/poll/proposals");
  $("#statVotes").textContent = data.totalVotes;
  $("#statProposals").textContent = data.proposals.length;

  let voted = [];
  const voter = state.mode === "wallet" ? state.wallet.account : state.selectedAccount;
  if (voter) {
    try {
      voted = (await api(`/poll/voted/${voter}`)).hasVoted;
    } catch (_) {}
  }
  $("#voteAccount").textContent = voter ? `Voting as ${short(voter)}` : "No voter selected";

  const max = Math.max(1, ...data.proposals.map((p) => p.votes));
  $("#proposalList").innerHTML = data.proposals.length
    ? data.proposals
        .map(
          (p, i) => `<div class="proposal">
            <header>
              <h3>#${p.id} · ${p.title}</h3>
              ${voted[i] ? '<span class="voted-tag">voted ✓</span>' : ""}
            </header>
            <p>${p.description || "—"}</p>
            <div class="bar"><i style="width:${(p.votes / max) * 100}%"></i></div>
            <div class="meta">
              <span>${p.votes} vote${p.votes === 1 ? "" : "s"}</span>
              <button class="btn small" data-vote="${p.id}" ${voted[i] ? "disabled" : ""}>Vote</button>
            </div>
          </div>`
        )
        .join("")
    : "<p class='muted'>No proposals yet.</p>";

  document.querySelectorAll("[data-vote]").forEach((b) =>
    b.addEventListener("click", () => castVote(Number(b.dataset.vote), b))
  );
}

function renderFooter() {
  $("#modeLabel").textContent = state.mode === "wallet" ? "Mode: wallet (MetaMask)" : "Mode: backend API (node accounts)";
  const acct = state.mode === "wallet" ? state.wallet.account : state.selectedAccount;
  $("#accountLabel").textContent = acct ? `Account ${acct}` : "No account selected";
}

/* ---------- writes ---------- */
async function contractsForWrite() {
  if (state.mode === "wallet") return { token: state.wallet.token, poll: state.wallet.poll };
  return { token: null, poll: null };
}

async function transferTokens(btn) {
  const done = busy(btn, "Sending…");
  try {
    const to = $("#transferTo").value.trim();
    const amount = $("#transferAmount").value.trim();
    if (!to || !amount) throw new Error("Recipient and amount are required");
    let hash;
    if (state.mode === "wallet") {
      const tx = await state.wallet.token.transfer(to, ethers.parseUnits(amount, 18));
      const receipt = await tx.wait();
      hash = receipt.hash;
    } else {
      const res = await api("/token/transfer", { method: "POST", body: { from: state.selectedAccount, to, amount } });
      hash = res.hash;
    }
    toast(`Transferred ${amount} token · tx ${short(hash)}`);
    await Promise.all([loadStatus(), loadAccounts(), loadTransfers()]);
  } catch (err) {
    toast(err.message, true);
  } finally {
    done();
  }
}

async function mintTokens(btn) {
  const done = busy(btn, "Minting…");
  try {
    const to = $("#mintTo").value.trim();
    const amount = $("#mintAmount").value.trim();
    if (!to || !amount) throw new Error("Recipient and amount are required");
    let hash;
    if (state.mode === "wallet") {
      const tx = await state.wallet.token.mint(to, ethers.parseUnits(amount, 18));
      hash = (await tx.wait()).hash;
    } else {
      hash = (await api("/token/mint", { method: "POST", body: { to, amount } })).hash;
    }
    toast(`Minted ${amount} token · tx ${short(hash)}`);
    await Promise.all([loadStatus(), loadAccounts(), loadTransfers()]);
  } catch (err) {
    toast(err.message, true);
  } finally {
    done();
  }
}

async function castVote(id, btn) {
  const done = busy(btn, "Voting…");
  try {
    let hash;
    if (state.mode === "wallet") {
      const tx = await state.wallet.poll.vote(id);
      hash = (await tx.wait()).hash;
    } else {
      hash = (await api("/poll/vote", { method: "POST", body: { proposalId: id, voter: state.selectedAccount } })).hash;
    }
    toast(`Voted on #${id} · tx ${short(hash)}`);
    await Promise.all([loadProposals(), loadStatus()]);
  } catch (err) {
    toast(err.message, true);
  } finally {
    done();
  }
}

async function createProposal(btn) {
  const done = busy(btn, "Creating…");
  try {
    const title = $("#propTitle").value.trim();
    const description = $("#propDesc").value.trim();
    if (!title) throw new Error("Title is required");
    let hash;
    if (state.mode === "wallet") {
      const tx = await state.wallet.poll.createProposal(title, description);
      hash = (await tx.wait()).hash;
    } else {
      hash = (await api("/poll/proposals", { method: "POST", body: { title, description } })).hash;
    }
    toast(`Proposal created · tx ${short(hash)}`);
    $("#propTitle").value = "";
    $("#propDesc").value = "";
    await Promise.all([loadProposals(), loadStatus()]);
  } catch (err) {
    toast(err.message, true);
  } finally {
    done();
  }
}

/* ---------- wallet ---------- */
async function connectWallet() {
  if (!window.ethereum) {
    toast("No wallet found. Install MetaMask, or stay in backend API mode.", true);
    return;
  }
  try {
    const wanted = state.status.chainId;
    const chainHex = "0x" + wanted.toString(16);
    const current = await window.ethereum.request({ method: "eth_chainId" });
    if (parseInt(current, 16) !== wanted) {
      try {
        await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainHex }] });
      } catch (_) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: chainHex, chainName: "Hardhat Local", rpcUrls: [state.status.rpcUrl], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } }],
        });
      }
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();

    state.wallet.provider = provider;
    state.wallet.account = ethers.getAddress(accounts[0]);
    state.wallet.token = new ethers.Contract(state.addresses.ChainToken.address, state.abis.ChainToken, signer);
    state.wallet.poll = new ethers.Contract(state.addresses.Poll.address, state.abis.Poll, signer);
    state.mode = "wallet";

    $("#walletBtn").textContent = short(state.wallet.account);
    $("#walletBtn").classList.remove("ghost");
    renderFooter();
    toast(`Wallet connected: ${short(state.wallet.account)}`);
    await loadProposals();
  } catch (err) {
    toast(err.message, true);
  }
}

if (window.ethereum) {
  window.ethereum.on?.("accountsChanged", () => {
    if (state.mode === "wallet") connectWallet();
  });
}

/* ---------- wire up ---------- */
$("#walletBtn").addEventListener("click", connectWallet);
$("#balBtn").addEventListener("click", async () => {
  try {
    const addr = $("#balAddr").value.trim();
    if (!addr) throw new Error("Enter an address");
    const b = await api(`/token/balance/${addr}`);
    $("#balResult").innerHTML = `<strong>${Number(b.token).toLocaleString()} token</strong><br>${b.eth} ETH<br><span class="muted">${b.address}</span>`;
  } catch (err) {
    toast(err.message, true);
  }
});
$("#transferBtn").addEventListener("click", (e) => transferTokens(e.currentTarget));
$("#mintBtn").addEventListener("click", (e) => mintTokens(e.currentTarget));
$("#propBtn").addEventListener("click", (e) => createProposal(e.currentTarget));
$("#refreshTransfers").addEventListener("click", () => loadTransfers().catch((e) => toast(e.message, true)));
$("#transferFrom").addEventListener("change", (e) => {
  state.selectedAccount = e.target.value;
  renderFooter();
});

async function init() {
  try {
    await loadStatus();
    state.abis = await api("/abi");
    await Promise.all([loadAccounts(), loadTransfers(), loadProposals()]);
    renderFooter();
  } catch (err) {
    $("#netBadge").textContent = "backend offline";
    $("#netBadge").className = "badge off";
    toast(err.message + " — start the chain and backend (npm run node / deploy / backend)", true);
  }
}

init();
setInterval(() => loadStatus().catch(() => {}), 8000);
