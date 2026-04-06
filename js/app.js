// ==================== STATE ====================
let currentUser = null;
let tradesCache = [];
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let editingTradeId = null;
let unsubscribeTrades = null;

// ==================== AUTH ====================
const authScreen = document.getElementById('auth-screen');
const appEl = document.getElementById('app');
const authForm = document.getElementById('auth-form');
const authError = document.getElementById('auth-error');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const logoutBtn = document.getElementById('logout-btn');

function showAuthError(msg) {
  authError.textContent = msg;
  authError.style.display = 'block';
  setTimeout(() => { authError.style.display = 'none'; }, 5000);
}

// Login
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  loginBtn.disabled = true;
  loginBtn.textContent = 'Entrando...';
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    showAuthError(translateAuthError(err.code));
  }
  loginBtn.disabled = false;
  loginBtn.textContent = 'Iniciar Sesión';
});

// Register
registerBtn.addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || password.length < 6) {
    showAuthError('Email y contraseña (mín 6 caracteres) requeridos');
    return;
  }
  registerBtn.disabled = true;
  registerBtn.textContent = 'Creando...';
  try {
    await auth.createUserWithEmailAndPassword(email, password);
  } catch (err) {
    showAuthError(translateAuthError(err.code));
  }
  registerBtn.disabled = false;
  registerBtn.textContent = 'Crear Cuenta';
});

// Logout
logoutBtn.addEventListener('click', () => {
  if (unsubscribeTrades) { unsubscribeTrades(); unsubscribeTrades = null; }
  auth.signOut();
});

// Auth state observer
auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    authScreen.style.display = 'none';
    appEl.style.display = 'flex';
    document.getElementById('user-email').textContent = user.email;
    subscribeTrades();
  } else {
    currentUser = null;
    tradesCache = [];
    authScreen.style.display = 'flex';
    appEl.style.display = 'none';
    if (unsubscribeTrades) { unsubscribeTrades(); unsubscribeTrades = null; }
  }
});

function translateAuthError(code) {
  const map = {
    'auth/user-not-found': 'No existe una cuenta con este email',
    'auth/wrong-password': 'Contraseña incorrecta',
    'auth/email-already-in-use': 'Este email ya tiene una cuenta',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
    'auth/invalid-email': 'Email no válido',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento',
    'auth/invalid-credential': 'Email o contraseña incorrectos',
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
  if (editingTradeId) {
    await userTradesRef().doc(id).set(data);
  } else {
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
  document.getElementById('modal-title').textContent = 'Nueva Operación';
  document.getElementById('trade-date').value = new Date().toISOString().split('T')[0];

  if (trade) {
    editingTradeId = trade.id;
    document.getElementById('modal-title').textContent = 'Editar Operación';
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

  // Auto-calculate P&L if not provided
  if (!document.getElementById('trade-pnl').value) {
    if (trade.direction === 'long') {
      trade.pnl = (trade.exit - trade.entry) * trade.quantity;
    } else {
      trade.pnl = (trade.entry - trade.exit) * trade.quantity;
    }
    trade.pnl = Math.round(trade.pnl * 100) / 100;
  }

  // Auto-set result based on P&L
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
  if (!confirm('¿Eliminar esta operación?')) return;
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

  if (filterAsset) {
    trades = trades.filter(t => t.asset.includes(filterAsset));
  }
  if (filterResult) {
    trades = trades.filter(t => t.result === filterResult);
  }

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

// ==================== FILTERS ====================
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
  trades.forEach(t => {
    assetPnl[t.asset] = (assetPnl[t.asset] || 0) + t.pnl;
  });

  const entries = Object.entries(assetPnl).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    container.innerHTML = '<p class="empty-msg">No hay datos aún</p>';
    return;
  }

  const maxAbs = Math.max(...entries.map(e => Math.abs(e[1])), 1);

  container.innerHTML = entries.map(([asset, pnl]) => {
    const width = Math.round((Math.abs(pnl) / maxAbs) * 100);
    const cls = pnl >= 0 ? 'bar-positive' : 'bar-negative';
    return `
      <div class="bar-row">
        <span class="bar-label">${escapeHtml(asset)}</span>
        <div class="bar-track">
          <div class="bar-fill ${cls}" style="width:${Math.max(width, 3)}%"></div>
        </div>
        <span class="bar-value ${pnl >= 0 ? 'positive' : 'negative'}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</span>
      </div>`;
  }).join('');
}

function renderWeekdayChart(trades) {
  const container = document.getElementById('weekday-chart');
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const dayPnl = [0, 0, 0, 0, 0, 0, 0];

  trades.forEach(t => {
    const d = new Date(t.date + 'T12:00:00').getDay();
    dayPnl[d] += t.pnl;
  });

  const maxAbs = Math.max(...dayPnl.map(v => Math.abs(v)), 1);

  container.innerHTML = days.map((name, i) => {
    const pnl = dayPnl[i];
    const width = Math.round((Math.abs(pnl) / maxAbs) * 100);
    const cls = pnl >= 0 ? 'bar-positive' : 'bar-negative';
    return `
      <div class="bar-row">
        <span class="bar-label">${name.slice(0, 3)}</span>
        <div class="bar-track">
          <div class="bar-fill ${cls}" style="width:${Math.max(width, 3)}%"></div>
        </div>
        <span class="bar-value ${pnl >= 0 ? 'positive' : 'negative'}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</span>
      </div>`;
  }).join('');
}

// ==================== CALENDAR ====================
const WEEKDAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function renderCalendar() {
  const trades = getTrades();
  const grid = document.getElementById('calendar-grid');
  const titleEl = document.getElementById('calendar-month-year');

  titleEl.textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;

  const tradesByDate = {};
  trades.forEach(t => {
    if (!tradesByDate[t.date]) tradesByDate[t.date] = [];
    tradesByDate[t.date].push(t);
  });

  const firstDay = new Date(currentYear, currentMonth, 1);
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  let html = '<div class="calendar-header-row">';
  WEEKDAY_NAMES.forEach(d => {
    html += `<div class="calendar-header-cell">${d}</div>`;
  });
  html += '</div>';

  html += '<div class="calendar-body">';

  for (let i = 0; i < startDay; i++) {
    html += '<div class="calendar-cell empty"></div>';
  }

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

    const isToday = dateStr === new Date().toISOString().split('T')[0];
    if (isToday) cellClass += ' today';

    html += `<div class="${cellClass}" data-date="${dateStr}">`;
    html += `<span class="day-number">${day}</span>`;

    if (dayTrades.length > 0) {
      html += '<div class="day-trades-mini">';
      dayTrades.forEach(t => {
        const icon = t.result === 'win' ? '&#10003;' : t.result === 'loss' ? '&#10007;' : '&#8212;';
        const iconClass = `mini-trade mini-${t.result}`;
        html += `<span class="${iconClass}" title="${escapeHtml(t.asset)}: ${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)} - ${escapeHtml(t.notes || 'Sin notas')}">${icon}</span>`;
      });
      html += '</div>';
      html += `<div class="day-summary">`;
      html += `<span class="${dayPnl >= 0 ? 'positive' : 'negative'}">${dayPnl >= 0 ? '+' : ''}$${dayPnl.toFixed(2)}</span>`;
      html += `</div>`;
    }

    html += '</div>';
  }

  const totalCells = startDay + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 0; i < remaining; i++) {
    html += '<div class="calendar-cell empty"></div>';
  }

  html += '</div>';
  grid.innerHTML = html;

  grid.querySelectorAll('.calendar-cell:not(.empty)').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.dataset.date;
      openModal();
      document.getElementById('trade-date').value = date;
    });
  });
}

document.getElementById('prev-month').addEventListener('click', () => {
  currentMonth--;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  renderCalendar();
});

document.getElementById('next-month').addEventListener('click', () => {
  currentMonth++;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  renderCalendar();
});

// ==================== STATISTICS ====================
function renderStats() {
  const trades = getTrades();

  const assetData = {};
  trades.forEach(t => {
    if (!assetData[t.asset]) assetData[t.asset] = { pnl: 0, wins: 0, total: 0 };
    assetData[t.asset].pnl += t.pnl;
    assetData[t.asset].total++;
    if (t.result === 'win') assetData[t.asset].wins++;
  });

  const bestAssets = Object.entries(assetData).sort((a, b) => b[1].pnl - a[1].pnl).slice(0, 5);
  document.getElementById('stats-best-assets').innerHTML = bestAssets.length ?
    bestAssets.map(([asset, data]) => `
      <div class="stat-item">
        <span class="stat-name">${escapeHtml(asset)}</span>
        <span class="stat-value positive">+$${data.pnl.toFixed(2)}</span>
        <span class="stat-detail">${data.total} ops | WR: ${Math.round((data.wins / data.total) * 100)}%</span>
      </div>
    `).join('') : '<p class="empty-msg">No hay datos</p>';

  const worstAssets = Object.entries(assetData).sort((a, b) => a[1].pnl - b[1].pnl).slice(0, 5);
  document.getElementById('stats-worst-assets').innerHTML = worstAssets.length ?
    worstAssets.map(([asset, data]) => `
      <div class="stat-item">
        <span class="stat-name">${escapeHtml(asset)}</span>
        <span class="stat-value negative">$${data.pnl.toFixed(2)}</span>
        <span class="stat-detail">${data.total} ops | WR: ${Math.round((data.wins / data.total) * 100)}%</span>
      </div>
    `).join('') : '<p class="empty-msg">No hay datos</p>';

  const winRateAssets = Object.entries(assetData)
    .filter(([, d]) => d.total >= 1)
    .sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total));
  document.getElementById('stats-winrate-asset').innerHTML = winRateAssets.length ?
    winRateAssets.map(([asset, data]) => {
      const wr = Math.round((data.wins / data.total) * 100);
      return `
        <div class="stat-item">
          <span class="stat-name">${escapeHtml(asset)}</span>
          <div class="progress-bar"><div class="progress-fill" style="width:${wr}%"></div></div>
          <span class="stat-value">${wr}%</span>
          <span class="stat-detail">${data.wins}/${data.total}</span>
        </div>`;
    }).join('') : '<p class="empty-msg">No hay datos</p>';

  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const weekdayPnl = [0, 0, 0, 0, 0, 0, 0];
  const weekdayCount = [0, 0, 0, 0, 0, 0, 0];
  trades.forEach(t => {
    const d = new Date(t.date + 'T12:00:00').getDay();
    weekdayPnl[d] += t.pnl;
    weekdayCount[d]++;
  });

  document.getElementById('stats-weekday-pnl').innerHTML = days.map((name, i) => `
    <div class="stat-item">
      <span class="stat-name">${name}</span>
      <span class="stat-value ${weekdayPnl[i] >= 0 ? 'positive' : 'negative'}">${weekdayPnl[i] >= 0 ? '+' : ''}$${weekdayPnl[i].toFixed(2)}</span>
    </div>
  `).join('');

  document.getElementById('stats-weekday-count').innerHTML = days.map((name, i) => `
    <div class="stat-item">
      <span class="stat-name">${name}</span>
      <span class="stat-value">${weekdayCount[i]}</span>
    </div>
  `).join('');

  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const wins = trades.filter(t => t.result === 'win');
  const losses = trades.filter(t => t.result === 'loss');
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
  const profitFactor = losses.length && avgLoss !== 0
    ? Math.abs(wins.reduce((s, t) => s + t.pnl, 0) / losses.reduce((s, t) => s + t.pnl, 0))
    : wins.length > 0 ? Infinity : 0;
  const expectancy = trades.length ? totalPnl / trades.length : 0;

  let maxConsWins = 0, maxConsLosses = 0, consWins = 0, consLosses = 0;
  const sorted = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));
  sorted.forEach(t => {
    if (t.result === 'win') { consWins++; consLosses = 0; }
    else if (t.result === 'loss') { consLosses++; consWins = 0; }
    else { consWins = 0; consLosses = 0; }
    maxConsWins = Math.max(maxConsWins, consWins);
    maxConsLosses = Math.max(maxConsLosses, consLosses);
  });

  document.getElementById('stats-advanced').innerHTML = `
    <div class="stat-item"><span class="stat-name">Ganancia Media</span><span class="stat-value positive">+$${avgWin.toFixed(2)}</span></div>
    <div class="stat-item"><span class="stat-name">Pérdida Media</span><span class="stat-value negative">$${avgLoss.toFixed(2)}</span></div>
    <div class="stat-item"><span class="stat-name">Profit Factor</span><span class="stat-value">${profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}</span></div>
    <div class="stat-item"><span class="stat-name">Expectancy</span><span class="stat-value ${expectancy >= 0 ? 'positive' : 'negative'}">${expectancy >= 0 ? '+' : ''}$${expectancy.toFixed(2)}</span></div>
    <div class="stat-item"><span class="stat-name">Racha Ganadora Máx</span><span class="stat-value">${maxConsWins}</span></div>
    <div class="stat-item"><span class="stat-name">Racha Perdedora Máx</span><span class="stat-value">${maxConsLosses}</span></div>
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

// ==================== REFRESH ALL ====================
function refreshAll() {
  renderDashboard();
  renderCalendar();
  renderTradesTable();
  renderStats();
}
