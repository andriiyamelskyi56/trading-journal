// ==================== STATE ====================
let currentUser = null;
let tradesCache = [];
let openPnlCache = {}; // { tradeId: { pnl, currentPrice } }
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let editingTradeId = null;
let unsubscribeTrades = null;
let calendarView = 'month';
let currentWeekStart = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(0,0,0,0); return d; })();

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
  if (unsubscribeWatchlists) { unsubscribeWatchlists(); unsubscribeWatchlists = null; }
  stopQuotesAutoRefresh();
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
    if (typeof unsubscribeWatchlists !== 'undefined' && unsubscribeWatchlists) { unsubscribeWatchlists(); unsubscribeWatchlists = null; }
    if (typeof stopQuotesAutoRefresh === 'function') stopQuotesAutoRefresh();
  }
});

function enterApp(user) {
  authScreen.style.display = 'none';
  appEl.style.display = 'flex';

  // Show user info in sidebar
  const displayName = user.displayName || user.email;
  document.getElementById('user-email').textContent = displayName;

  subscribeTrades();
  subscribeWatchlists();
  startQuotesAutoRefresh();
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
  return tradesCache.map(t => {
    const trade = { ...t };
    if (trade.result === 'loss' && trade.risk > 0) {
      trade.pnl = -trade.risk;
    } else if (trade.result === 'breakeven') {
      trade.pnl = 0;
    } else if (trade.result === 'win') {
      if (typeof trade.pnl !== 'number') trade.pnl = 0;
    } else if (trade.result === 'open') {
      const cached = openPnlCache[trade.id];
      trade.pnl = cached ? cached.pnl : 0;
    }
    if (typeof trade.pnl !== 'number') trade.pnl = 0;
    return trade;
  });
}

function getOpenPositions() {
  return tradesCache.filter(t => t.result === 'open');
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
    window.scrollTo(0, 0);
    refreshAll();
    if (section === 'markets' && activeWatchlistId) fetchQuotes();
    if (section === 'charts') populateChartSymbols();
  });
});

// ==================== MODAL ====================
const modal = document.getElementById('trade-modal');
const form = document.getElementById('trade-form');
const addBtn = document.getElementById('add-trade-btn');
const closeBtn = document.getElementById('modal-close');
const cancelBtn = document.getElementById('modal-cancel');

// Pending files to upload on save
let pendingFilesPre = [];  // {file, dataUrl}
let pendingFilesPost = [];
let existingScreensPre = [];  // URLs from existing trade
let existingScreensPost = [];

// ==================== MODAL TABS ====================
document.querySelectorAll('.modal-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

function switchToTab(tabName) {
  document.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-' + tabName).classList.add('active');
}

// ==================== RR CALCULATION ====================
function calcRR() {
  const entry = parseFloat(document.getElementById('trade-entry').value);
  const sl = parseFloat(document.getElementById('trade-sl').value);
  const tp = parseFloat(document.getElementById('trade-tp').value);
  const qty = parseFloat(document.getElementById('trade-quantity').value) || 0;
  const dir = document.getElementById('trade-direction').value;
  const rrEl = document.getElementById('trade-rr');
  const riskEl = document.getElementById('trade-risk');
  const rewardEl = document.getElementById('trade-reward');

  // Calculate risk in $
  if (entry && sl && qty) {
    const riskPrice = dir === 'long' ? entry - sl : sl - entry;
    const riskMoney = Math.abs(riskPrice * qty);
    riskEl.textContent = riskPrice > 0 ? `-$${riskMoney.toFixed(2)}` : 'SL invalido';
  } else {
    riskEl.textContent = '--';
  }

  // Calculate reward in $
  if (entry && tp && qty) {
    const rewardPrice = dir === 'long' ? tp - entry : entry - tp;
    const rewardMoney = Math.abs(rewardPrice * qty);
    rewardEl.textContent = rewardPrice > 0 ? `+$${rewardMoney.toFixed(2)}` : 'TP invalido';
  } else {
    rewardEl.textContent = '--';
  }

  // Calculate RR ratio
  if (!entry || !sl || !tp || entry === sl) { rrEl.textContent = '--'; return; }

  let risk, reward;
  if (dir === 'long') {
    risk = entry - sl;
    reward = tp - entry;
  } else {
    risk = sl - entry;
    reward = entry - tp;
  }

  if (risk <= 0) { rrEl.textContent = 'SL invalido'; return; }
  if (reward <= 0) { rrEl.textContent = 'TP invalido'; return; }

  const rr = reward / risk;
  rrEl.textContent = `1 : ${rr.toFixed(2)}`;
  rrEl.style.color = rr >= 2 ? 'var(--green)' : rr >= 1 ? 'var(--yellow)' : 'var(--red)';
}

['trade-entry', 'trade-sl', 'trade-tp', 'trade-direction', 'trade-quantity'].forEach(id => {
  document.getElementById(id).addEventListener('input', calcRR);
  document.getElementById(id).addEventListener('change', calcRR);
});

// ==================== P&L vs PLAN ====================
function calcRRActual() {
  const entry = parseFloat(document.getElementById('trade-entry').value);
  const exit = parseFloat(document.getElementById('trade-exit').value);
  const sl = parseFloat(document.getElementById('trade-sl').value);
  const dir = document.getElementById('trade-direction').value;
  const el = document.getElementById('trade-rr-actual');

  if (!entry || !exit || !sl || entry === sl) { el.textContent = '--'; return; }

  let risk, actual;
  if (dir === 'long') {
    risk = entry - sl;
    actual = exit - entry;
  } else {
    risk = sl - entry;
    actual = entry - exit;
  }

  if (risk <= 0) { el.textContent = '--'; return; }
  const rr = actual / risk;
  el.textContent = `${rr >= 0 ? '+' : ''}${rr.toFixed(2)}R`;
  el.style.color = rr >= 0 ? 'var(--green)' : 'var(--red)';
}

document.getElementById('trade-exit').addEventListener('input', calcRRActual);

// Show/hide open position fields based on result selection
document.getElementById('trade-result').addEventListener('change', (e) => {
  const isOpen = e.target.value === 'open';
  document.getElementById('open-position-fields').style.display = isOpen ? '' : 'none';
  document.getElementById('trade-exit').closest('.form-row').style.display = isOpen ? 'none' : '';
});

// ==================== CLOUDINARY CONFIG ====================
const CLOUDINARY_CLOUD = 'dr1nxeniz';
const CLOUDINARY_PRESET = 'ml_default';

// ==================== CLOUDINARY UPLOAD ====================
async function uploadToCloudinary(file, userId) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_PRESET);
  formData.append('folder', `trading-journal/${userId}`);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) throw new Error('Error subiendo imagen a Cloudinary');
  const data = await res.json();
  return data.secure_url;
}

// ==================== FILE UPLOAD ZONES ====================
function setupUploadZone(zoneId, fileInputId, previewId, pendingArray) {
  const zone = document.getElementById(zoneId);
  const fileInput = document.getElementById(fileInputId);
  const preview = document.getElementById(previewId);

  zone.addEventListener('click', (e) => {
    if (e.target.closest('.upload-thumb-remove') || e.target.closest('.upload-thumb img')) return;
    fileInput.click();
  });

  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files, previewId, pendingArray);
  });

  fileInput.addEventListener('change', () => {
    handleFiles(fileInput.files, previewId, pendingArray);
    fileInput.value = '';
  });
}

function handleFiles(files, previewId, pendingArray) {
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const entry = { file, dataUrl: e.target.result };
      pendingArray.push(entry);
      renderUploadPreview(previewId, pendingArray);
    };
    reader.readAsDataURL(file);
  });
}

function renderUploadPreview(previewId, pendingArray, existingUrls = []) {
  const preview = document.getElementById(previewId);
  preview.innerHTML = '';

  existingUrls.forEach((url, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'upload-thumb';
    const img = document.createElement('img');
    img.src = url;
    img.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(url); });
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'upload-thumb-remove';
    btn.dataset.existing = i;
    btn.textContent = '\u00d7';
    thumb.appendChild(img);
    thumb.appendChild(btn);
    preview.appendChild(thumb);
  });

  pendingArray.forEach((entry, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'upload-thumb';
    const img = document.createElement('img');
    img.src = entry.dataUrl;
    img.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(entry.dataUrl); });
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'upload-thumb-remove';
    btn.dataset.pending = i;
    btn.textContent = '\u00d7';
    thumb.appendChild(img);
    thumb.appendChild(btn);
    preview.appendChild(thumb);
  });

  // Hide placeholder if there are files
  const zone = preview.closest('.upload-zone');
  const placeholder = zone.querySelector('.upload-placeholder');
  if (placeholder) placeholder.style.display = (existingUrls.length + pendingArray.length) > 0 ? 'none' : '';
}

// Remove buttons
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.upload-thumb-remove');
  if (!btn) return;
  e.stopPropagation();

  const zone = btn.closest('.upload-zone');
  const isPre = zone.id === 'upload-pre';
  const pending = isPre ? pendingFilesPre : pendingFilesPost;
  const existing = isPre ? existingScreensPre : existingScreensPost;
  const previewId = isPre ? 'preview-pre' : 'preview-post';

  if (btn.dataset.pending !== undefined) {
    pending.splice(parseInt(btn.dataset.pending), 1);
  } else if (btn.dataset.existing !== undefined) {
    existing.splice(parseInt(btn.dataset.existing), 1);
  }
  renderUploadPreview(previewId, pending, existing);
});

setupUploadZone('upload-pre', 'file-pre', 'preview-pre', pendingFilesPre);

// ==================== PASTE SCREENSHOTS (Ctrl+V / Cmd+V) ====================
document.addEventListener('paste', (e) => {
  if (!modal.classList.contains('open')) return;
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;

  const imageFiles = [];
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) imageFiles.push(file);
    }
  }
  if (imageFiles.length === 0) return;

  e.preventDefault();

  // Paste into whichever tab is active
  const isResultTab = document.getElementById('tab-result').classList.contains('active');
  const pending = isResultTab ? pendingFilesPost : pendingFilesPre;
  const previewId = isResultTab ? 'preview-post' : 'preview-pre';
  const existing = isResultTab ? existingScreensPost : existingScreensPre;

  imageFiles.forEach(file => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      pending.push({ file, dataUrl: ev.target.result });
      renderUploadPreview(previewId, pending, existing);
    };
    reader.readAsDataURL(file);
  });
});
setupUploadZone('upload-post', 'file-post', 'preview-post', pendingFilesPost);

// ==================== UPLOAD PENDING FILES TO CLOUDINARY ====================
async function uploadPendingFiles(files, userId) {
  const urls = [];
  for (const entry of files) {
    const url = await uploadToCloudinary(entry.file, userId);
    urls.push(url);
  }
  return urls;
}

// ==================== LIGHTBOX ====================
function openLightbox(src) {
  const lb = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = src;
  lb.classList.add('open');
}

document.getElementById('lightbox').addEventListener('click', (e) => {
  if (e.target.tagName !== 'IMG') {
    document.getElementById('lightbox').classList.remove('open');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.getElementById('lightbox').classList.remove('open');
});

// ==================== OPEN / CLOSE MODAL ====================
function openModal(trade = null) {
  editingTradeId = null;
  form.reset();
  pendingFilesPre = [];
  pendingFilesPost = [];
  existingScreensPre = [];
  existingScreensPost = [];
  document.getElementById('trade-rr').textContent = '--';
  document.getElementById('trade-rr').style.color = '';
  document.getElementById('trade-risk').textContent = '--';
  document.getElementById('trade-reward').textContent = '--';
  document.getElementById('trade-rr-actual').textContent = '--';
  document.getElementById('trade-rr-actual').style.color = '';
  document.getElementById('modal-title').textContent = 'Nueva Operacion';
  document.getElementById('trade-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('open-position-fields').style.display = 'none';
  document.getElementById('trade-exit').closest('.form-row').style.display = '';
  switchToTab('plan');

  if (trade) {
    editingTradeId = trade.id;
    document.getElementById('modal-title').textContent = 'Editar Operacion';
    document.getElementById('trade-id').value = trade.id;
    document.getElementById('trade-date').value = trade.date;
    document.getElementById('trade-asset').value = trade.asset;
    document.getElementById('trade-direction').value = trade.direction;
    document.getElementById('trade-quantity').value = trade.quantity;
    document.getElementById('trade-entry').value = trade.entry;
    document.getElementById('trade-exit').value = trade.exit || '';
    document.getElementById('trade-pnl').value = trade.pnl || '';
    document.getElementById('trade-result').value = trade.result || '';
    document.getElementById('trade-sl').value = trade.sl || '';
    document.getElementById('trade-tp').value = trade.tp || '';
    document.getElementById('trade-notes-pre').value = trade.notesPre || trade.notes || '';
    document.getElementById('trade-notes-post').value = trade.notesPost || '';

    // Open position fields
    if (trade.result === 'open') {
      document.getElementById('open-position-fields').style.display = '';
      document.getElementById('trade-exit').closest('.form-row').style.display = 'none';
      document.getElementById('trade-market-symbol').value = trade.marketSymbol || '';
      document.getElementById('trade-market-type').value = trade.marketType || 'stock';
    }

    existingScreensPre = [...(trade.screenshotsPre || [])];
    existingScreensPost = [...(trade.screenshotsPost || [])];

    calcRR();
    calcRRActual();
  }

  renderUploadPreview('preview-pre', pendingFilesPre, existingScreensPre);
  renderUploadPreview('preview-post', pendingFilesPost, existingScreensPost);
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

  const saveBtn = document.getElementById('save-trade-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Guardando...';

  try {
    const exitVal = document.getElementById('trade-exit').value;
    const pnlVal = document.getElementById('trade-pnl').value;
    const entry = parseFloat(document.getElementById('trade-entry').value);
    const direction = document.getElementById('trade-direction').value;
    const quantity = parseFloat(document.getElementById('trade-quantity').value);

    const trade = {
      id: editingTradeId || null,
      date: document.getElementById('trade-date').value,
      asset: document.getElementById('trade-asset').value.toUpperCase().trim(),
      direction,
      quantity,
      entry,
      exit: exitVal ? parseFloat(exitVal) : null,
      sl: parseFloat(document.getElementById('trade-sl').value) || null,
      tp: parseFloat(document.getElementById('trade-tp').value) || null,
      pnl: 0,
      result: document.getElementById('trade-result').value || '',
      notesPre: document.getElementById('trade-notes-pre').value.trim(),
      notesPost: document.getElementById('trade-notes-post').value.trim(),
      notes: document.getElementById('trade-notes-pre').value.trim(),
      screenshotsPre: [...existingScreensPre],
      screenshotsPost: [...existingScreensPost],
    };

    // Calculate Risk in $
    let riskAmount = 0;
    if (entry && trade.sl) {
      if (direction === 'long') {
        riskAmount = (entry - trade.sl) * quantity;
      } else {
        riskAmount = (trade.sl - entry) * quantity;
      }
      riskAmount = Math.round(Math.abs(riskAmount) * 100) / 100;
    }
    trade.risk = riskAmount;

    // Result is always set by the user
    trade.result = document.getElementById('trade-result').value || 'breakeven';

    // Save open position extra fields
    if (trade.result === 'open') {
      trade.marketSymbol = document.getElementById('trade-market-symbol').value.toUpperCase().trim() || trade.asset;
      trade.marketType = document.getElementById('trade-market-type').value || 'stock';
      trade.pnl = 0;
    }

    // Calculate P&L — resultado determines the P&L logic
    if (trade.result !== 'open' && pnlVal) {
      // Manual P&L entered by user
      trade.pnl = parseFloat(pnlVal);
    } else if (trade.result === 'loss') {
      // Perdedora → P&L = -Riesgo (hit SL)
      trade.pnl = riskAmount > 0 ? -riskAmount : 0;
    } else if (trade.result === 'win') {
      // Ganadora → P&L from exit price, or TP if no exit
      if (trade.exit !== null) {
        if (direction === 'long') {
          trade.pnl = (trade.exit - entry) * quantity;
        } else {
          trade.pnl = (entry - trade.exit) * quantity;
        }
        trade.pnl = Math.round(trade.pnl * 100) / 100;
      } else if (trade.tp && entry) {
        if (direction === 'long') {
          trade.pnl = Math.round((trade.tp - entry) * quantity * 100) / 100;
        } else {
          trade.pnl = Math.round((entry - trade.tp) * quantity * 100) / 100;
        }
      }
    } else {
      // Breakeven → P&L = 0
      trade.pnl = 0;
    }

    // Upload pending images to Cloudinary
    console.log('[SAVE] pendingPre:', pendingFilesPre.length, 'pendingPost:', pendingFilesPost.length);
    console.log('[SAVE] existingPre:', existingScreensPre.length, 'existingPost:', existingScreensPost.length);

    if (pendingFilesPre.length > 0 || pendingFilesPost.length > 0) {
      saveBtn.textContent = 'Subiendo imagenes...';
      try {
        const [newPreUrls, newPostUrls] = await Promise.all([
          uploadPendingFiles(pendingFilesPre, currentUser.uid),
          uploadPendingFiles(pendingFilesPost, currentUser.uid),
        ]);
        console.log('[SAVE] Cloudinary URLs pre:', newPreUrls);
        console.log('[SAVE] Cloudinary URLs post:', newPostUrls);
        trade.screenshotsPre = [...existingScreensPre, ...newPreUrls];
        trade.screenshotsPost = [...existingScreensPost, ...newPostUrls];
      } catch (uploadErr) {
        console.error('[SAVE] Upload failed:', uploadErr);
        alert('Error subiendo imagenes: ' + uploadErr.message);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar';
        return;
      }
    }

    console.log('[SAVE] Final screenshotsPre:', trade.screenshotsPre);
    console.log('[SAVE] Final screenshotsPost:', trade.screenshotsPost);

    // Save to Firestore
    saveBtn.textContent = 'Guardando...';
    const { id: savedId, ...dataToSave } = trade;
    dataToSave.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    console.log('[SAVE] Saving to Firestore, editingId:', editingTradeId);

    if (editingTradeId) {
      await userTradesRef().doc(editingTradeId).set(dataToSave);
    } else {
      dataToSave.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await userTradesRef().add(dataToSave);
    }

    console.log('[SAVE] Success!');
    closeModal();
  } catch (err) {
    alert('Error al guardar: ' + err.message);
  }

  saveBtn.disabled = false;
  saveBtn.textContent = 'Guardar';
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
    const allScreens = [...(t.screenshotsPre || []), ...(t.screenshotsPost || [])];
    const thumbsHtml = allScreens.length > 0
      ? `<div class="trade-thumbs">${allScreens.slice(0, 3).map((_, idx) => `<img class="trade-thumb trade-thumb-lg" data-trade-img="${t.id}" data-img-idx="${idx}">`).join('')}${allScreens.length > 3 ? `<span style="font-size:11px;color:var(--text-muted);align-self:center;">+${allScreens.length - 3}</span>` : ''}</div>`
      : '<span style="color:var(--text-muted);font-size:11px;">-</span>';

    // Calculate RR for display
    let rrText = '-';
    if (t.entry && t.sl && t.tp) {
      let risk, reward;
      if (t.direction === 'long') { risk = t.entry - t.sl; reward = t.tp - t.entry; }
      else { risk = t.sl - t.entry; reward = t.entry - t.tp; }
      if (risk > 0 && reward > 0) rrText = `1:${(reward / risk).toFixed(1)}`;
    }

    return `
    <tr class="trade-row trade-row-${t.result}" data-trade-id="${t.id}">
      <td>${formatDate(t.date)}</td>
      <td><strong>${escapeHtml(t.asset)}</strong></td>
      <td><span class="badge badge-${t.direction}">${t.direction.toUpperCase()}</span></td>
      <td>${t.entry}</td>
      <td>${t.sl || '-'}</td>
      <td>${t.tp || '-'}</td>
      <td>${t.exit || '-'}</td>
      <td>${rrText}</td>
      <td class="negative">${t.risk ? '-$' + t.risk.toFixed(2) : '-'}</td>
      <td class="pnl ${(t.pnl || 0) >= 0 ? 'positive' : 'negative'}">${(t.pnl || 0) >= 0 ? '+' : ''}$${(t.pnl || 0).toFixed(2)}</td>
      <td><span class="badge badge-${t.result}">${resultLabel(t.result)}</span></td>
      <td>${thumbsHtml}</td>
      <td class="actions-cell">
        <button class="btn btn-sm btn-edit" data-edit-id="${t.id}" onclick="event.stopPropagation()">Editar</button>
        <button class="btn btn-sm btn-delete" onclick="event.stopPropagation();deleteTrade('${t.id}')">Eliminar</button>
      </td>
    </tr>`;
  }).join('');

  // Set thumbnail sources and click handlers (avoids huge base64 in HTML attributes)
  tbody.querySelectorAll('img[data-trade-img]').forEach(img => {
    const trade = tradesCache.find(t => t.id === img.dataset.tradeImg);
    if (trade) {
      const allScreens = [...(trade.screenshotsPre || []), ...(trade.screenshotsPost || [])];
      const idx = parseInt(img.dataset.imgIdx);
      if (allScreens[idx]) {
        img.src = allScreens[idx];
        img.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(allScreens[idx]); });
      }
    }
  });

  // Edit button click
  tbody.querySelectorAll('[data-edit-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const trade = tradesCache.find(t => t.id === btn.dataset.editId);
      if (trade) openModal(trade);
    });
  });

  // Double-click to edit
  tbody.querySelectorAll('.trade-row').forEach(row => {
    row.addEventListener('dblclick', () => {
      const trade = tradesCache.find(t => t.id === row.dataset.tradeId);
      if (trade) openModal(trade);
    });
    row.style.cursor = 'pointer';
  });
}

document.getElementById('filter-asset').addEventListener('input', renderTradesTable);
document.getElementById('filter-result').addEventListener('change', renderTradesTable);

// ==================== DASHBOARD ====================
function renderDashboard() {
  const trades = getTrades();
  const sorted = [...trades].sort((a, b) => new Date(a.date) - new Date(b.date));
  const wins = trades.filter(t => t.result === 'win');
  const losses = trades.filter(t => t.result === 'loss');
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);

  // Fila 1
  document.getElementById('total-trades').textContent = trades.length;
  document.getElementById('win-trades').textContent = wins.length;
  document.getElementById('loss-trades').textContent = losses.length;
  document.getElementById('win-rate').textContent = trades.length ? Math.round((wins.length / trades.length) * 100) + '%' : '0%';
  const pnlEl = document.getElementById('total-pnl');
  pnlEl.textContent = (totalPnl >= 0 ? '+' : '') + '$' + totalPnl.toFixed(2);
  pnlEl.className = 'card-value ' + (totalPnl >= 0 ? 'positive' : 'negative');

  // Fila 2: métricas avanzadas
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const pf = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : wins.length > 0 ? '∞' : '--';
  document.getElementById('profit-factor').textContent = pf;
  document.getElementById('profit-factor').className = 'card-value ' + (parseFloat(pf) >= 1 ? 'positive' : 'negative');

  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  document.getElementById('avg-win').textContent = '$' + avgWin.toFixed(2);
  document.getElementById('avg-loss').textContent = '-$' + avgLoss.toFixed(2);

  const bestTrade = trades.length ? Math.max(...trades.map(t => t.pnl)) : 0;
  const worstTrade = trades.length ? Math.min(...trades.map(t => t.pnl)) : 0;
  document.getElementById('best-trade').textContent = '+$' + bestTrade.toFixed(2);
  document.getElementById('worst-trade').textContent = '$' + worstTrade.toFixed(2);

  // Racha máxima ganadora y perdedora
  let maxStreak = 0, curStreak = 0;
  let maxLossStreak = 0, curLossStreak = 0;
  sorted.forEach(t => {
    if (t.result === 'win') { curStreak++; maxStreak = Math.max(maxStreak, curStreak); curLossStreak = 0; }
    else if (t.result === 'loss') { curLossStreak++; maxLossStreak = Math.max(maxLossStreak, curLossStreak); curStreak = 0; }
    else { curStreak = 0; curLossStreak = 0; }
  });
  document.getElementById('max-streak').textContent = maxStreak;
  document.getElementById('max-loss-streak').textContent = maxLossStreak;

  // Max Drawdown
  let peak = 0, maxDD = 0, cum = 0;
  sorted.forEach(t => {
    cum += t.pnl;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  });
  const ddEl = document.getElementById('max-drawdown');
  ddEl.textContent = '-$' + maxDD.toFixed(2);

  // Expectancy (expected $ per trade)
  const expectancy = trades.length ? totalPnl / trades.length : 0;
  const expEl = document.getElementById('expectancy');
  expEl.textContent = (expectancy >= 0 ? '+' : '') + '$' + expectancy.toFixed(2);
  expEl.className = 'card-value ' + (expectancy >= 0 ? 'positive' : 'negative');

  // Average Risk:Reward ratio
  const avgRR = avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : wins.length > 0 ? '∞' : '--';
  const rrEl = document.getElementById('avg-rr');
  rrEl.textContent = typeof avgRR === 'string' ? avgRR : '1:' + avgRR;
  if (parseFloat(avgRR) >= 1) rrEl.className = 'card-value positive';
  else if (!isNaN(parseFloat(avgRR))) rrEl.className = 'card-value negative';

  // Recent trades
  const recent = [...trades].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  document.getElementById('recent-trades-body').innerHTML = recent.map(t => `
    <tr class="trade-row-${t.result}">
      <td>${formatDate(t.date)}</td>
      <td><strong>${escapeHtml(t.asset)}</strong></td>
      <td><span class="badge badge-${t.direction}">${t.direction.toUpperCase()}</span></td>
      <td class="pnl ${(t.pnl || 0) >= 0 ? 'positive' : 'negative'}">${(t.pnl || 0) >= 0 ? '+' : ''}$${(t.pnl || 0).toFixed(2)}</td>
      <td><span class="badge badge-${t.result}">${resultLabel(t.result)}</span></td>
    </tr>
  `).join('');

  renderEquityChart(sorted);
  renderMonthlyChart(sorted);
  renderAssetChart(trades);
  renderWeekdayChart(trades);
  renderPnlDistribution(trades);
  renderDirectionChart(trades);
  renderHourlyChart(trades);
}

// ==================== EQUITY CURVE ====================
let equityChart = null;
let equitySeriesClosed = null;
let equitySeriesOpen = null;

function renderEquityChart(sortedTrades) {
  const container = document.getElementById('equity-chart-container');

  if (!equityChart) {
    equityChart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: 260,
      layout: { background: { color: '#1a1d27' }, textColor: '#8a8fa8' },
      grid: { vertLines: { color: '#2a2e3d' }, horzLines: { color: '#2a2e3d' } },
      rightPriceScale: { borderColor: '#2a2e3d' },
      timeScale: { borderColor: '#2a2e3d', timeVisible: true },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      handleScroll: true,
      handleScale: true,
    });
    // Serie principal: todos los trades (azul/morado)
    equitySeriesClosed = equityChart.addAreaSeries({
      lineColor: '#6366f1',
      topColor: '#6366f140',
      bottomColor: '#6366f100',
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      title: 'P&L Total',
    });
    const resizeObs = new ResizeObserver(() => equityChart.applyOptions({ width: container.clientWidth }));
    resizeObs.observe(container);
  }

  if (sortedTrades.length === 0) {
    equitySeriesClosed.setData([]);
    return;
  }

  // Agrupar P&L por fecha: suma todos los trades del mismo día
  const dailyPnl = {};
  sortedTrades.forEach(t => {
    const day = t.date;
    dailyPnl[day] = (dailyPnl[day] || 0) + (t.pnl || 0);
  });

  // Ordenar por fecha y calcular acumulado
  const sortedDays = Object.keys(dailyPnl).sort();
  let cumulative = 0;
  const data = [];
  sortedDays.forEach(day => {
    cumulative += dailyPnl[day];
    data.push({
      time: day, // 'YYYY-MM-DD' — LightweightCharts acepta este formato directamente
      value: parseFloat(cumulative.toFixed(2)),
    });
  });

  // Añadir punto de hoy si la última fecha no es hoy y hay posiciones abiertas
  const todayStr = new Date().toISOString().split('T')[0];
  const hasOpen = sortedTrades.some(t => t.result === 'open');
  if (hasOpen && data.length > 0 && data[data.length - 1].time !== todayStr) {
    data.push({ time: todayStr, value: parseFloat(cumulative.toFixed(2)) });
  }

  equitySeriesClosed.setData(data);

  // Colorear según si está en positivo o negativo
  const lastVal = data[data.length - 1]?.value ?? 0;
  equitySeriesClosed.applyOptions({
    lineColor: lastVal >= 0 ? '#6366f1' : '#ef4444',
    topColor: lastVal >= 0 ? '#6366f140' : '#ef444430',
    bottomColor: '#00000000',
  });

  equityChart.timeScale().fitContent();
}

// ==================== BAR CHARTS ====================
function renderMonthlyChart(sortedTrades) {
  const container = document.getElementById('monthly-chart');
  const monthlyPnl = {};
  sortedTrades.forEach(t => {
    const key = t.date.slice(0, 7); // 'YYYY-MM'
    monthlyPnl[key] = (monthlyPnl[key] || 0) + t.pnl;
  });

  const entries = Object.entries(monthlyPnl).sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length === 0) { container.innerHTML = '<p class="empty-msg">No hay datos aun</p>'; return; }

  const maxAbs = Math.max(...entries.map(e => Math.abs(e[1])), 1);
  container.innerHTML = entries.map(([month, pnl]) => {
    const [y, m] = month.split('-');
    const label = new Date(+y, +m - 1, 1).toLocaleString('es-ES', { month: 'short', year: '2-digit' });
    const width = Math.round((Math.abs(pnl) / maxAbs) * 100);
    const cls = pnl >= 0 ? 'bar-positive' : 'bar-negative';
    return `<div class="bar-row"><span class="bar-label">${label}</span><div class="bar-track"><div class="bar-fill ${cls}" style="width:${Math.max(width, 3)}%"></div></div><span class="bar-value ${pnl >= 0 ? 'positive' : 'negative'}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</span></div>`;
  }).join('');
}

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

// ==================== P&L DISTRIBUTION ====================
function renderPnlDistribution(trades) {
  const container = document.getElementById('pnl-distribution-chart');
  if (trades.length === 0) { container.innerHTML = '<p class="empty-msg">No hay datos aun</p>'; return; }

  const pnls = trades.map(t => t.pnl);
  const min = Math.min(...pnls);
  const max = Math.max(...pnls);
  const range = max - min || 1;
  const bucketCount = Math.min(10, trades.length);
  const bucketSize = range / bucketCount;

  const buckets = Array(bucketCount).fill(0);
  const bucketLabels = [];
  for (let i = 0; i < bucketCount; i++) {
    const lo = min + i * bucketSize;
    const hi = lo + bucketSize;
    bucketLabels.push(lo);
    pnls.forEach(p => {
      if (i === bucketCount - 1 ? (p >= lo && p <= hi) : (p >= lo && p < hi)) buckets[i]++;
    });
  }

  const maxCount = Math.max(...buckets, 1);
  container.innerHTML = buckets.map((count, i) => {
    const lo = bucketLabels[i];
    const label = '$' + Math.round(lo);
    const width = Math.round((count / maxCount) * 100);
    const cls = lo >= 0 ? 'bar-positive' : 'bar-negative';
    return `<div class="bar-row"><span class="bar-label">${label}</span><div class="bar-track"><div class="bar-fill ${cls}" style="width:${Math.max(width, 3)}%"></div></div><span class="bar-value">${count}</span></div>`;
  }).join('');
}

// ==================== LONG VS SHORT ====================
function renderDirectionChart(trades) {
  const container = document.getElementById('direction-chart');
  if (trades.length === 0) { container.innerHTML = '<p class="empty-msg">No hay datos aun</p>'; return; }

  const longs = trades.filter(t => t.direction === 'long');
  const shorts = trades.filter(t => t.direction === 'short');

  const longPnl = longs.reduce((s, t) => s + t.pnl, 0);
  const shortPnl = shorts.reduce((s, t) => s + t.pnl, 0);
  const longWR = longs.length ? Math.round((longs.filter(t => t.result === 'win').length / longs.length) * 100) : 0;
  const shortWR = shorts.length ? Math.round((shorts.filter(t => t.result === 'win').length / shorts.length) * 100) : 0;

  container.innerHTML = `
    <div class="direction-comparison">
      <div class="direction-col">
        <span class="direction-title badge badge-long">LONG</span>
        <div class="direction-stats">
          <div class="direction-stat"><span class="direction-stat-label">Trades</span><span class="direction-stat-value">${longs.length}</span></div>
          <div class="direction-stat"><span class="direction-stat-label">Win Rate</span><span class="direction-stat-value">${longWR}%</span></div>
          <div class="direction-stat"><span class="direction-stat-label">P&L</span><span class="direction-stat-value ${longPnl >= 0 ? 'positive' : 'negative'}">${longPnl >= 0 ? '+' : ''}$${longPnl.toFixed(2)}</span></div>
        </div>
      </div>
      <div class="direction-vs">VS</div>
      <div class="direction-col">
        <span class="direction-title badge badge-short">SHORT</span>
        <div class="direction-stats">
          <div class="direction-stat"><span class="direction-stat-label">Trades</span><span class="direction-stat-value">${shorts.length}</span></div>
          <div class="direction-stat"><span class="direction-stat-label">Win Rate</span><span class="direction-stat-value">${shortWR}%</span></div>
          <div class="direction-stat"><span class="direction-stat-label">P&L</span><span class="direction-stat-value ${shortPnl >= 0 ? 'positive' : 'negative'}">${shortPnl >= 0 ? '+' : ''}$${shortPnl.toFixed(2)}</span></div>
        </div>
      </div>
    </div>`;
}

// ==================== HOURLY CHART ====================
function renderHourlyChart(trades) {
  const container = document.getElementById('hourly-chart');
  const tradesWithTime = trades.filter(t => t.entryTime);
  if (tradesWithTime.length === 0) { container.innerHTML = '<p class="empty-msg">Añade hora de entrada a tus trades</p>'; return; }

  const hourPnl = {};
  tradesWithTime.forEach(t => {
    const h = parseInt(t.entryTime.split(':')[0]);
    const label = h.toString().padStart(2, '0') + ':00';
    hourPnl[label] = (hourPnl[label] || 0) + t.pnl;
  });

  const entries = Object.entries(hourPnl).sort((a, b) => a[0].localeCompare(b[0]));
  const maxAbs = Math.max(...entries.map(e => Math.abs(e[1])), 1);
  container.innerHTML = entries.map(([hour, pnl]) => {
    const width = Math.round((Math.abs(pnl) / maxAbs) * 100);
    const cls = pnl >= 0 ? 'bar-positive' : 'bar-negative';
    return `<div class="bar-row"><span class="bar-label">${hour}</span><div class="bar-track"><div class="bar-fill ${cls}" style="width:${Math.max(width, 3)}%"></div></div><span class="bar-value ${pnl >= 0 ? 'positive' : 'negative'}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</span></div>`;
  }).join('');
}

// ==================== CALENDAR ====================
const WEEKDAY_NAMES = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function getTradesByDate(trades) {
  const map = {};
  trades.forEach(t => { if (!map[t.date]) map[t.date] = []; map[t.date].push(t); });
  return map;
}

function dateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const todayStr = new Date().toISOString().split('T')[0];

function renderCalendar() {
  if (calendarView === 'week') renderWeekView();
  else if (calendarView === 'year') renderYearView();
  else renderMonthView();
}

// ==================== MONTH VIEW ====================
function renderMonthView() {
  const trades = getTrades();
  const grid = document.getElementById('calendar-grid');
  const titleEl = document.getElementById('calendar-month-year');
  titleEl.textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;

  const tradesByDate = getTradesByDate(trades);

  const firstDay = new Date(currentYear, currentMonth, 1);
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  let html = '<div class="calendar-header-row">';
  WEEKDAY_NAMES.forEach(d => { html += `<div class="calendar-header-cell">${d}</div>`; });
  html += '</div><div class="calendar-body">';

  for (let i = 0; i < startDay; i++) html += '<div class="calendar-cell empty"></div>';

  for (let day = 1; day <= daysInMonth; day++) {
    const ds = dateStr(currentYear, currentMonth, day);
    const dayTrades = tradesByDate[ds] || [];
    const dayPnl = dayTrades.reduce((sum, t) => sum + t.pnl, 0);

    let cellClass = 'calendar-cell';
    if (dayTrades.length > 0) {
      if (dayPnl > 0) cellClass += ' day-win';
      else if (dayPnl < 0) cellClass += ' day-loss';
      else cellClass += ' day-breakeven';
    }
    if (ds === todayStr) cellClass += ' today';

    html += `<div class="${cellClass}" data-date="${ds}"><span class="day-number">${day}</span>`;
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

// ==================== WEEK VIEW ====================
function renderWeekView() {
  const trades = getTrades();
  const grid = document.getElementById('calendar-grid');
  const titleEl = document.getElementById('calendar-month-year');
  const tradesByDate = getTradesByDate(trades);

  const weekEnd = new Date(currentWeekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const startLabel = currentWeekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  const endLabel = weekEnd.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  titleEl.textContent = `${startLabel} - ${endLabel}`;

  let html = '<div class="week-header-row">';
  for (let i = 0; i < 7; i++) {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    html += `<div class="week-header-cell">${WEEKDAY_NAMES[i]}<span class="week-header-date">${d.getDate()}</span></div>`;
  }
  html += '</div><div class="week-grid">';

  for (let i = 0; i < 7; i++) {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    const ds = dateStr(d.getFullYear(), d.getMonth(), d.getDate());
    const dayTrades = tradesByDate[ds] || [];
    const dayPnl = dayTrades.reduce((sum, t) => sum + t.pnl, 0);

    let cellClass = 'week-cell';
    if (dayTrades.length > 0) {
      if (dayPnl > 0) cellClass += ' day-win';
      else if (dayPnl < 0) cellClass += ' day-loss';
      else cellClass += ' day-breakeven';
    }
    if (ds === todayStr) cellClass += ' today';

    html += `<div class="${cellClass}" data-date="${ds}">`;
    if (dayTrades.length > 0) {
      dayTrades.forEach(t => {
        const allScreens = [...(t.screenshotsPre || []), ...(t.screenshotsPost || [])];
        html += `<div class="week-trade-item trade-${t.result}" data-trade-id="${t.id}">`;
        html += `<div class="week-trade-asset">${escapeHtml(t.asset)} <span class="badge badge-${t.direction}" style="font-size:9px;padding:1px 4px;">${t.direction.toUpperCase()}</span></div>`;
        html += `<div class="week-trade-pnl ${(t.pnl||0) >= 0 ? 'positive' : 'negative'}">${(t.pnl||0) >= 0 ? '+' : ''}$${(t.pnl||0).toFixed(2)}</div>`;
        if (t.notesPre || t.notes) html += `<div class="week-trade-notes">${escapeHtml(t.notesPre || t.notes)}</div>`;
        if (allScreens.length > 0) {
          html += '<div class="week-trade-thumbs">';
          allScreens.slice(0, 2).forEach((_, idx) => {
            html += `<img class="week-trade-thumb" data-week-img="${t.id}" data-img-idx="${idx}">`;
          });
          if (allScreens.length > 2) html += `<span style="font-size:9px;color:var(--text-muted);">+${allScreens.length - 2}</span>`;
          html += '</div>';
        }
        html += '</div>';
      });
      html += `<div class="day-summary" style="margin-top:8px;"><span class="${dayPnl >= 0 ? 'positive' : 'negative'}">${dayPnl >= 0 ? '+' : ''}$${dayPnl.toFixed(2)}</span></div>`;
    }
    html += '</div>';
  }
  html += '</div>';
  grid.innerHTML = html;

  // Set week thumbnail sources
  grid.querySelectorAll('img[data-week-img]').forEach(img => {
    const trade = tradesCache.find(t => t.id === img.dataset.weekImg);
    if (trade) {
      const allScreens = [...(trade.screenshotsPre || []), ...(trade.screenshotsPost || [])];
      const idx = parseInt(img.dataset.imgIdx);
      if (allScreens[idx]) {
        img.src = allScreens[idx];
        img.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(allScreens[idx]); });
      }
    }
  });

  // Double-click on trade item to edit
  grid.querySelectorAll('.week-trade-item').forEach(item => {
    item.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      const trade = tradesCache.find(t => t.id === item.dataset.tradeId);
      if (trade) openModal(trade);
    });
    item.style.cursor = 'pointer';
  });

  grid.querySelectorAll('.week-cell').forEach(cell => {
    cell.addEventListener('click', (e) => {
      if (e.target.closest('.week-trade-item')) return;
      openModal();
      document.getElementById('trade-date').value = cell.dataset.date;
    });
  });
}

// ==================== YEAR VIEW ====================
function renderYearView() {
  const trades = getTrades();
  const grid = document.getElementById('calendar-grid');
  const titleEl = document.getElementById('calendar-month-year');
  titleEl.textContent = `${currentYear}`;

  const tradesByDate = getTradesByDate(trades);

  let html = '<div class="year-grid">';
  for (let month = 0; month < 12; month++) {
    const daysInMonth = new Date(currentYear, month + 1, 0).getDate();
    let firstDayOfWeek = new Date(currentYear, month, 1).getDay() - 1;
    if (firstDayOfWeek < 0) firstDayOfWeek = 6;

    let monthPnl = 0;
    let monthTradeCount = 0;

    html += `<div class="year-month" data-month="${month}">`;
    html += `<div class="year-month-title">${MONTH_NAMES[month].slice(0, 3)}</div>`;
    html += '<div class="year-month-header">';
    WEEKDAY_NAMES.forEach(d => { html += `<span>${d.charAt(0)}</span>`; });
    html += '</div><div class="year-month-grid">';

    for (let i = 0; i < firstDayOfWeek; i++) html += '<div class="year-day empty"></div>';

    for (let day = 1; day <= daysInMonth; day++) {
      const ds = dateStr(currentYear, month, day);
      const dayTrades = tradesByDate[ds] || [];
      const dayPnl = dayTrades.reduce((sum, t) => sum + t.pnl, 0);
      monthPnl += dayPnl;
      monthTradeCount += dayTrades.length;

      let cls = 'year-day';
      if (dayTrades.length > 0) {
        if (dayPnl > 0) cls += ' day-win';
        else if (dayPnl < 0) cls += ' day-loss';
        else cls += ' day-breakeven';
      }
      if (ds === todayStr) cls += ' today';

      const tooltip = dayTrades.length > 0
        ? `${day}: ${dayTrades.length} op, ${dayPnl >= 0 ? '+' : ''}$${dayPnl.toFixed(2)}`
        : `${day}`;
      html += `<div class="${cls}" title="${tooltip}"></div>`;
    }
    html += '</div>';

    if (monthTradeCount > 0) {
      html += `<div class="year-month-summary"><span class="${monthPnl >= 0 ? 'positive' : 'negative'}">${monthPnl >= 0 ? '+' : ''}$${monthPnl.toFixed(2)}</span> <span style="color:var(--text-muted);font-size:10px;">(${monthTradeCount} ops)</span></div>`;
    }
    html += '</div>';
  }
  html += '</div>';
  grid.innerHTML = html;

  grid.querySelectorAll('.year-month').forEach(el => {
    el.addEventListener('click', () => {
      currentMonth = parseInt(el.dataset.month);
      calendarView = 'month';
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.view-btn[data-view="month"]').classList.add('active');
      renderCalendar();
    });
  });
}

// ==================== CALENDAR NAVIGATION ====================
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    calendarView = btn.dataset.view;
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderCalendar();
  });
});

document.getElementById('prev-month').addEventListener('click', () => {
  if (calendarView === 'week') {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  } else if (calendarView === 'year') {
    currentYear--;
  } else {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  }
  renderCalendar();
});

document.getElementById('next-month').addEventListener('click', () => {
  if (calendarView === 'week') {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  } else if (calendarView === 'year') {
    currentYear++;
  } else {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  }
  renderCalendar();
});

// ==================== STATISTICS ====================
function renderStats() {
  const trades = getTrades();
  const assetData = {};
  trades.forEach(t => {
    if (!assetData[t.asset]) assetData[t.asset] = { pnl: 0, wins: 0, total: 0 };
    assetData[t.asset].pnl += t.pnl; assetData[t.asset].total++;
    if (t.result === 'win') assetData[t.asset].wins++;
  });

  const bestAssets = Object.entries(assetData).filter(([, d]) => d.pnl > 0).sort((a, b) => b[1].pnl - a[1].pnl).slice(0, 5);
  document.getElementById('stats-best-assets').innerHTML = bestAssets.length ? bestAssets.map(([asset, data]) => `<div class="stat-item"><span class="stat-name">${escapeHtml(asset)}</span><span class="stat-value positive">+$${data.pnl.toFixed(2)}</span><span class="stat-detail">${data.total} ops | WR: ${Math.round((data.wins / data.total) * 100)}%</span></div>`).join('') : '<p class="empty-msg">No hay activos con ganancias</p>';

  const worstAssets = Object.entries(assetData).filter(([, d]) => d.pnl < 0).sort((a, b) => a[1].pnl - b[1].pnl).slice(0, 5);
  document.getElementById('stats-worst-assets').innerHTML = worstAssets.length ? worstAssets.map(([asset, data]) => `<div class="stat-item"><span class="stat-name">${escapeHtml(asset)}</span><span class="stat-value negative">$${data.pnl.toFixed(2)}</span><span class="stat-detail">${data.total} ops | WR: ${Math.round((data.wins / data.total) * 100)}%</span></div>`).join('') : '<p class="empty-msg">No hay activos con perdidas</p>';

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
  return { win: 'Ganadora', loss: 'Perdedora', breakeven: 'Breakeven', open: 'Abierta' }[result] || result;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== MARKETS / WATCHLISTS ====================
let watchlistsCache = [];
let activeWatchlistId = null;
let quotesCache = {};
let quotesInterval = null;
let unsubscribeWatchlists = null;

// Popular instruments suggestions
const POPULAR_INSTRUMENTS = {
  crypto: [
    { symbol: 'BTCUSDT', name: 'Bitcoin' },
    { symbol: 'ETHUSDT', name: 'Ethereum' },
    { symbol: 'BNBUSDT', name: 'BNB' },
    { symbol: 'SOLUSDT', name: 'Solana' },
    { symbol: 'XRPUSDT', name: 'XRP' },
    { symbol: 'ADAUSDT', name: 'Cardano' },
    { symbol: 'DOGEUSDT', name: 'Dogecoin' },
    { symbol: 'DOTUSDT', name: 'Polkadot' },
    { symbol: 'AVAXUSDT', name: 'Avalanche' },
    { symbol: 'MATICUSDT', name: 'Polygon' },
    { symbol: 'LINKUSDT', name: 'Chainlink' },
    { symbol: 'LTCUSDT', name: 'Litecoin' },
  ],
  forex: [
    { symbol: 'EURUSDT', name: 'EUR/USD' },
    { symbol: 'GBPUSDT', name: 'GBP/USD' },
    { symbol: 'JPYUSDT', name: 'JPY/USD' },
  ],
  stock: [
    { symbol: 'AAPL', name: 'Apple' },
    { symbol: 'MSFT', name: 'Microsoft' },
    { symbol: 'GOOGL', name: 'Google' },
    { symbol: 'TSLA', name: 'Tesla' },
    { symbol: 'AMZN', name: 'Amazon' },
    { symbol: 'NVDA', name: 'NVIDIA' },
  ],
};

function userWatchlistsRef() {
  return db.collection('users').doc(currentUser.uid).collection('watchlists');
}

function subscribeWatchlists() {
  if (unsubscribeWatchlists) unsubscribeWatchlists();
  unsubscribeWatchlists = userWatchlistsRef().orderBy('createdAt').onSnapshot((snapshot) => {
    watchlistsCache = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderWatchlistTabs();
    if (activeWatchlistId) {
      const exists = watchlistsCache.find(w => w.id === activeWatchlistId);
      if (!exists && watchlistsCache.length > 0) {
        activeWatchlistId = watchlistsCache[0].id;
      } else if (!exists) {
        activeWatchlistId = null;
      }
    } else if (watchlistsCache.length > 0) {
      activeWatchlistId = watchlistsCache[0].id;
    }
    renderWatchlistTabs();
    if (activeWatchlistId) fetchQuotes();
  });
}

function renderWatchlistTabs() {
  const container = document.getElementById('watchlist-tabs');
  const addBar = document.getElementById('add-instrument-bar');

  if (watchlistsCache.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">No tienes listas. Crea una para empezar a seguir instrumentos.</p>';
    addBar.style.display = 'none';
    document.getElementById('quotes-table-body').innerHTML = '<tr><td colspan="8" class="empty-msg">Crea una lista para ver cotizaciones</td></tr>';
    return;
  }

  container.innerHTML = watchlistsCache.map(w => {
    const instruments = w.instruments || [];
    const isActive = w.id === activeWatchlistId;
    return `<button class="watchlist-tab ${isActive ? 'active' : ''}" data-wl-id="${w.id}">
      ${escapeHtml(w.name)}
      <span class="tab-count">${instruments.length}</span>
      <span class="watchlist-tab-delete" data-wl-delete="${w.id}" title="Eliminar lista">&times;</span>
    </button>`;
  }).join('');

  addBar.style.display = activeWatchlistId ? 'block' : 'none';

  // Show suggestions for active watchlist type
  const activeWl = watchlistsCache.find(w => w.id === activeWatchlistId);
  if (activeWl) {
    const type = activeWl.type || 'crypto';
    document.getElementById('instrument-type').value = type === 'mixed' ? 'crypto' : type;
    renderInstrumentSuggestions(type, activeWl.instruments || []);
  }

  // Tab click handlers
  container.querySelectorAll('.watchlist-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      if (e.target.closest('.watchlist-tab-delete')) return;
      activeWatchlistId = tab.dataset.wlId;
      renderWatchlistTabs();
      fetchQuotes();
    });
  });

  // Delete watchlist
  container.querySelectorAll('.watchlist-tab-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Eliminar esta lista?')) return;
      try {
        await userWatchlistsRef().doc(btn.dataset.wlDelete).delete();
        if (activeWatchlistId === btn.dataset.wlDelete) {
          activeWatchlistId = watchlistsCache.length > 1 ? watchlistsCache.find(w => w.id !== btn.dataset.wlDelete)?.id : null;
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    });
  });
}

function renderInstrumentSuggestions(type, existingInstruments) {
  const container = document.getElementById('instrument-suggestions');
  const suggestions = POPULAR_INSTRUMENTS[type === 'mixed' ? 'crypto' : type] || [];
  const existingSymbols = existingInstruments.map(i => i.symbol);

  const filtered = suggestions.filter(s => !existingSymbols.includes(s.symbol));
  if (filtered.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = '<span style="font-size:11px;color:var(--text-muted);width:100%;margin-bottom:2px;">Sugerencias:</span>' +
    filtered.map(s => `<button type="button" class="instrument-suggestion" data-sym="${s.symbol}" data-name="${s.name}">+ ${s.name} (${s.symbol})</button>`).join('');

  container.querySelectorAll('.instrument-suggestion').forEach(btn => {
    btn.addEventListener('click', () => {
      addInstrumentToWatchlist(btn.dataset.sym, btn.dataset.name);
    });
  });
}

// Watchlist modal
const watchlistModal = document.getElementById('watchlist-modal');
const watchlistForm = document.getElementById('watchlist-form');

document.getElementById('add-watchlist-btn').addEventListener('click', () => {
  watchlistModal.classList.add('open');
  document.getElementById('watchlist-name').value = '';
  document.getElementById('watchlist-name').focus();
});

document.getElementById('watchlist-modal-close').addEventListener('click', () => watchlistModal.classList.remove('open'));
document.getElementById('watchlist-modal-cancel').addEventListener('click', () => watchlistModal.classList.remove('open'));
watchlistModal.addEventListener('click', (e) => { if (e.target === watchlistModal) watchlistModal.classList.remove('open'); });

watchlistForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('watchlist-name').value.trim();
  const type = document.getElementById('watchlist-type').value;
  if (!name) return;

  try {
    const docRef = await userWatchlistsRef().add({
      name,
      type,
      instruments: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    activeWatchlistId = docRef.id;
    watchlistModal.classList.remove('open');
  } catch (err) {
    alert('Error: ' + err.message);
  }
});

// Add instrument
document.getElementById('add-instrument-btn').addEventListener('click', () => {
  const symbol = document.getElementById('instrument-symbol').value.trim().toUpperCase();
  const name = document.getElementById('instrument-name').value.trim() || symbol;
  if (!symbol) return;
  addInstrumentToWatchlist(symbol, name);
});

document.getElementById('instrument-symbol').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('add-instrument-btn').click();
  }
});

async function addInstrumentToWatchlist(symbol, name) {
  if (!activeWatchlistId) return;

  const wl = watchlistsCache.find(w => w.id === activeWatchlistId);
  if (!wl) return;

  const instruments = wl.instruments || [];
  if (instruments.find(i => i.symbol === symbol)) {
    alert('Este instrumento ya esta en la lista');
    return;
  }

  const type = document.getElementById('instrument-type').value;

  try {
    await userWatchlistsRef().doc(activeWatchlistId).update({
      instruments: firebase.firestore.FieldValue.arrayUnion({ symbol, name, type }),
    });
    document.getElementById('instrument-symbol').value = '';
    document.getElementById('instrument-name').value = '';
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function removeInstrumentFromWatchlist(symbol) {
  if (!activeWatchlistId) return;
  const wl = watchlistsCache.find(w => w.id === activeWatchlistId);
  if (!wl) return;

  const instrument = (wl.instruments || []).find(i => i.symbol === symbol);
  if (!instrument) return;

  try {
    await userWatchlistsRef().doc(activeWatchlistId).update({
      instruments: firebase.firestore.FieldValue.arrayRemove(instrument),
    });
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ==================== FETCH QUOTES ====================
async function fetchQuotes() {
  const wl = watchlistsCache.find(w => w.id === activeWatchlistId);
  if (!wl || !wl.instruments || wl.instruments.length === 0) {
    renderQuotes([]);
    return;
  }

  const tbody = document.getElementById('quotes-table-body');
  tbody.innerHTML = '<tr><td colspan="8" class="quote-loading"><div class="spinner" style="margin:0 auto;width:24px;height:24px;"></div> Cargando cotizaciones...</td></tr>';

  const instruments = wl.instruments;
  const quotes = [];

  // Group by type
  const cryptoSymbols = instruments.filter(i => i.type === 'crypto').map(i => i.symbol);
  const otherInstruments = instruments.filter(i => i.type !== 'crypto');

  // Fetch crypto from Binance
  if (cryptoSymbols.length > 0) {
    try {
      const symbols = JSON.stringify(cryptoSymbols);
      const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbols)}`);
      if (res.ok) {
        const data = await res.json();
        data.forEach(ticker => {
          const instrument = instruments.find(i => i.symbol === ticker.symbol);
          quotes.push({
            symbol: ticker.symbol,
            name: instrument ? instrument.name : ticker.symbol,
            type: 'crypto',
            price: parseFloat(ticker.lastPrice),
            change: parseFloat(ticker.priceChange),
            changePercent: parseFloat(ticker.priceChangePercent),
            high: parseFloat(ticker.highPrice),
            low: parseFloat(ticker.lowPrice),
            volume: parseFloat(ticker.quoteVolume),
          });
        });
      }
    } catch (err) {
      console.error('Binance API error:', err);
    }
  }

  // Fetch stock/forex quotes via Finnhub API (free, CORS-enabled)
  if (otherInstruments.length > 0) {
    const FINNHUB_KEY = localStorage.getItem('finnhub_api_key') || 'demo';

    const stockQuotePromises = otherInstruments.map(async (inst) => {
      try {
        // Try Finnhub first (CORS-enabled, no proxy needed)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(inst.symbol)}&token=${FINNHUB_KEY}`,
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);
        if (res.ok) {
          const q = await res.json();
          // Finnhub returns: c=current, d=change, dp=change%, h=high, l=low, pc=prevClose, o=open
          if (q && q.c && q.c > 0) {
            return {
              symbol: inst.symbol,
              name: inst.name,
              type: inst.type,
              price: q.c,
              change: q.d,
              changePercent: q.dp,
              high: q.h || null,
              low: q.l || null,
              volume: null, // Finnhub quote doesn't include volume
            };
          }
        }
      } catch (err) {
        console.warn(`Finnhub error for ${inst.symbol}:`, err.message);
      }

      // Fallback: try Yahoo Finance via CORS proxy
      try {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(inst.symbol)}?interval=1d&range=1d`;
        const controller2 = new AbortController();
        const timeoutId2 = setTimeout(() => controller2.abort(), 8000);
        const res2 = await fetch(
          `https://corsproxy.io/?${yahooUrl}`,
          { signal: controller2.signal }
        );
        clearTimeout(timeoutId2);
        if (res2.ok) {
          const data = await res2.json();
          const meta = data?.chart?.result?.[0]?.meta;
          if (meta && meta.regularMarketPrice) {
            const price = meta.regularMarketPrice;
            const prevClose = meta.previousClose || meta.chartPreviousClose;
            return {
              symbol: inst.symbol,
              name: inst.name,
              type: inst.type,
              price: price,
              change: prevClose ? price - prevClose : null,
              changePercent: prevClose ? ((price - prevClose) / prevClose) * 100 : null,
              high: meta.regularMarketDayHigh || null,
              low: meta.regularMarketDayLow || null,
              volume: meta.regularMarketVolume || null,
            };
          }
        }
      } catch (err2) {
        console.warn(`Yahoo Finance error for ${inst.symbol}:`, err2.message);
      }

      // Final fallback to cached data
      const existing = quotesCache[inst.symbol];
      return {
        symbol: inst.symbol,
        name: inst.name,
        type: inst.type,
        price: existing ? existing.price : null,
        change: existing ? existing.change : null,
        changePercent: existing ? existing.changePercent : null,
        high: existing ? existing.high : null,
        low: existing ? existing.low : null,
        volume: existing ? existing.volume : null,
        noData: !existing,
      };
    });

    const stockQuotes = await Promise.all(stockQuotePromises);
    quotes.push(...stockQuotes);
  }

  // Update cache
  quotes.forEach(q => { quotesCache[q.symbol] = q; });

  renderQuotes(quotes);
  document.getElementById('quotes-refresh-info').textContent = `Actualizado: ${new Date().toLocaleTimeString('es-ES')}`;
}

function renderQuotes(quotes) {
  const tbody = document.getElementById('quotes-table-body');

  if (quotes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-msg">Añade instrumentos a esta lista para ver cotizaciones</td></tr>';
    return;
  }

  tbody.innerHTML = quotes.map(q => {
    const t = q.type;
    const priceStr = q.price !== null ? formatPrice(q.price, t) : '--';
    const changeStr = q.change !== null ? (q.change >= 0 ? '+' : '') + formatPrice(q.change, t) : '--';
    const changePctStr = q.changePercent !== null ? (q.changePercent >= 0 ? '+' : '') + q.changePercent.toFixed(2) + '%' : '--';
    const highStr = q.high !== null ? formatPrice(q.high, t) : '--';
    const lowStr = q.low !== null ? formatPrice(q.low, t) : '--';
    const volStr = q.volume !== null ? formatVolume(q.volume) : '--';
    const changeClass = q.changePercent !== null ? (q.changePercent >= 0 ? 'positive' : 'negative') : '';
    const badgeClass = q.changePercent !== null ? (q.changePercent >= 0 ? 'positive' : 'negative') : '';
    const arrow = q.changePercent !== null ? (q.changePercent >= 0 ? '&#9650;' : '&#9660;') : '';
    const icon = q.name ? q.name.charAt(0).toUpperCase() : q.symbol.charAt(0);

    return `
    <tr data-quote-symbol="${q.symbol}">
      <td>
        <div class="quote-symbol">
          <div class="quote-symbol-icon">${icon}</div>
          <div class="quote-symbol-info">
            <span class="quote-symbol-ticker">${escapeHtml(q.symbol)}</span>
            <span class="quote-symbol-name">${escapeHtml(q.name)} <span class="badge" style="font-size:9px;padding:1px 4px;">${q.type.toUpperCase()}</span></span>
          </div>
        </div>
      </td>
      <td class="quote-price">${priceStr}</td>
      <td class="${changeClass}" style="font-weight:600;">${changeStr}</td>
      <td><span class="quote-change-badge ${badgeClass}">${arrow} ${changePctStr}</span></td>
      <td>${highStr}</td>
      <td>${lowStr}</td>
      <td class="quote-volume">${volStr}</td>
      <td>
        <button class="btn btn-sm btn-delete" data-remove-symbol="${q.symbol}" title="Quitar de la lista">&#10005;</button>
      </td>
    </tr>`;
  }).join('');

  // Remove instrument click
  tbody.querySelectorAll('[data-remove-symbol]').forEach(btn => {
    btn.addEventListener('click', () => removeInstrumentFromWatchlist(btn.dataset.removeSymbol));
  });
}

function formatPrice(price, type) {
  if (type === 'stock') {
    return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (type === 'forex') {
    return price >= 10 ? price.toFixed(3) : price.toFixed(5);
  }
  // Crypto: precision based on price magnitude
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(6);
  return price.toFixed(8);
}

function formatVolume(vol) {
  if (vol >= 1e9) return (vol / 1e9).toFixed(2) + 'B';
  if (vol >= 1e6) return (vol / 1e6).toFixed(2) + 'M';
  if (vol >= 1e3) return (vol / 1e3).toFixed(1) + 'K';
  return vol.toFixed(0);
}

// Refresh quotes button
document.getElementById('refresh-quotes-btn').addEventListener('click', fetchQuotes);

// Auto-refresh quotes every 30 seconds when Markets section is active
function startQuotesAutoRefresh() {
  stopQuotesAutoRefresh();
  quotesInterval = setInterval(() => {
    if (document.getElementById('markets').classList.contains('active') && activeWatchlistId) {
      fetchQuotes();
    }
  }, 30000);
}

function stopQuotesAutoRefresh() {
  if (quotesInterval) { clearInterval(quotesInterval); quotesInterval = null; }
}

// ==================== CHARTS SECTION ====================
let tvChart = null;
let tvCandleSeries = null;
let tvVolumeSeries = null;
let currentChartSymbol = null;
let currentChartRange = '1M';
let currentChartType = 'stock';
let chartWebSocket = null;
let chartPollInterval = null;

function getChartRangeParams(range) {
  const ranges = {
    '1D': { interval: '5m', range: '1d' },
    '5D': { interval: '15m', range: '5d' },
    '1M': { interval: '1d', range: '1mo' },
    '3M': { interval: '1d', range: '3mo' },
    '6M': { interval: '1d', range: '6mo' },
    '1Y': { interval: '1wk', range: '1y' },
    '5Y': { interval: '1mo', range: '5y' },
  };
  return ranges[range] || ranges['1M'];
}

function getBinanceInterval(range) {
  const map = {
    '1D': { interval: '5m', limit: 288 },
    '5D': { interval: '15m', limit: 480 },
    '1M': { interval: '1d', limit: 30 },
    '3M': { interval: '1d', limit: 90 },
    '6M': { interval: '1d', limit: 180 },
    '1Y': { interval: '1w', limit: 52 },
    '5Y': { interval: '1M', limit: 60 },
  };
  return map[range] || map['1M'];
}

function populateChartSymbols() {
  const select = document.getElementById('chart-symbol-select');
  select.innerHTML = '<option value="">-- Seleccionar --</option>';

  const allInstruments = [];
  watchlistsCache.forEach(wl => {
    if (wl.instruments) {
      wl.instruments.forEach(inst => {
        if (!allInstruments.find(i => i.symbol === inst.symbol)) {
          allInstruments.push(inst);
        }
      });
    }
  });

  if (allInstruments.length === 0) {
    select.innerHTML = '<option value="">Añade instrumentos en Mercados</option>';
    return;
  }

  const groups = { crypto: [], stock: [], forex: [] };
  allInstruments.forEach(inst => {
    const type = inst.type || 'stock';
    if (!groups[type]) groups[type] = [];
    groups[type].push(inst);
  });

  const labels = { crypto: 'Crypto', stock: 'Acciones', forex: 'Forex' };
  Object.entries(groups).forEach(([type, instruments]) => {
    if (instruments.length === 0) return;
    const optgroup = document.createElement('optgroup');
    optgroup.label = labels[type] || type;
    instruments.forEach(inst => {
      const opt = document.createElement('option');
      opt.value = inst.symbol;
      opt.textContent = `${inst.symbol} - ${inst.name}`;
      opt.dataset.type = type;
      select.appendChild(opt);
    });
    // Actually append to optgroup then select
    instruments.forEach(inst => {
      const opt = document.createElement('option');
      opt.value = inst.symbol;
      opt.textContent = `${inst.symbol} - ${inst.name}`;
      opt.dataset.type = type;
      optgroup.appendChild(opt);
    });
    select.appendChild(optgroup);
  });

  // Remove the individual options added outside optgroups
  Array.from(select.querySelectorAll(':scope > option[data-type]')).forEach(o => o.remove());
}

function initChart() {
  const container = document.getElementById('tv-chart-container');
  container.innerHTML = '';

  tvChart = LightweightCharts.createChart(container, {
    width: container.clientWidth,
    height: 500,
    layout: {
      background: { color: '#1a1d27' },
      textColor: '#8a8fa8',
    },
    grid: {
      vertLines: { color: '#2a2e3d' },
      horzLines: { color: '#2a2e3d' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
    },
    rightPriceScale: {
      borderColor: '#2a2e3d',
    },
    timeScale: {
      borderColor: '#2a2e3d',
      timeVisible: true,
      secondsVisible: false,
    },
  });

  tvCandleSeries = tvChart.addCandlestickSeries({
    upColor: '#22c55e',
    downColor: '#ef4444',
    borderDownColor: '#ef4444',
    borderUpColor: '#22c55e',
    wickDownColor: '#ef4444',
    wickUpColor: '#22c55e',
  });

  tvVolumeSeries = tvChart.addHistogramSeries({
    color: '#6366f180',
    priceFormat: { type: 'volume' },
    priceScaleId: '',
  });
  tvVolumeSeries.priceScale().applyOptions({
    scaleMargins: { top: 0.8, bottom: 0 },
  });

  // Responsive resize
  const resizeObserver = new ResizeObserver(() => {
    tvChart.applyOptions({ width: container.clientWidth });
  });
  resizeObserver.observe(container);
}

async function fetchChartData(symbol, type, range) {
  const params = getChartRangeParams(range);

  if (type === 'crypto') {
    return fetchBinanceCandles(symbol, range);
  }

  // Stocks/Forex: Yahoo Finance via CORS proxy
  const corsProxies = [
    url => `https://corsproxy.io/?${url}`,
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${params.interval}&range=${params.range}`;

  for (const proxy of corsProxies) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(proxy(yahooUrl), { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) continue;
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result) continue;

      const timestamps = result.timestamp;
      const ohlc = result.indicators?.quote?.[0];
      if (!timestamps || !ohlc) continue;

      const candles = [];
      const volumes = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (ohlc.open[i] == null) continue;
        const time = timestamps[i];
        candles.push({
          time,
          open: ohlc.open[i],
          high: ohlc.high[i],
          low: ohlc.low[i],
          close: ohlc.close[i],
        });
        volumes.push({
          time,
          value: ohlc.volume[i] || 0,
          color: ohlc.close[i] >= ohlc.open[i] ? '#22c55e40' : '#ef444440',
        });
      }

      const meta = result.meta;
      return {
        candles,
        volumes,
        price: meta?.regularMarketPrice,
        prevClose: meta?.previousClose || meta?.chartPreviousClose,
        high: meta?.regularMarketDayHigh,
        low: meta?.regularMarketDayLow,
        open: candles.length > 0 ? candles[candles.length - 1].open : null,
        close: meta?.regularMarketPrice,
        volume: meta?.regularMarketVolume,
      };
    } catch (err) {
      console.warn(`Chart proxy error for ${symbol}:`, err.message);
    }
  }
  return null;
}

async function fetchBinanceCandles(symbol, range) {
  const params = getBinanceInterval(range);
  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${params.interval}&limit=${params.limit}`
    );
    if (!res.ok) return null;
    const data = await res.json();

    const candles = [];
    const volumes = [];
    data.forEach(k => {
      const time = Math.floor(k[0] / 1000);
      const open = parseFloat(k[1]);
      const high = parseFloat(k[2]);
      const low = parseFloat(k[3]);
      const close = parseFloat(k[4]);
      const vol = parseFloat(k[5]);

      candles.push({ time, open, high, low, close });
      volumes.push({
        time,
        value: vol,
        color: close >= open ? '#22c55e40' : '#ef444440',
      });
    });

    const last = candles[candles.length - 1];
    const first = candles[0];
    return {
      candles,
      volumes,
      price: last?.close,
      prevClose: first?.open,
      high: last?.high,
      low: last?.low,
      open: last?.open,
      close: last?.close,
      volume: volumes.length > 0 ? volumes[volumes.length - 1].value : null,
    };
  } catch (err) {
    console.error('Binance candles error:', err);
    return null;
  }
}

async function loadChart(symbol, type, range) {
  if (!symbol) return;

  // Stop previous real-time connections
  stopChartRealtime();

  currentChartSymbol = symbol;
  currentChartType = type;
  currentChartRange = range;

  // Show loading
  const container = document.getElementById('tv-chart-container');
  if (!tvChart) initChart();

  // Set price precision based on instrument type
  let pricePrec = 2;
  if (type === 'forex') pricePrec = 5;
  else if (type === 'stock') pricePrec = 2;
  else pricePrec = 2; // crypto default, auto-adjusts after data loads
  tvCandleSeries.applyOptions({ priceFormat: { type: 'price', precision: pricePrec, minMove: 1 / Math.pow(10, pricePrec) } });

  tvCandleSeries.setData([]);
  tvVolumeSeries.setData([]);

  document.getElementById('chart-info-symbol').textContent = symbol;
  document.getElementById('chart-info-price').textContent = 'Cargando...';
  document.getElementById('chart-info-change').textContent = '';
  document.getElementById('chart-info-change').className = 'chart-info-change';

  const data = await fetchChartData(symbol, type, range);

  if (!data || data.candles.length === 0) {
    document.getElementById('chart-info-price').textContent = 'Sin datos';
    document.getElementById('chart-details-grid').style.display = 'none';
    return;
  }

  // Auto-adjust crypto precision based on actual price
  if (type === 'crypto' && data.price != null) {
    let cp = 2;
    if (data.price < 0.01) cp = 8;
    else if (data.price < 1) cp = 6;
    else if (data.price < 1000) cp = 4;
    tvCandleSeries.applyOptions({ priceFormat: { type: 'price', precision: cp, minMove: 1 / Math.pow(10, cp) } });
  }

  tvCandleSeries.setData(data.candles);
  tvVolumeSeries.setData(data.volumes);
  tvChart.timeScale().fitContent();

  // Update info bar
  const price = data.price;
  const prevClose = data.prevClose;
  if (price != null) {
    document.getElementById('chart-info-price').textContent = formatPrice(price, type);
    if (prevClose) {
      const change = price - prevClose;
      const changePct = (change / prevClose) * 100;
      const sign = change >= 0 ? '+' : '';
      const el = document.getElementById('chart-info-change');
      el.textContent = `${sign}${formatPrice(change, type)} (${sign}${changePct.toFixed(2)}%)`;
      el.className = `chart-info-change ${change >= 0 ? 'positive' : 'negative'}`;
    }
  }

  // Update details grid
  const grid = document.getElementById('chart-details-grid');
  grid.style.display = 'grid';
  document.getElementById('chart-detail-open').textContent = data.open != null ? formatPrice(data.open, type) : '--';
  document.getElementById('chart-detail-high').textContent = data.high != null ? formatPrice(data.high, type) : '--';
  document.getElementById('chart-detail-low').textContent = data.low != null ? formatPrice(data.low, type) : '--';
  document.getElementById('chart-detail-close').textContent = data.close != null ? formatPrice(data.close, type) : '--';
  document.getElementById('chart-detail-volume').textContent = data.volume != null ? formatVolume(data.volume) : '--';
  if (data.price != null && data.prevClose) {
    const ch = data.price - data.prevClose;
    const chPct = (ch / data.prevClose) * 100;
    const el = document.getElementById('chart-detail-change');
    el.textContent = `${ch >= 0 ? '+' : ''}${chPct.toFixed(2)}%`;
    el.style.color = ch >= 0 ? 'var(--green)' : 'var(--red)';
  } else {
    document.getElementById('chart-detail-change').textContent = '--';
  }

  // Start real-time updates
  if (type === 'crypto') {
    startCryptoWebSocket(symbol, range);
  } else {
    startStockPolling(symbol, type, range);
  }
}

// ==================== REAL-TIME CHART UPDATES ====================
function stopChartRealtime() {
  if (chartWebSocket) {
    chartWebSocket.close();
    chartWebSocket = null;
  }
  if (chartPollInterval) {
    clearInterval(chartPollInterval);
    chartPollInterval = null;
  }
}

function updateChartInfoBar(price, prevClose) {
  if (price == null) return;
  const t = currentChartType;
  document.getElementById('chart-info-price').textContent = formatPrice(price, t);
  document.getElementById('chart-detail-close').textContent = formatPrice(price, t);
  if (prevClose) {
    const change = price - prevClose;
    const changePct = (change / prevClose) * 100;
    const sign = change >= 0 ? '+' : '';
    const el = document.getElementById('chart-info-change');
    el.textContent = `${sign}${formatPrice(change, t)} (${sign}${changePct.toFixed(2)}%)`;
    el.className = `chart-info-change ${change >= 0 ? 'positive' : 'negative'}`;
    const chEl = document.getElementById('chart-detail-change');
    chEl.textContent = `${sign}${changePct.toFixed(2)}%`;
    chEl.style.color = change >= 0 ? 'var(--green)' : 'var(--red)';
  }
}

function startCryptoWebSocket(symbol, range) {
  const params = getBinanceInterval(range);
  const wsSymbol = symbol.toLowerCase();
  const wsUrl = `wss://stream.binance.com:9443/ws/${wsSymbol}@kline_${params.interval}`;

  chartWebSocket = new WebSocket(wsUrl);

  chartWebSocket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    const k = msg.k;
    if (!k) return;

    const candle = {
      time: Math.floor(k.t / 1000),
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c),
    };

    const volume = {
      time: candle.time,
      value: parseFloat(k.v),
      color: candle.close >= candle.open ? '#22c55e40' : '#ef444440',
    };

    tvCandleSeries.update(candle);
    tvVolumeSeries.update(volume);

    // Update info bar and details
    updateChartInfoBar(candle.close, null);
    document.getElementById('chart-detail-open').textContent = formatPrice(candle.open, 'crypto');
    document.getElementById('chart-detail-high').textContent = formatPrice(candle.high, 'crypto');
    document.getElementById('chart-detail-low').textContent = formatPrice(candle.low, 'crypto');
    document.getElementById('chart-detail-volume').textContent = formatVolume(parseFloat(k.v));
  };

  chartWebSocket.onerror = (err) => {
    console.warn('Chart WebSocket error:', err);
  };
}

function startStockPolling(symbol, type, range) {
  // Poll every 30 seconds for stock/forex updates
  chartPollInterval = setInterval(async () => {
    if (!document.getElementById('charts').classList.contains('active')) return;
    if (currentChartSymbol !== symbol) return;

    try {
      const data = await fetchChartData(symbol, type, range);
      if (data && data.candles.length > 0) {
        const lastCandle = data.candles[data.candles.length - 1];
        const lastVolume = data.volumes[data.volumes.length - 1];
        tvCandleSeries.update(lastCandle);
        tvVolumeSeries.update(lastVolume);
        updateChartInfoBar(data.price, data.prevClose);
      }
    } catch (err) {
      console.warn('Chart poll error:', err);
    }
  }, 30000);
}

// Chart event listeners
document.getElementById('chart-symbol-select').addEventListener('change', (e) => {
  const opt = e.target.selectedOptions[0];
  if (!opt || !opt.value) return;
  const type = opt.dataset.type || 'stock';
  loadChart(opt.value, type, currentChartRange);
});

document.getElementById('chart-range-btns').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-range]');
  if (!btn) return;
  document.querySelectorAll('#chart-range-btns .btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentChartRange = btn.dataset.range;
  if (currentChartSymbol) {
    loadChart(currentChartSymbol, currentChartType, currentChartRange);
  }
});

// ==================== OPEN POSITIONS ====================
async function fetchPriceForPosition(pos) {
  const symbol = pos.marketSymbol || pos.asset;
  const type = pos.marketType || 'stock';
  try {
    if (type === 'crypto') {
      const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`);
      if (res.ok) { const d = await res.json(); return parseFloat(d.price); }
    } else {
      // Try Finnhub
      const key = localStorage.getItem('finnhub_api_key') || 'demo';
      const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`);
      if (res.ok) { const d = await res.json(); if (d.c > 0) return d.c; }
      // Fallback: Yahoo Finance
      const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      const res2 = await fetch(`https://corsproxy.io/?${yahooUrl}`);
      if (res2.ok) { const d2 = await res2.json(); const p = d2?.chart?.result?.[0]?.meta?.regularMarketPrice; if (p) return p; }
    }
  } catch (e) { /* silent */ }
  return null;
}

async function renderOpenPositions() {
  const positions = getOpenPositions();
  const section = document.getElementById('open-positions-section');
  if (positions.length === 0) { section.style.display = 'none'; return; }
  section.style.display = '';

  const tbody = document.getElementById('open-positions-body');
  tbody.innerHTML = positions.map(() => `<tr><td colspan="9" class="quote-loading">Cargando precios...</td></tr>`).join('');

  const results = await Promise.all(positions.map(async (pos) => {
    const currentPrice = await fetchPriceForPosition(pos);
    const entry = pos.entry;
    const qty = pos.quantity || 1;
    const dir = pos.direction || 'long';
    let unrealPnl = null, pctChange = null;
    if (currentPrice != null && entry) {
      unrealPnl = dir === 'long'
        ? (currentPrice - entry) * qty
        : (entry - currentPrice) * qty;
      pctChange = ((currentPrice - entry) / entry) * 100 * (dir === 'long' ? 1 : -1);
    }
    // Update cache for dashboard stats
    if (unrealPnl != null) {
      openPnlCache[pos.id] = { pnl: unrealPnl, currentPrice };
    }
    return { pos, currentPrice, unrealPnl, pctChange };
  }));

  // Re-render dashboard stats with updated P&L from open positions
  renderDashboard();

  tbody.innerHTML = results.map(({ pos, currentPrice, unrealPnl, pctChange }) => {
    const t = pos.marketType || 'stock';
    const priceStr = currentPrice != null ? formatPrice(currentPrice, t) : '--';
    const entryStr = formatPrice(pos.entry, t);
    const pnlStr = unrealPnl != null ? (unrealPnl >= 0 ? '+' : '') + '$' + unrealPnl.toFixed(2) : '--';
    const pnlCls = unrealPnl != null ? (unrealPnl >= 0 ? 'positive' : 'negative') : '';
    const pctStr = pctChange != null ? (pctChange >= 0 ? '+' : '') + pctChange.toFixed(2) + '%' : '--';
    const symbol = pos.marketSymbol || pos.asset;
    return `<tr>
      <td><strong>${escapeHtml(pos.asset)}</strong> <span class="badge" style="font-size:9px">${(t).toUpperCase()}</span></td>
      <td><span class="badge badge-${pos.direction}">${(pos.direction || '').toUpperCase()}</span></td>
      <td>${pos.quantity}</td>
      <td>${entryStr}</td>
      <td class="${currentPrice != null ? (currentPrice >= pos.entry ? 'positive' : 'negative') : ''}">${priceStr}</td>
      <td class="${pnlCls}" style="font-weight:700;">${pnlStr}</td>
      <td class="${pnlCls}">${pctStr}</td>
      <td>${formatDate(pos.date)}</td>
      <td><button class="btn btn-sm" data-open-chart="${symbol}" data-open-type="${t}">&#128200;</button></td>
    </tr>`;
  }).join('');

  // Chart buttons
  tbody.querySelectorAll('[data-open-chart]').forEach(btn => {
    btn.addEventListener('click', () => {
      const symbol = btn.dataset.openChart;
      const type = btn.dataset.openType;
      document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
      document.querySelector('[data-section="charts"]').classList.add('active');
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById('charts').classList.add('active');
      populateChartSymbols();
      setTimeout(() => {
        const sel = document.getElementById('chart-symbol-select');
        const opt = Array.from(sel.options).find(o => o.value === symbol);
        if (opt) { sel.value = symbol; loadChart(symbol, type, currentChartRange); }
        else { loadChart(symbol, type, currentChartRange); }
      }, 100);
    });
  });

  // Render P&L curves for each position
  await renderOpenPnlCurves(results);
}

const openPnlCharts = {};

async function fetchHistoricalPrices(pos) {
  const symbol = pos.marketSymbol || pos.asset;
  const type = pos.marketType || 'stock';
  const entryDate = pos.date; // 'YYYY-MM-DD'

  // Calculate days since entry
  const daysSince = Math.ceil((new Date() - new Date(entryDate + 'T12:00:00')) / 86400000);
  if (daysSince <= 0) return [];

  let range = '1mo';
  if (daysSince > 365) range = '5y';
  else if (daysSince > 90) range = '1y';
  else if (daysSince > 30) range = '6mo';

  if (type === 'crypto') {
    let interval = '1d', limit = Math.min(daysSince + 2, 365);
    if (daysSince > 365) { interval = '1w'; limit = Math.min(Math.ceil(daysSince / 7) + 2, 200); }
    try {
      const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data
        .filter(k => Math.floor(k[0] / 1000) >= Math.floor(new Date(entryDate + 'T00:00:00').getTime() / 1000))
        .map(k => ({ time: Math.floor(k[0] / 1000), close: parseFloat(k[4]) }));
    } catch { return []; }
  }

  // Stocks/Forex via Yahoo Finance
  const proxies = [
    url => `https://corsproxy.io/?${url}`,
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  ];
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
  for (const proxy of proxies) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(proxy(yahooUrl), { signal: controller.signal });
      clearTimeout(tid);
      if (!res.ok) continue;
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (!result) continue;
      const timestamps = result.timestamp;
      const closes = result.indicators?.quote?.[0]?.close;
      if (!timestamps || !closes) continue;
      const entryTs = Math.floor(new Date(entryDate + 'T00:00:00').getTime() / 1000);
      const points = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (timestamps[i] >= entryTs && closes[i] != null) {
          points.push({ time: timestamps[i], close: closes[i] });
        }
      }
      return points;
    } catch { /* try next */ }
  }
  return [];
}

async function renderOpenPnlCurves(results) {
  const container = document.getElementById('open-pnl-curves');
  container.innerHTML = '';

  for (const { pos, unrealPnl } of results) {
    const symbol = pos.marketSymbol || pos.asset;
    const type = pos.marketType || 'stock';
    const entry = pos.entry;
    const qty = pos.quantity || 1;
    const dir = pos.direction === 'long' ? 1 : -1;

    const box = document.createElement('div');
    box.className = 'open-pnl-curve-box';
    const pnlCls = unrealPnl != null ? (unrealPnl >= 0 ? 'positive' : 'negative') : '';
    const pnlStr = unrealPnl != null ? (unrealPnl >= 0 ? '+' : '') + '$' + unrealPnl.toFixed(2) : '--';
    box.innerHTML = `
      <div class="open-pnl-curve-header">
        <span class="open-pnl-curve-title">P&L — ${escapeHtml(pos.asset)} (desde ${formatDate(pos.date)})</span>
        <span class="open-pnl-curve-value ${pnlCls}">${pnlStr}</span>
      </div>
      <div class="open-pnl-chart-container" id="pnl-curve-${escapeHtml(symbol)}"></div>`;
    container.appendChild(box);

    // Fetch historical and render
    const points = await fetchHistoricalPrices(pos);
    const chartEl = document.getElementById(`pnl-curve-${escapeHtml(symbol)}`);
    if (!chartEl) continue;

    const chart = LightweightCharts.createChart(chartEl, {
      width: chartEl.clientWidth,
      height: 160,
      layout: { background: { color: '#0f1117' }, textColor: '#8a8fa8' },
      grid: { vertLines: { color: '#2a2e3d' }, horzLines: { color: '#2a2e3d' } },
      rightPriceScale: { borderColor: '#2a2e3d' },
      timeScale: { borderColor: '#2a2e3d', timeVisible: false },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      handleScroll: false, handleScale: false,
    });

    const pnlData = points.map(p => ({
      time: p.time,
      value: parseFloat(((p.close - entry) * qty * dir).toFixed(2)),
    }));

    const isPositive = pnlData.length === 0 || pnlData[pnlData.length - 1].value >= 0;
    const lineColor = isPositive ? '#22c55e' : '#ef4444';
    const topColor = isPositive ? '#22c55e30' : '#ef444430';

    const series = chart.addAreaSeries({
      lineColor,
      topColor,
      bottomColor: '#00000000',
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });

    if (pnlData.length > 0) {
      series.setData(pnlData);
      chart.timeScale().fitContent();
    }

    // Add zero baseline
    series.createPriceLine({ price: 0, color: '#8a8fa840', lineWidth: 1, lineStyle: 2 });

    const resizeObs = new ResizeObserver(() => chart.applyOptions({ width: chartEl.clientWidth }));
    resizeObs.observe(chartEl);
  }
}

document.getElementById('refresh-open-btn').addEventListener('click', renderOpenPositions);

function refreshAll() {
  renderDashboard();
  renderCalendar();
  renderTradesTable();
  renderStats();
  renderOpenPositions();
  if (document.getElementById('markets').classList.contains('active') && activeWatchlistId) {
    fetchQuotes();
  }
  if (document.getElementById('charts').classList.contains('active')) {
    populateChartSymbols();
  }
}
