// ==================== STATE ====================
let currentUser = null;
let tradesCache = [];
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

    // Calculate P&L
    if (pnlVal) {
      trade.pnl = parseFloat(pnlVal);
    } else if (trade.exit !== null) {
      // P&L from actual exit price
      if (direction === 'long') {
        trade.pnl = (trade.exit - entry) * quantity;
      } else {
        trade.pnl = (entry - trade.exit) * quantity;
      }
      trade.pnl = Math.round(trade.pnl * 100) / 100;
    } else if (trade.result === 'loss' && riskAmount > 0) {
      // No exit price but marked as loss → P&L = -Risk (hit SL)
      trade.pnl = -riskAmount;
    } else if (trade.result === 'win' && trade.tp && entry) {
      // No exit price but marked as win → P&L from TP
      if (direction === 'long') {
        trade.pnl = Math.round((trade.tp - entry) * quantity * 100) / 100;
      } else {
        trade.pnl = Math.round((entry - trade.tp) * quantity * 100) / 100;
      }
    }

    // Result is always set by the user, never auto-detected
    trade.result = document.getElementById('trade-result').value || 'breakeven';

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
    <tr class="trade-row trade-${t.result}" data-trade-id="${t.id}">
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
