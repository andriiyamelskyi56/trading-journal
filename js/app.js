// ==================== STATE ====================
let currentUser = null;
let tradesCache = [];
let openPnlCache = {}; // { tradeId: { pnl, currentPrice } }
let openHistoricalCache = {}; // { tradeId: [{date:'YYYY-MM-DD', close}] }
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
  auth.signOut();
});

// ==================== AUTH STATE OBSERVER ====================
auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    if (!user.emailVerified) {
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
  return tradesCache.map(t => {
    const trade = { ...t };
    if (trade.result === 'loss') {
      // Una pérdida nunca puede sumar en positivo: usa el P&L guardado
      // forzado a negativo, o -riesgo si no hay P&L registrado.
      if (typeof trade.pnl === 'number' && trade.pnl !== 0) {
        trade.pnl = -Math.abs(trade.pnl);
      } else if (trade.risk > 0) {
        trade.pnl = -trade.risk;
      }
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

// ==================== STATS SUB-TABS ====================
document.querySelectorAll('.stats-subtab').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.statsTab;
    document.querySelectorAll('.stats-subtab').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.stats-subpanel').forEach(p => {
      p.classList.toggle('active', p.dataset.statsPanel === target);
    });
  });
});

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
    if (section === 'edge') renderEdgeSection();
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

  const fmtMoney = (n) => {
    const a = Math.abs(n);
    if (a >= 10) return n.toFixed(2);
    if (a >= 0.1) return n.toFixed(3);
    if (a >= 0.001) return n.toFixed(5);
    return n.toFixed(8);
  };

  if (entry && sl && qty) {
    const riskPrice = dir === 'long' ? entry - sl : sl - entry;
    riskEl.textContent = riskPrice > 0 ? `-$${fmtMoney(Math.abs(riskPrice * qty))}` : 'SL invalido';
  } else {
    riskEl.textContent = '--';
  }

  if (entry && tp && qty) {
    const rewardPrice = dir === 'long' ? tp - entry : entry - tp;
    rewardEl.textContent = rewardPrice > 0 ? `+$${fmtMoney(Math.abs(rewardPrice * qty))}` : 'TP invalido';
  } else {
    rewardEl.textContent = '--';
  }

  if (!entry || !sl || !tp || entry === sl) { rrEl.textContent = '--'; rrEl.style.color = ''; return; }
  const risk = dir === 'long' ? entry - sl : sl - entry;
  const reward = dir === 'long' ? tp - entry : entry - tp;
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

// Hide the exit/PnL row when the trade is still open.
document.getElementById('trade-result').addEventListener('change', (e) => {
  const isOpen = e.target.value === 'open';
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

  const galleryUrls = [...existingUrls, ...pendingArray.map(p => p.dataUrl)];

  existingUrls.forEach((url, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'upload-thumb';
    const img = document.createElement('img');
    img.src = url;
    img.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(galleryUrls, i); });
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
    img.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(galleryUrls, existingUrls.length + i); });
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
let lightboxImages = [];
let lightboxIndex = 0;
let lightboxTrade = null;

function openLightbox(srcOrImages, index = 0, trade = null) {
  lightboxImages = Array.isArray(srcOrImages) ? srcOrImages.filter(Boolean) : [srcOrImages];
  lightboxIndex = Math.max(0, Math.min(index, lightboxImages.length - 1));
  lightboxTrade = trade;
  renderLightbox();
  document.getElementById('lightbox').classList.add('open');
}

function renderLightbox() {
  const total = lightboxImages.length;
  document.getElementById('lightbox-img').src = lightboxImages[lightboxIndex] || '';
  const counter = document.getElementById('lightbox-counter');
  counter.textContent = total > 1 ? `${lightboxIndex + 1} / ${total}` : '';
  counter.style.display = total > 1 ? '' : 'none';
  const showNav = total > 1;
  document.getElementById('lightbox-prev').style.display = showNav ? '' : 'none';
  document.getElementById('lightbox-next').style.display = showNav ? '' : 'none';
  document.getElementById('lightbox-info').innerHTML = lightboxTrade ? renderLightboxInfo(lightboxTrade) : '';
  document.getElementById('lightbox-info').style.display = lightboxTrade ? '' : 'none';
}

function renderLightboxInfo(t) {
  const pnl = Number(t.pnl) || 0;
  const pnlClass = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : '';
  const pnlStr = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
  const rrPlan = (t.entry && t.sl && t.tp) ? (() => {
    const risk = t.direction === 'long' ? t.entry - t.sl : t.sl - t.entry;
    const reward = t.direction === 'long' ? t.tp - t.entry : t.entry - t.tp;
    return (risk > 0 && reward > 0) ? `1 : ${(reward / risk).toFixed(2)}` : '—';
  })() : '—';
  const fields = [
    ['Fecha', formatDate(t.date)],
    ['Activo', escapeHtml(t.asset || '—')],
    ['Setup', t.setup ? `<span class="setup-chip">${escapeHtml(t.setup)}</span>` : '—'],
    ['Dirección', `<span class="badge badge-${t.direction}">${(t.direction || '').toUpperCase()}</span>`],
    ['Cantidad', t.quantity ?? '—'],
    ['Entrada', t.entry ?? '—'],
    ['Stop Loss', t.sl ?? '—'],
    ['Take Profit', t.tp ?? '—'],
    ['Salida', t.exit ?? '—'],
    ['RR planeado', rrPlan],
    ['P&amp;L', `<span class="${pnlClass}">${pnlStr}</span>`],
    ['Resultado', `<span class="badge badge-${t.result}">${resultLabel(t.result)}</span>`],
  ];
  const scenario = t.notesPre || t.notes || '';
  const entryConditions = t.entryConditions || '';
  const actualScenario = t.actualScenario || '';
  const notesPost = t.notesPost || '';
  const fieldsHtml = fields.map(([k, v]) => `<div class="lb-field"><span class="lb-label">${k}</span><span class="lb-value">${v}</span></div>`).join('');
  const blocks = [
    scenario && `<div class="lb-notes"><h4>Escenario</h4><p>${escapeHtml(scenario)}</p></div>`,
    entryConditions && `<div class="lb-notes"><h4>Condiciones de entrada</h4><p>${escapeHtml(entryConditions)}</p></div>`,
    actualScenario && `<div class="lb-notes"><h4>Escenario real</h4><p>${escapeHtml(actualScenario)}</p></div>`,
    notesPost && `<div class="lb-notes"><h4>Notas Post</h4><p>${escapeHtml(notesPost)}</p></div>`,
  ].filter(Boolean).join('');
  return `<div class="lb-info-grid">${fieldsHtml}</div>${blocks}`;
}

function lightboxStep(delta) {
  if (lightboxImages.length < 2) return;
  lightboxIndex = (lightboxIndex + delta + lightboxImages.length) % lightboxImages.length;
  renderLightbox();
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}

document.getElementById('lightbox').addEventListener('click', (e) => {
  if (e.target.id === 'lightbox') closeLightbox();
});
document.getElementById('lightbox-close-btn').addEventListener('click', closeLightbox);
document.getElementById('lightbox-prev').addEventListener('click', (e) => { e.stopPropagation(); lightboxStep(-1); });
document.getElementById('lightbox-next').addEventListener('click', (e) => { e.stopPropagation(); lightboxStep(1); });

document.addEventListener('keydown', (e) => {
  const lb = document.getElementById('lightbox');
  if (!lb.classList.contains('open')) return;
  if (e.key === 'Escape') closeLightbox();
  else if (e.key === 'ArrowLeft') lightboxStep(-1);
  else if (e.key === 'ArrowRight') lightboxStep(1);
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
    document.getElementById('trade-entry-conditions').value = trade.entryConditions || '';
    document.getElementById('trade-actual-scenario').value = trade.actualScenario || '';
    document.getElementById('trade-notes-post').value = trade.notesPost || '';

    if (trade.result === 'open') {
      document.getElementById('trade-exit').closest('.form-row').style.display = 'none';
    }

    existingScreensPre = [...(trade.screenshotsPre || [])];
    existingScreensPost = [...(trade.screenshotsPost || [])];

    calcRR();
    calcRRActual();
  }

  renderUploadPreview('preview-pre', pendingFilesPre, existingScreensPre);
  renderUploadPreview('preview-post', pendingFilesPost, existingScreensPost);
  populateTradeEdgeFields(trade);
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
      entryConditions: document.getElementById('trade-entry-conditions').value.trim(),
      actualScenario: document.getElementById('trade-actual-scenario').value.trim(),
      notesPost: document.getElementById('trade-notes-post').value.trim(),
      notes: document.getElementById('trade-notes-pre').value.trim(),
      screenshotsPre: [...existingScreensPre],
      screenshotsPost: [...existingScreensPost],
      ...readTradeEdgeFields(),
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

    if (trade.result === 'open') {
      trade.pnl = 0;
    }

    // Calculate P&L — resultado determines the P&L logic
    if (trade.result !== 'open' && pnlVal) {
      // Manual P&L entered by user
      trade.pnl = parseFloat(pnlVal);
      // En pérdidas el P&L manual se interpreta como magnitud: siempre negativo
      if (trade.result === 'loss' && trade.pnl > 0) trade.pnl = -trade.pnl;
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

    const setupCell = t.setup
      ? `<span class="setup-chip">${escapeHtml(t.setup)}</span>`
      : '<span class="setup-empty">—</span>';
    return `
    <tr class="trade-row trade-row-${t.result}" data-trade-id="${t.id}">
      <td>${formatDate(t.date)}</td>
      <td><strong>${escapeHtml(t.asset)}</strong></td>
      <td>${setupCell}</td>
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
        img.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(allScreens, idx, trade); });
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

  // Click anywhere on the row to edit (image thumbs and action buttons
  // stopPropagation on their own clicks so they keep their behaviour).
  tbody.querySelectorAll('.trade-row').forEach(row => {
    row.addEventListener('click', () => {
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
      autoSize: true,
      layout: { background: { color: '#1a1d27' }, textColor: '#8a8fa8' },
      grid: { vertLines: { color: '#2a2e3d' }, horzLines: { color: '#2a2e3d' } },
      rightPriceScale: {
        borderColor: '#2a2e3d',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: '#2a2e3d',
        timeVisible: true,
        fixLeftEdge: true,
        fixRightEdge: true,
        rightOffset: 2,
        lockVisibleTimeRangeOnResize: true,
      },
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
  }

  if (sortedTrades.length === 0) {
    equitySeriesClosed.setData([]);
    return;
  }

  // Agrupar P&L por fecha de trades cerrados
  const dailyPnl = {};
  sortedTrades.forEach(t => {
    if (t.result === 'open') return; // open positions handled via historical cache
    const day = t.date;
    dailyPnl[day] = (dailyPnl[day] || 0) + (t.pnl || 0);
  });

  // Añadir P&L incremental diario de posiciones abiertas usando cierres históricos
  const openPos = getOpenPositions();
  openPos.forEach(pos => {
    const history = openHistoricalCache[pos.id];
    if (!history || history.length === 0) return;
    const qty = parseFloat(pos.quantity) || 1;
    const dir = (pos.direction === 'long' || pos.direction === 'buy') ? 1 : -1;
    let prevClose = parseFloat(pos.entry) || 0;
    history.forEach(({ date, close }) => {
      const dailyChange = (close - prevClose) * qty * dir;
      dailyPnl[date] = (dailyPnl[date] || 0) + dailyChange;
      prevClose = close;
    });
  });

  // Ordenar por fecha y calcular acumulado
  const sortedDays = Object.keys(dailyPnl).sort();
  let cumulative = 0;
  const data = [];
  sortedDays.forEach(day => {
    cumulative += dailyPnl[day];
    data.push({
      time: day,
      value: parseFloat(cumulative.toFixed(2)),
    });
  });

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
  sortedTrades.filter(t => t.result !== 'open').forEach(t => {
    const key = t.date.slice(0, 7);
    monthlyPnl[key] = (monthlyPnl[key] || 0) + t.pnl;
  });

  // P&L diario de posiciones abiertas agrupado por mes
  const openPos = getOpenPositions();
  openPos.forEach(pos => {
    const history = openHistoricalCache[pos.id];
    if (!history || history.length === 0) return;
    const qty = parseFloat(pos.quantity) || 1;
    const dir = (pos.direction === 'long' || pos.direction === 'buy') ? 1 : -1;
    let prevClose = parseFloat(pos.entry) || 0;
    history.forEach(({ date, close }) => {
      const key = date.slice(0, 7);
      const dailyChange = (close - prevClose) * qty * dir;
      monthlyPnl[key] = (monthlyPnl[key] || 0) + dailyChange;
      prevClose = close;
    });
  });

  const entries = Object.entries(monthlyPnl).sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length === 0) { container.innerHTML = '<p class="empty-msg">No hay datos aun</p>'; return; }

  const maxAbs = Math.max(...entries.map(e => Math.abs(e[1])), 1);
  container.innerHTML = entries.map(([month, pnl]) => {
    const [y, m] = month.split('-');
    const label = new Date(+y, +m - 1, 1).toLocaleString('es-ES', { month: 'short', year: '2-digit' });
    const width = pnl === 0 ? 0 : Math.max(Math.round((Math.abs(pnl) / maxAbs) * 100), 3);
    const cls = pnl >= 0 ? 'bar-positive' : 'bar-negative';
    return `<div class="bar-row"><span class="bar-label">${label}</span><div class="bar-track"><div class="bar-fill ${cls}" style="width:${width}%"></div></div><span class="bar-value ${pnl >= 0 ? 'positive' : 'negative'}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</span></div>`;
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
  const dayCount = [0, 0, 0, 0, 0, 0, 0];

  // P&L de trades cerrados: cada trade cuenta como 1 sesión en ese día
  trades.filter(t => t.result !== 'open').forEach(t => {
    const d = new Date(t.date + 'T12:00:00').getDay();
    dayPnl[d] += t.pnl;
    dayCount[d]++;
  });

  // P&L diario de posiciones abiertas: (cierre_hoy - cierre_ayer) × lote × dirección
  // Cada punto del historial cuenta como 1 sesión
  const openPos = getOpenPositions();
  openPos.forEach(pos => {
    const history = openHistoricalCache[pos.id];
    if (!history || history.length === 0) return;
    const qty = parseFloat(pos.quantity) || 1;
    const dir = (pos.direction === 'long' || pos.direction === 'buy') ? 1 : -1;
    let prevClose = parseFloat(pos.entry) || 0;
    history.forEach(({ date, close }) => {
      const dailyChange = (close - prevClose) * qty * dir;
      const dow = new Date(date + 'T12:00:00').getDay();
      dayPnl[dow] += dailyChange;
      dayCount[dow]++;
      prevClose = close;
    });
  });

  // Mostrar promedio por sesión (no acumulado) para evitar distorsión por duración
  const avgPnl = dayPnl.map((total, i) => dayCount[i] > 0 ? total / dayCount[i] : 0);

  const maxAbs = Math.max(...avgPnl.map(v => Math.abs(v)), 1);
  container.innerHTML = days.map((name, i) => {
    const pnl = avgPnl[i];
    const width = pnl === 0 ? 0 : Math.max(Math.round((Math.abs(pnl) / maxAbs) * 100), 3);
    const cls = pnl > 0 ? 'bar-positive' : pnl < 0 ? 'bar-negative' : 'bar-zero';
    const valCls = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral';
    const valStr = pnl === 0 ? '$0.00' : `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl) < 0.01 ? pnl.toFixed(3) : pnl.toFixed(2)}`;
    const countStr = dayCount[i] > 0 ? ` <span style="color:#555;font-size:10px">(${dayCount[i]})</span>` : '';
    return `<div class="bar-row"><span class="bar-label">${name.slice(0, 3)}</span><div class="bar-track">${width > 0 ? `<div class="bar-fill ${cls}" style="width:${width}%"></div>` : ''}</div><span class="bar-value ${valCls}">${valStr}${countStr}</span></div>`;
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
    const width = pnl === 0 ? 0 : Math.max(Math.round((Math.abs(pnl) / maxAbs) * 100), 3);
    const cls = pnl > 0 ? 'bar-positive' : 'bar-negative';
    const valCls = pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral';
    return `<div class="bar-row"><span class="bar-label">${hour}</span><div class="bar-track">${width > 0 ? `<div class="bar-fill ${cls}" style="width:${width}%"></div>` : ''}</div><span class="bar-value ${valCls}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</span></div>`;
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
        img.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(allScreens, idx, trade); });
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

function refreshAll() {
  renderDashboard();
  renderCalendar();
  renderTradesTable();
  renderStats();
  if (document.getElementById('edge')?.classList.contains('active')) {
    renderEdgeSection();
  }
}

// ==================== EDGE / TAGGING ====================
// Per-trade metadata for edge discovery: setup, session, market trend,
// volatility, mistakes (multi), plan adherence (1-5), catalyst.
// Setups and mistakes are user-defined lists stored in localStorage.

const DEFAULT_MISTAKES = [
  'FOMO',
  'SL movido',
  'Sin plan',
  'Chasing',
  'Salida prematura',
  'Oversize',
  'Ignorar setup',
  'Revenge trading',
];
const SESSION_LABELS = {
  'preapertura': 'Preapertura',
  'primera-hora': 'Primera hora',
  'midday': 'Midday',
  'power-hour': 'Power Hour',
  'after-hours': 'After-hours',
};
const TREND_LABELS = { 'alcista': 'Alcista', 'lateral': 'Lateral', 'bajista': 'Bajista' };
const VOL_LABELS = { 'alta': 'Alta', 'media': 'Media', 'baja': 'Baja' };
const ADHERENCE_LABELS = { '1': '1 · Improvisé', '2': '2', '3': '3 · Mitad', '4': '4', '5': '5 · Lo seguí al pie' };

function getSetups() {
  try { return JSON.parse(localStorage.getItem('tj_setups') || '[]'); }
  catch { return []; }
}
function saveSetups(list) {
  localStorage.setItem('tj_setups', JSON.stringify(list));
}
function getMistakes() {
  try {
    const raw = localStorage.getItem('tj_mistakes');
    if (!raw) { saveMistakes(DEFAULT_MISTAKES); return [...DEFAULT_MISTAKES]; }
    return JSON.parse(raw);
  } catch { return [...DEFAULT_MISTAKES]; }
}
function saveMistakes(list) {
  localStorage.setItem('tj_mistakes', JSON.stringify(list));
}

function populateSelect(sel, items, current, placeholder = '— Sin definir —') {
  if (!sel) return;
  sel.innerHTML = `<option value="">${placeholder}</option>` +
    items.map(s => `<option value="${escapeHtml(s)}"${s === current ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('');
}

function renderMistakeChips(containerId, selected) {
  const box = document.getElementById(containerId);
  if (!box) return;
  const all = getMistakes();
  box.innerHTML = all.map(m => {
    const isOn = selected.includes(m);
    return `<button type="button" class="chip${isOn ? ' chip-on' : ''}" data-mistake="${escapeHtml(m)}">${escapeHtml(m)}</button>`;
  }).join('') || '<span class="chip-empty">Sin errores definidos. Añade algunos en "Gestionar errores".</span>';
  box.querySelectorAll('[data-mistake]').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('chip-on'));
  });
}

function readMistakeChips(containerId) {
  return Array.from(document.querySelectorAll(`#${containerId} .chip.chip-on`))
    .map(b => b.dataset.mistake);
}

// Wire the trade-modal "Edge" tab when openModal runs / form submits.
function populateTradeEdgeFields(trade) {
  populateSelect(document.getElementById('trade-setup'), getSetups(), trade?.setup || '');
  document.getElementById('trade-session').value = trade?.session || '';
  document.getElementById('trade-trend').value = trade?.marketTrend || '';
  document.getElementById('trade-volatility').value = trade?.volatility || '';
  document.getElementById('trade-adherence').value = trade?.planAdherence != null ? String(trade.planAdherence) : '';
  document.getElementById('trade-catalyst').value = trade?.catalyst || '';
  renderMistakeChips('trade-mistakes-chips', trade?.mistakes || []);
}

function readTradeEdgeFields() {
  const adh = document.getElementById('trade-adherence').value;
  return {
    setup: document.getElementById('trade-setup').value || null,
    session: document.getElementById('trade-session').value || null,
    marketTrend: document.getElementById('trade-trend').value || null,
    volatility: document.getElementById('trade-volatility').value || null,
    planAdherence: adh ? parseInt(adh) : null,
    catalyst: document.getElementById('trade-catalyst').value.trim() || null,
    mistakes: readMistakeChips('trade-mistakes-chips'),
  };
}

// "+" button next to setup select adds a new setup via prompt.
document.getElementById('trade-setup-add')?.addEventListener('click', () => {
  const name = prompt('Nuevo setup (ej. ORB, VWAP reclaim, Gap fill):');
  if (!name) return;
  const list = getSetups();
  if (!list.includes(name)) { list.push(name); saveSetups(list); }
  populateSelect(document.getElementById('trade-setup'), list, name);
});
document.getElementById('trade-mistake-add')?.addEventListener('click', () => {
  const name = prompt('Nuevo error (ej. "Entré sin confirmación"):');
  if (!name) return;
  const list = getMistakes();
  if (!list.includes(name)) { list.push(name); saveMistakes(list); }
  renderMistakeChips('trade-mistakes-chips', readMistakeChips('trade-mistakes-chips').concat(name));
});

// ---- Tag manager modal (used by Edge section buttons) ----
let tagManagerKind = 'setups';
function openTagManager(kind) {
  tagManagerKind = kind;
  document.getElementById('tag-manager-title').textContent =
    kind === 'setups' ? 'Gestionar setups' : 'Gestionar errores';
  renderTagManagerList();
  document.getElementById('tag-manager-modal').classList.add('open');
}
function renderTagManagerList() {
  const ul = document.getElementById('tag-manager-list');
  const list = tagManagerKind === 'setups' ? getSetups() : getMistakes();
  ul.innerHTML = list.length
    ? list.map((t, i) => `<li><span>${escapeHtml(t)}</span><button type="button" class="btn btn-sm btn-delete" data-tag-del="${i}">Eliminar</button></li>`).join('')
    : '<li class="tag-empty">Lista vacía.</li>';
  ul.querySelectorAll('[data-tag-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const list2 = tagManagerKind === 'setups' ? getSetups() : getMistakes();
      list2.splice(parseInt(btn.dataset.tagDel), 1);
      tagManagerKind === 'setups' ? saveSetups(list2) : saveMistakes(list2);
      renderTagManagerList();
    });
  });
}
document.getElementById('tag-manager-close')?.addEventListener('click', () => {
  document.getElementById('tag-manager-modal').classList.remove('open');
});
document.getElementById('tag-manager-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'tag-manager-modal') {
    document.getElementById('tag-manager-modal').classList.remove('open');
  }
});
document.getElementById('tag-manager-add')?.addEventListener('click', () => {
  const input = document.getElementById('tag-manager-new');
  const v = input.value.trim();
  if (!v) return;
  const list = tagManagerKind === 'setups' ? getSetups() : getMistakes();
  if (!list.includes(v)) {
    list.push(v);
    tagManagerKind === 'setups' ? saveSetups(list) : saveMistakes(list);
  }
  input.value = '';
  renderTagManagerList();
});
document.getElementById('edge-manage-setups')?.addEventListener('click', () => openTagManager('setups'));
document.getElementById('edge-manage-mistakes')?.addEventListener('click', () => openTagManager('mistakes'));

// ---- Edge pivot table ----
function tradeGroupValue(t, groupBy) {
  switch (groupBy) {
    case 'setup': return t.setup || '— Sin etiqueta —';
    case 'session': return t.session ? (SESSION_LABELS[t.session] || t.session) : '— Sin etiqueta —';
    case 'trend': return t.marketTrend ? (TREND_LABELS[t.marketTrend] || t.marketTrend) : '— Sin etiqueta —';
    case 'volatility': return t.volatility ? (VOL_LABELS[t.volatility] || t.volatility) : '— Sin etiqueta —';
    case 'adherence': return t.planAdherence != null ? (ADHERENCE_LABELS[String(t.planAdherence)] || String(t.planAdherence)) : '— Sin etiqueta —';
    case 'mistake': return t.mistakes && t.mistakes.length ? t.mistakes : ['— Sin etiqueta —'];
    default: return '— Sin etiqueta —';
  }
}

function tradeRiskMultiple(t) {
  if (!t.risk || t.risk <= 0 || t.pnl == null) return null;
  return t.pnl / t.risk;
}

function renderEdgeSection() {
  const groupBy = document.getElementById('edge-groupby').value;
  document.getElementById('edge-th-group').textContent =
    ({ setup: 'Setup', session: 'Sesión', trend: 'Tendencia', volatility: 'Volatilidad', adherence: 'Adherencia', mistake: 'Error' })[groupBy];

  const closed = getTrades().filter(t => t.result === 'win' || t.result === 'loss' || t.result === 'breakeven');
  const groups = new Map();
  for (const t of closed) {
    const keys = groupBy === 'mistake' ? tradeGroupValue(t, 'mistake') : [tradeGroupValue(t, groupBy)];
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
  }

  const rows = [];
  for (const [key, ts] of groups.entries()) {
    const n = ts.length;
    const wins = ts.filter(t => t.result === 'win').length;
    const losses = ts.filter(t => t.result === 'loss').length;
    const winRate = n ? wins / n : 0;
    const pnlTotal = ts.reduce((s, t) => s + (t.pnl || 0), 0);
    const avgWin = wins ? ts.filter(t => t.result === 'win').reduce((s, t) => s + (t.pnl || 0), 0) / wins : 0;
    const avgLoss = losses ? ts.filter(t => t.result === 'loss').reduce((s, t) => s + (t.pnl || 0), 0) / losses : 0;
    const expectancy = winRate * avgWin + (1 - winRate) * avgLoss;
    const rs = ts.map(tradeRiskMultiple).filter(r => r != null);
    const avgR = rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null;
    const best = Math.max(...ts.map(t => t.pnl || 0));
    const worst = Math.min(...ts.map(t => t.pnl || 0));
    rows.push({ key, n, winRate, pnlTotal, expectancy, avgR, best, worst });
  }

  rows.sort((a, b) => b.expectancy - a.expectancy);

  const tbody = document.getElementById('edge-table-body');
  const emptyEl = document.getElementById('edge-empty');
  if (!rows.length) {
    tbody.innerHTML = '';
    emptyEl.style.display = '';
  } else {
    emptyEl.style.display = 'none';
    tbody.innerHTML = rows.map(r => {
      const pnlClass = r.pnlTotal >= 0 ? 'positive' : 'negative';
      const expClass = r.expectancy >= 0 ? 'positive' : 'negative';
      return `<tr>
        <td><strong>${escapeHtml(r.key)}</strong></td>
        <td>${r.n}</td>
        <td>${(r.winRate * 100).toFixed(0)}%</td>
        <td class="${pnlClass}">${r.pnlTotal >= 0 ? '+' : ''}$${r.pnlTotal.toFixed(2)}</td>
        <td class="${expClass}">${r.expectancy >= 0 ? '+' : ''}$${r.expectancy.toFixed(2)}</td>
        <td>${r.avgR != null ? r.avgR.toFixed(2) + 'R' : '-'}</td>
        <td class="${r.best >= 0 ? 'positive' : 'negative'}">${r.best >= 0 ? '+' : ''}$${r.best.toFixed(2)}</td>
        <td class="${r.worst >= 0 ? 'positive' : 'negative'}">${r.worst >= 0 ? '+' : ''}$${r.worst.toFixed(2)}</td>
      </tr>`;
    }).join('');
  }

  // Summary cards
  const totalClosed = closed.length;
  const totalPnl = closed.reduce((s, t) => s + (t.pnl || 0), 0);
  const tagged = closed.filter(t => t.setup || (t.mistakes && t.mistakes.length)).length;
  const coverage = totalClosed ? Math.round((tagged / totalClosed) * 100) : 0;
  document.getElementById('edge-summary-cards').innerHTML = `
    <div class="card"><span class="card-label">Operaciones cerradas</span><span class="card-value">${totalClosed}</span></div>
    <div class="card"><span class="card-label">Etiquetadas</span><span class="card-value">${tagged} <small style="font-size:14px;color:var(--text-muted);">(${coverage}%)</small></span></div>
    <div class="card card-pnl"><span class="card-label">P&L total</span><span class="card-value ${totalPnl >= 0 ? 'positive' : 'negative'}">${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}</span></div>
    <div class="card"><span class="card-label">Categorías encontradas</span><span class="card-value">${rows.length}</span></div>
  `;
}

document.getElementById('edge-groupby')?.addEventListener('change', renderEdgeSection);
