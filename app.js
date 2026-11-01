/**
 * NTE Ranker - Core Application Logic
 * Integración con Google Sheets Web App API (Global Sync) + Sistema Elo Base 1000 + Conversor de Drive + Sliders + Rankings & Ship Summary
 */

const GOOGLE_SHEETS_API_URL = "https://script.google.com/macros/s/AKfycbzoIbivf7hCOTGelu7Pg3qR0rrgz2ShcngiEJKxcYpvOQEmpzmM9T3PxfxZ08Hgkxn6/exec";
const STORAGE_ROSTER_KEY = "nte_roster_data_v2";

let roster = [];
let tiersConfig = [];
let newsData = [];
let aboutData = { texts: {}, faq: [] };
let currentLang = 'es';
let tierViewMode = 'all';

let currentPair = [null, null];
let nextPair = [null, null];

let currentRankingFilter = 'ships'; // 'ships' (uno por personaje) o 'skins' (todos)

document.addEventListener("DOMContentLoaded", () => {
    loadLocalData();
    initNavigation();
    initVotingEvents();
    initSizeSliders();
    initLanguageSelector();
    initFilters();
    initRankingsEvents();
    checkAndRecordVisit();
    fetchGoogleSheetsData();
});

function loadLocalData() {
    const saved = localStorage.getItem(STORAGE_ROSTER_KEY);
    if (saved) {
        try { roster = JSON.parse(saved); } catch (e) { console.error("Error cargando datos locales:", e); }
    }
}

function saveLocalData() {
    localStorage.setItem(STORAGE_ROSTER_KEY, JSON.stringify(roster));
}

function sanitizeDriveUrl(url) {
    if (!url) return '';
    if (typeof url !== 'string') return '';
    if (url.includes('drive.google.com/file/d/')) {
        const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) return `https://lh3.googleusercontent.com/d/${match[1]}`;
    }
    return url;
}

function checkAndRecordVisit() {
    const HAS_VISITED_KEY = "nte_user_visited_v1";
    
    if (!localStorage.getItem(HAS_VISITED_KEY)) {
        fetch(GOOGLE_SHEETS_API_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: "record_visit" })
        })
        .then(() => {
            localStorage.setItem(HAS_VISITED_KEY, "true");
        })
        .catch(err => console.error("Error registrando visita:", err));
    }
}

async function fetchGoogleSheetsData() {
    try {
        const response = await fetch(GOOGLE_SHEETS_API_URL);
        const data = await response.json();
        
        if (data.vote && data.vote.length > 0) {
            const localMap = {};
            roster.forEach(item => { localMap[item.id_skin_personaje] = { rating: item.rating, matches: item.matches }; });

            roster = data.vote.map(row => ({
                id_skin_personaje: row.id_skin_personaje,
                nombrepersonaje: row.nombrepersonaje,
                nombreskin: row.nombreskin,
                nombreskin_en: row.nombreskin_en || row.nombreskin,
                imagenskin: sanitizeDriveUrl(row.imagenskin),
                imagenskin_thumb: sanitizeDriveUrl(row.imagenshortskin || row.imagenskin_thumb || row.imagenskin),
                fecha_lanzamiento: row.fecha_lanzamiento || '',
                rating: row.rating !== undefined && row.rating !== "" ? Number(row.rating) : (localMap[row.id_skin_personaje] ? localMap[row.id_skin_personaje].rating : 1000),
                matches: row.matches !== undefined && row.matches !== "" ? Number(row.matches) : (localMap[row.id_skin_personaje] ? localMap[row.id_skin_personaje].matches : 0)
            }));
        }

        if (data.tiers && data.tiers.length > 0) tiersConfig = data.tiers;
        if (data.news && data.news.length > 0) newsData = data.news;
        if (data.about && data.about.length > 0) processAboutData(data.about);

        saveLocalData();
        renderNews();
        renderAboutDynamic();
        getNewPair();

        if (document.getElementById('view-tiers')?.classList.contains('active')) renderTiers();
        if (document.getElementById('view-latest')?.classList.contains('active')) renderLatest();
        if (document.getElementById('view-rankings')?.classList.contains('active')) renderRankingsTable(currentRankingFilter);
    } catch (err) {
        console.error("Error conectando con Google Sheets:", err);
        renderNews();
        renderAboutDynamic();
        getNewPair();
    }
}

function initLanguageSelector() {
    const langSelect = document.getElementById('lang-select');
    if (langSelect) {
        langSelect.addEventListener('change', (e) => {
            currentLang = e.target.value;
            getNewPair();
            if (document.getElementById('view-tiers')?.classList.contains('active')) renderTiers();
            if (document.getElementById('view-latest')?.classList.contains('active')) renderLatest();
            if (document.getElementById('view-rankings')?.classList.contains('active')) renderRankingsTable(currentRankingFilter);
        });
    }
}

function processAboutData(aboutRows) {
    aboutData.texts = {};
    aboutData.faq = [];
    aboutRows.forEach(row => {
        if (row.about_clave && row.about_texto) aboutData.texts[row.about_clave] = row.about_texto;
        if (row.about_pregunta && row.about_respuesta) {
            aboutData.faq.push({ pregunta: row.about_pregunta, respuesta: row.about_respuesta });
        }
    });
}

function initNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabViews = document.querySelectorAll('.tab-view');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            if (!targetTab) return;

            navButtons.forEach(b => b.classList.remove('active'));
            tabViews.forEach(v => v.classList.remove('active'));

            btn.classList.add('active');
            const targetView = document.getElementById(`view-${targetTab}`);
            if (targetView) targetView.classList.add('active');

            if (targetTab === 'tiers') renderTiers();
            if (targetTab === 'latest') renderLatest();
            if (targetTab === 'news') renderNews();
            if (targetTab === 'rankings') showRankingsList();
        });
    });

    document.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const filterType = item.getAttribute('data-ranking-filter');
            const rankingsBtn = document.querySelector('[data-tab="rankings"]');
            
            navButtons.forEach(b => b.classList.remove('active'));
            tabViews.forEach(v => v.classList.remove('active'));

            if (rankingsBtn) rankingsBtn.classList.add('active');
            const rankingsView = document.getElementById('view-rankings');
            if (rankingsView) rankingsView.classList.add('active');

            renderRankingsTable(filterType);
        });
    });

    document.querySelectorAll('.link-tab-jump').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-target');
            const targetBtn = document.querySelector(`[data-tab="${target}"]`);
            if (targetBtn) targetBtn.click();
        });
    });
}

function initSizeSliders() {
    const tierSlider = document.getElementById('tier-size-slider');
    const tierVal = document.getElementById('slider-val');
    const tierContainer = document.getElementById('tier-blocks-container');

    if (tierSlider) {
        tierSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            if (tierVal) tierVal.textContent = `${val}x`;
            if (tierContainer) tierContainer.style.setProperty('--card-scale', val);
        });
    }

    const latestSlider = document.getElementById('latest-size-slider');
    const latestVal = document.getElementById('latest-slider-val');
    const latestContainer = document.getElementById('latest-groups-container');

    if (latestSlider) {
        latestSlider.addEventListener('input', (e) => {
            const val = e.target.value;
            if (latestVal) latestVal.textContent = `${val}x`;
            if (latestContainer) latestContainer.style.setProperty('--card-scale', val);
        });
    }
}

function initFilters() {
    const searchTier = document.getElementById('tier-search');
    if (searchTier) searchTier.addEventListener('input', renderTiers);

    const searchLatest = document.getElementById('latest-search');
    if (searchLatest) searchLatest.addEventListener('input', renderLatest);

    const toggleBtns = document.querySelectorAll('.toggle-btn');
    if (toggleBtns.length >= 2) {
        toggleBtns[0].classList.remove('active');
        toggleBtns[1].classList.add('active');

        toggleBtns[0].addEventListener('click', () => {
            toggleBtns[0].classList.add('active');
            toggleBtns[1].classList.remove('active');
            tierViewMode = 'unique';
            renderTiers();
        });
        toggleBtns[1].addEventListener('click', () => {
            toggleBtns[1].classList.add('active');
            toggleBtns[0].classList.remove('active');
            tierViewMode = 'all';
            renderTiers();
        });
    }
}

function calculateElo(winnerRating, loserRating) {
    const K = 32;
    const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
    const expectedLoser = 1 / (1 + Math.pow(10, (winnerRating - loserRating) / 400));

    return {
        newWinnerRating: Math.round(winnerRating + K * (1 - expectedWinner)),
        newLoserRating: Math.round(loserRating + K * (0 - expectedLoser))
    };
}

function preloadImage(url) {
    if (!url) return;
    const img = new Image();
    img.src = url;
}

function getNewPair() {
    if (roster.length < 2) {
        // Limpiamos los src si aún no hay datos para evitar imágenes rotas
        const imgLeft = document.getElementById('img-left');
        const imgRight = document.getElementById('img-right');
        if (imgLeft) imgLeft.removeAttribute('src');
        if (imgRight) imgRight.removeAttribute('src');
        return;
    }

    if (nextPair[0] && nextPair[1]) {
        currentPair = [...nextPair];
    } else {
        let idx1 = Math.floor(Math.random() * roster.length);
        let idx2;
        do { idx2 = Math.floor(Math.random() * roster.length); } while (idx1 === idx2);
        currentPair = [roster[idx1], roster[idx2]];
    }
    
    const skinName0 = currentLang === 'us' ? currentPair[0].nombreskin_en : currentPair[0].nombreskin;
    const skinName1 = currentLang === 'us' ? currentPair[1].nombreskin_en : currentPair[1].nombreskin;

    document.getElementById('name-left').textContent = `${currentPair[0].nombrepersonaje} — ${skinName0}`;
    const imgLeft = document.getElementById('img-left');
    if (currentPair[0].imagenskin) {
        imgLeft.src = currentPair[0].imagenskin;
    } else {
        imgLeft.removeAttribute('src');
    }
    
    document.getElementById('name-right').textContent = `${currentPair[1].nombrepersonaje} — ${skinName1}`;
    const imgRight = document.getElementById('img-right');
    if (currentPair[1].imagenskin) {
        imgRight.src = currentPair[1].imagenskin;
    } else {
        imgRight.removeAttribute('src');
    }

    let nIdx1 = Math.floor(Math.random() * roster.length);
    let nIdx2;
    do { nIdx2 = Math.floor(Math.random() * roster.length); } while (nIdx1 === nIdx2);

    nextPair = [roster[nIdx1], roster[nIdx2]];
    preloadImage(nextPair[0].imagenskin);
    preloadImage(nextPair[1].imagenskin);
}

async function syncVoteGlobal(winner, loser) {
    try {
        const payload = {
            winner: { id: winner.id_skin_personaje, newRating: winner.rating, newMatches: winner.matches },
            loser: { id: loser.id_skin_personaje, newRating: loser.rating, newMatches: loser.matches }
        };

        fetch(GOOGLE_SHEETS_API_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(err => console.error("Error en sincronización global de voto:", err));
    } catch (e) {
        console.error("Error preparando el payload global:", e);
    }
}

function handleVote(winnerIdx) {
    const winner = currentPair[winnerIdx];
    const loser = currentPair[winnerIdx === 0 ? 1 : 0];

    const { newWinnerRating, newLoserRating } = calculateElo(winner.rating, loser.rating);
    winner.rating = newWinnerRating;
    winner.matches++;
    loser.rating = newLoserRating;
    loser.matches++;

    saveLocalData();
    syncVoteGlobal(winner, loser);
    getNewPair();
}

function initVotingEvents() {
    const cardLeft = document.getElementById('card-left');
    const cardRight = document.getElementById('card-right');
    const btnNewPair = document.getElementById('btn-new-pair');

    if (cardLeft) cardLeft.addEventListener('click', () => handleVote(0));
    if (cardRight) cardRight.addEventListener('click', () => handleVote(1));
    if (btnNewPair) btnNewPair.addEventListener('click', getNewPair);

    window.addEventListener('keydown', (e) => {
        const voteView = document.getElementById('view-vote');
        if (!voteView || !voteView.classList.contains('active')) return;
        if (e.key === 'ArrowLeft') handleVote(0);
        if (e.key === 'ArrowRight') handleVote(1);
        if (e.key === 'r' || e.key === 'R') getNewPair();
    });
}

/* --- SECCIÓN RANKINGS Y SHIP SUMMARY --- */
function initRankingsEvents() {
    const searchInput = document.getElementById('rankings-search');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderRankingsTable(currentRankingFilter);
        });
    }

    const btnBack = document.getElementById('btn-back-to-rankings');
    if (btnBack) {
        btnBack.addEventListener('click', () => {
            showRankingsList();
        });
    }
}

function showRankingsList() {
    document.getElementById('rankings-list-view').style.display = 'block';
    document.getElementById('rankings-summary-view').style.display = 'none';
    renderRankingsTable(currentRankingFilter);
}

function renderRankingsTable(filterType = 'ships') {
    currentRankingFilter = filterType;
    const container = document.getElementById('rankings-table-container');
    const titleEl = document.getElementById('rankings-title');
    const descEl = document.getElementById('rankings-desc');
    const searchVal = document.getElementById('rankings-search')?.value.toLowerCase().trim() || '';
    
    if (!container) return;
    container.innerHTML = '';

    let listToRender = [...roster];

    if (filterType === 'ships') {
        if (titleEl) titleEl.textContent = "Top personajes";
        if (descEl) descEl.textContent = "Cada personaje aparece una vez, usando el skin donde rankea más alto. Actualizado cada ~10 minutos.";
        
        const bestMap = {};
        listToRender.forEach(item => {
            if (!bestMap[item.nombrepersonaje] || item.rating > bestMap[item.nombrepersonaje].rating) {
                bestMap[item.nombrepersonaje] = item;
            }
        });
        listToRender = Object.values(bestMap);
    } else {
        if (titleEl) titleEl.textContent = "Top skins";
        if (descEl) descEl.textContent = "Lista completa de todas las variantes de skins ordenadas por rating Elo.";
    }

    if (searchVal) {
        listToRender = listToRender.filter(item => 
            item.nombrepersonaje.toLowerCase().includes(searchVal) || 
            item.nombreskin.toLowerCase().includes(searchVal) ||
            item.nombreskin_en.toLowerCase().includes(searchVal)
        );
    }

    listToRender.sort((a, b) => b.rating - a.rating);

    if (listToRender.length === 0) {
        container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem; padding: 12px;">No se encontraron resultados.</p>`;
        return;
    }

    container.innerHTML = listToRender.map((item, index) => {
        const skinName = currentLang === 'us' ? (item.nombreskin_en || item.nombreskin) : item.nombreskin;
        const matches = item.matches || 0;
        const wins = Math.round(matches * (item.rating / (item.rating + 1000))) || Math.floor(matches / 2);
        const releaseYearMonth = item.fecha_lanzamiento ? item.fecha_lanzamiento.substring(0, 7).replace('-', '/') : '2026/10';

        return `
            <div class="ranking-row-card">
                <div class="ranking-row-left">
                    <span class="ranking-pos">#${index + 1}</span>
                    <img src="${item.imagenskin_thumb || item.imagenskin}" alt="${item.nombrepersonaje}" class="ranking-thumb">
                    <div class="ranking-details">
                        <h3>${item.nombrepersonaje}</h3>
                        <div class="ranking-biggest">Popular: ${skinName}</div>
                        <div class="ranking-stats-inline">
                            <span>Puntuación: <strong>${item.rating}</strong></span>
                            <span>Enfrentamientos: <strong>${matches}</strong></span>
                            <span>Victorias: <strong>${wins}</strong></span>
                            <span>${releaseYearMonth}</span>
                        </div>
                    </div>
                </div>
                <div class="ranking-row-right">
                    <button class="btn-ship-summary" onclick="openShipSummary('${item.nombrepersonaje}')">Resumen</button>
                </div>
            </div>
        `;
    }).join('');
}

function openShipSummary(characterName) {
    const listView = document.getElementById('rankings-list-view');
    const summaryView = document.getElementById('rankings-summary-view');
    
    if (!listView || !summaryView) return;

    const charSkins = roster.filter(i => i.nombrepersonaje === characterName);
    if (charSkins.length === 0) return;

    charSkins.sort((a, b) => b.rating - a.rating);
    const bestSkin = charSkins[0];

    listView.style.display = 'none';
    summaryView.style.display = 'block';

    document.getElementById('summary-char-name').textContent = characterName;
    document.getElementById('summary-char-img').src = bestSkin.imagenskin;

    const totalSkins = charSkins.length;
    const bestRating = bestSkin.rating;
    const totalMatches = charSkins.reduce((acc, curr) => acc + (curr.matches || 0), 0);
    const totalWins = charSkins.reduce((acc, curr) => acc + Math.round((curr.matches || 0) * 0.5), 0);
    const totalLosses = Math.max(0, totalMatches - totalWins);

    document.getElementById('stat-skins-count').textContent = totalSkins;
    document.getElementById('stat-best-rating').textContent = bestRating;
    document.getElementById('stat-wins').textContent = totalWins;
    document.getElementById('stat-losses').textContent = totalLosses;
    document.getElementById('stat-matches').textContent = totalMatches;
    document.getElementById('summary-skins-title').textContent = `Popularidad de skins (${totalSkins})`;

    const skinsContainer = document.getElementById('summary-skins-container');
    skinsContainer.innerHTML = charSkins.map((skin, idx) => {
        const skinName = currentLang === 'us' ? (skin.nombreskin_en || skin.nombreskin) : skin.nombreskin;
        const matches = skin.matches || 0;
        const wins = Math.round(matches * 0.5);
        const dateVal = skin.fecha_lanzamiento || '2025/05';

        return `
            <div class="ranking-row-card">
                <div class="ranking-row-left">
                    <span class="ranking-pos">#${idx + 1}</span>
                    <img src="${skin.imagenskin_thumb || skin.imagenskin}" alt="${skinName}" class="ranking-thumb">
                    <div class="ranking-details">
                        <h3>${skinName}</h3>
                        <div class="ranking-stats-inline" style="margin-top: 4px;">
                            <span>Popularidad: <strong>${skin.rating}</strong></span>
                            <span>Enfrentamientos: <strong>${matches}</strong></span>
                            <span>Victorias: <strong>${wins}</strong></span>
                            <span>${dateVal}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* --- RESTO DE FUNCIONES (Tiers, Latest, News, FAQ) --- */
function initFAQ() {
    document.querySelectorAll('.faq-trigger').forEach(trigger => {
        trigger.replaceWith(trigger.cloneNode(true));
    });

    document.querySelectorAll('.faq-trigger').forEach(trigger => {
        trigger.addEventListener('click', () => {
            const item = trigger.parentElement;
            item.classList.toggle('open');
        });
    });
}

function getProcessedRosterForTiers() {
    let list = [...roster];
    const searchVal = document.getElementById('tier-search')?.value.toLowerCase().trim() || '';

    if (searchVal) {
        list = list.filter(item => 
            item.nombrepersonaje.toLowerCase().includes(searchVal) || 
            item.nombreskin.toLowerCase().includes(searchVal) ||
            item.nombreskin_en.toLowerCase().includes(searchVal)
        );
    }

    if (tierViewMode === 'unique') {
        const bestMap = {};
        list.forEach(item => {
            if (!bestMap[item.nombrepersonaje] || item.rating > bestMap[item.nombrepersonaje].rating) {
                bestMap[item.nombrepersonaje] = item;
            }
        });
        list = Object.values(bestMap);
    }

    return list.sort((a, b) => b.rating - a.rating);
}

function createThumbCardHTML(item) {
    const skinName = currentLang === 'us' ? (item.nombreskin_en || item.nombreskin) : item.nombreskin;
    const releaseDate = item.fecha_lanzamiento || 'N/A';
    const matchesCount = item.matches !== undefined ? item.matches : 0;

    return `
        <div class="tier-card-thumb">
            <span class="tier-card-badge">${item.rating}</span>
            <img src="${item.imagenskin_thumb}" alt="${skinName}">
            <div class="card-tooltip-overlay">
                <div class="tooltip-title">${item.nombrepersonaje} — ${skinName}</div>
                <div class="tooltip-info">
                    Rating ${item.rating} · ${matchesCount} matches<br>
                    Released ${releaseDate}
                </div>
            </div>
        </div>
    `;
}

function renderTiers() {
    const container = document.getElementById('tier-blocks-container');
    if (!container) return;
    container.innerHTML = '';

    const sorted = getProcessedRosterForTiers();
    const searchVal = document.getElementById('tier-search')?.value.trim() || '';

    const tiersConfigMap = {};
    if (tiersConfig && tiersConfig.length > 0) {
        tiersConfig.forEach(t => {
            const key = String(t.tier_id_lateral || '').toLowerCase().trim();
            tiersConfigMap[key] = t;
        });
    }

    const top3Config = tiersConfigMap['top3'] || { nombretier: 'Top 3', min_porcentaje: 'n/a', descripcion_puntos: '3 mejores' };

    let top3CenterText = '';
    const top3MinPct = top3Config.min_porcentaje !== undefined ? String(top3Config.min_porcentaje).trim() : '';
    const top3DescPts = top3Config.descripcion_puntos !== undefined ? String(top3Config.descripcion_puntos).trim() : '';

    if (top3MinPct && top3DescPts) {
        top3CenterText = `${top3MinPct} (${top3DescPts})`;
    } else {
        top3CenterText = top3MinPct || top3DescPts || '';
    }

    if (sorted.length >= 3 && !searchVal) {
        const top3 = sorted.slice(0, 3);
        const top1 = top3[0], top2 = top3[1], top3rd = top3[2];

        const topBlock = document.createElement('div');
        topBlock.className = 'tier-group-block';
        topBlock.innerHTML = `
            <div class="tier-group-header">
                <div class="tier-header-left">${top3Config.nombretier}</div>
                <div class="tier-header-center">${top3CenterText}</div>
                <div class="tier-header-right">
                    <span>3 items</span>
                    <svg class="collapse-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
            </div>
            <div class="tier-body">
                <div class="top3-podium-container">
                    <div class="podium-slot rank-2">${createThumbCardHTML(top2)}</div>
                    <div class="podium-slot rank-1">${createThumbCardHTML(top1)}</div>
                    <div class="podium-slot rank-3">${createThumbCardHTML(top3rd)}</div>
                </div>
            </div>
        `;
        setupCollapse(topBlock);
        container.appendChild(topBlock);
    }

    const remaining = sorted.length >= 3 && !searchVal ? sorted.slice(3) : sorted;
    const regularTierIds = ['tier1', 'tier2', 'tier3', 'tier4'];

    regularTierIds.forEach((tierId, index) => {
        const tierInfo = tiersConfigMap[tierId] || {
            nombretier: `Tier ${index + 1}`,
            min_porcentaje: '',
            descripcion_puntos: ''
        };
        
        let itemsInTier = [];

        if (tierId === 'tier1') {
            itemsInTier = remaining.filter(i => i.rating >= 1150);
        } else if (tierId === 'tier2') {
            itemsInTier = remaining.filter(i => i.rating >= 1050 && i.rating < 1150);
        } else if (tierId === 'tier3') {
            itemsInTier = remaining.filter(i => i.rating >= 950 && i.rating < 1050);
        } else if (tierId === 'tier4') {
            itemsInTier = remaining.filter(i => i.rating < 950);
        }

        if (itemsInTier.length === 0 && searchVal) return;

        let centerText = '';
        const minPct = tierInfo.min_porcentaje !== undefined ? String(tierInfo.min_porcentaje).trim() : '';
        const descPts = tierInfo.descripcion_puntos !== undefined ? String(tierInfo.descripcion_puntos).trim() : '';

        if (minPct && descPts) {
            centerText = `${minPct} (${descPts})`;
        } else {
            centerText = minPct || descPts || '';
        }

        const block = document.createElement('div');
        block.className = 'tier-group-block';
        block.innerHTML = `
            <div class="tier-group-header">
                <div class="tier-header-left">${tierInfo.nombretier}</div>
                <div class="tier-header-center">${centerText}</div>
                <div class="tier-header-right">
                    <span>${itemsInTier.length} items</span>
                    <svg class="collapse-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
            </div>
            <div class="tier-body">
                <div class="tier-items-grid">
                    ${itemsInTier.length > 0 ? itemsInTier.map(item => createThumbCardHTML(item)).join('') : '<span style="font-size:0.85rem; color:var(--text-muted);">Sin personajes en este tier actualmente</span>'}
                </div>
            </div>
        `;
        setupCollapse(block);
        container.appendChild(block);
    });
}

function parseDateInfo(dateString) {
    if (!dateString) return { monthLabel: 'Anteriores', timestamp: 0 };
    
    let dateObj;
    const str = String(dateString).trim();

    if (str.includes('/')) {
        const parts = str.split('/');
        if (parts.length === 3) {
            dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
        }
    } else if (str.includes('-')) {
        const parts = str.split('-');
        if (parts.length === 3) {
            dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
        } else if (parts.length === 2) {
            dateObj = new Date(parts[0], parts[1] - 1, 1);
        }
    }

    if (!dateObj || isNaN(dateObj.getTime())) {
        dateObj = new Date(str);
    }

    if (isNaN(dateObj.getTime())) {
        return { monthLabel: str, timestamp: 0 };
    }

    const monthLabel = dateObj.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    return { monthLabel, timestamp: dateObj.getTime() };
}

function renderLatest() {
    const container = document.getElementById('latest-groups-container');
    if (!container) return;
    container.innerHTML = '';

    const searchVal = document.getElementById('latest-search')?.value.toLowerCase().trim() || '';
    let list = [...roster];

    if (searchVal) {
        list = list.filter(item => 
            item.nombrepersonaje.toLowerCase().includes(searchVal) || 
            item.nombreskin.toLowerCase().includes(searchVal) ||
            item.nombreskin_en.toLowerCase().includes(searchVal)
        );
    }

    const groups = {};

    list.forEach(item => {
        const rawDate = item.fecha_lanzamiento || '';
        const { monthLabel, timestamp } = parseDateInfo(rawDate);
        
        item._exactTimestamp = timestamp;

        if (!groups[monthLabel]) {
            groups[monthLabel] = {
                items: [],
                maxTimestamp: timestamp
            };
        }
        groups[monthLabel].items.push(item);
        if (timestamp > groups[monthLabel].maxTimestamp) {
            groups[monthLabel].maxTimestamp = timestamp;
        }
    });

    const sortedMonths = Object.keys(groups).sort((a, b) => {
        return groups[b].maxTimestamp - groups[a].maxTimestamp;
    });

    sortedMonths.forEach(month => {
        const groupData = groups[month];
        
        groupData.items.sort((a, b) => {
            if (b._exactTimestamp !== a._exactTimestamp) {
                return b._exactTimestamp - a._exactTimestamp;
            }
            return b.rating - a.rating;
        });

        const avgElo = groupData.items.length > 0 
            ? (groupData.items.reduce((acc, curr) => acc + curr.rating, 0) / groupData.items.length).toFixed(1) 
            : 0;

        const block = document.createElement('div');
        block.className = 'tier-group-block';
        block.innerHTML = `
            <div class="tier-group-header">
                <div class="tier-header-left" style="text-transform: capitalize;">${month}</div>
                <div class="tier-header-center">Avg: ${avgElo}</div>
                <div class="tier-header-right">
                    <span>${groupData.items.length} items</span>
                    <svg class="collapse-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
            </div>
            <div class="tier-body">
                <div class="tier-items-grid">
                    ${groupData.items.map(item => createThumbCardHTML(item)).join('')}
                </div>
            </div>
        `;
        setupCollapse(block);
        container.appendChild(block);
    });
}

function setupCollapse(blockElement) {
    const header = blockElement.querySelector('.tier-group-header');
    if (header) {
        header.addEventListener('click', () => {
            blockElement.classList.toggle('collapsed');
        });
    }
}

function renderNews() {
    const container = document.getElementById('news-feed-container');
    if (!container) return;

    if (!newsData || newsData.length === 0) {
        container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">No hay noticias registradas.</p>`;
        return;
    }

    const reversedNews = [...newsData].reverse();

    container.innerHTML = reversedNews.map(post => {
        let bullets = [];
        if (post.news_bulletitems) {
            bullets = String(post.news_bulletitems).split('||').map(b => b.trim()).filter(b => b.length > 0);
        }

        return `
            <div class="news-post-card">
                <div class="news-post-header">
                    <h3>${post.news_titulo || ''}</h3>
                    <span class="news-date-badge">${post.news_dia || ''}</span>
                </div>
                <div class="news-body">
                    <p>${post.news_contenido || ''}</p>
                    ${bullets.length > 0 ? `<ul>${bullets.map(i => `<li>${i}</li>`).join('')}</ul>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function renderAboutDynamic() {
    const faqContainer = document.querySelector('.faq-accordion');
    if (!faqContainer || aboutData.faq.length === 0) return;

    faqContainer.innerHTML = aboutData.faq.map(faq => `
        <div class="faq-item">
            <button class="faq-trigger">
                <span>${faq.pregunta}</span>
                <svg class="faq-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            <div class="faq-content">
                <p>${faq.respuesta}</p>
            </div>
        </div>
    `).join('');

    initFAQ();
}