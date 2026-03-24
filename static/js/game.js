/* ══════════════════════════════════════════════════════════════
   EGIPTO ESCAPE — Client-side Game Logic
══════════════════════════════════════════════════════════════ */

'use strict';

// ─── State ────────────────────────────────────────────────────
let gameState = null;
let timerInterval = null;
let localTimeRemaining = 0;
let selectedHiero = [];          
let currentEnigma = 0;           
let placedPieces = {};           

let currentAnubisPlacements = [null, null, null];
let lockCylinders = [0, 0, 0];
let selectedCraftItem = null;
let guardianInterval = null;
let guardianActive = false;
let guardianTimeout = null;
let guardianStartTimeout = null;

// ─── Web Audio API SFX ──────────────────────────────────────────
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function playSFX(type) {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  if (type === 'click') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.start(); osc.stop(audioCtx.currentTime + 0.1);
  } else if (type === 'stone') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(100, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
    osc.start(); osc.stop(audioCtx.currentTime + 0.4);
  } else if (type === 'success') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, audioCtx.currentTime);
    osc.frequency.setValueAtTime(554, audioCtx.currentTime + 0.1);
    osc.frequency.setValueAtTime(659, audioCtx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
    osc.start(); osc.stop(audioCtx.currentTime + 0.6);
  }
}

// ─── API helper ───────────────────────────────────────────────
async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  return res.json();
}

// ─── Audio Helper ─────────────────────────────────────────────
function playMusic() {
  const bgMusic = document.getElementById('bg-music');
  const btnToggle = document.getElementById('btn-music-toggle');
  if (!bgMusic) return;
  bgMusic.volume = document.getElementById('music-volume').value;
  bgMusic.play().then(() => {
    btnToggle.innerHTML = '⏸ Pausar Música';
  }).catch(e => console.log('Autoplay prevent by browser:', e));
}

// ─── Toast notifications ──────────────────────────────────────
function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const div = document.createElement('div');
  div.className = `toast ${type}`;
  div.textContent = msg;
  container.appendChild(div);
  setTimeout(() => div.remove(), 3800);
}

// ═══════════════════════════════════════════════════════════════
//  GAME FLOW
// ═══════════════════════════════════════════════════════════════

async function login() {
  playSFX('click');
  const input = document.getElementById('login-username');
  const username = input.value.trim();
  if (!username) { toast('Por favor, escribe tu nombre.', 'warning'); return; }

  const data = await api('POST', '/api/login', { username });
  if (data.error) { toast(data.error, 'error'); return; }

  // Transition to start screen
  document.getElementById('screen-login').hidden = true;
  document.getElementById('screen-start').hidden = false;
  document.getElementById('welcome-message').textContent = `Bienvenido, Viajero ${data.username}`;
  
  const achEl = document.getElementById('achievements-display');
  if (achEl) {
    if (data.achievements && data.achievements.length > 0) {
      const map = {
        'perfeccionista': '🏅 Perfeccionista',
        'speedrunner': '🏅 Speedrunner',
        'lector': '🏅 Lector'
      };
      const badges = data.achievements.map(a => `<span class="badge" style="background:rgba(201,162,39,0.2); border:1px solid var(--gold); padding:0.2rem 0.5rem; border-radius:4px; margin:0.2rem; display:inline-block; font-size:0.85rem; color:var(--gold-light);">${map[a] || a}</span>`).join('');
      achEl.innerHTML = `<strong>🏆 Tus Logros Obtenidos</strong><br>${badges}`;
    } else {
      achEl.innerHTML = '<span style="color:var(--muted); font-size:0.85rem;">Aún no has desbloqueado ningún logro.</span>';
    }
  }

  const btnResume = document.getElementById('btn-resume');
  if (data.has_active_game) {
    btnResume.style.display = 'inline-flex';
    toast('⛺ Tienes una exploración en curso...', 'info');
  } else {
    btnResume.style.display = 'none';
  }
}

async function resumeGame() {
  playSFX('click');
  const data = await api('POST', '/api/resume');
  if (!data.success) { toast(data.error || 'Error al restaurar', 'error'); return; }
  
  gameState = data.state;
  localTimeRemaining = gameState.time_remaining;
  placedPieces = {};

  document.getElementById('screen-start').hidden = true;
  document.getElementById('screen-game').hidden  = false;

  startTimer();
  renderAll();
  playMusic();
  startGuardianSystem();
  toast('⚓ De vuelta a la pirámide...', 'success');
}

async function startGame() {
  playSFX('click');
  const diff = document.getElementById('login-difficulty').value;
  const data = await api('POST', '/api/start', { difficulty: diff });
  if (!data.success) { toast('Error al iniciar partida', 'error'); return; }
  gameState = data.state;
  localTimeRemaining = gameState.time_remaining;
  placedPieces = {};

  document.getElementById('screen-start').hidden = true;
  document.getElementById('screen-login').hidden = true;
  document.getElementById('screen-game').hidden  = false;
  document.getElementById('screen-victory').hidden  = true;
  document.getElementById('screen-gameover').hidden = true;

  startTimer();
  renderAll();
  playMusic();
  startGuardianSystem();
  toast('⚓ La pirámide se cierra detrás de ti... ¡Escapa!');
}

function checkEndConditions() {
  if (!gameState) return;
  if (gameState.game_won) { showVictory(); return; }
  if (gameState.game_over || gameState.time_remaining <= 0) { showGameOver(); }
}

function showVictory() {
  playSFX('success');
  clearInterval(timerInterval);
  stopGuardianSystem();
  closeAllModals();
  document.getElementById('screen-game').hidden    = true;
  document.getElementById('screen-gameover').hidden = true;
  document.getElementById('screen-victory').hidden  = false;
  document.getElementById('secret-text-display').textContent =
    gameState.secret_text || '¡Has escapado de la pirámide!';
}

function showGameOver() {
  playSFX('stone');
  clearInterval(timerInterval);
  stopGuardianSystem();
  closeAllModals();
  document.getElementById('screen-game').hidden    = true;
  document.getElementById('screen-victory').hidden  = true;
  document.getElementById('screen-gameover').hidden = false;
}

function restartGame() {
  playSFX('click');
  clearInterval(timerInterval);
  stopGuardianSystem();
  gameState = null; selectedHiero = []; placedPieces = {};
  document.getElementById('screen-victory').hidden  = true;
  document.getElementById('screen-gameover').hidden = true;
  document.getElementById('screen-game').hidden     = true;
  document.getElementById('screen-start').hidden    = true;
  document.getElementById('screen-login').hidden    = false;
  document.getElementById('login-username').value   = '';
  fetchLeaderboard(); // refresh leaderboard
}

// ─── Timer ───────────────────────────────────────────────────
function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    localTimeRemaining = Math.max(0, localTimeRemaining - 1);
    renderTimer();
    if (localTimeRemaining <= 0) {
      clearInterval(timerInterval);
      showGameOver();
    }
  }, 1000);
  renderTimer();
}

function renderTimer() {
  const el  = document.getElementById('timer');
  const m   = Math.floor(localTimeRemaining / 60);
  const s   = Math.floor(localTimeRemaining % 60);
  el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  el.className = localTimeRemaining <= 30 ? 'danger'
               : localTimeRemaining <= 60 ? 'warning' : '';
}

// ═══════════════════════════════════════════════════════════════
//  ROOM ACTIONS
// ═══════════════════════════════════════════════════════════════

async function moveToRoom(room) {
  playSFX('stone');
  const data = await api('POST', '/api/move', { room });
  if (data.error) { toast(data.error, 'error'); return; }
  gameState = data.state;
  if (guardianActive && room === 1) {
    guardianActive = false;
    clearTimeout(guardianTimeout);
    toast('Estás a salvo... el Guardián ha pasado de largo.', 'success');
  }
  renderAll();
}

async function pickupItem(item, opts = null) {
  playSFX('click');
  const endpoint = item === 'weight' ? '/api/pickup_weight' : '/api/pickup';
  const body = item === 'weight' ? { weight_id: opts } : { item };
  const data = await api('POST', endpoint, body);
  
  if (data.error) { toast(data.error, 'error'); return; }
  gameState = data.state;
  toast(data.message, 'success');
  renderAll();
}

async function readNote(room) {
  playSFX('click');
  const data = await api('POST', '/api/read_note', { room });
  if (data.success) { gameState = data.state; renderAll(); }
  const msgs = {
    1: "La puerta se selló a mi espalda. No veo cómo volver. El aire está pesado.",
    2: "Los dioses dejaron pergaminos. Alguien los partió intentando descifrarlos... o algo peor.",
    3: "He encontrado las salas profundas. La estatua de Anubis aguarda. Exige pesado tributo.",
    4: "¡Es inútil! La verdad es ligera como una pluma, el motor humano es carne, pero el materialismo ciega más.",
    5: "La tumba real. Rebosa riqueza, pero no me servirá de nada si perezco en la oscuridad eternamente.",
  };
  document.getElementById('diary-text').textContent = msgs[room];
  openModal('modal-diary');
}

async function triggerHint() {
  playSFX('click');
  const data = await api('POST', '/api/hint');
  if (data.error) { toast(data.error, 'error'); return; }
  // Overwrite state: new time deduction
  gameState = data.state;
  localTimeRemaining = gameState.time_remaining;
  
  toast(data.message, 'warning');
  playSFX('success');
  renderAll();
}

// ═══════════════════════════════════════════════════════════════
//  HIEROGLYPH INPUT
// ═══════════════════════════════════════════════════════════════

function openHieroPanel(enigma) {
  if (!gameState.has_dictionary) {
    toast('⚠️ Necesitas el diccionario para leer.', 'error'); return;
  }
  currentEnigma = enigma;
  selectedHiero = [];
  renderHieroPanel();
  openModal('modal-hiero');
}

function clickHiero(index) {
  playSFX('click');
  if (selectedHiero.length >= 3) return;
  selectedHiero.push(index);
  const btn = document.querySelector(`.hiero-btn[data-index="${index}"]`);
  if (btn) { btn.classList.add('selected-glow'); setTimeout(() => btn.classList.remove('selected-glow'), 400); }
  renderHieroSlots();
}

function clearHiero() {
  playSFX('click');
  selectedHiero = [];
  renderHieroSlots();
}

async function submitHiero() {
  if (selectedHiero.length !== 3) {
    toast('Selecciona exactamente 3 jeroglíficos.', 'error'); return;
  }
  const data = await api('POST', '/api/solve', { enigma: currentEnigma, code: selectedHiero });
  closeModal('modal-hiero');
  if (data.error) { toast(data.error, 'error'); return; }
  if (data.success) {
    playSFX('success');
    gameState = data.state;
    toast(data.message, 'success');
    checkEndConditions();
    renderAll();
  } else {
    playSFX('stone');
    gameState = data.state; // update errors
    toast(data.message, 'error');
    if (gameState.error_count > 0 && gameState.error_count % 3 === 0) {
      triggerSandTrap();
    }
  }
}

function renderHieroPanel() {
  renderHieroSlots();
  const grid = document.getElementById('hiero-grid');
  grid.innerHTML = '';
  gameState.hieroglyphs.forEach((glyph, i) => {
    const btn = document.createElement('button');
    btn.className = 'hiero-btn';
    btn.dataset.index = i;
    btn.innerHTML = `<span class="hiero-char">${glyph}</span><span class="hiero-name">${gameState.hieroglyph_names[i]}</span>`;
    btn.addEventListener('click', () => clickHiero(i));
    grid.appendChild(btn);
  });
  const title = document.getElementById('hiero-modal-title');
  title.textContent = currentEnigma === 1
    ? '🧩 Enigma 1 — Introducir Combinación'
    : '🧩 Enigma 2 — Introducir Combinación';
}

function renderHieroSlots() {
  const hieroGlyphs = gameState ? gameState.hieroglyphs : [];
  [0,1,2].forEach(i => {
    const slot = document.getElementById(`hiero-slot-${i}`);
    if (!slot) return;
    if (selectedHiero[i] !== undefined) {
      slot.textContent  = hieroGlyphs[selectedHiero[i]] || '?';
      slot.classList.add('filled');
    } else {
      slot.textContent = '';
      slot.classList.remove('filled');
    }
  });
}

// ═══════════════════════════════════════════════════════════════
//  DICTIONARY & PAPIROS MODAL
// ═══════════════════════════════════════════════════════════════

function openDictionary() {
  if (!gameState.has_dictionary) { toast('⚠️ No tienes el diccionario.', 'error'); return; }
  openModal('modal-dictionary');
}

function openPapiro(which) {
  if (which === 1 && !gameState.has_papiro1) return;
  if (which === 2 && !gameState.has_papiro2) return;

  const hasDic = gameState.has_dictionary;
  const modal  = document.getElementById(`modal-papiro${which}`);
  const contentEl = modal.querySelector('.papiro-content');
  const hintEl    = modal.querySelector('.papiro-hint');
  const glyphsEl  = modal.querySelector('.papiro-glyphs');

  if (which === 1) {
    contentEl.querySelector('.papiro-text').innerHTML =
      `<strong>Papiro de Ra</strong><br>
       Los dioses te hablan a través de símbolos...<br>`;
    if (hasDic && gameState.enigma1_hint) {
      hintEl.innerHTML = `💡 Con el diccionario descifras: la combinación es<br><strong>${gameState.enigma1_hint.join(' → ')}</strong>`;
      hintEl.hidden = false;
      if (gameState.papiro1_code_indices) {
        glyphsEl.innerHTML = gameState.papiro1_code_indices.map(idx => `<div class="papiro-glyph"><span class="glyph-char">${gameState.hieroglyphs[idx]}</span><span class="glyph-name">${gameState.hieroglyph_names[idx]}</span></div>`).join('');
        glyphsEl.hidden = false;
      }
    } else {
      hintEl.hidden = true;
      glyphsEl.hidden = true;
      hintEl.textContent = '⚠️ Necesitas el diccionario para descifrar este papiro.';
      if (!hasDic) hintEl.hidden = false;
    }
  } else {
    contentEl.querySelector('.papiro-text').innerHTML = `<strong>Papiro de Osiris</strong><br>Introduce los jeroglíficos tal como aparecen.`;
    if (gameState.papiro2_code_indices) {
      glyphsEl.innerHTML = gameState.papiro2_code_indices.map(idx => `<div class="papiro-glyph"><span class="glyph-char">${gameState.hieroglyphs[idx]}</span><span class="glyph-name">${gameState.hieroglyph_names[idx]}</span></div>`).join('');
      glyphsEl.hidden = false;
    }
    hintEl.hidden = true;
  }
  openModal(`modal-papiro${which}`);
}

// ═══════════════════════════════════════════════════════════════
//  ANUBIS PUZZLE (PIECE 3)
// ═══════════════════════════════════════════════════════════════

function openAnubis() {
  currentAnubisPlacements = [null, null, null];
  renderAnubisModal();
  openModal('modal-anubis');
}

function renderAnubisModal() {
  const coll = gameState.weights_collected || [];
  [1, 2, 3].forEach(idx => {
    const s = document.getElementById(`anubis-slot-${idx}`);
    s.textContent = currentAnubisPlacements[idx-1] ? getWeightIcon(currentAnubisPlacements[idx-1]) : '';
  });
  
  const inv = document.getElementById('anubis-inventory');
  inv.innerHTML = '';
  coll.forEach(w => {
    if (!currentAnubisPlacements.includes(w)) {
      const d = document.createElement('div');
      d.className = 'weight-item';
      d.textContent = getWeightIcon(w);
      d.onclick = () => placeAnubisWeight(w);
      inv.appendChild(d);
    }
  });
}

function placeAnubisWeight(w) {
  const eIdx = currentAnubisPlacements.indexOf(null);
  if (eIdx !== -1) {
    currentAnubisPlacements[eIdx] = w;
    playSFX('click');
    renderAnubisModal();
  }
}

function clickAnubisSlot(pos) {
  if (currentAnubisPlacements[pos-1] !== null) {
    currentAnubisPlacements[pos-1] = null;
    playSFX('click');
    renderAnubisModal();
  }
}

function resetAnubis() {
  playSFX('click');
  currentAnubisPlacements = [null, null, null];
  renderAnubisModal();
}

async function submitAnubis() {
  playSFX('click');
  if (currentAnubisPlacements.includes(null)) {
    toast('Coloca los 3 pesos primero.', 'warning'); return;
  }
  const data = await api('POST', '/api/solve_anubis', { order: currentAnubisPlacements });
  if (data.success) {
    playSFX('success');
    gameState = data.state;
    toast(data.message, 'success');
    closeModal('modal-anubis');
    checkEndConditions();
    renderAll();
  } else {
    playSFX('stone');
    gameState = data.state; // Refresh errors state
    toast(data.message, 'error');
  }
}

function getWeightIcon(wId) {
  if (wId === 1) return '🫀'; // corazon
  if (wId === 2) return '🪶'; // pluma
  if (wId === 3) return '🪙';  // oro
  return '?';
}

function getWeightName(wId) {
  if (wId === 1) return 'Corazón';
  if (wId === 2) return 'Pluma';
  if (wId === 3) return 'Oro';
  return '?';
}

// ═══════════════════════════════════════════════════════════════
//  FINAL PUZZLE MODAL
// ═══════════════════════════════════════════════════════════════

function openPuzzle() {
  const pieces = gameState.puzzle_pieces;
  if (pieces.length < 3) {
    toast('⚠️ Aún te faltan piezas del puzzle.', 'error'); return;
  }
  renderPuzzleBoard();
  openModal('modal-puzzle');
}

function renderPuzzleBoard() {
  [1,2,3].forEach(p => {
    const slot = document.getElementById(`puzzle-slot-${p}`);
    if (!slot) return;
    const hasPiece = gameState.puzzle_pieces.includes(p);
    const isPlaced = placedPieces[p];
    if (isPlaced) {
      slot.className = 'puzzle-slot placed';
      slot.textContent = PIECE_ICON[p];
    } else if (hasPiece) {
      slot.className = 'puzzle-slot available';
      slot.innerHTML = `<span style="font-size:0.75rem;">Haz clic<br>para colocar</span>`;
    } else {
      slot.className = 'puzzle-slot';
      slot.innerHTML = '?';
    }
  });
  const allPlaced = [1,2,3].every(p => placedPieces[p]);
  document.getElementById('btn-complete-puzzle').disabled = !allPlaced;
}

const PIECE_ICON = { 1: '𓂀', 2: '𓄿', 3: '𓅱' };

function clickPuzzleSlot(p) {
  if (!gameState.puzzle_pieces.includes(p) || placedPieces[p]) return;
  placedPieces[p] = true;
  playSFX('click');
  toast(`✨ Pieza ${p} colocada.`, 'success');
  renderPuzzleBoard();
}

async function completePuzzle() {
  playSFX('click');
  const data = await api('POST', '/api/complete_puzzle');
  if (data.error) { toast(data.error, 'error'); return; }
  closeModal('modal-puzzle');
  gameState = data.state;
  localTimeRemaining = gameState.time_remaining;
  showVictory();
}

// ═══════════════════════════════════════════════════════════════
//  RENDER ALL UI
// ═══════════════════════════════════════════════════════════════

function renderAll() {
  if (!gameState) return;
  renderRoom();
  renderSidebar();
  renderNavButtons();
  renderHeaderRoom();
  updateMap();
}

function updateMap() {
  [1,2,3,4,5,6,7].forEach(r => {
    const node = document.getElementById(`map-node-${r}`);
    if (node) node.classList.toggle('active-room', gameState.current_room === r);
  });
}

function renderHeaderRoom() {
  const names = ['', 'Sala 1 — Cámara de Entrada', 'Sala 2 — Pasillo de los Sirvientes', 'Sala 3 — Archivo de Papiros', 'Sala 4 — Santuario Oscuro', 'Sala 5 — Cámara de Ofrendas', 'Sala 6 — Armería Real', 'Sala 7 — Tumba del Faraón'];
  document.getElementById('header-room-label').textContent = names[gameState.current_room] || '';
}

// ─── Room scene ────────────────────────────────────────────────
function renderRoom() {
  const overlay = document.getElementById('darkness-overlay');
  
  if ((gameState.current_room >= 4) && !gameState.has_torch) {
    overlay.hidden = false;
  } else {
    overlay.hidden = true;
  }

  const bg = document.getElementById('room-bg-img');
  bg.src = `/static/img/room${gameState.current_room}.png`;

  const objContainer = document.getElementById('scene-objects');
  objContainer.innerHTML = '';

  if (gameState.current_room === 1) renderRoom1Objects(objContainer);
  if (gameState.current_room === 2) renderRoom2Objects(objContainer);
  if (gameState.current_room === 3) renderRoom3Objects(objContainer);
  if (gameState.current_room === 4) renderRoom4Objects(objContainer);
  if (gameState.current_room === 5) renderRoom5Objects(objContainer);
  if (gameState.current_room === 6) renderRoom6Objects(objContainer);
  if (gameState.current_room === 7) renderRoom7Objects(objContainer);

  const notesRead = gameState.notes_read || [];
  if (!notesRead.includes(gameState.current_room)) {
    const note = makeObject('📝', 'Diario Suelto', '75%', '5%', () => readNote(gameState.current_room));
    objContainer.appendChild(note);
  }

  if (!gameState.has_dictionary && gameState.pos_diccionario && gameState.pos_diccionario.room === gameState.current_room) {
    const dic = makeObject('📖', 'Diccionario de Jeroglíficos', gameState.pos_diccionario.x, gameState.pos_diccionario.y, () => pickupItem('dictionary'));
    objContainer.appendChild(dic);
  }
  if (!gameState.has_papiro1 && gameState.pos_papiro1 && gameState.pos_papiro1.room === gameState.current_room) {
    const pap1 = makeObject('📜', 'Papiro de Ra', gameState.pos_papiro1.x, gameState.pos_papiro1.y, () => pickupItem('papiro1'));
    objContainer.appendChild(pap1);
  }
  if (!gameState.has_papiro2 && gameState.pos_papiro2 && gameState.pos_papiro2.room === gameState.current_room) {
    const pap2 = makeObject('📜', 'Papiro de Osiris', gameState.pos_papiro2.x, gameState.pos_papiro2.y, () => pickupItem('papiro2'));
    objContainer.appendChild(pap2);
  }
  
  // Render Weights
  const collectedW = gameState.weights_collected || [];
  const localWeights = gameState.pos_weights || [];
  localWeights.forEach(w => {
    if (!collectedW.includes(w.id)) {
      const obj = makeObject(getWeightIcon(w.id), "Figura Pesada", w.x, w.y, () => pickupItem('weight', w.id));
      objContainer.appendChild(obj);
    }
  });
}

function makeObject(icon, label, x, y, onClick, extraClass = '') {
  const div = document.createElement('div');
  div.className = `scene-object${extraClass ? ' ' + extraClass : ''}`;
  div.style.left = x; div.style.bottom = y;
  div.innerHTML = `<span class="obj-icon ${extraClass}">${icon}</span>
                   <span class="scene-object-label">${label}</span>`;
  div.addEventListener('click', onClick);
  return div;
}

function renderRoom1Objects(container) {
  if (!gameState.has_palo) {
    const palo = makeObject('🪵', 'Palo Seco', '12%', '25%', () => pickupItem('palo'));
    container.appendChild(palo);
  }

  const nav = document.createElement('div');
  nav.className = 'scene-nav right'; nav.innerHTML = '›'; nav.title = 'Ir a Sala 2';
  nav.addEventListener('click', () => moveToRoom(2));
  container.appendChild(nav);

  const has3 = [1,2,3].every(p => gameState.puzzle_pieces.includes(p));
  if (has3 && !gameState.puzzle_completed) {
    const puz = makeObject('🗿', 'Altar del Puzzle', '50%', '20%', openPuzzle);
    puz.style.left = '45%';
    container.appendChild(puz);
  }
  
  if (gameState.enigma1_solved) addRoomMessage(container, '✅ Enigma 1 resuelto', '#27ae60', '2rem');
  if (gameState.enigma2_solved) addRoomMessage(container, '✅ Enigma 2 resuelto', '#27ae60', '4rem');
  if (gameState.anubis_solved) addRoomMessage(container, '✅ Balanza resuelta', '#27ae60', '6rem');
}

function renderRoom2Objects(container) {
  const navLeft = document.createElement('div');
  navLeft.className = 'scene-nav left'; navLeft.innerHTML = '‹'; navLeft.title = 'Ir a Sala 1';
  navLeft.addEventListener('click', () => moveToRoom(1));
  container.appendChild(navLeft);

  const navRight = document.createElement('div');
  navRight.className = 'scene-nav right'; navRight.innerHTML = '›'; navRight.title = 'Ir a Sala 3';
  navRight.addEventListener('click', () => moveToRoom(3));
  container.appendChild(navRight);

  if (gameState.has_papiro1 && gameState.has_dictionary && !gameState.enigma1_solved) {
    const solveBtn = makeObject('🔑', 'Resolver Enigma 1', '45%', '10%', () => { openHieroPanel(1); });
    container.appendChild(solveBtn);
  }

  if (!gameState.has_vendas) {
    const vendas = makeObject('🩹', 'Vendas Antiguas', '20%', '15%', () => pickupItem('vendas'));
    container.appendChild(vendas);
  }
}

function renderRoom3Objects(container) {
  const navLeft = document.createElement('div');
  navLeft.className = 'scene-nav left'; navLeft.innerHTML = '‹'; navLeft.title = 'Ir a Sala 2';
  navLeft.addEventListener('click', () => moveToRoom(2));
  container.appendChild(navLeft);

  const navRight = document.createElement('div');
  navRight.className = 'scene-nav right'; navRight.innerHTML = '›'; navRight.title = 'Ir a Sala 4';
  navRight.addEventListener('click', () => moveToRoom(4));
  container.appendChild(navRight);

  if (gameState.has_papiro2 && gameState.has_dictionary && !gameState.enigma2_solved) {
    const solveBtn = makeObject('🔑', 'Resolver Enigma 2', '70%', '22%', () => openHieroPanel(2));
    container.appendChild(solveBtn);
  }
}

function renderRoom4Objects(container) {
  const navLeft = document.createElement('div');
  navLeft.className = 'scene-nav left'; navLeft.innerHTML = '‹'; navLeft.title = 'Ir a Sala 3';
  navLeft.addEventListener('click', () => moveToRoom(3));
  container.appendChild(navLeft);

  const navRight = document.createElement('div');
  navRight.className = 'scene-nav right'; navRight.innerHTML = '›'; navRight.title = 'Ir a Sala 5';
  navRight.addEventListener('click', () => moveToRoom(5));
  container.appendChild(navRight);
  
  if (!gameState.anubis_solved) {
    const solveBtn = makeObject('⚖️', 'Balanza de Anubis', '50%', '30%', () => openAnubis());
    container.appendChild(solveBtn);
  }
}

function renderRoom5Objects(container) {
  const navLeft = document.createElement('div');
  navLeft.className = 'scene-nav left'; navLeft.innerHTML = '‹'; navLeft.title = 'Ir a Sala 4';
  navLeft.addEventListener('click', () => moveToRoom(4));
  container.appendChild(navLeft);

  const navRight = document.createElement('div');
  navRight.className = 'scene-nav right'; navRight.innerHTML = '›'; navRight.title = 'Ir a Sala 6';
  navRight.addEventListener('click', () => moveToRoom(6));
  container.appendChild(navRight);
}

function renderRoom6Objects(container) {
  const navLeft = document.createElement('div');
  navLeft.className = 'scene-nav left'; navLeft.innerHTML = '‹'; navLeft.title = 'Ir a Sala 5';
  navLeft.addEventListener('click', () => moveToRoom(5));
  container.appendChild(navLeft);

  const navRight = document.createElement('div');
  navRight.className = 'scene-nav right'; navRight.innerHTML = '›'; navRight.title = 'Ir a Sala 7';
  navRight.addEventListener('click', () => moveToRoom(7));
  container.appendChild(navRight);

  if (!gameState.has_secret_relic) {
    const chestBtn = makeObject('🔒', 'Cofre Sellado', '50%', '30%', () => openLockMinigame());
    container.appendChild(chestBtn);
  }
}

function renderRoom7Objects(container) {
  const navLeft = document.createElement('div');
  navLeft.className = 'scene-nav left'; navLeft.innerHTML = '‹'; navLeft.title = 'Ir a Sala 6';
  navLeft.addEventListener('click', () => moveToRoom(6));
  container.appendChild(navLeft);
}

function addRoomMessage(container, text, color, bottom = '0.5rem') {
  const div = document.createElement('div');
  div.style.cssText = `
    position:absolute; left:50%; transform:translateX(-50%);
    bottom:${bottom}; background:rgba(0,0,0,0.78);
    border:1px solid ${color}; border-radius:6px;
    padding:3px 12px; font-family:'Cinzel',serif;
    font-size:0.72rem; color:${color}; white-space:nowrap;`;
  div.textContent = text;
  container.appendChild(div);
}

// ─── Sidebar ────────────────────────────────────────────────────
function renderSidebar() {
  renderButtonStatus();
  renderInventory();
}

function renderButtonStatus() {
  [1,2,3].forEach(i => {
    const el = document.getElementById(`btn-ind-${i}`);
    if (!el) return;
    el.classList.toggle('active', gameState.buttons_activated.includes(i));
  });
}

function renderInventory() {
  const grid = document.getElementById('inventory-grid');
  grid.innerHTML = '';
  const items = [];

  if (gameState.has_dictionary) items.push({ icon: '📖', label: 'Diccionario', action: openDictionary });
  if (gameState.has_papiro1) items.push({ icon: '📜', label: 'Papiro Ra', action: () => openPapiro(1) });
  if (gameState.has_papiro2) items.push({ icon: '📜', label: 'Papiro Osiris', action: () => openPapiro(2) });
  if (gameState.has_torch) items.push({ icon: '🔥', label: 'Antorcha', action: null });
  if (gameState.has_palo) items.push({ id: 'palo', icon: '🪵', label: 'Palo Seco', action: () => clickCraftItem('palo') });
  if (gameState.has_vendas) items.push({ id: 'vendas', icon: '🩹', label: 'Vendas', action: () => clickCraftItem('vendas') });
  if (gameState.has_secret_relic) items.push({ icon: '🏺', label: 'Reliquia', action: () => inspectItem('🏺', 'Reliquia de Kha-Ra\n\nDesprende un aura oscura y milenaria. Has demostrado gran valía al encontrar el Secreto de la Vida.') });
  
  const collWeights = gameState.weights_collected || [];
  collWeights.forEach(w => items.push({ icon: getWeightIcon(w), label: getWeightName(w), action: null }));

  if (gameState.puzzle_pieces.includes(1)) items.push({ icon: '<span class="piece-icon">𓂀</span>', label: 'Pieza 1', raw: true });
  if (gameState.puzzle_pieces.includes(2)) items.push({ icon: '<span class="piece-icon">𓄿</span>', label: 'Pieza 2', raw: true });
  if (gameState.puzzle_pieces.includes(3)) items.push({ icon: '<span class="piece-icon">𓅱</span>', label: 'Pieza 3', raw: true });

  if ([1,2,3].every(p => gameState.puzzle_pieces.includes(p)) && !gameState.puzzle_completed) {
    items.push({ icon: '🗿', label: 'Puzzle Final', action: openPuzzle });
  }

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'inv-item';
    if (item.action) div.style.cursor = 'pointer';
    if (item.id && item.id === selectedCraftItem) div.style.boxShadow = '0 0 10px 2px var(--gold)'; // inline highlight
    
    if (item.raw) {
      div.innerHTML = `<span class="inv-icon">${item.icon}</span><span class="inv-label">${item.label}</span>`;
    } else {
      div.innerHTML = `<span class="inv-icon">${item.icon}</span><span class="inv-label">${item.label}</span>`;
    }
    if (item.action) div.addEventListener('click', () => { playSFX('click'); item.action(); });
    grid.appendChild(div);
  });
}

function renderNavButtons() {
  [1,2,3,4,5,6,7].forEach(i => {
    const btn = document.getElementById(`nav-btn-${i}`);
    if (!btn) return;
    btn.classList.toggle('current', gameState.current_room === i);
  });
}

function openModal(id) {
  playSFX('click');
  closeAllModals();
  const overlay = document.getElementById('modal-overlay');
  overlay.hidden = false;
  Array.from(overlay.children).forEach(el => { el.hidden = true; });
  const modal = document.getElementById(id);
  if (modal) modal.hidden = false;
}

function closeModal(id) {
  playSFX('click');
  const modal = document.getElementById(id);
  if (modal) modal.hidden = true;
  const overlay = document.getElementById('modal-overlay');
  const anyVisible = Array.from(overlay.children).some(el => !el.hidden);
  if (!anyVisible) overlay.hidden = true;
}

function closeAllModals() {
  const overlay = document.getElementById('modal-overlay');
  overlay.hidden = true;
  Array.from(overlay.children).forEach(el => { el.hidden = true; });
}

// ═══════════════════════════════════════════════════════════════
//  GUARDIAN & HAZARDS
// ═══════════════════════════════════════════════════════════════
function startGuardianSystem() {
  clearInterval(guardianInterval);
  clearTimeout(guardianStartTimeout);
  guardianActive = false;
  
  // Wait 3 minutes (180,000 ms) before starting the random patrol interval
  guardianStartTimeout = setTimeout(() => {
    guardianInterval = setInterval(() => {
      if (gameState && !gameState.game_won && !gameState.game_over) {
        triggerGuardian();
      }
    }, 45000 + Math.random() * 30000);
  }, 180000);
}

function stopGuardianSystem() {
  clearInterval(guardianInterval);
  clearTimeout(guardianTimeout);
  clearTimeout(guardianStartTimeout);
  guardianActive = false;
}

function triggerGuardian() {
  if (gameState.current_room === 1) return;
  playSFX('stone');
  document.body.classList.add('shake-screen');
  setTimeout(() => document.body.classList.remove('shake-screen'), 1000);
  toast('¡Un Guardián se acerca! ¡Escóndete en la Cámara de Entrada (Sala 1) rápido!', 'error');
  guardianActive = true;
  guardianTimeout = setTimeout(() => {
    if (guardianActive && gameState && gameState.current_room !== 1) {
       toast('El Guardián te ha encontrado...', 'error');
       localTimeRemaining = 0;
       showGameOver();
    }
    guardianActive = false;
  }, 12000);
}

function triggerSandTrap() {
  playSFX('stone');
  document.body.classList.add('shake-screen');
  setTimeout(() => document.body.classList.remove('shake-screen'), 800);
  localTimeRemaining -= 120;
  toast('¡Trampa activada! Has perdido 2 minutos.', 'error');
}

// ═══════════════════════════════════════════════════════════════
//  CRAFTING & INSPECT
// ═══════════════════════════════════════════════════════════════
async function clickCraftItem(id) {
  if (!selectedCraftItem) {
    selectedCraftItem = id;
    renderInventory();
    return;
  }
  if (selectedCraftItem !== id) {
    const data = await api('POST', '/api/craft', { item1: selectedCraftItem, item2: id });
    selectedCraftItem = null;
    if (data.success) {
      playSFX('success');
      gameState = data.state;
      toast(data.message, 'success');
      renderAll();
    } else {
      toast(data.error, 'error');
      renderInventory();
    }
  } else {
    selectedCraftItem = null;
    renderInventory();
  }
}

function inspectItem(icon, desc) {
  document.getElementById('inspect-icon').textContent = icon;
  document.getElementById('inspect-desc').textContent = desc;
  openModal('modal-inspect');
}

// ═══════════════════════════════════════════════════════════════
//  LOCK MINIGAME
// ═══════════════════════════════════════════════════════════════
function openLockMinigame() {
  lockCylinders = [0, 0, 0];
  renderLockCylinders();
  openModal('modal-minigame-lock');
}
function renderLockCylinders() {
  document.getElementById('cyl-val-0').textContent = lockCylinders[0];
  document.getElementById('cyl-val-1').textContent = lockCylinders[1];
  document.getElementById('cyl-val-2').textContent = lockCylinders[2];
}
function spinCylinder(col, dir) {
  playSFX('click');
  lockCylinders[col] = (lockCylinders[col] + dir + 10) % 10;
  renderLockCylinders();
}
async function submitLock() {
  const code = lockCylinders.join('-');
  const data = await api('POST', '/api/unlock_secret', { code });
  if (data.success) {
    playSFX('success');
    gameState = data.state;
    toast(data.message, 'success');
    closeModal('modal-minigame-lock');
    renderAll();
  } else {
    playSFX('stone');
    gameState = data.state;
    toast(data.error, 'error');
    if (gameState.error_count > 0 && gameState.error_count % 3 === 0) triggerSandTrap();
  }
}

// ═══════════════════════════════════════════════════════════════
//  BOOT Y LEADERBOARD
// ═══════════════════════════════════════════════════════════════

async function fetchLeaderboard() {
  const data = await api('GET', '/api/leaderboard');
  if (data.leaderboard || data.leaderboard_hard) {
    const tbody = document.querySelector('#leaderboard-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    let mixed = [];
    if (data.leaderboard_hard) mixed = mixed.concat(data.leaderboard_hard.map(x=>({...x, diff:'Modo Faraón'})));
    if (data.leaderboard) mixed = mixed.concat(data.leaderboard.map(x=>({...x, diff:'Normal'})));
    
    mixed.sort((a,b) => a.time_taken - b.time_taken);
    
    if (mixed.length === 0) {
      tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color:var(--muted); padding:1.5rem;">Aún no hay exploradores exitosos...<br><span style="font-size:0.75rem;">¡Sé el primero en escapar!</span></td></tr>';
      return;
    }
    mixed.slice(0, 10).forEach((entry, idx) => {
      const tr = document.createElement('tr');
      const timeStr = formatTimeRecord(entry.time_taken);
      const medal = idx === 0 ? '🥇 ' : idx === 1 ? '🥈 ' : idx === 2 ? '🥉 ' : '';
      tr.innerHTML = `<td>${medal}${entry.username} <span style="font-size:0.6rem; color: #777;">(${entry.diff})</span></td><td>${timeStr}</td>`;
      tbody.appendChild(tr);
    });
  }
}

function formatTimeRecord(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

document.addEventListener('DOMContentLoaded', () => {
  fetchLeaderboard();

  // Settings and Audio
  const btnSettings = document.getElementById('btn-settings');
  if (btnSettings) btnSettings.addEventListener('click', () => openModal('modal-settings'));
  
  const bgMusic = document.getElementById('bg-music');
  const btnToggle = document.getElementById('btn-music-toggle');
  const volumeSlider = document.getElementById('music-volume');
  if (bgMusic && btnToggle && volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
      bgMusic.volume = e.target.value;
    });
    btnToggle.addEventListener('click', () => {
      playSFX('click');
      if (bgMusic.paused) {
        bgMusic.play();
        btnToggle.innerHTML = '⏸ Pausar Música';
      } else {
        bgMusic.pause();
        btnToggle.innerHTML = '▶ Reproducir Música';
      }
    });
  }

  // Mega Expansion bindings
  const hintBtn = document.getElementById('btn-hint');
  if (hintBtn) hintBtn.addEventListener('click', triggerHint);
  
  const submitAnubisBtn = document.getElementById('btn-submit-anubis');
  if (submitAnubisBtn) submitAnubisBtn.addEventListener('click', submitAnubis);

  document.getElementById('btn-login').addEventListener('click', login);
  document.getElementById('login-username').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
  });

  document.getElementById('btn-resume').addEventListener('click', resumeGame);
  document.getElementById('btn-start').addEventListener('click', startGame);
  document.getElementById('btn-restart-victory').addEventListener('click', restartGame);
  document.getElementById('btn-restart-gameover').addEventListener('click', restartGame);

  [1,2,3,4,5,6,7].forEach(i => {
    const btn = document.getElementById(`nav-btn-${i}`);
    if (btn) btn.addEventListener('click', () => moveToRoom(i));
  });

  document.getElementById('btn-hiero-clear').addEventListener('click', clearHiero);
  document.getElementById('btn-hiero-submit').addEventListener('click', submitHiero);

  document.getElementById('btn-complete-puzzle').addEventListener('click', completePuzzle);

  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAllModals();
  });
});
