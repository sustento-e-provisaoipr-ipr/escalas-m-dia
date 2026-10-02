import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue, remove, update } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

// Credenciais
const firebaseConfig = {
  apiKey: "AIzaSyAR30jenqk2rNQ-tjzteURlw2KBIGs7HaQ",
  authDomain: "escalas-midia-aa4ab.firebaseapp.com",
  databaseURL: "https://escalas-midia-aa4ab-default-rtdb.firebaseio.com",
  projectId: "escalas-midia-aa4ab",
  storageBucket: "escalas-midia-aa4ab.firebasestorage.app",
  messagingSenderId: "292407447169",
  appId: "1:292407447169:web:6582c301afcd82f9318780",
  measurementId: "G-H16L7JTJLE"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Utilitários
const $ = (q, el=document) => el.querySelector(q); const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));
const escapeHtml = (s) => (s||"").toString().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const pad2 = (n) => String(n).padStart(2, '0');

let state = { usuarios: { admins: {}, colaboradores: {} }, setores: {}, escalas: {}, trocas: {} };
let currentUser = null;
let current = new Date();

// --- SISTEMA ANTI-F5 (Recupera dados se houver) ---
let selectedYear = sessionStorage.getItem("savedYear") ? parseInt(sessionStorage.getItem("savedYear")) : current.getFullYear();
let selectedMonth = sessionStorage.getItem("savedMonth") ? parseInt(sessionStorage.getItem("savedMonth")) : current.getMonth();
let schedulingData = null;
let swapData = null;
let activeResolveReq = null; // Armazena os dados da troca sendo resolvida pelo admin

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });

// ---------- OTIMIZAÇÃO DE ESCUTA ----------
const listenData = () => {
  onValue(ref(database, 'usuarios'), snap => { state.usuarios = snap.val() || { admins: {}, colaboradores: {} }; if(currentUser) updateViews(); });
  onValue(ref(database, 'setores'), snap => { state.setores = snap.val() || {}; if(currentUser) updateViews(); });
  onValue(ref(database, 'escalas'), snap => { state.escalas = snap.val() || {}; if(currentUser) updateViews(); });
  onValue(ref(database, 'trocas'), snap => { state.trocas = snap.val() || {}; if(currentUser) updateViews(); });
};

// Funções de Banco
const saveSector = async (id, nome, cor) => set(ref(database, `setores/${id}`), { nome, cor });
const updateSector = async (id, nome, cor) => update(ref(database, `setores/${id}`), { nome, cor });
const removeSector = async (id) => remove(ref(database, `setores/${id}`));

const saveSchedule = async (userId, userName, year, month, day, sectorId, sectorName, silent = false) => {
  const path = `escalas/${String(year)}/${pad2(month+1)}/${pad2(day)}/${userId}`;
  if (sectorId) {
    await set(ref(database, path), { nome_colaborador: userName, setor_id: sectorId, setor_nome: sectorName });
    if(!silent) Toast.fire({ icon: 'success', title: 'Escala salva!' });
  } else {
    await remove(ref(database, path));
    if(!silent) Toast.fire({ icon: 'info', title: 'Escala removida.' });
  }
};

// ---------- AUTENTICAÇÃO ----------
const setupAuth = () => {
  const loggedUser = sessionStorage.getItem("logged_user");
  if (loggedUser) { currentUser = JSON.parse(loggedUser); initApp(); }

  $("#showRegister").onclick = () => { $("#formLogin").style.display="none"; $("#formRegister").style.display="block"; };
  $("#showLogin").onclick = () => { $("#formRegister").style.display="none"; $("#formLogin").style.display="block"; };

  $("#btnLogin").onclick = async () => {
    const login = $("#loginUser").value.trim();
    const pass = $("#loginPass").value.trim();
    
    if (login === "au.costa" && pass === "80605276") {
      currentUser = { id: "admin_au_costa", nome: "Aury Costa", login: "au.costa", role: "admins" };
      await set(ref(database, `usuarios/admins/admin_au_costa`), { nome: currentUser.nome, login: currentUser.login, senha: pass });
      sessionStorage.setItem("logged_user", JSON.stringify(currentUser));
      initApp(); return;
    }

    const snap = await get(ref(database, 'usuarios'));
    const dbUsers = snap.val() || { admins: {}, colaboradores: {} };
    let userObj = null; let userRole = null; let userId = null;
    const findIn = (group, roleName) => {
      for (const [id, u] of Object.entries(group || {})) {
        if (u.login === login) { userObj = u; userRole = roleName; userId = id; break; }
      }
    };
    findIn(dbUsers.admins || {}, 'admins');
    if(!userObj) findIn(dbUsers.colaboradores || {}, 'colaboradores');

    if (userObj && userObj.senha === pass) {
      currentUser = { id: userId, nome: userObj.nome, login: userObj.login, role: userRole };
      sessionStorage.setItem("logged_user", JSON.stringify(currentUser));
      Toast.fire({ icon: 'success', title: `Bem-vindo(a), ${currentUser.nome}!` });
      initApp();
    } else {
      Swal.fire('Ops!', 'Usuário ou senha incorretos.', 'error');
    }
  };

  $("#btnRegister").onclick = async () => {
    const nome = $("#regName").value.trim();
    const login = $("#regUser").value.trim();
    const pass = $("#regPass").value.trim();
    if(!nome || !login || !pass) return Swal.fire('Atenção', 'Preencha todos os campos.', 'warning');

    const snap = await get(ref(database, 'usuarios'));
    const dbUsers = snap.val() || { admins: {}, colaboradores: {} };
    const allLogins = [...Object.values(dbUsers.admins || {}), ...Object.values(dbUsers.colaboradores || {})].map(u => u.login);
    if (allLogins.includes(login)) return Swal.fire('Erro', 'Este login já está em uso.', 'error');

    const novoId = "usr_" + Date.now(); 
    await set(ref(database, `usuarios/colaboradores/${novoId}`), { nome, login, senha: pass });
    
    currentUser = { id: novoId, nome, login, role: "colaboradores" };
    sessionStorage.setItem("logged_user", JSON.stringify(currentUser));
    Toast.fire({ icon: 'success', title: 'Cadastro realizado!' });
    initApp();
  };
  $("#btnLogout").onclick = () => { sessionStorage.clear(); location.reload(); }; // Limpa tudo ao sair
};

// ---------- INICIALIZAÇÃO ----------
const initApp = async () => {
  $("#loginOverlay").style.display = "none";
  $("#mainLayout").style.display = "grid";
  $("#currentUserBadge").textContent = `Usuário: ${currentUser.nome}`;
  
  listenData();
  fillPickers();

  if (currentUser.role === "admins") {
    $("#adminSidebar").style.display = "block";
    $("#adminCalendarView").style.display = "block";
    $("#userDashboard").style.display = "none";
    bindAdminEvents();
  } else {
    $("#adminSidebar").style.display = "none";
    $("#adminCalendarView").style.display = "none";
    $("#userDashboard").style.display = "block";
    $("#mainLayout").style.gridTemplateColumns = "1fr";     bindUserEvents();   } };  const fillPickers = () => {   $$("select[id$='year']").forEach(sel => {
    sel.innerHTML = "";
    for(let y=2024; y<=2500; y++) sel.innerHTML += `<option value="${y}" ${y===selectedYear?'selected':''}>${y}</option>`;
    sel.onchange = (e) => { 
      selectedYear = Number(e.target.value); 
      sessionStorage.setItem("savedYear", selectedYear); // Salva o ano para anti-F5
      updateViews(); 
    };
  });
  $$("select[id$='month']").forEach(sel => {
    sel.innerHTML = "";
    for(let m=0; m<12; m++) sel.innerHTML += `<option value="${m}" ${m===selectedMonth?'selected':''}>${MONTHS[m]}</option>`;
    sel.onchange = (e) => { 
      selectedMonth = Number(e.target.value); 
      sessionStorage.setItem("savedMonth", selectedMonth); // Salva o mês para anti-F5
      updateViews(); 
    };
  });
};

const updateViews = () => {
  if (currentUser.role === "admins") {
    updateFiltersOptions();
    renderSectors();
    renderUsers();
    renderAdminCalendars();
    renderSwapsAdmin();
  } else {
    renderUserDashboard();
  }
};

const updateFiltersOptions = () => {
  const selUser = $("#filterUser");
  const selSec = $("#filterSector");
  if(!selUser || !selSec) return;
  
  // Anti-F5 dos Filtros
  const savedFUser = sessionStorage.getItem("savedFUser") || "";
  const savedFSec = sessionStorage.getItem("savedFSec") || "";

  selUser.innerHTML = '<option value="">Todos os Colaboradores</option>';
  const apenasColaboradores = state.usuarios?.colaboradores || {};
  Object.entries(apenasColaboradores).forEach(([uid, u]) => { selUser.innerHTML += `<option value="${uid}">${escapeHtml(u.nome)}</option>`; });
  selUser.value = Object.keys(apenasColaboradores).includes(savedFUser) ? savedFUser : "";

  selSec.innerHTML = '<option value="">Todos os Setores</option>';
  Object.entries(state.setores || {}).forEach(([sid, s]) => { selSec.innerHTML += `<option value="${sid}">${escapeHtml(s.nome)}</option>`; });
  selSec.value = Object.keys(state.setores||{}).includes(savedFSec) ? savedFSec : "";

  selUser.onchange = () => { sessionStorage.setItem("savedFUser", selUser.value); renderAdminCalendars(); };
  selSec.onchange = () => { sessionStorage.setItem("savedFSec", selSec.value); renderAdminCalendars(); };
};

// ---------- MODULOS DO ADMIN ----------
const bindAdminEvents = () => {
  $("#btnAddSector").onclick = async () => {
    const nome = $("#newSectorName").value.trim();
    const cor = $("#newSectorColor").value;
    if(!nome) return Swal.fire('Atenção', 'Digite um nome para o setor.', 'warning');
    await saveSector("sec_" + Date.now(), nome, cor);
    $("#newSectorName").value = ""; Toast.fire({ icon: 'success', title: 'Setor adicionado!' });
  };

  $("#btnAdminAddUser").onclick = () => {
    $("#muId").value = ""; $("#muName").value = ""; $("#muLogin").value = ""; $("#muPass").value = "";
    $("#modalUserTitle").textContent = "Novo Colaborador"; $("#modalUserForm").classList.add("show");
  };
  $("#btnCancelUserForm").onclick = () => $("#modalUserForm").classList.remove("show");

  $("#btnSaveUserForm").onclick = async () => {
    const id = $("#muId").value; const nome = $("#muName").value.trim(); const login = $("#muLogin").value.trim();
    const senha = $("#muPass").value.trim(); const role = $("#muRole").value;

    if(!nome || !login || !senha) return Swal.fire('Atenção', 'Preencha todos os campos.', 'warning');
    
    let exists = false;
    Object.entries({ ...(state.usuarios?.admins || {}), ...(state.usuarios?.colaboradores || {}) }).forEach(([k, v]) => {
      if(v.login === login && k !== id) exists = true;
    });
    if(exists) return Swal.fire('Erro', 'Login já existente.', 'error');

    const usrId = id || ("usr_" + Date.now());
    if(id) {
       let oldRole = state.usuarios?.admins?.[id] ? 'admins' : (state.usuarios?.colaboradores?.[id] ? 'colaboradores' : null);
       if(oldRole && oldRole !== role) await remove(ref(database, `usuarios/${oldRole}/${id}`));
    }
    await set(ref(database, `usuarios/${role}/${usrId}`), { nome, login, senha });
    $("#modalUserForm").classList.remove("show"); Toast.fire({ icon: 'success', title: 'Usuário salvo!' });
  };

  $("#btnCancelSchedule").onclick = () => $("#modalSchedule").classList.remove("show");
  $("#btnSaveSchedule").onclick = async () => {
    const sectorId = $("#schSector").value;
    if(!sectorId) return Swal.fire('Atenção', 'Selecione um setor.', 'warning');
    await saveSchedule(schedulingData.userId, schedulingData.userName, schedulingData.year, schedulingData.month, schedulingData.day, sectorId, state.setores[sectorId].nome);
    $("#modalSchedule").classList.remove("show");
  };
  $("#btnRemoveSchedule").onclick = async () => {
    await saveSchedule(schedulingData.userId, schedulingData.userName, schedulingData.year, schedulingData.month, schedulingData.day, null);
    $("#modalSchedule").classList.remove("show");
  };

  // Eventos de Resolução de Troca (Nova Janela Inteligente)
  $("#btnCancelResolve").onclick = () => $("#modalAdminResolveSwap").classList.remove("show");
  $("#btnRejectSwap").onclick = async () => {
    await remove(ref(database, `trocas/${activeResolveReq.reqId}`));
    $("#modalAdminResolveSwap").classList.remove("show"); Toast.fire({ icon: 'info', title: 'Troca rejeitada.' });
  };
  $("#rsNewDate").onchange = () => updateSwapPreview(); // Atualiza a lista em tempo real ao mudar a data no calendário de troca
  $("#btnConfirmResolve").onclick = async () => {
    const newDt = $("#rsNewDate").value;
    const newSecId = $("#rsNewSector").value;
    const swapTargetId = $("#rsSwapWith").value; // O usuário que vai ceder o lugar, se houver

    if(!newDt || !newSecId) return Swal.fire('Erro', 'Escolha a Nova Data e o Novo Setor para confirmar.', 'error');
    
    const [y, m, d] = newDt.split("-");
    const newSecName = state.setores[newSecId].nome;

    // 1. Apaga a escala original do solicitante
    await saveSchedule(activeResolveReq.uid, activeResolveReq.uname, activeResolveReq.oldY, activeResolveReq.oldM, activeResolveReq.oldD, null, null, true);

    // 2. Se o Admin decidiu Substituir o Fulano pelo Ciclano:
    if (swapTargetId) {
      // Tira o alvo da nova data
      await saveSchedule(swapTargetId, "", parseInt(y), parseInt(m)-1, parseInt(d), null, null, true);
      // Coloca o alvo na data/setor antigo do solicitante (Inverte as posições)
      const targetName = state.usuarios?.colaboradores?.[swapTargetId]?.nome || "Colaborador";
      await saveSchedule(swapTargetId, targetName, activeResolveReq.oldY, activeResolveReq.oldM, activeResolveReq.oldD, activeResolveReq.secId, activeResolveReq.secName, true);
    }

    // 3. Coloca o Solicitante na Nova Data e Novo Setor
    await saveSchedule(activeResolveReq.uid, activeResolveReq.uname, parseInt(y), parseInt(m)-1, parseInt(d), newSecId, newSecName, true);

    // 4. Exclui a notificação de troca
    await remove(ref(database, `trocas/${activeResolveReq.reqId}`));
    $("#modalAdminResolveSwap").classList.remove("show");
    Swal.fire('Sucesso!', 'A troca de escalas foi aplicada perfeitamente no banco de dados.', 'success');
  };
};

// Atualiza visualmente quem já está no dia selecionado no Modal de Troca
const updateSwapPreview = () => {
  const dtVal = $("#rsNewDate").value;
  const list = $("#rsExistingUsers");
  const selTarget = $("#rsSwapWith");
  list.innerHTML = ""; selTarget.innerHTML = `<option value="">Não substituir (Apenas adicionar neste dia)</option>`;

  if(!dtVal) { list.innerHTML = "<div class='small muted'>Escolha uma data acima para ver a equipe.</div>"; return; }
  
  const [y,m,d] = dtVal.split("-");
  const daySch = state.escalas?.[y]?.[m]?.[d] || {};
  const usersInDay = Object.keys(daySch);

  if(usersInDay.length === 0) {
    list.innerHTML = "<div class='small muted'>Ninguém escalado neste dia ainda. O caminho está livre!</div>";
  } else {
    usersInDay.forEach(uid => {
      const shift = daySch[uid];
      list.innerHTML += `<div style="font-size:13px; margin-bottom:4px;">✅ <b>${escapeHtml(shift.nome_colaborador)}</b> (${escapeHtml(shift.setor_nome)})</div>`;
      selTarget.innerHTML += `<option value="${uid}">Trocar lugar com ${escapeHtml(shift.nome_colaborador)}</option>`;
    });
  }
};

const renderSwapsAdmin = () => {
  const panel = $("#adminSwapsPanel"); const box = $("#swapList"); box.innerHTML = "";
  const trocas = Object.entries(state.trocas || {});
  if (trocas.length === 0) { panel.style.display = "none"; return; }
  
  panel.style.display = "block";
  trocas.forEach(([reqId, req]) => {
    const el = document.createElement("div"); el.className = "card"; el.style.flexDirection = "column"; el.style.alignItems = "flex-start";
    
    let suggHtml = req.newDate ? `<b style="color:var(--blue)">${req.newDate.split("-").reverse().join("/")}</b>` : `<b style="color:var(--muted)">Em aberto (Você decide)</b>`;

    el.innerHTML = `
      <div style="font-size:13px;">
        <b>${escapeHtml(req.uname)}</b> deseja alterar o dia <b>${pad2(req.oldD)}/${pad2(req.oldM+1)}/${req.oldY}</b>
        <br>Sugestão para o novo dia: ${suggHtml}
      </div>
      <button class="btn blue btn-resolve" style="width:100%; margin-top:8px; padding:6px; font-size:12px;">Resolver Troca</button>
    `;

    el.querySelector(".btn-resolve").onclick = () => {
      activeResolveReq = { reqId, ...req };
      $("#rsUserName").textContent = req.uname;
      $("#rsOldDate").textContent = `${pad2(req.oldD)}/${pad2(req.oldM+1)}/${req.oldY}`;
      $("#rsOldSector").textContent = req.secName;
      $("#rsSuggDate").textContent = req.newDate ? req.newDate.split("-").reverse().join("/") : "Nenhuma preferência definida";
      
      // Auto preenche a data e os setores
      $("#rsNewDate").value = req.newDate || "";
      const selS = $("#rsNewSector"); selS.innerHTML = "";
      Object.entries(state.setores||{}).forEach(([sid, s]) => { selS.innerHTML += `<option value="${sid}">${escapeHtml(s.nome)}</option>`; });
      selS.value = req.secId; // Preenche com o setor atual da pessoa

      updateSwapPreview();
      $("#modalAdminResolveSwap").classList.add("show");
    };
    box.appendChild(el);
  });
};

const renderSectors = () => {
  const box = $("#sectorList"); box.innerHTML = "";
  Object.entries(state.setores || {}).forEach(([id, sec]) => {
    const el = document.createElement("div"); el.className = "card";
    const cor = sec.cor || '#36c37d';
    el.innerHTML = `
      <div class="meta" style="display:flex; align-items:center; gap:8px;">
        <div style="width:14px; height:14px; border-radius:50%; background:${cor};"></div>
        <div class="name">${escapeHtml(sec.nome)}</div>
      </div>
      <div style="display:flex; gap:5px;">
        <button class="btn ghost btn-edit-sec" style="padding:4px 8px; font-size:12px;">Editar</button>
        <button class="btn ghost danger btn-del-sec" style="padding:4px 8px; font-size:12px;">Excluir</button>
      </div>`;
    el.querySelector(".btn-edit-sec").onclick = async () => {
      const { value: formValues } = await Swal.fire({
        title: 'Editar Setor',
        html: `<input id="swal-input1" class="swal2-input" placeholder="Nome" value="${escapeHtml(sec.nome)}">
               <div style="margin-top:10px;">Cor: <input type="color" id="swal-input2" style="width:50px; height:40px; cursor:pointer;" value="${cor}"></div>`,
        focusConfirm: false, showCancelButton: true, confirmButtonText: 'Salvar',
        preConfirm: () => [document.getElementById('swal-input1').value, document.getElementById('swal-input2').value]
      });
      if (formValues && formValues[0].trim() !== "") { await updateSector(id, formValues[0].trim(), formValues[1]); Toast.fire({ icon: 'success', title: 'Setor atualizado!' }); }
    };
    el.querySelector(".btn-del-sec").onclick = async () => {
      const res = await Swal.fire({ title: 'Excluir Setor?', text: `Remover "${sec.nome}"?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#fb7185' });
      if(res.isConfirmed) await removeSector(id);
    };
    box.appendChild(el);
  });
};

const renderUsers = () => {
  const box = $("#employeeList"); box.innerHTML = "";
  const drawUser = (id, u, roleStr) => {
    const el = document.createElement("div"); el.className = "card";
    const badgeHtml = roleStr === 'admins' ? `<span class="badge" style="background:#fff0f0; color:#dc2626;">Admin</span>` : '';
    el.innerHTML = `
      <div class="meta">
        <div class="name" style="display:flex;align-items:center;gap:6px;">${escapeHtml(u.nome)} ${badgeHtml}</div>
        <div class="sub">Login: <b>${escapeHtml(u.login)}</b></div>
      </div>
      <button class="btn ghost" style="padding:4px 8px; font-size:12px;">Editar</button>`;
    el.querySelector("button").onclick = () => {
      $("#muId").value = id; $("#muName").value = u.nome; $("#muLogin").value = u.login; $("#muPass").value = u.senha; $("#muRole").value = roleStr;
      $("#modalUserTitle").textContent = "Editar Cadastro"; $("#modalUserForm").classList.add("show");
    };
    box.appendChild(el);
  };
  if (state.usuarios?.admins) Object.entries(state.usuarios.admins).forEach(([id, u]) => drawUser(id, u, 'admins'));
  if (state.usuarios?.colaboradores) Object.entries(state.usuarios.colaboradores).forEach(([id, u]) => drawUser(id, u, 'colaboradores'));
};

const buildCalendarHTML = (y, m, title) => {
  const fUser = $("#filterUser")?.value; const fSector = $("#filterSector")?.value;
  const days = new Date(y, m+1, 0).getDate();
  let html = `<div class="month-label">${title} - ${MONTHS[m]} ${y}</div>
              <div class="table-responsive" style="margin-bottom: 20px;"><table class="calendar"><thead><tr><th>Colaborador</th>`;
  
  const diasDaSemana = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  for(let d=1; d<=days; d++) {
    const diaSemana = diasDaSemana[new Date(y, m, d).getDay()];
    html += `<th><div style="font-size:12px">${d}</div><div style="font-size:9px; color:var(--muted); font-weight:normal; text-transform:uppercase;">${diaSemana}</div></th>`;
  }
  html += `</tr></thead><tbody>`;

  const apenasColaboradores = state.usuarios?.colaboradores || {};
  const userIds = Object.keys(apenasColaboradores);

  if (userIds.length === 0) {
    html += `<tr><td colspan="${days + 1}" style="text-align:center; padding: 10px; color: var(--muted);">Nenhum colaborador cadastrado ainda.</td></tr>`;
  } else {
    userIds.forEach(uid => {
      if(fUser && uid !== fUser) return;
      html += `<tr><th title="${escapeHtml(apenasColaboradores[uid].nome)}">${escapeHtml(apenasColaboradores[uid].nome)}</th>`;
      
      for(let d=1; d<=days; d++) {
        const sch = state.escalas?.[String(y)]?.[pad2(m+1)]?.[pad2(d)]?.[uid];
        if(sch && (!fSector || sch.setor_id === fSector)) {
          const cor = (state.setores || {})[sch.setor_id]?.cor || '#36c37d';
          html += `<td data-uid="${uid}" data-uname="${escapeHtml(apenasColaboradores[uid].nome)}" data-day="${d}" data-m="${m}" data-y="${y}" title="${escapeHtml(sch.setor_nome)}">
                    <div class="cell" style="background-color:${cor}; color:#fff;">S</div>
                   </td>`;
        } else {
          html += `<td data-uid="${uid}" data-uname="${escapeHtml(apenasColaboradores[uid].nome)}" data-day="${d}" data-m="${m}" data-y="${y}"><div class="cell"></div></td>`;
        }
      }
      html += `</tr>`;
    });
  }
  return html + `</tbody></table></div>`;
};

const renderAdminCalendars = () => {
  const box = $("#calendar"); if (!box) return; box.innerHTML = "";   let prevY = selectedMonth === 0 ? selectedYear - 1 : selectedYear;   let prevM = selectedMonth === 0 ? 11 : selectedMonth - 1;   box.innerHTML += buildCalendarHTML(prevY, prevM, "Mês Anterior");   box.innerHTML += buildCalendarHTML(selectedYear, selectedMonth, "Mês Vigente");    $$("tbody td", box).forEach(td => {
    td.onclick = () => {
      const uid = td.getAttribute("data-uid"); if(!uid) return;
      const uname = td.getAttribute("data-uname");
      const dayNum = parseInt(td.getAttribute("data-day"));
      const cMonth = parseInt(td.getAttribute("data-m"));
      const cYear = parseInt(td.getAttribute("data-y"));
      
      schedulingData = { userId: uid, userName: uname, day: dayNum, month: cMonth, year: cYear };
      $("#schUserName").textContent = uname;
      $("#schDate").textContent = `${pad2(dayNum)}/${pad2(cMonth+1)}/${cYear}`;
      
      const sel = $("#schSector"); sel.innerHTML = `<option value="">-- Selecione o Setor --</option>`;
      Object.entries(state.setores || {}).forEach(([sid, sec]) => { sel.innerHTML += `<option value="${sid}">${escapeHtml(sec.nome)}</option>`; });
      
      const currentSch = state.escalas?.[cYear]?.[pad2(cMonth+1)]?.[pad2(dayNum)]?.[uid];
      if(currentSch) sel.value = currentSch.setor_id;

      $("#modalSchedule").classList.add("show");
    };
  });
};

// ---------- MODULOS DO USUÁRIO COMUM (COLABORADOR) ----------
const bindUserEvents = () => {
  $("#swapHasSuggestion").onchange = (e) => {
    $("#swapDateWrap").style.display = e.target.value === "yes" ? "block" : "none";
  };
  $("#btnCancelSwap").onclick = () => $("#modalUserSwap").classList.remove("show");
  
  $("#btnConfirmSwap").onclick = async () => {
    const hasSugg = $("#swapHasSuggestion").value === "yes";
    const newDate = $("#swapNewDate").value;
    if(hasSugg && !newDate) return Swal.fire('Atenção', 'Selecione a data sugerida.', 'warning');
    
    const reqId = "trc_" + Date.now();
    await set(ref(database, `trocas/${reqId}`), {
      uid: currentUser.id, uname: currentUser.nome,
      oldY: swapData.year, oldM: swapData.month, oldD: swapData.day,
      secId: swapData.secId, secName: swapData.secName,
      newDate: hasSugg ? newDate : null
    });

    $("#modalUserSwap").classList.remove("show");
    Toast.fire({ icon: 'success', title: 'Pedido de alteração enviado ao administrador!' });
  };
};

const renderUserDashboard = () => {
  const box = $("#myScheduleList"); box.innerHTML = "";
  const daysInMonth = new Date(selectedYear, selectedMonth+1, 0).getDate();
  let found = false;
  
  for(let d=1; d<=daysInMonth; d++) {
    const yStr = String(selectedYear); const mStr = pad2(selectedMonth+1); const dStr = pad2(d);
    const mySch = state.escalas?.[yStr]?.[mStr]?.[dStr]?.[currentUser.id];
    
    if(mySch) {
      found = true;
      const sec = (state.setores || {})[mySch.setor_id];
      const cor = sec ? (sec.cor || '#36c37d') : '#36c37d';
      const dt = new Date(selectedYear, selectedMonth, d);
      const wName = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"][dt.getDay()];
      
      const card = document.createElement("div"); card.className = "schedule-card";
      card.innerHTML = `
        <div class="s-date" style="background:${cor}20; color:${cor};">
          <span class="s-day">${dStr}</span>
          <span class="s-weekday">${wName}</span>
        </div>
        <div class="s-info" style="flex:1;">
          <div class="small muted">Servirá no setor:</div>
          <div class="s-sector" style="color:${cor}">${escapeHtml(mySch.setor_nome)}</div>
        </div>
        <button class="btn ghost btn-swap" style="padding: 6px 10px; font-size:12px; color: var(--blue);">Pedir Alteração</button>
      `;

      card.querySelector(".btn-swap").onclick = () => {
        swapData = { year: selectedYear, month: selectedMonth, day: d, secId: mySch.setor_id, secName: mySch.setor_nome };
        $("#swapOldDate").textContent = `${dStr}/${mStr}/${yStr}`;
        $("#swapSectorName").textContent = mySch.setor_nome;
        $("#swapHasSuggestion").value = "no"; $("#swapDateWrap").style.display = "none"; $("#swapNewDate").value = "";
        $("#modalUserSwap").classList.add("show");
      };
      box.appendChild(card);
    }
  }

  if(!found) box.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--muted); grid-column: 1/-1;">Você não tem escalas definidas para este mês.</div>`;
};

setupAuth();