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
let currentTab = 'modpacks';
let currentFilter = 'all';
let searchQuery = '';
let selectedFile = null;

document.addEventListener('DOMContentLoaded', async () => {
  await initDB();
  initSteamAuth();
  initTabs();
  initSearchAndFilters();
  initModals();
  initDropzone();
  await refreshView();
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
      reject(e);
    };
  });
}

function dbSavePublication(item) {
  return new Promise((resolve, reject) => {
    if (!db) return reject('Database not initialized');
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(item);
    req.onsuccess = () => resolve(true);
    req.onerror = (e) => reject(e);
  });
}

function dbGetAllPublications() {
  return new Promise((resolve, reject) => {
    if (!db) return reject('Database not initialized');
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e);
  });
}

function dbDeletePublication(id) {
  return new Promise((resolve, reject) => {
    if (!db) return reject('Database not initialized');
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = (e) => reject(e);
  });
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
  const modalLogin = document.getElementById('modal-steam-login');
  const closeBtn = document.getElementById('close-steam-modal');
  const cancelBtn = document.getElementById('cancel-steam-modal');
  const form = document.getElementById('steam-login-form');

  if (btnLogin) {
    btnLogin.addEventListener('click', () => openSteamModal());
  }
  if (closeBtn) closeBtn.addEventListener('click', () => closeSteamModal());
  if (cancelBtn) cancelBtn.addEventListener('click', () => closeSteamModal());

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const inputVal = (document.getElementById('steam-input').value || '').trim();
      const nicknameVal = (document.getElementById('steam-nickname').value || '').trim();

      if (!inputVal || !nicknameVal) {
        showCommToast('Por favor completa todos los campos del perfil.', 'warn');
        return;
      }

      let profileUrl = inputVal;
      let steamId = nicknameVal.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (!profileUrl.startsWith('http://') && !profileUrl.startsWith('https://')) {
        if (/^\d{17}$/.test(profileUrl)) {
          steamId = profileUrl;
          profileUrl = `https://steamcommunity.com/profiles/${profileUrl}/`;
        } else {
          profileUrl = `https://steamcommunity.com/id/${profileUrl}/`;
        }
      } else {
        const match = profileUrl.match(/(?:id|profiles)\/([^/]+)/);
        if (match) steamId = match[1];
      }

      const user = {
        name: nicknameVal,
        profileUrl: profileUrl,
        steamId: steamId || nicknameVal,
        avatar: 'icono.png',
        joinedAt: new Date().toISOString()
      };

      setSteamUser(user);
      closeSteamModal();
      showCommToast(`¡Bienvenido, ${user.name}! Perfil de Steam vinculado con éxito.`, 'ok');
      refreshView();
    });
  }

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

  if (type === 'modpack') {
    btnModpack.classList.add('active');
    btnAutoexec.classList.remove('active');
    fileLabel.textContent = 'Archivo del Modpack (.dcepack o .zip):';
    fileInput.accept = '.dcepack,.zip';
    dropzoneHint.textContent = 'Formatos soportados: .dcepack, .zip';
  } else {
    btnAutoexec.classList.add('active');
    btnModpack.classList.remove('active');
    fileLabel.textContent = 'Archivo de Configuración Autoexec (.cfg):';
    fileInput.accept = '.cfg';
    dropzoneHint.textContent = 'Formato soportado: .cfg';
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

  try {
    const pubId = 'dce_pub_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    let driveDownloadUrl = null;
    let driveFileId = null;

    // Subida automática a Google Drive Bridge si el endpoint está configurado
    if (GOOGLE_DRIVE_BRIDGE_ENDPOINT && GOOGLE_DRIVE_BRIDGE_ENDPOINT.startsWith('http')) {
      try {
        const base64Data = await fileToBase64(selectedFile);
        const payload = {
          type: type,
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

    const item = {
      id: pubId,
      type: type, // 'modpack' | 'autoexec'
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
    closePublishModal();
    const driveNote = driveDownloadUrl ? ' (Sincronizado en tu Google Drive)' : '';
    showCommToast(`🎉 ¡${item.title} publicado con éxito en la comunidad!${driveNote}`, 'ok');
    await refreshView();
  } catch (ex) {
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

  // Update Global Stats
  const modpacksList = items.filter(i => i.type === 'modpack');
  const autoexecsList = items.filter(i => i.type === 'autoexec');
  const authorsSet = new Set(items.map(i => i.authorSteamId || i.authorName));

  const statModpacks = document.getElementById('stat-modpacks');
  const statAutoexecs = document.getElementById('stat-autoexecs');
  const statCreators = document.getElementById('stat-creators');
  const myPostsBadge = document.getElementById('my-posts-badge');

  if (statModpacks) statModpacks.textContent = modpacksList.length;
  if (statAutoexecs) statAutoexecs.textContent = autoexecsList.length;
  if (statCreators) statCreators.textContent = authorsSet.size;

  const myPosts = user ? items.filter(i => i.authorSteamId === user.steamId) : [];
  if (myPostsBadge) myPostsBadge.textContent = myPosts.length;

  // Filter items for current tab
  let filtered = [];
  if (currentTab === 'modpacks') {
    filtered = modpacksList;
  } else if (currentTab === 'autoexecs') {
    filtered = autoexecsList;
  } else if (currentTab === 'my-posts') {
    filtered = myPosts;
  }

  // Apply Category Chip Filter
  if (currentFilter !== 'all') {
    filtered = filtered.filter(i => i.category === currentFilter);
  }

  // Apply Search Query Filter
  if (searchQuery) {
    filtered = filtered.filter(i => {
      const t = (i.title || '').toLowerCase();
      const a = (i.authorName || '').toLowerCase();
      const d = (i.description || '').toLowerCase();
      const v = (i.version || '').toLowerCase();
      const c = (i.category || '').toLowerCase();
      return t.includes(searchQuery) || a.includes(searchQuery) || d.includes(searchQuery) || v.includes(searchQuery) || c.includes(searchQuery);
    });
  }

  // Sort by newest first
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  renderGrid(filtered);
}

function renderGrid(items) {
  const grid = document.getElementById('items-grid');
  const emptyState = document.getElementById('empty-state');
  const emptyDesc = document.getElementById('empty-desc');

  if (!grid || !emptyState) return;

  grid.innerHTML = '';

  if (items.length === 0) {
    grid.style.display = 'none';
    emptyState.style.display = 'flex';

    if (currentTab === 'my-posts') {
      emptyDesc.textContent = 'Aún no has publicado ningún Modpack ni Autoexec. ¡Usa el botón "+ Publicar Creación" para compartir el primero!';
    } else if (searchQuery || currentFilter !== 'all') {
      emptyDesc.textContent = 'No se encontraron publicaciones que coincidan con los filtros de búsqueda aplicados.';
    } else {
      emptyDesc.textContent = currentTab === 'modpacks'
        ? 'Aún no hay Modpacks publicados. ¡Inicia sesión con Steam y sé el primero en subir un archivo .dcepack!'
        : 'Aún no hay Autoexecs publicados. ¡Inicia sesión con Steam y sé el primero en subir tu archivo .cfg!';
    }
    return;
  }

  grid.style.display = 'grid';
  emptyState.style.display = 'none';

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'community-card';

    const isMyPost = (currentTab === 'my-posts');
    const isModpack = item.type === 'modpack';
    const typeLabel = isModpack ? '.DCEPACK' : '.CFG';
    const typeClass = isModpack ? 'badge-flame' : 'badge-green';

    const dateStr = new Date(item.createdAt).toLocaleDateString('es-ES', {
      year: 'numeric', month: 'short', day: 'numeric'
    });

    card.innerHTML = `
      <div class="community-card-header">
        <div class="comm-badge-row">
          <span class="badge ${typeClass}">${typeLabel}</span>
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
        if (confirm(`¿Estás seguro de eliminar "${item.title}" de tus publicaciones?`)) {
          await dbDeletePublication(item.id);
          showCommToast('Publicación eliminada con éxito.', 'ok');
          await refreshView();
        }
      });
    }

    grid.appendChild(card);
  });
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
