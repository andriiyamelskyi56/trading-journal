// ==================== STATE ====================
let currentUser = null;
let tradesCache = [];
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let editingTradeId = null;
let unsubscribeTrades = null;

// ==================== AUTH VIEWS ====================
const authScreen = document.getElementById('auth-screen');
const appEl = document.getElementById('app');
const authViews = {
  welcome: document.getElementById('auth-welcome'),
  login: document.getElementById('auth-login'),
  register: document.getElementById('auth-register'),
  verify: document.getElementById('auth-verify'),
  reset: document.getElementById('auth-reset'),
};

function showAuthView(viewName) {
  Object.values(authViews).forEach(v => v.style.display = 'none');
  authViews[viewName].style.display = 'block';
  // Clear errors
  document.querySelectorAll('.auth-error, .auth-success').forEach(el => el.style.display = 'none');
}

// Welcome -> Login / Register
document.getElementById('go-login-btn').addEventListener('click', () => showAuthView('login'));
document.getElementById('go-register-btn').addEventListener('click', () => showAuthView('register'));

// Switch between login/register
document.getElementById('login-to-register').addEventListener('click', (e) => { e.preventDefault(); showAuthView('register'); });
document.getElementById('register-to-login').addEventListener('click', (e) => { e.preventDefault(); showAuthView('login'); });

// Forgot password
document.getElementById('forgot-password-link').addEventListener('click', (e) => { e.preventDefault(); showAuthView('reset'); });
document.getElementById('reset-to-login').addEventListener('click', (e) => { e.preventDefault(); showAuthView('login'); });

// Verify -> logout
document.getElementById('verify-logout').addEventListener('click', (e) => {
  e.preventDefault();
  auth.signOut();
  showAuthView('welcome');
});

// ==================== PASSWORD VALIDATION ====================
const regPassword = document.getElementById('reg-password');
const regPasswordConfirm = document.getElementById('reg-password-confirm');
const strengthHint = document.getElementById('password-strength');
const matchHint = document.getElementById('password-match');

regPassword.addEventListener('input', () => {
  const val = regPassword.value;
  if (val.length === 0) { strengthHint.textContent = ''; return; }
  if (val.length < 6) {
    strengthHint.textContent = 'Muy corta';
    strengthHint.className = 'input-hint hint-weak';
  } else if (val.length < 10 || !/[A-Z]/.test(val) || !/[0-9]/.test(val)) {
    strengthHint.textContent = 'Media';
    strengthHint.className = 'input-hint hint-medium';
  } else {
    strengthHint.textContent = 'Fuerte';
    strengthHint.className = 'input-hint hint-strong';
  }
  checkPasswordMatch();
});

regPasswordConfirm.addEventListener('input', checkPasswordMatch);

function checkPasswordMatch() {
  if (regPasswordConfirm.value.length === 0) { matchHint.textContent = ''; return; }
  if (regPassword.value === regPasswordConfirm.value) {
    matchHint.textContent = 'Las contrasenas coinciden';
    matchHint.className = 'input-hint hint-strong';
  } else {
    matchHint.textContent = 'Las contrasenas no coinciden';
    matchHint.className = 'input-hint hint-weak';
  }
}

// ==================== REGISTER ====================
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('register-error');

  const firstName = document.getElementById('reg-firstname').value.trim();
  const lastName = document.getElementById('reg-lastname').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const passwordConfirm = document.getElementById('reg-password-confirm').value;
  const terms = document.getElementById('reg-terms').checked;

  // Validations
  if (!firstName || !lastName) {
    showError(errorEl, 'Nombre y apellidos son obligatorios');
    return;
  }
  if (password !== passwordConfirm) {
    showError(errorEl, 'Las contrasenas no coinciden');
    return;
  }
  if (password.length < 6) {
    showError(errorEl, 'La contrasena debe tener al menos 6 caracteres');
    return;
  }
  if (!terms) {
    showError(errorEl, 'Debes aceptar los terminos de uso');
    return;
  }

  const btn = document.getElementById('register-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Creando cuenta...';

  try {
    // Create user in Firebase Auth
    const cred = await auth.createUserWithEmailAndPassword(email, password);

    // Set display name
    await cred.user.updateProfile({
      displayName: firstName + ' ' + lastName
    });

    // Save user profile to Firestore
    await db.collection('users').doc(cred.user.uid).set({
      firstName: firstName,
      lastName: lastName,
      fullName: firstName + ' ' + lastName,
      email: email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
      settings: {
        currency: 'USD',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    });

    // Send verification email
    await cred.user.sendEmailVerification();

    // Show verification screen
    document.getElementById('verify-email-display').textContent = email;
    showAuthView('verify');

  } catch (err) {
    showError(errorEl, translateAuthError(err.code));
  }

  btn.disabled = false;
  btn.textContent = 'Crear Cuenta';
});

// ==================== LOGIN ====================
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('login-error');
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  const btn = document.getElementById('login-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Entrando...';

  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);

    // Update last login
    await db.collection('users').doc(cred.user.uid).update({
      lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});

    // Check email verification
    if (!cred.user.emailVerified) {
      document.getElementById('verify-email-display').textContent = email;
      showAuthView('verify');
      btn.disabled = false;
      btn.textContent = 'Entrar';
      return;
    }

    // Auth state observer will handle the rest
  } catch (err) {
    showError(errorEl, translateAuthError(err.code));
  }

  btn.disabled = false;
  btn.textContent = 'Entrar';
});

// ==================== VERIFY EMAIL ====================
document.getElementById('check-verification-btn').addEventListener('click', async () => {
  const errorEl = document.getElementById('verify-error');
  const successEl = document.getElementById('verify-success');
  const btn = document.getElementById('check-verification-btn');

  btn.disabled = true;
  btn.textContent = 'Comprobando...';

  try {
    await auth.currentUser.reload();
    if (auth.currentUser.emailVerified) {
      showSuccess(successEl, 'Email verificado correctamente!');
      setTimeout(() => {
        // Trigger auth state change to enter app
        auth.onAuthStateChanged(() => {});
        enterApp(auth.currentUser);
      }, 1000);
    } else {
      showError(errorEl, 'El email aun no ha sido verificado. Revisa tu bandeja de entrada y spam.');
    }
  } catch (err) {
    showError(errorEl, 'Error al comprobar: ' + err.message);
  }

  btn.disabled = false;
  btn.textContent = 'Ya he verificado mi email';
});

document.getElementById('resend-verification-btn').addEventListener('click', async () => {
  const successEl = document.getElementById('verify-success');
  const errorEl = document.getElementById('verify-error');
  const btn = document.getElementById('resend-verification-btn');

  btn.disabled = true;
  try {
    await auth.currentUser.sendEmailVerification();
    showSuccess(successEl, 'Email de verificacion reenviado! Revisa tu correo.');
  } catch (err) {
    showError(errorEl, 'Espera unos minutos antes de reenviar.');
  }
  btn.disabled = false;
});

// ==================== RESET PASSWORD ====================
document.getElementById('reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('reset-error');
  const successEl = document.getElementById('reset-success');
  const email = document.getElementById('reset-email').value.trim();

  const btn = document.getElementById('reset-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    await auth.sendPasswordResetEmail(email);
    showSuccess(successEl, 'Email enviado! Revisa tu correo (tambien spam) para restablecer tu contrasena.');
  } catch (err) {
    showError(errorEl, translateAuthError(err.code));
  }

  btn.disabled = false;
  btn.textContent = 'Enviar Email de Recuperacion';
});

// ==================== LOGOUT ====================
document.getElementById('logout-btn').addEventListener('click', () => {
  if (unsubscribeTrades) { unsubscribeTrades(); unsubscribeTrades = null; }
  auth.signOut();
});

// ==================== AUTH STATE OBSERVER ====================
auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    if (!user.emailVerified) {
      // Show verification screen
      authScreen.style.display = 'flex';
      appEl.style.display = 'none';
      document.getElementById('verify-email-display').textContent = user.email;
      showAuthView('verify');
      return;
    }
    enterApp(user);
  } else {
    currentUser = null;
    tradesCache = [];
    authScreen.style.display = 'flex';
    appEl.style.display = 'none';
    showAuthView('welcome');
    if (unsubscribeTrades) { unsubscribeTrades(); unsubscribeTrades = null; }
  }
});

function enterApp(user) {
  authScreen.style.display = 'none';
  appEl.style.display = 'flex';

  // Show user info in sidebar
  const displayName = user.displayName || user.email;
  document.getElementById('user-email').textContent = displayName;

  subscribeTrades();
}

// ==================== HELPERS AUTH ====================
function showError(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
  el.className = 'auth-error';
  setTimeout(() => { el.style.display = 'none'; }, 6000);
}

function showSuccess(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
  el.className = 'auth-success';
}

function translateAuthError(code) {
  const map = {
    'auth/user-not-found': 'No existe una cuenta con este email',
    'auth/wrong-password': 'Contrasena incorrecta',
    'auth/email-already-in-use': 'Este email ya tiene una cuenta registrada',
    'auth/weak-password': 'La contrasena debe tener al menos 6 caracteres',
    'auth/invalid-email': 'El formato del email no es valido',
    'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos',
    'auth/invalid-credential': 'Email o contrasena incorrectos',
    'auth/user-disabled': 'Esta cuenta ha sido desactivada',
    'auth/network-request-failed': 'Error de conexion. Comprueba tu internet',
  };
  return map[code] || 'Error: ' + code;
}

// ==================== FIRESTORE ====================
function userTradesRef() {
  return db.collection('users').doc(currentUser.uid).collection('trades');
}

function subscribeTrades() {
  const loading = document.getElementById('loading-overlay');
  loading.style.display = 'flex';

  unsubscribeTrades = userTradesRef().onSnapshot((snapshot) => {
    tradesCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    loading.style.display = 'none';
    refreshAll();
  }, (error) => {
    console.error('Firestore error:', error);
    loading.style.display = 'none';
  });
}

function getTrades() {
  return tradesCache;
}

async function saveTrade(trade) {
  const { id, ...data } = trade;
  data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
  if (editingTradeId) {
    await userTradesRef().doc(id).set(data);
  } else {
    data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    await userTradesRef().add(data);
  }
}

async function deleteTradeFromDB(id) {
  await userTradesRef().doc(id).delete();
}

// ==================== NAVIGATION ====================
document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const section = link.dataset.section;
    document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(section).classList.add('active');
    refreshAll();
  });
});

// ==================== MODAL ====================
const modal = document.getElementById('trade-modal');
const form = document.getElementById('trade-form');
const addBtn = document.getElementById('add-trade-btn');
const closeBtn = document.getElementById('modal-close');
const cancelBtn = document.getElementById('modal-cancel');

function openModal(trade = null) {
  editingTradeId = null;
  form.reset();
  document.getElementById('modal-title').textContent = 'Nueva Operacion';
  document.getElementById('trade-date').value = new Date().toISOString().split('T')[0];

  if (trade) {
    editingTradeId = trade.id;
    document.getElementById('modal-title').textContent = 'Editar Operacion';
    document.getElementById('trade-id').value = trade.id;
    document.getElementById('trade-date').value = trade.date;
    document.getElementById('trade-asset').value = trade.asset;
    document.getElementById('trade-direction').value = trade.direction;
    document.getElementById('trade-quantity').value = trade.quantity;
    document.getElementById('trade-entry').value = trade.entry;
    document.getElementById('trade-exit').value = trade.exit;
    document.getElementById('trade-pnl').value = trade.pnl;
    document.getElementById('trade-result').value = trade.result;
    document.getElementById('trade-notes').value = trade.notes || '';
  }

  modal.classList.add('open');
}

function closeModal() {
  modal.classList.remove('open');
  editingTradeId = null;
}

addBtn.addEventListener('click', () => openModal());
closeBtn.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

// ==================== FORM SUBMIT ====================
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const trade = {
    id: editingTradeId || null,
    date: document.getElementById('trade-date').value,
    asset: document.getElementById('trade-asset').value.toUpperCase().trim(),
    direction: document.getElementById('trade-direction').value,
    quantity: parseFloat(document.getElementById('trade-quantity').value),
    entry: parseFloat(document.getElementById('trade-entry').value),
    exit: parseFloat(document.getElementById('trade-exit').value),
    pnl: parseFloat(document.getElementById('trade-pnl').value) || 0,
    result: document.getElementById('trade-result').value,
    notes: document.getElementById('trade-notes').value.trim(),
  };

  if (!document.getElementById('trade-pnl').value) {
    if (trade.direction === 'long') {
      trade.pnl = (trade.exit - trade.entry) * trade.quantity;
    } else {
      trade.pnl = (trade.entry - trade.exit) * trade.quantity;
    }
    trade.pnl = Math.round(trade.pnl * 100) / 100;
  }

  if (trade.pnl > 0) trade.result = 'win';
  else if (trade.pnl < 0) trade.result = 'loss';
  else trade.result = 'breakeven';

  try {
    await saveTrade(trade);
    closeModal();
  } catch (err) {
    alert('Error al guardar: ' + err.message);
  }
});

// ==================== DELETE TRADE ====================
async function deleteTrade(id) {
  if (!confirm('Eliminar esta operacion?')) return;
  try {
    await deleteTradeFromDB(id);
  } catch (err) {
    alert('Error al eliminar: ' + err.message);
  }
}

// ==================== RENDER TRADES TABLE ====================
function renderTradesTable() {
  const tbody = document.getElementById('trades-table-body');
  let trades = getTrades();

  const filterAsset = document.getElementById('filter-asset').value.toUpperCase().trim();
  const filterResult = document.getElementById('filter-result').value;

  if (filterAsset) trades = trades.filter(t => t.asset.includes(filterAsset));
  if (filterResult) trades = trades.filter(t => t.result === filterResult);

  trades.sort((a, b) => new Date(b.date) - new Date(a.date));

  tbody.innerHTML = trades.map(t => {
    const tradeJson = JSON.stringify(t).replace(/"/g, '&quot;');
    return `
    <tr class="trade-row trade-${t.result}">
      <td>${formatDate(t.date)}</td>
      <td><strong>${escapeHtml(t.asset)}</strong></td>
      <td><span class="badge badge-${t.direction}">${t.direction.toUpperCase()}</span></td>
      <td>${t.entry}</td>
      <td>${t.exit}</td>
      <td>${t.quantity}</td>
      <td class="pnl ${t.pnl >= 0 ? 'positive' : 'negative'}">${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}</td>
      <td><span class="badge badge-${t.result}">${resultLabel(t.result)}</span></td>
      <td class="notes-cell">${escapeHtml(t.notes || '-')}</td>
      <td class="actions-cell">
        <button class="btn btn-sm btn-edit" onclick='openModal(${tradeJson})'>Editar</button>
        <button class="btn btn-sm btn-delete" onclick="deleteTrade('${t.id}')">Eliminar</button>
      </td>
    </tr>`;
  }).join('');
}

document.getElementById('filter-asset').addEventListener('input', renderTradesTable);
document.getElementById('filter-result').addEventListener('change', renderTradesTable);

// ==================== DASHBOARD ====================
function renderDashboard() {
  const trades = getTrades();
  const wins = trades.filter(t => t.result === 'win');
  const losses = trades.filter(t => t.result === 'loss');
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);

  document.getElementById('total-trades').textContent = trades.length;
  document.getElementById('win-trades').textContent = wins.length;
  document.getElementById('loss-trades').textContent = losses.length;
  document.getElementById('win-rate').textContent = trades.length ? Math.round((wins.length / trades.length) * 100) + '%' : '0%';

  const pnlEl = document.getElementById('total-pnl');
  pnlEl.textContent = (totalPnl >= 0 ? '+' : '') + '$' + totalPnl.toFixed(2);
  pnlEl.className = 'card-value ' + (totalPnl >= 0 ? 'positive' : 'negative');

  const recent = [...trades].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  document.getElementById('recent-trades-body').innerHTML = recent.map(t => `
    <tr>
      <td>${formatDate(t.date)}</td>
      <td><strong>${escapeHtml(t.asset)}</strong></td>
      <td><span class="badge badge-${t.direction}">${t.direction.toUpperCase()}</span></td>
      <td class="pnl ${t.pnl >= 0 ? 'positive' : 'negative'}">${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}</td>
      <td><span class="badge badge-${t.result}">${resultLabel(t.result)}</span></td>
    </tr>
  `).join('');

  renderAssetChart(trades);
  renderWeekdayChart(trades);
}

// ==================== BAR CHARTS ====================
function renderAssetChart(trades) {
  const container = document.getElementById('asset-chart');
  const assetPnl = {};
  trades.forEach(t => { assetPnl[t.asset] = (assetPnl[t.asset] || 0) + t.pnl; });

  const entries = Object.entries(assetPnl).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) { container.innerHTML = '<p class="empty-msg">No hay datos aun</p>'; return; }

  const maxAbs = Math.max(...entries.map(e => Math.abs(e[1])), 1);
  container.innerHTML = entries.map(([asset, pnl]) => {
    const width = Math.round((Math.abs(pnl) / maxAbs) * 100);
    const cls = pnl >= 0 ? 'bar-positive' : 'bar-negative';
    return `<div class="bar-row"><span class="bar-label">${escapeHtml(asset)}</span><div class="bar-track"><div class="bar-fill ${cls}" style="width:${Math.max(width, 3)}%"></div></div><span class="bar-value ${pnl >= 0 ? 'positive' : 'negative'}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</span></div>`;
  }).join('');
}

function renderWeekdayChart(trades) {
  const container = document.getElementById('weekday-chart');
  const days = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  const dayPnl = [0, 0, 0, 0, 0, 0, 0];
  trades.forEach(t => { const d = new Date(t.date + 'T12:00:00').getDay(); dayPnl[d] += t.pnl; });

  const maxAbs = Math.max(...dayPnl.map(v => Math.abs(v)), 1);
  container.innerHTML = days.map((name, i) => {
    const pnl = dayPnl[i];
    const width = Math.round((Math.abs(pnl) / maxAbs) * 100);
    const cls = pnl >= 0 ? 'bar-positive' : 'bar-negative';
    return `<div class="bar-row"><span class="bar-label">${name.slice(0, 3)}</span><div class="bar-track"><div class="bar-fill ${cls}" style="width:${Math.max(width, 3)}%"></div></div><span class="bar-value ${pnl >= 0 ? 'positive' : 'negative'}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</span></div>`;
  }).join('');
}

// ==================== CALENDAR ====================
const WEEKDAY_NAMES = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function renderCalendar() {
  const trades = getTrades();
  const grid = document.getElementById('calendar-grid');
  const titleEl = document.getElementById('calendar-month-year');
  titleEl.textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;

  const tradesByDate = {};
  trades.forEach(t => { if (!tradesByDate[t.date]) tradesByDate[t.date] = []; tradesByDate[t.date].push(t); });

  const firstDay = new Date(currentYear, currentMonth, 1);
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  let html = '<div class="calendar-header-row">';
  WEEKDAY_NAMES.forEach(d => { html += `<div class="calendar-header-cell">${d}</div>`; });
  html += '</div><div class="calendar-body">';

  for (let i = 0; i < startDay; i++) html += '<div class="calendar-cell empty"></div>';

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayTrades = tradesByDate[dateStr] || [];
    const dayPnl = dayTrades.reduce((sum, t) => sum + t.pnl, 0);

    let cellClass = 'calendar-cell';
    if (dayTrades.length > 0) {
      if (dayPnl > 0) cellClass += ' day-win';
      else if (dayPnl < 0) cellClass += ' day-loss';
      else cellClass += ' day-breakeven';
    }
    if (dateStr === new Date().toISOString().split('T')[0]) cellClass += ' today';

    html += `<div class="${cellClass}" data-date="${dateStr}"><span class="day-number">${day}</span>`;
    if (dayTrades.length > 0) {
      html += '<div class="day-trades-mini">';
      dayTrades.forEach(t => {
        const icon = t.result === 'win' ? '&#10003;' : t.result === 'loss' ? '&#10007;' : '&#8212;';
        html += `<span class="mini-trade mini-${t.result}" title="${escapeHtml(t.asset)}: ${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)} - ${escapeHtml(t.notes || 'Sin notas')}">${icon}</span>`;
      });
      html += `</div><div class="day-summary"><span class="${dayPnl >= 0 ? 'positive' : 'negative'}">${dayPnl >= 0 ? '+' : ''}$${dayPnl.toFixed(2)}</span></div>`;
    }
    html += '</div>';
  }

  const totalCells = startDay + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 0; i < remaining; i++) html += '<div class="calendar-cell empty"></div>';
  html += '</div>';
  grid.innerHTML = html;

  grid.querySelectorAll('.calendar-cell:not(.empty)').forEach(cell => {
    cell.addEventListener('click', () => { openModal(); document.getElementById('trade-date').value = cell.dataset.date; });
  });
}

document.getElementById('prev-month').addEventListener('click', () => { currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; } renderCalendar(); });
document.getElementById('next-month').addEventListener('click', () => { currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; } renderCalendar(); });

// ==================== STATISTICS ====================
function renderStats() {
  const trades = getTrades();
  const assetData = {};
  trades.forEach(t => {
    if (!assetData[t.asset]) assetData[t.asset] = { pnl: 0, wins: 0, total: 0 };
    assetData[t.asset].pnl += t.pnl; assetData[t.asset].total++;
    if (t.result === 'win') assetData[t.asset].wins++;
  });

  const bestAssets = Object.entries(assetData).sort((a, b) => b[1].pnl - a[1].pnl).slice(0, 5);
  document.getElementById('stats-best-assets').innerHTML = bestAssets.length ? bestAssets.map(([asset, data]) => `<div class="stat-item"><span class="stat-name">${escapeHtml(asset)}</span><span class="stat-value positive">+$${data.pnl.toFixed(2)}</span><span class="stat-detail">${data.total} ops | WR: ${Math.round((data.wins / data.total) * 100)}%</span></div>`).join('') : '<p class="empty-msg">No hay datos</p>';

  const worstAssets = Object.entries(assetData).sort((a, b) => a[1].pnl - b[1].pnl).slice(0, 5);
  document.getElementById('stats-worst-assets').innerHTML = worstAssets.length ? worstAssets.map(([asset, data]) => `<div class="stat-item"><span class="stat-name">${escapeHtml(asset)}</span><span class="stat-value negative">$${data.pnl.toFixed(2)}</span><span class="stat-detail">${data.total} ops | WR: ${Math.round((data.wins / data.total) * 100)}%</span></div>`).join('') : '<p class="empty-msg">No hay datos</p>';

  const winRateAssets = Object.entries(assetData).filter(([, d]) => d.total >= 1).sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total));
  document.getElementById('stats-winrate-asset').innerHTML = winRateAssets.length ? winRateAssets.map(([asset, data]) => { const wr = Math.round((data.wins / data.total) * 100); return `<div class="stat-item"><span class="stat-name">${escapeHtml(asset)}</span><div class="progress-bar"><div class="progress-fill" style="width:${wr}%"></div></div><span class="stat-value">${wr}%</span><span class="stat-detail">${data.wins}/${data.total}</span></div>`; }).join('') : '<p class="empty-msg">No hay datos</p>';

  const days = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
  const weekdayPnl = [0, 0, 0, 0, 0, 0, 0];
  const weekdayCount = [0, 0, 0, 0, 0, 0, 0];
  trades.forEach(t => { const d = new Date(t.date + 'T12:00:00').getDay(); weekdayPnl[d] += t.pnl; weekdayCount[d]++; });

  document.getElementById('stats-weekday-pnl').innerHTML = days.map((name, i) => `<div class="stat-item"><span class="stat-name">${name}</span><span class="stat-value ${weekdayPnl[i] >= 0 ? 'positive' : 'negative'}">${weekdayPnl[i] >= 0 ? '+' : ''}$${weekdayPnl[i].toFixed(2)}</span></div>`).join('');
  document.getElementById('stats-weekday-count').innerHTML = days.map((name, i) => `<div class="stat-item"><span class="stat-name">${name}</span><span class="stat-value">${weekdayCount[i]}</span></div>`).join('');

  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const wins = trades.filter(t => t.result === 'win');
  const losses = trades.filter(t => t.result === 'loss');
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
  const profitFactor = losses.length && avgLoss !== 0 ? Math.abs(wins.reduce((s, t) => s + t.pnl, 0) / losses.reduce((s, t) => s + t.pnl, 0)) : wins.length > 0 ? Infinity : 0;
  const expectancy = trades.length ? totalPnl / trades.length : 0;

  let maxConsWins = 0, maxConsLosses = 0, consWins = 0, consLosses = 0;
  [...trades].sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(t => {
    if (t.result === 'win') { consWins++; consLosses = 0; } else if (t.result === 'loss') { consLosses++; consWins = 0; } else { consWins = 0; consLosses = 0; }
    maxConsWins = Math.max(maxConsWins, consWins); maxConsLosses = Math.max(maxConsLosses, consLosses);
  });

  document.getElementById('stats-advanced').innerHTML = `
    <div class="stat-item"><span class="stat-name">Ganancia Media</span><span class="stat-value positive">+$${avgWin.toFixed(2)}</span></div>
    <div class="stat-item"><span class="stat-name">Perdida Media</span><span class="stat-value negative">$${avgLoss.toFixed(2)}</span></div>
    <div class="stat-item"><span class="stat-name">Profit Factor</span><span class="stat-value">${profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}</span></div>
    <div class="stat-item"><span class="stat-name">Expectancy</span><span class="stat-value ${expectancy >= 0 ? 'positive' : 'negative'}">${expectancy >= 0 ? '+' : ''}$${expectancy.toFixed(2)}</span></div>
    <div class="stat-item"><span class="stat-name">Racha Ganadora Max</span><span class="stat-value">${maxConsWins}</span></div>
    <div class="stat-item"><span class="stat-name">Racha Perdedora Max</span><span class="stat-value">${maxConsLosses}</span></div>
  `;
}

// ==================== HELPERS ====================
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

function resultLabel(result) {
  return { win: 'Ganadora', loss: 'Perdedora', breakeven: 'Breakeven' }[result] || result;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function refreshAll() {
  renderDashboard();
  renderCalendar();
  renderTradesTable();
  renderStats();
}
