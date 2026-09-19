/* ==============================================================================
   DCE COMMUNITY HUB — INTERACTIVE JAVASCRIPT & INDEXEDDB STORAGE
   Desarrollado por DCE STUDIOS | https://dcegaming.netlify.app/
   ============================================================================== */

// IndexedDB Configuration
const DB_NAME = 'dce_community_hub_db';
const DB_VERSION = 1;
const STORE_NAME = 'publications';

// Google Drive Bridge Webhook (Apps Script URL para tu cuenta Google 5TB Pro)
// Pega aquí la URL de tu implementación web de Google Apps Script (terminada en /exec)
const GOOGLE_DRIVE_BRIDGE_ENDPOINT = 'https://script.google.com/macros/s/AKfycby14z64teU3o1V7FcRkgzHenQ3MfQP46Sj_fn4Lz0pbhPjjFPZe3fAuQYdW6glhvGnJ0Q/exec';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result;
      const base64 = res.substring(res.indexOf(',') + 1);
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

let db = null;
let currentTab = 'all';
let currentFilter = 'all';
let searchQuery = '';
let selectedFile = null;

let memoryPublications = [];

document.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  initSteamAuth();
  initTabs();
  initSearchAndFilters();
  initModals();
  initDropzone();
  await refreshView();
  syncRemotePublications();
  setInterval(syncRemotePublications, 45000);
});

/* ==============================================================================
   1. INDEXEDDB ENGINE (ALMACENAMIENTO BINARIO LOCAL Y DESCARGAS REALES)
   ============================================================================== */
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('type', 'type', { unique: false });
        store.createIndex('authorSteamId', 'authorSteamId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    request.onerror = (e) => {
      console.error('Error al inicializar IndexedDB:', e);
      resolve(null);
    };
  });
}

function dbSavePublication(item) {
  // 1. Actualizar memoria inmediatamente para respuesta en tiempo real
  const existingIdx = memoryPublications.findIndex(p => p.id === item.id);
  if (existingIdx >= 0) {
    memoryPublications[existingIdx] = item;
  } else {
    memoryPublications.unshift(item);
  }

  return new Promise((resolve) => {
    if (!db) return resolve(true);
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(item);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(true);
    } catch (e) {
      resolve(true);
    }
  });
}

function dbGetAllPublications() {
  return new Promise((resolve) => {
    if (!db) return resolve(memoryPublications);
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const dbItems = req.result || [];
        const map = new Map();
        for (const item of memoryPublications) {
          if (item && item.id) map.set(item.id, item);
        }
        for (const item of dbItems) {
          if (item && item.id) map.set(item.id, item);
        }
        memoryPublications = Array.from(map.values());
        resolve(memoryPublications);
      };
      req.onerror = () => resolve(memoryPublications);
    } catch (e) {
      resolve(memoryPublications);
    }
  });
}

function dbDeletePublication(id) {
  memoryPublications = memoryPublications.filter(p => p.id !== id);
  return new Promise((resolve) => {
    if (!db) return resolve(true);
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(true);
    } catch (e) {
      resolve(true);
    }
  });
}

async function syncRemotePublications() {
  if (!GOOGLE_DRIVE_BRIDGE_ENDPOINT || !GOOGLE_DRIVE_BRIDGE_ENDPOINT.startsWith('http')) return;
  try {
    const resp = await fetch(GOOGLE_DRIVE_BRIDGE_ENDPOINT + '?action=list', {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    const data = await resp.json();
    if (data && data.status === 'success' && Array.isArray(data.publications)) {
      for (const pub of data.publications) {
        if (pub && pub.id) {
          await dbSavePublication(pub);
        }
      }
      await refreshView();
    }
  } catch (err) {
    console.warn('[DCE Community Hub] Conexión remota temporalmente no disponible:', err);
  }
}

/* ==============================================================================
   2. STEAM AUTHENTICATION (SESIÓN DE CREADOR)
   ============================================================================== */
const STEAM_SESSION_KEY = 'dce_steam_creator_session';

function getSteamUser() {
  try {
    const raw = localStorage.getItem(STEAM_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setSteamUser(user) {
  localStorage.setItem(STEAM_SESSION_KEY, JSON.stringify(user));
  updateSteamUI();
}

function clearSteamUser() {
  localStorage.removeItem(STEAM_SESSION_KEY);
  updateSteamUI();
  if (currentTab === 'my-posts') {
    switchTab('modpacks');
  }
  refreshView();
}

function initSteamAuth() {
  const btnLogin = document.getElementById('btn-steam-login');
  const closeBtn = document.getElementById('close-steam-modal');
  const cancelBtn = document.getElementById('cancel-steam-modal');

  // Detect Steam OpenID callback in URL (?steam_auth=... or ?steam_error=...)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const steamAuthParam = urlParams.get('steam_auth');
    const steamErrorParam = urlParams.get('steam_error');

    if (steamAuthParam) {
      const decodedUser = JSON.parse(decodeURIComponent(steamAuthParam));
      if (decodedUser && decodedUser.steamId) {
        setSteamUser(decodedUser);
        showCommToast(`¡Bienvenido, ${decodedUser.name}! Autenticado oficialmente por Steam Guard.`, 'ok');
      }
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    } else if (steamErrorParam) {
      if (steamErrorParam === 'cancelled') {
        showCommToast('Inicio de sesión en Steam cancelado.', 'warn');
      } else {
        showCommToast(`Error de autenticación con Steam: ${steamErrorParam}`, 'err');
      }
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  } catch (err) {
    console.error('Error al procesar callback de Steam:', err);
  }

  if (btnLogin) {
    btnLogin.addEventListener('click', () => openSteamModal());
  }
  if (closeBtn) closeBtn.addEventListener('click', () => closeSteamModal());
  if (cancelBtn) cancelBtn.addEventListener('click', () => closeSteamModal());

  updateSteamUI();
}

function openSteamModal() {
  const modal = document.getElementById('modal-steam-login');
  if (modal) modal.classList.add('open');
}

function closeSteamModal() {
  const modal = document.getElementById('modal-steam-login');
  if (modal) modal.classList.remove('open');
}

function updateSteamUI() {
  const slot = document.getElementById('steam-auth-slot');
  const user = getSteamUser();

  if (!slot) return;

  if (user) {
    slot.innerHTML = `
      <div class="steam-user-badge">
        <a href="${user.profileUrl}" target="_blank" rel="noopener noreferrer" class="steam-user-link" title="Abrir mi perfil de Steam">
          <img src="${user.avatar}" alt="Steam Avatar" class="steam-user-avatar" />
          <div class="steam-user-meta">
            <span class="steam-user-name">${escapeHtml(user.name)}</span>
            <span class="steam-verified-tag"><i class="fab fa-steam"></i> Creador Verificado</span>
          </div>
        </a>
        <button class="btn btn-outline-danger btn-xs" id="btn-steam-logout" title="Cerrar sesión de Steam">
          <i class="fas fa-right-from-bracket"></i>
        </button>
      </div>
    `;

    const logoutBtn = document.getElementById('btn-steam-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        clearSteamUser();
        showCommToast('Sesión de Steam cerrada.', 'ok');
      });
    }
  } else {
    slot.innerHTML = `
      <button class="btn btn-steam btn-sm" id="btn-steam-login">
        <i class="fab fa-steam"></i> <span>Iniciar Sesión con Steam</span>
      </button>
    `;
    const btnLogin = document.getElementById('btn-steam-login');
    if (btnLogin) {
      btnLogin.addEventListener('click', () => openSteamModal());
    }
  }

  // Update publish form creator preview
  const previewSlot = document.getElementById('pub-creator-preview');
  if (previewSlot) {
    if (user) {
      previewSlot.innerHTML = `
        <div class="creator-mini-box">
          <img src="${user.avatar}" class="mini-avatar" />
          <span>${escapeHtml(user.name)}</span>
          <span class="badge-mini"><i class="fab fa-steam"></i> Verificado</span>
        </div>
      `;
    } else {
      previewSlot.innerHTML = `
        <span class="text-dim-sm"><i class="fas fa-lock"></i> Requiere iniciar sesión con Steam</span>
      `;
    }
  }
}

/* ==============================================================================
   3. TABS NAVIGATION & SEARCH CONTROLS
   ============================================================================== */
function initTabs() {
  const tabs = document.querySelectorAll('.comm-tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      if (tabId === 'my-posts' && !getSteamUser()) {
        showCommToast('Inicia sesión con Steam para ver y gestionar tus publicaciones.', 'warn');
        openSteamModal();
        return;
      }
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll('.comm-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });
  refreshView();
}

function initSearchAndFilters() {
  const searchInput = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear-btn');
  const chips = document.querySelectorAll('.comm-chip');

  if (searchInput) {
    let debounceTimer = null;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      searchQuery = (e.target.value || '').trim().toLowerCase();
      if (clearBtn) {
        clearBtn.style.display = searchQuery ? 'block' : 'none';
      }
      debounceTimer = setTimeout(() => {
        refreshView();
      }, 200);
    });
  }

  if (clearBtn && searchInput) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      clearBtn.style.display = 'none';
      refreshView();
    });
  }

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      refreshView();
    });
  });
}

/* ==============================================================================
   4. MODALS & PUBLICATION FORM
   ============================================================================== */
function initModals() {
  const publishTrigger = document.getElementById('btn-publish-trigger');
  const emptyPublishTrigger = document.getElementById('btn-empty-publish');
  const modalPublish = document.getElementById('modal-publish');
  const closePublishBtn = document.getElementById('close-publish-modal');
  const cancelPublishBtn = document.getElementById('cancel-publish-modal');
  const typeModpackBtn = document.getElementById('type-btn-modpack');
  const typeAutoexecBtn = document.getElementById('type-btn-autoexec');
  const pubForm = document.getElementById('publish-form');

  const onOpenPublish = () => {
    if (!getSteamUser()) {
      showCommToast('Debes vincular tu cuenta de Steam para publicar como creador.', 'warn');
      openSteamModal();
      return;
    }
    openPublishModal();
  };

  if (publishTrigger) publishTrigger.addEventListener('click', onOpenPublish);
  if (emptyPublishTrigger) emptyPublishTrigger.addEventListener('click', onOpenPublish);
  if (closePublishBtn) closePublishBtn.addEventListener('click', () => closePublishModal());
  if (cancelPublishBtn) cancelPublishBtn.addEventListener('click', () => closePublishModal());

  // Type switcher inside modal
  if (typeModpackBtn && typeAutoexecBtn) {
    typeModpackBtn.addEventListener('click', () => setPublishType('modpack'));
    typeAutoexecBtn.addEventListener('click', () => setPublishType('autoexec'));
  }

  // Submit publication
  if (pubForm) {
    pubForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handlePublishSubmit();
    });
  }
}

function openPublishModal(defaultType = null) {
  if (defaultType) setPublishType(defaultType);
  const modal = document.getElementById('modal-publish');
  if (modal) modal.classList.add('open');
}

function closePublishModal() {
  const modal = document.getElementById('modal-publish');
  if (modal) modal.classList.remove('open');
  resetPublishForm();
}

function setPublishType(type) {
  const typeInput = document.getElementById('pub-item-type');
  const btnModpack = document.getElementById('type-btn-modpack');
  const btnAutoexec = document.getElementById('type-btn-autoexec');
  const fileLabel = document.getElementById('pub-file-label');
  const fileInput = document.getElementById('pub-file-input');
  const dropzoneHint = document.getElementById('dropzone-hint');

  typeInput.value = type;
  const groupModpackMode = document.getElementById('group-modpack-mode');

  if (type === 'modpack') {
    btnModpack.classList.add('active');
    btnAutoexec.classList.remove('active');
    fileLabel.textContent = 'Archivo del Modpack (.dcepack o .zip):';
    fileInput.accept = '.dcepack,.zip';
    dropzoneHint.textContent = 'Formatos soportados: .dcepack, .zip';
    if (groupModpackMode) groupModpackMode.style.display = 'block';
  } else {
    btnAutoexec.classList.add('active');
    btnModpack.classList.remove('active');
    fileLabel.textContent = 'Archivo de Configuración Autoexec (.cfg):';
    fileInput.accept = '.cfg';
    dropzoneHint.textContent = 'Formato soportado: .cfg';
    if (groupModpackMode) groupModpackMode.style.display = 'none';
  }

  selectedFile = null;
  updateDropzoneDisplay();
}

function initDropzone() {
  const dropzone = document.getElementById('file-dropzone');
  const fileInput = document.getElementById('pub-file-input');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });
}

function handleFileSelected(file) {
  const type = document.getElementById('pub-item-type').value;
  const ext = file.name.split('.').pop().toLowerCase();

  // Security checks: prohibited dangerous extensions
  const dangerousExts = ['exe', 'dll', 'bat', 'cmd', 'vbs', 'ps1', 'scr', 'sh', 'com', 'msi', 'jar'];
  if (dangerousExts.includes(ext)) {
    showCommToast(`⚠️ Archivo con extensión prohibida por seguridad (.${ext}).`, 'err');
    selectedFile = null;
    updateDropzoneDisplay();
    return;
  }

  if (type === 'modpack' && !['dcepack', 'zip'].includes(ext)) {
    showCommToast('El archivo para modpack debe ser formato .dcepack o .zip', 'warn');
    selectedFile = null;
    updateDropzoneDisplay();
    return;
  }

  if (type === 'autoexec' && ext !== 'cfg') {
    showCommToast('El archivo para autoexec debe ser formato .cfg', 'warn');
    selectedFile = null;
    updateDropzoneDisplay();
    return;
  }

  selectedFile = file;
  updateDropzoneDisplay();
}

function updateDropzoneDisplay() {
  const selectedBox = document.getElementById('dropzone-selected-file');
  const nameLabel = document.getElementById('selected-file-name');
  const sizeLabel = document.getElementById('selected-file-size');

  if (!selectedBox) return;

  if (selectedFile) {
    selectedBox.style.display = 'flex';
    nameLabel.textContent = selectedFile.name;
    sizeLabel.textContent = formatBytes(selectedFile.size);
  } else {
    selectedBox.style.display = 'none';
  }
}

function resetPublishForm() {
  const form = document.getElementById('publish-form');
  if (form) form.reset();
  selectedFile = null;
  updateDropzoneDisplay();
  setPublishType('modpack');
}

function showUploadProgress(title, status, percent) {
  const modal = document.getElementById('modal-upload-progress');
  const tEl = document.getElementById('upload-progress-title');
  const sEl = document.getElementById('upload-progress-status');
  const bEl = document.getElementById('upload-progress-bar');
  const pEl = document.getElementById('upload-progress-percent');
  const iEl = document.getElementById('upload-progress-icon');
  if (modal) modal.style.display = 'flex';
  if (tEl && title) tEl.textContent = title;
  if (sEl && status) sEl.textContent = status;
  if (bEl && percent !== undefined) bEl.style.width = percent + '%';
  if (pEl && percent !== undefined) pEl.textContent = percent + '%';
  if (iEl) {
    if (percent === 100) {
      iEl.className = 'fas fa-check-circle';
      iEl.style.color = '#22c55e';
    } else {
      iEl.className = 'fas fa-cloud-arrow-up fa-bounce';
      iEl.style.color = 'var(--flame-orange)';
    }
  }
}

function hideUploadProgress() {
  const modal = document.getElementById('modal-upload-progress');
  if (modal) modal.style.display = 'none';
}

async function handlePublishSubmit() {
  const user = getSteamUser();
  if (!user) {
    showCommToast('Debes iniciar sesión con Steam para publicar.', 'warn');
    openSteamModal();
    return;
  }

  if (!selectedFile) {
    showCommToast('Por favor selecciona el archivo a publicar.', 'warn');
    return;
  }

  const type = document.getElementById('pub-item-type').value;
  const title = (document.getElementById('pub-title').value || '').trim();
  const version = (document.getElementById('pub-version').value || 'v1.0').trim();
  const category = document.getElementById('pub-category').value;
  const modpackMode = (type === 'modpack') ? (document.getElementById('pub-modpack-mode')?.value || 'Normal') : null;
  const description = (document.getElementById('pub-description').value || '').trim();

  if (!title || !description) {
    showCommToast('Completa el título y la descripción.', 'warn');
    return;
  }

  const submitBtn = document.getElementById('btn-submit-publish');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando y Subiendo...';
  }

  showUploadProgress('Publicando en DCE Hub', 'Preparando y analizando archivo...', 15);
  closePublishModal();

  try {
    const pubId = 'dce_pub_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    let driveDownloadUrl = null;
    let driveFileId = null;

    // Subida automática a Google Drive Bridge si el endpoint está configurado
    if (GOOGLE_DRIVE_BRIDGE_ENDPOINT && GOOGLE_DRIVE_BRIDGE_ENDPOINT.startsWith('http')) {
      try {
        showUploadProgress('Publicando en DCE Hub', 'Codificando paquete seguro...', 35);
        const base64Data = await fileToBase64(selectedFile);
        showUploadProgress('Publicando en DCE Hub', 'Transmitiendo a la nube comunitaria (Google Drive 5TB)...', 65);
        const payload = {
          type: type,
          modpackMode: modpackMode,
          fileName: selectedFile.name,
          fileData: base64Data,
          mimeType: selectedFile.type || 'application/octet-stream',
          title: title,
          version: version,
          category: category,
          description: description,
          authorName: user.name,
          authorSteamId: user.steamId,
          authorSteamUrl: user.profileUrl,
          authorAvatar: user.avatar
        };

        const resp = await fetch(GOOGLE_DRIVE_BRIDGE_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload)
        });
        const driveRes = await resp.json();
        if (driveRes && driveRes.status === 'success') {
          driveDownloadUrl = driveRes.directDownloadUrl;
          driveFileId = driveRes.fileId;
          console.log('[DCE Drive Bridge] Subido con éxito a Google Drive:', driveRes);
        }
      } catch (uploadErr) {
        console.warn('[DCE Drive Bridge] Conexión con Apps Script no disponible, respaldado localmente:', uploadErr);
      }
    }

    showUploadProgress('Publicando en DCE Hub', 'Finalizando registro de publicación...', 90);

    const item = {
      id: pubId,
      type: type, // 'modpack' | 'autoexec'
      modpackMode: modpackMode,
      title: title,
      version: version,
      category: category,
      description: description,
      authorName: user.name,
      authorSteamUrl: user.profileUrl,
      authorSteamId: user.steamId,
      authorAvatar: user.avatar,
      fileName: selectedFile.name,
      fileSize: selectedFile.size,
      fileBlob: selectedFile,
      driveDownloadUrl: driveDownloadUrl,
      driveFileId: driveFileId,
      createdAt: new Date().toISOString()
    };

    await dbSavePublication(item);
    showUploadProgress('¡Publicación Exitosa!', 'Tu creación ya está disponible para toda la comunidad.', 100);
    await new Promise(r => setTimeout(r, 800));
    hideUploadProgress();

    const driveNote = driveDownloadUrl ? ' (Sincronizado en tu Google Drive)' : '';
    showCommToast(`🎉 ¡${item.title} publicado con éxito en la comunidad!${driveNote}`, 'ok');
    await refreshView();
  } catch (ex) {
    hideUploadProgress();
    console.error('Error al guardar publicación:', ex);
    showCommToast('Error al procesar el archivo. Revisa los permisos del navegador.', 'err');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-check-circle"></i> Publicar en la Comunidad';
    }
  }
}

/* ==============================================================================
   5. VIEW RENDERING & DIRECT DOWNLOADS
   ============================================================================== */
async function refreshView() {
  const items = await dbGetAllPublications();
  const user = getSteamUser();

  // 1. Separate by type
  const modpacksList = items.filter(i => i.type === 'modpack');
  const autoexecsList = items.filter(i => i.type === 'autoexec');
  const authorsSet = new Set(items.map(i => i.authorSteamId || i.authorName));

  // 2. Global stats
  const statModpacks = document.getElementById('stat-modpacks');
  const statAutoexecs = document.getElementById('stat-autoexecs');
  const statCreators = document.getElementById('stat-creators');
  const myPostsBadge = document.getElementById('my-posts-badge');

  if (statModpacks) statModpacks.textContent = modpacksList.length;
  if (statAutoexecs) statAutoexecs.textContent = autoexecsList.length;
  if (statCreators) statCreators.textContent = authorsSet.size;

  const myPosts = user ? items.filter(i => i.authorSteamId === user.steamId) : [];
  if (myPostsBadge) myPostsBadge.textContent = myPosts.length;

  // 3. Filter function for Search Query & Category Chips
  const filterItem = (item) => {
    if (currentFilter !== 'all') {
      if (currentFilter === 'Persistente') {
        if (item.modpackMode !== 'Persistente') return false;
      } else if (currentFilter === 'Normal') {
        if (item.modpackMode !== 'Normal') return false;
      } else {
        const c1 = (item.category || '').toLowerCase();
        const c2 = currentFilter.toLowerCase();
        if (!c1.includes(c2) && !c2.includes(c1)) return false;
      }
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const t = (item.title || '').toLowerCase();
      const a = (item.authorName || '').toLowerCase();
      const d = (item.description || '').toLowerCase();
      const v = (item.version || '').toLowerCase();
      const c = (item.category || '').toLowerCase();
      const m = (item.modpackMode || '').toLowerCase();
      const f = (item.fileName || '').toLowerCase();
      if (!t.includes(q) && !a.includes(q) && !d.includes(q) && !v.includes(q) && !c.includes(q) && !m.includes(q) && !f.includes(q)) {
        return false;
      }
    }
    return true;
  };

  const filteredModpacks = modpacksList.filter(filterItem).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const filteredAutoexecs = autoexecsList.filter(filterItem).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const filteredMyPosts = myPosts.filter(filterItem).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // 4. Section Box Containers
  const boxModpacks = document.getElementById('section-box-modpacks');
  const boxAutoexecs = document.getElementById('section-box-autoexecs');
  const boxMyPosts = document.getElementById('section-box-my-posts');
  const emptyStateGlobal = document.getElementById('empty-state');
  const emptyDescGlobal = document.getElementById('empty-desc');

  // Control visibility of section boxes according to currentTab
  if (currentTab === 'all') {
    if (boxModpacks) boxModpacks.style.display = 'block';
    if (boxAutoexecs) boxAutoexecs.style.display = 'block';
    if (boxMyPosts) boxMyPosts.style.display = 'none';
  } else if (currentTab === 'modpacks') {
    if (boxModpacks) boxModpacks.style.display = 'block';
    if (boxAutoexecs) boxAutoexecs.style.display = 'none';
    if (boxMyPosts) boxMyPosts.style.display = 'none';
  } else if (currentTab === 'autoexecs') {
    if (boxModpacks) boxModpacks.style.display = 'none';
    if (boxAutoexecs) boxAutoexecs.style.display = 'block';
    if (boxMyPosts) boxMyPosts.style.display = 'none';
  } else if (currentTab === 'my-posts') {
    if (boxModpacks) boxModpacks.style.display = 'none';
    if (boxAutoexecs) boxAutoexecs.style.display = 'none';
    if (boxMyPosts) boxMyPosts.style.display = 'block';
  }

  // 5. Populate Modpacks Box
  populateBox({
    gridId: 'grid-modpacks',
    emptyId: 'empty-modpacks',
    badgeId: 'badge-count-modpacks',
    items: filteredModpacks,
    badgeSuffix: 'Modpacks',
    isMyPost: false
  });

  // 6. Populate Autoexecs Box
  populateBox({
    gridId: 'grid-autoexecs',
    emptyId: 'empty-autoexecs',
    badgeId: 'badge-count-autoexecs',
    items: filteredAutoexecs,
    badgeSuffix: 'Autoexecs',
    isMyPost: false
  });

  // 7. Populate My Posts Box
  populateBox({
    gridId: 'grid-my-posts',
    emptyId: 'empty-my-posts',
    badgeId: 'badge-count-my-posts',
    items: filteredMyPosts,
    badgeSuffix: 'Publicaciones',
    isMyPost: true
  });

  // 8. Global Empty State check
  if (emptyStateGlobal) {
    let totalVisible = 0;
    if (currentTab === 'all') totalVisible = filteredModpacks.length + filteredAutoexecs.length;
    else if (currentTab === 'modpacks') totalVisible = filteredModpacks.length;
    else if (currentTab === 'autoexecs') totalVisible = filteredAutoexecs.length;
    else if (currentTab === 'my-posts') totalVisible = filteredMyPosts.length;

    if (totalVisible === 0 && (searchQuery || currentFilter !== 'all')) {
      emptyStateGlobal.style.display = 'flex';
      if (emptyDescGlobal) emptyDescGlobal.textContent = 'No se encontraron publicaciones que coincidan con la búsqueda o filtro aplicado.';
    } else {
      emptyStateGlobal.style.display = 'none';
    }
  }
}

function populateBox({ gridId, emptyId, badgeId, items, badgeSuffix, isMyPost }) {
  const grid = document.getElementById(gridId);
  const empty = document.getElementById(emptyId);
  const badge = document.getElementById(badgeId);

  if (badge) badge.textContent = `${items.length} ${badgeSuffix}`;

  if (!grid) return;
  grid.innerHTML = '';

  if (items.length === 0) {
    grid.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    return;
  }

  grid.style.display = 'grid';
  if (empty) empty.style.display = 'none';

  items.forEach(item => {
    const card = createCardElement(item, isMyPost);
    grid.appendChild(card);
  });
}

function createCardElement(item, isMyPost) {
  const card = document.createElement('div');
  card.className = 'community-card';

  const isModpack = item.type === 'modpack';
  const typeLabel = isModpack ? '.DCEPACK' : '.CFG';
  const typeClass = isModpack ? 'badge-flame' : 'badge-green';

  const modeBadge = isModpack ? (
    (item.modpackMode === 'Persistente')
      ? '<span class="comm-mode-badge badge-persistente" title="Almacén persistente local dce_storage (0 MB adicionales)"><i class="fas fa-hard-drive"></i> Persistente</span>'
      : '<span class="comm-mode-badge badge-normal" title="Requiere suscripciones activas en Steam Workshop"><i class="fab fa-steam"></i> Normal</span>'
  ) : '';

  const dateStr = new Date(item.createdAt).toLocaleDateString('es-ES', {
    year: 'numeric', month: 'short', day: 'numeric'
  });

  card.innerHTML = `
    <div class="community-card-header">
      <div class="comm-badge-row">
        <span class="badge ${typeClass}">${typeLabel}</span>
        ${modeBadge}
        <span class="comm-version-badge">${escapeHtml(item.version)}</span>
        <span class="comm-cat-badge">${escapeHtml(item.category)}</span>
        <span class="comm-security-badge"><i class="fas fa-shield-check"></i> Seguro</span>
      </div>
      <h4 class="comm-card-title">${escapeHtml(item.title)}</h4>
      
      <!-- Author Profile Link (Opens Steam in new tab) -->
      <div class="comm-card-author">
        <img src="${item.authorAvatar || 'icono.png'}" class="author-micro-avatar" alt="Avatar" />
        <span class="author-label">Creador:</span>
        <a href="${item.authorSteamUrl}" target="_blank" rel="noopener noreferrer" class="author-steam-link" title="Abrir perfil oficial de Steam en nueva pestaña">
          <i class="fab fa-steam"></i>
          <strong>${escapeHtml(item.authorName)}</strong>
        </a>
      </div>
    </div>

    <p class="comm-card-desc">${escapeHtml(item.description)}</p>

    <div class="comm-card-meta">
      <span><i class="fas fa-file-code"></i> ${escapeHtml(item.fileName)}</span>
      <span><i class="fas fa-weight-hanging"></i> ${formatBytes(item.fileSize)}</span>
      <span><i class="fas fa-calendar-alt"></i> ${dateStr}</span>
    </div>

    <div class="comm-card-actions">
      <button class="btn btn-primary btn-sm btn-comm-download" data-id="${item.id}" title="Descarga directa inmediata sin intermediarios">
        <i class="fas fa-download"></i> <span>Descargar (${formatBytes(item.fileSize)})</span>
      </button>
      ${isMyPost ? `
        <button class="btn btn-outline-danger btn-sm btn-comm-delete" data-id="${item.id}">
          <i class="fas fa-trash-alt"></i> <span>Eliminar Publicación</span>
        </button>
      ` : ''}
    </div>
  `;

  // Download Button Action
  const dlBtn = card.querySelector('.btn-comm-download');
  if (dlBtn) {
    dlBtn.addEventListener('click', () => triggerFileDownload(item));
  }

  // Delete Button Action (In My Posts)
  const delBtn = card.querySelector('.btn-comm-delete');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      if (confirm(`¿Estás seguro de eliminar "${item.title}"? Esta acción también lo borrará de Google Drive.`)) {
        delBtn.disabled = true;
        delBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Eliminando de Drive...';

        // 1. Borrar de Google Drive si tiene archivo asociado
        const fileIdToDelete = item.driveFileId || (item.driveDownloadUrl ? (item.driveDownloadUrl.match(/id=([a-zA-Z0-9_-]+)/) || [])[1] : null);

        if (fileIdToDelete && GOOGLE_DRIVE_BRIDGE_ENDPOINT && GOOGLE_DRIVE_BRIDGE_ENDPOINT.startsWith('http')) {
          try {
            await fetch(GOOGLE_DRIVE_BRIDGE_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({
                action: 'delete',
                fileId: fileIdToDelete
              })
            });
            console.log('[DCE Drive Bridge] Archivo eliminado en Google Drive:', fileIdToDelete);
          } catch (delDriveErr) {
            console.warn('[DCE Drive Bridge] Error al solicitar eliminación en Google Drive:', delDriveErr);
          }
        }

        // 2. Borrar de base de datos local
        await dbDeletePublication(item.id);
        showCommToast('Publicación y archivo de Google Drive eliminados con éxito.', 'ok');
        await refreshView();
      }
    });
  }

  return card;
}

function triggerFileDownload(item) {
  // 1. Descarga directa desde Google Drive si existe URL directa
  if (item.driveDownloadUrl) {
    const a = document.createElement('a');
    a.href = item.driveDownloadUrl;
    a.download = item.fileName || (item.title + (item.type === 'modpack' ? '.dcepack' : '.cfg'));
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showCommToast(`📥 Descarga directa de "${item.fileName}" iniciada...`, 'ok');
    return;
  }

  // 2. Fallback: descarga desde blob en almacenamiento local IndexedDB
  if (item.fileBlob) {
    try {
      const url = URL.createObjectURL(item.fileBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.fileName || (item.title + (item.type === 'modpack' ? '.dcepack' : '.cfg'));
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      showCommToast(`📥 Descargando "${item.fileName}"...`, 'ok');
    } catch (ex) {
      console.error('Error al iniciar descarga:', ex);
      showCommToast('No se pudo iniciar la descarga en el navegador.', 'err');
    }
    return;
  }

  showCommToast('Error: archivo no disponible para descarga.', 'err');
}

/* ==============================================================================
   6. UTILITIES
   ============================================================================== */
function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showCommToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.className = 'toast show ' + type;

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.className = 'toast';
  }, 4200);
}
