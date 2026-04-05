// --- LIMPIEZA DE URL (Hosting gratuito) ---
if (window.location.search.includes('i=')) {
    const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
}

// --- CONFIGURACIÓN ---
const API_URLS = {
    usd: 'https://ve.dolarapi.com/v1/dolares',
    eur: 'https://ve.dolarapi.com/v1/euros'
};
const DB_NAME = 'MercadoCambiarioVEDB';
const DB_VERSION = 4;
const STORE_NAME = 'rates';
const APP_VERSION = '1.3';

// --- ESTADO DOM ---
const ratesContainer = document.getElementById('rates-container');
const loadingState = document.getElementById('loading-state');
const refreshBtns = document.querySelectorAll('.refresh-btn');
const refreshIcons = document.querySelectorAll('.refresh-icon');
const refreshLoaders = document.querySelectorAll('.refresh-loader');
const statusIndicator = document.getElementById('status-indicator');
const lastUpdateText = document.getElementById('last-update-text');
const toast = document.getElementById('toast');

// --- VARIABLES GLOBALES CALCULADORA ---
let availableRates = {};
let activeInput = 'ves';
let currentVesValue = "";
let currentForeignValue = "";

// --- MODO OSCURO ---
function applyTheme(isDark) {
    const html = document.documentElement;
    const sunIcon = document.getElementById('sun-icon');
    const moonIcon = document.getElementById('moon-icon');
    const settingsSunIcon = document.getElementById('settings-sun-icon');
    const settingsMoonIcon = document.getElementById('settings-moon-icon');
    
    if (isDark) {
        html.classList.add('dark');
        if (sunIcon) sunIcon.classList.add('hidden');
        if (moonIcon) moonIcon.classList.remove('hidden');
        if (settingsSunIcon) settingsSunIcon.classList.add('hidden');
        if (settingsMoonIcon) settingsMoonIcon.classList.remove('hidden');
    } else {
        html.classList.remove('dark');
        if (sunIcon) sunIcon.classList.remove('hidden');
        if (moonIcon) moonIcon.classList.add('hidden');
        if (settingsSunIcon) settingsSunIcon.classList.remove('hidden');
        if (settingsMoonIcon) settingsMoonIcon.classList.add('hidden');
    }
    updateThemeColor();
}

function toggleDarkMode() {
    const html = document.documentElement;
    const sunIcon = document.getElementById('sun-icon');
    const moonIcon = document.getElementById('moon-icon');
    const settingsSunIcon = document.getElementById('settings-sun-icon');
    const settingsMoonIcon = document.getElementById('settings-moon-icon');
    const isDark = html.classList.toggle('dark');
    
    if (isDark) {
        if (sunIcon) sunIcon.classList.add('hidden');
        if (moonIcon) moonIcon.classList.remove('hidden');
        if (settingsSunIcon) settingsSunIcon.classList.add('hidden');
        if (settingsMoonIcon) settingsMoonIcon.classList.remove('hidden');
    } else {
        if (sunIcon) sunIcon.classList.remove('hidden');
        if (moonIcon) moonIcon.classList.add('hidden');
        if (settingsSunIcon) settingsSunIcon.classList.remove('hidden');
        if (settingsMoonIcon) settingsMoonIcon.classList.add('hidden');
    }
    updateThemeColor();
}

function updateThemeColor() {
    const isDark = document.documentElement.classList.contains('dark');
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        // Igualar al fondo del bottom nav bar: bg-white (#ffffff) / dark:bg-slate-800 (#1e293b)
        metaThemeColor.setAttribute('content', isDark ? '#1e293b' : '#ffffff');
    }
}

// --- BASE DE DATOS (IndexedDB) ---
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (db.objectStoreNames.contains(STORE_NAME)) {
                db.deleteObjectStore(STORE_NAME);
            }
            db.createObjectStore(STORE_NAME, { keyPath: 'uniqueId' });
            
            // Crear almacén de settings si no existe
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => {
            console.error("Error al abrir IndexedDB:", event.target.error);
            reject(event.target.error);
        };
    });
}

async function saveRatesToDB(rates) {
    if (!db) return;
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.clear();
        rates.forEach(rate => store.put(rate));
        transaction.oncomplete = () => resolve();
        transaction.onerror = (e) => reject(e.target.error);
    });
}

async function getRatesFromDB() {
    if (!db) return [];
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function saveSettingsToDB(settingsObj) {
    if (!db) return;
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['settings'], 'readwrite');
        const store = transaction.objectStore('settings');
        const request = store.put(settingsObj);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

async function getSettingsFromDB() {
    if (!db) return null;
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['settings'], 'readonly');
        const store = transaction.objectStore('settings');
        const request = store.get('user_prefs');
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

// --- LÓGICA DE INTERFAZ Y DATOS ---

function showToast(message, duration = 3500) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

function hideAppLoader() {
    const loader = document.getElementById('app-loader');
    if (loader) {
        loader.classList.add('fade-out');
        setTimeout(() => {
            loader.style.display = 'none';
        }, 750);
    }
}

function copyToClipboard(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        showToast('¡Valor copiado al portapapeles!');
    }).catch(err => {
        console.error('Error al copiar: ', err);
        showToast('Error al copiar');
    });
}

function updateStatus(type) {
    statusIndicator.className = 'flex-1 md:flex-none flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border transition-all duration-300';
    
    if (type === 'online') {
        statusIndicator.classList.add('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
        statusIndicator.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span> Sistema en línea`;
    } else if (type === 'offline') {
        statusIndicator.classList.add('bg-amber-50', 'text-amber-700', 'border-amber-200');
        statusIndicator.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]"></span> Datos guardados (Sin internet)`;
    } else if (type === 'loading') {
        statusIndicator.classList.add('bg-blue-50', 'text-blue-700', 'border-blue-200');
        statusIndicator.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span> Sincronizando...`;
    } else if (type === 'error') {
        statusIndicator.classList.add('bg-red-50', 'text-red-700', 'border-red-200');
        statusIndicator.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-red-500"></span> Error de conexión`;
    }
}

function formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return 'N/A';
    // Formateador forzado ESTRICTAMENTE a 2 decimales
    let formatted = new Intl.NumberFormat('es-VE', { 
        style: 'currency', 
        currency: 'VES',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
    
    // Normalizar Bs.S (Viejo) a Bs. (Actual)
    return formatted.replace('Bs.S', 'Bs.');
}

function formatDate(dateString) {
    if (!dateString) return 'Desconocida';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-VE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
    }).format(date);
}

function setButtonLoading(isLoading) {
    refreshBtns.forEach(btn => btn.disabled = isLoading);
    if (isLoading) {
        refreshIcons.forEach(icon => icon.classList.add('hidden'));
        refreshLoaders.forEach(loader => loader.classList.remove('hidden'));
    } else {
        refreshIcons.forEach(icon => icon.classList.remove('hidden'));
        refreshLoaders.forEach(loader => loader.classList.add('hidden'));
    }
}

function createRateCard(rate, index) {
    const delay = index * 0.05;
    const keyName = (rate.casa || rate.fuente || '').toLowerCase();
    const isOfficial = keyName === 'oficial' || keyName === 'bcv';
    
    const cardClass = isOfficial 
        ? 'bg-gradient-to-br from-indigo-50/50 to-white dark:from-indigo-900/20 dark:to-slate-800 border-indigo-200 dark:border-indigo-800 shadow-indigo-100/50 dark:shadow-indigo-900/20' 
        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-700';
    
    const badgeClass = rate.moneda === 'EUR' 
        ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700'
        : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700';

    const titulo = rate.nombre || rate.casa || rate.fuente || 'Desconocido';

    const hasCompra = rate.compra !== null && rate.compra !== undefined && rate.compra > 0;
    const hasVenta = rate.venta !== null && rate.venta !== undefined && rate.venta > 0;
    const hasPromedio = rate.promedio !== null && rate.promedio !== undefined && rate.promedio > 0;
    
    let htmlPrecios = '<div class="grid grid-cols-2 gap-3 mt-5">';
    let contadorValores = 0;

    if (hasCompra) {
        htmlPrecios += `
            <div class="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl border border-slate-100 dark:border-slate-600 flex justify-between items-center group/copy">
                <div>
                    <p class="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold mb-1">Compra</p>
                    <p class="text-lg font-black text-slate-800 dark:text-white">${formatCurrency(rate.compra)}</p>
                </div>
                <button onclick="copyToClipboard('${rate.compra}')" class="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-white dark:hover:bg-slate-600 rounded-lg transition-all opacity-100 md:opacity-0 md:group-hover/copy:opacity-100 focus:opacity-100 outline-none" title="Copiar compra">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                </button>
            </div>`;
        contadorValores++;
    }
    if (hasVenta) {
        htmlPrecios += `
            <div class="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl border border-slate-100 dark:border-slate-600 flex justify-between items-center group/copy">
                <div>
                    <p class="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold mb-1">Venta</p>
                    <p class="text-lg font-black text-slate-800 dark:text-white">${formatCurrency(rate.venta)}</p>
                </div>
                <button onclick="copyToClipboard('${rate.venta}')" class="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-white dark:hover:bg-slate-600 rounded-lg transition-all opacity-100 md:opacity-0 md:group-hover/copy:opacity-100 focus:opacity-100 outline-none" title="Copiar venta">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                </button>
            </div>`;
        contadorValores++;
    }
    
    if (hasPromedio || contadorValores === 0) {
        const valorUnico = rate.promedio || rate.venta || rate.compra || 0;
        const classSpan = contadorValores > 0 ? 'col-span-2' : 'col-span-2';
        const label = hasPromedio ? 'Promedio / Tasa Actual' : 'Tasa Única';
        
        htmlPrecios += `
            <div class="${classSpan} bg-blue-50/50 dark:bg-blue-900/30 p-3 rounded-xl border border-blue-100 dark:border-blue-800 flex justify-between items-center group/copy">
                <div>
                    <p class="text-[10px] text-blue-600 dark:text-blue-300 uppercase tracking-widest font-bold mb-1">${label}</p>
                    <p class="text-2xl font-black text-slate-900 dark:text-white">${formatCurrency(valorUnico)}</p>
                </div>
                <button onclick="copyToClipboard('${valorUnico}')" class="p-2 text-blue-500 hover:text-blue-700 hover:bg-white dark:hover:bg-blue-800/80 rounded-lg transition-all opacity-100 md:opacity-0 md:group-hover/copy:opacity-100 focus:opacity-100 outline-none" title="Copiar tasa">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                </button>
            </div>`;
    }
    htmlPrecios += '</div>';

    return `
        <div class="rounded-3xl border ${cardClass} p-6 shadow-sm hover:shadow-xl transition-all duration-300 animate-fade-in relative overflow-hidden group" style="animation-delay: ${delay}s; opacity: 0;">
            ${isOfficial ? '<div class="absolute -top-4 -right-4 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl -z-10 group-hover:bg-indigo-500/20 transition-colors"></div>' : ''}
            
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        ${titulo}
                        ${isOfficial ? '<svg class="w-5 h-5 text-indigo-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg>' : ''}
                    </h3>
                </div>
                <span class="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg ${badgeClass}">
                    ${rate.moneda === 'VES' ? 'Bs.' : (rate.moneda || 'N/A')}
                </span>
            </div>
            
            ${htmlPrecios}
            
            <div class="mt-6 pt-4 border-t border-slate-100/80 dark:border-slate-700/80 flex justify-between items-center text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                <div class="flex items-center gap-1.5">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    Actualizado:
                </div>
                <span>${formatDate(rate.fechaActualizacion)}</span>
            </div>
        </div>
    `;
}

function renderGroup(title, rates, currencyKey) {
    if (!rates || rates.length === 0) return '';
    
    rates.sort((a, b) => {
        const fA = (a.casa || a.fuente || '').toLowerCase();
        const fB = (b.casa || b.fuente || '').toLowerCase();
        if (fA === 'oficial' || fA === 'bcv') return -1;
        if (fB === 'oficial' || fB === 'bcv') return 1;
        return 0;
    });

    // Calcular brecha cambiaria (Oficial vs Paralelo)
    const oficial = availableRates[`${currencyKey}_oficial`];
    const paralelo = availableRates[`${currencyKey}_binance`];
    let brechaHtml = '';
    
    if (oficial > 0 && paralelo > 0) {
        const brecha = ((paralelo - oficial) / oficial) * 100;
        const isPositive = brecha > 0;
        const colorClass = isPositive ? 'text-rose-500' : 'text-emerald-500';
        const bgClass = isPositive ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800' : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800';
        
        brechaHtml = `
            <div class="rounded-3xl border ${bgClass} p-6 shadow-sm relative overflow-hidden">
                <div class="text-center">
                    <p class="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Brecha (Oficial vs Paralelo)</p>
                    <p class="text-5xl font-black ${colorClass} tracking-tight">${brecha.toFixed(2)}%</p>
                    <p class="text-sm text-slate-600 dark:text-slate-300 mt-2">${isPositive ? 'El paralelo está por encima del oficial' : 'El paralelo está por debajo del oficial'}</p>
                </div>
            </div>
        `;
    }

    return `
        <section class="animate-fade-in mt-10">
            <div class="flex items-center gap-3 mb-6">
                <h2 class="text-2xl font-bold text-slate-800 dark:text-white">${title}</h2>
                <div class="h-px bg-slate-200 flex-1"></div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${rates.map((rate, index) => createRateCard(rate, index)).join('')}
                ${brechaHtml}
            </div>
        </section>
    `;
}

function renderRates(rates) {
    loadingState.classList.add('hidden');
    ratesContainer.classList.remove('hidden');
    
    // Extraer tasas para la calculadora
    availableRates = {};
    const usdRates = rates.filter(r => r.moneda === 'USD');
    usdRates.forEach(rate => {
        const casa = (rate.casa || rate.fuente || '').toLowerCase();
        const moneda = rate.moneda;
        
        // Detectar Oficial/BCV
        if (casa === 'oficial' || casa === 'bcv') {
            const key = `${moneda.toLowerCase()}_oficial`;
            availableRates[key] = rate.promedio || rate.venta || rate.compra || 0;
        }
        // Detectar Binance/Paralelo (incluye variaciones como "binance_p2p", "paralelo", etc.)
        else if (casa.includes('binance') || casa.includes('paralelo')) {
            const key = `${moneda.toLowerCase()}_binance`;
            availableRates[key] = rate.promedio || rate.venta || rate.compra || 0;
        }
    });
    
    // Actualizar calculadora si hay datos
    if (Object.keys(availableRates).length > 0) {
        updateRateDisplay();
    }
    
    if (!Array.isArray(rates) || rates.length === 0) {
        ratesContainer.innerHTML = `
            <div class="text-center py-16 bg-white rounded-3xl border border-slate-100 shadow-sm">
                <p class="text-slate-500 font-medium text-lg">No hay datos cambiarios disponibles.</p>
            </div>`;
        return;
    }

    const eurRates = rates.filter(r => r.moneda === 'EUR');

    // --- CALCULAR EL PROMEDIO DEL DÓLAR (USD) ---
    let sumaUsd = 0;
    let contadorValores = 0;
    
    // Iteramos únicamente sobre las tasas de dólar
    usdRates.forEach(rate => {
        // Seleccionamos el valor correcto para sumar
        const valorPromediar = rate.promedio || rate.venta || rate.compra;
        if (valorPromediar && !isNaN(valorPromediar) && valorPromediar > 0) {
            sumaUsd += valorPromediar;
            contadorValores++; // Contamos cuántos se están sumando
        }
    });
    
    // Dividimos entre el total de valores sumados
    const promedioUsd = contadorValores > 0 ? (sumaUsd / contadorValores) : 0;

    // --- INYECTAR LA SECCIÓN PROMEDIO GENERAL Y LUEGO LAS TARJETAS ---
    ratesContainer.innerHTML = `
        ${contadorValores > 0 ? `
        <section class="animate-fade-in">
            <div class="bg-gradient-to-r from-blue-600 to-indigo-800 rounded-[2rem] p-8 md:p-10 text-white shadow-xl shadow-blue-900/10 relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8 border border-blue-500/30">
                <div class="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
                <div class="absolute bottom-0 left-0 w-40 h-40 bg-indigo-400/20 rounded-full blur-2xl translate-y-1/3 -translate-x-1/4 pointer-events-none"></div>
                
                <div class="relative z-10 text-center md:text-left">
                    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-bold uppercase tracking-widest text-blue-100 mb-4">
                        <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                        Análisis del Mercado
                    </div>
                    <h2 class="text-3xl md:text-4xl font-black tracking-tight mb-2 text-white">Promedio Dólar (USD)</h2>
                    <p class="text-blue-200/90 font-medium">Calculado sumando y dividiendo los valores del dólar.</p>
                </div>
                
                <div class="relative z-10 bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl p-6 md:p-8 text-center min-w-[220px] shadow-inner group/copy">
                    <p class="text-[10px] text-blue-200 uppercase tracking-[0.2em] font-bold mb-2">Valor Promedio (VES)</p>
                    <div class="flex items-center justify-center gap-3">
                        <p class="text-4xl md:text-5xl font-black tracking-tight text-white drop-shadow-md">
                            ${formatCurrency(promedioUsd)}
                        </p>
                        <button onclick="copyToClipboard('${promedioUsd}')" class="p-2 text-white/50 hover:text-white hover:bg-white/20 rounded-lg transition-all opacity-100 md:opacity-0 md:group-hover/copy:opacity-100 focus:opacity-100 outline-none" title="Copiar promedio">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                        </button>
                    </div>
                </div>
            </div>
        </section>
        ` : ''}

        ${renderGroup('Cotizaciones Dólar (USD)', usdRates, 'usd')}
        ${renderGroup('Cotizaciones Euro (EUR)', eurRates, 'eur')}
    `;
    
    // Buscar la fecha más reciente
    let mostRecentDate = 0;
    rates.forEach(r => {
        if (r.fechaActualizacion) {
            const time = new Date(r.fechaActualizacion).getTime();
            if (time > mostRecentDate) mostRecentDate = time;
        }
    });

    if (mostRecentDate > 0) {
        lastUpdateText.textContent = `Última actualizacion: ${formatDate(new Date(mostRecentDate))}`;
    }
}

async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 30000 } = options;
    
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

async function fetchEndpoint(url) {
    try {
        const res = await fetchWithTimeout(url);
        if (!res.ok) return [];
        return await res.json();
    } catch (e) {
        console.warn(`Error en ${url}:`, e);
        if (e.name === 'AbortError') {
            console.warn('La petición ha excedido el tiempo de espera (30s)');
        }
        return [];
    }
}

async function fetchData(forceRefresh = false) {
    setButtonLoading(true);
    updateStatus('loading');

    try {
        if (!forceRefresh) {
            const cachedRates = await getRatesFromDB();
            if (cachedRates && cachedRates.length > 0) {
                renderRates(cachedRates);
                updateStatus('offline');
            }
        }

        const [usdData, eurData] = await Promise.all([
            fetchEndpoint(API_URLS.usd),
            fetchEndpoint(API_URLS.eur)
        ]);

        let combinedRates = [...usdData, ...eurData];

        if (combinedRates.length > 0) {
            combinedRates = combinedRates.map(rate => {
                if (!rate.moneda && rate.nombre) {
                    rate.moneda = rate.nombre.includes('Euro') ? 'EUR' : 'USD';
                }
                rate.uniqueId = `${rate.moneda}_${rate.casa || rate.fuente || 'unknown'}`;
                rate._localSavedAt = new Date().toISOString();
                return rate;
            });

            renderRates(combinedRates);
            await saveRatesToDB(combinedRates);
            updateStatus('online');
            
            if (forceRefresh) showToast("Se han obtenido los valores más recientes.");
        } else {
            throw new Error("Sin datos");
        }

    } catch (error) {
        const cachedRates = await getRatesFromDB();
        if (cachedRates && cachedRates.length > 0) {
            renderRates(cachedRates);
            updateStatus('offline');
            if (forceRefresh) showToast("Mostrando caché local por fallo de red.", 4500);
        } else {
            updateStatus('error');
            loadingState.innerHTML = `
                <div class="text-center text-red-500 py-10 bg-red-50 w-full rounded-2xl border border-red-100">
                    <p class="font-bold text-lg">Conexión Fallida</p>
                    <p class="text-sm mt-2 text-red-600/80">Verifica tu conexión a internet.</p>
                </div>
            `;
        }
    } finally {
        setButtonLoading(false);
    }
}

// --- NAVEGACIÓN SPA ---

// --- FUNCIONES DE LA CALCULADORA ---
function updateRateDisplay() {
    const selector = document.getElementById('rate-selector');
    const display = document.getElementById('current-rate-display');
    const currencyLabel = document.getElementById('currency-label');
    
    if (!selector || !display) return;
    
    const selectedKey = selector.value;
    const rate = availableRates[selectedKey];
    
    // Determinar moneda para el label
    const isEur = selectedKey.includes('eur');
    const currency = isEur ? 'EUR' : 'USD';
    
    if (currencyLabel) {
        currencyLabel.textContent = currency;
    }
    
    if (rate && rate > 0) {
        display.textContent = `Tasa actual: ${formatCurrency(rate)} por ${currency}`;
        // Recalcular si hay valores
        if (currentVesValue || currentForeignValue) {
            calculateConversion();
        }
    } else {
        display.textContent = 'Tasa actual: Cargando...';
    }
}

function setActiveInput(type) {
    activeInput = type;
    const vesContainer = document.getElementById('input-ves-container');
    const foreignContainer = document.getElementById('input-foreign-container');
    
    if (type === 'ves') {
        vesContainer.querySelector('div').classList.add('border-blue-500', 'ring-2', 'ring-blue-500/20');
        vesContainer.querySelector('div').classList.remove('border-slate-200', 'dark:border-slate-600');
        foreignContainer.querySelector('div').classList.remove('border-blue-500', 'ring-2', 'ring-blue-500/20');
        foreignContainer.querySelector('div').classList.add('border-slate-200', 'dark:border-slate-600');
    } else {
        foreignContainer.querySelector('div').classList.add('border-blue-500', 'ring-2', 'ring-blue-500/20');
        foreignContainer.querySelector('div').classList.remove('border-slate-200', 'dark:border-slate-600');
        vesContainer.querySelector('div').classList.remove('border-blue-500', 'ring-2', 'ring-blue-500/20');
        vesContainer.querySelector('div').classList.add('border-slate-200', 'dark:border-slate-600');
    }
}

function swapInputs() {
    // Intercambiar valores
    const temp = currentVesValue;
    currentVesValue = currentForeignValue;
    currentForeignValue = temp;
    
    // Actualizar inputs
    document.getElementById('input-ves').value = currentVesValue ? formatInputDisplay(currentVesValue) : '';
    document.getElementById('input-foreign').value = currentForeignValue ? formatInputDisplay(currentForeignValue) : '';
    
    // Cambiar input activo
    setActiveInput(activeInput === 'ves' ? 'foreign' : 'ves');
    
    // Recalcular la matemática correcta
    calculateConversion();
}

function formatInputDisplay(value) {
    // Formatear con coma como separador decimal para mostrar
    if (!value) return '';
    // Reemplazar punto por coma para visualización
    return value.replace('.', ',');
}

function parseInputValue(value) {
    // Convertir valor de entrada a número (coma o punto como decimal)
    if (!value) return 0;
    // Reemplazar coma por punto para parsear
    const normalized = value.replace(',', '.');
    return parseFloat(normalized) || 0;
}

function handlePaste(event, type) {
    event.preventDefault();
    const pastedData = (event.clipboardData || window.clipboardData).getData('text');
    if (!pastedData) return;
    
    // Normalizar a número reemplazando comas por puntos
    let normalized = pastedData.replace(',', '.');
    let parsedValue = parseFloat(normalized);
    
    if (isNaN(parsedValue)) {
        showToast('El texto pegado no es un número válido');
        return;
    }
    
    // Convertir a string con máximo dos decimales y coma como separador
    let formatted = parsedValue.toFixed(2);
    // Eliminar decimales en VES si son ,00 o mantenerlos si existen
    if (type === 'ves' && formatted.endsWith('.00')) {
        formatted = parseInt(formatted).toString();
    } else {
        formatted = parseFloat(formatted).toString().replace('.', ',');
    }

    if (type === 'ves') {
        currentVesValue = formatted;
        document.getElementById('input-ves').value = currentVesValue;
    } else {
        currentForeignValue = formatted;
        document.getElementById('input-foreign').value = currentForeignValue;
    }
    
    calculateConversion();
}

function numpadPress(val) {
    if (activeInput === 'ves') {
        // Limitar longitud
        if (currentVesValue.length >= 15) return;
        // Solo permitir una coma
        if (val === ',' && currentVesValue.includes(',')) return;
        currentVesValue += val;
        document.getElementById('input-ves').value = currentVesValue;
    } else {
        if (currentForeignValue.length >= 15) return;
        if (val === ',' && currentForeignValue.includes(',')) return;
        currentForeignValue += val;
        document.getElementById('input-foreign').value = currentForeignValue;
    }
    calculateConversion();
}

function backspace() {
    if (activeInput === 'ves') {
        currentVesValue = currentVesValue.slice(0, -1);
        document.getElementById('input-ves').value = currentVesValue;
    } else {
        currentForeignValue = currentForeignValue.slice(0, -1);
        document.getElementById('input-foreign').value = currentForeignValue;
    }
    calculateConversion();
}

function clearAll() {
    currentVesValue = "";
    currentForeignValue = "";
    document.getElementById('input-ves').value = "";
    document.getElementById('input-foreign').value = "";
    setActiveInput('ves');
}

function calculateConversion() {
    const selector = document.getElementById('rate-selector');
    if (!selector) return;
    
    const selectedKey = selector.value;
    const rate = availableRates[selectedKey];
    
    if (!rate || rate <= 0) return;
    
    if (activeInput === 'ves') {
        // Convertir VES a Divisa
        const vesAmount = parseInputValue(currentVesValue);
        if (vesAmount > 0) {
            const foreignAmount = vesAmount / rate;
            currentForeignValue = foreignAmount.toFixed(2).replace('.', ',');
            document.getElementById('input-foreign').value = currentForeignValue;
        } else {
            currentForeignValue = "";
            document.getElementById('input-foreign').value = "";
        }
    } else {
        // Convertir Divisa a VES
        const foreignAmount = parseInputValue(currentForeignValue);
        if (foreignAmount > 0) {
            const vesAmount = foreignAmount * rate;
            // Formatear sin decimales para bolívares (números grandes)
            currentVesValue = Math.round(vesAmount).toString();
            document.getElementById('input-ves').value = formatInputDisplay(currentVesValue);
        } else {
            currentVesValue = "";
            document.getElementById('input-ves').value = "";
        }
    }
}

function switchView(targetViewId) {
    // Ocultar todas las vistas
    document.querySelectorAll('.view-section').forEach(view => {
        view.classList.add('hidden');
        view.classList.remove('block');
    });
    
    // Mostrar la vista seleccionada
    const targetView = document.getElementById(targetViewId);
    if (targetView) {
        targetView.classList.remove('hidden');
        targetView.classList.add('block');
    }
    
    // Actualizar estado de los botones de navegación
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('text-blue-600', 'dark:text-blue-400', 'bg-blue-50', 'dark:bg-blue-900/30');
        btn.classList.add('text-slate-500', 'dark:text-slate-400');
    });
    
    // Resaltar el botón activo
    const activeBtn = document.querySelector(`.nav-btn[data-target="${targetViewId}"]`);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-500', 'dark:text-slate-400');
        activeBtn.classList.add('text-blue-600', 'dark:text-blue-400', 'bg-blue-50', 'dark:bg-blue-900/30');
    }
    
    // Mostrar/ocultar header principal según la vista
    const mainHeader = document.getElementById('main-header');
    if (mainHeader) {
        if (targetViewId === 'view-prices') {
            mainHeader.classList.remove('hidden');
            mainHeader.classList.add('flex');
        } else {
            mainHeader.classList.add('hidden');
            mainHeader.classList.remove('flex');
        }
    }
    
    // Scroll al inicio
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Event listeners para botones de navegación
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-target');
        switchView(targetView);
    });
});

document.getElementById('rate-selector')?.addEventListener('change', updateRateDisplay);

// Event listener para guardar ajustes
document.getElementById('save-settings-btn')?.addEventListener('click', async () => {
    const isDark = document.documentElement.classList.contains('dark');
    const defaultRate = document.getElementById('default-rate-settings')?.value;
    
    const settings = { id: 'user_prefs', isDark: isDark, defaultRate: defaultRate };
    
    try {
        await saveSettingsToDB(settings);
        showToast('Ajustes guardados correctamente');
        
        // Actualizar la calculadora en tiempo real
        const calculatorRateSelect = document.getElementById('rate-selector');
        if (calculatorRateSelect && defaultRate) {
            calculatorRateSelect.value = defaultRate;
            updateRateDisplay();
            calculateConversion(); // Recalcular con la nueva tasa
        }
        
    } catch (error) {
        console.error('Error guardando ajustes:', error);
        showToast('Error al guardar ajustes');
    }
});

window.addEventListener('DOMContentLoaded', async () => {
    // Timeout de seguridad: Si pasan 10 segundos y sigue el loader, quitarlo
    setTimeout(hideAppLoader, 10000);

    try {
        await initDB();
        
        // Cargar ajustes desde IndexedDB
        const settings = await getSettingsFromDB();
        if (settings) {
            applyTheme(settings.isDark);
            
            // Aplicar tasa por defecto
            const defaultRateSelect = document.getElementById('default-rate-settings');
            const calculatorRateSelect = document.getElementById('rate-selector');
            
            if (settings.defaultRate) {
                if (defaultRateSelect) defaultRateSelect.value = settings.defaultRate;
                if (calculatorRateSelect) calculatorRateSelect.value = settings.defaultRate;
            }
        } else {
            // Si no hay ajustes guardados, usar preferencia del sistema para tema
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            applyTheme(prefersDark);
        }
        
        updateThemeColor();
        await fetchData();
        // Inicializar calculadora
        setActiveInput('ves');
        setTimeout(updateRateDisplay, 500);
        // Inicializar vista por defecto (calculadora)
        switchView('view-calculator');
        
        // Inicializar botón borrar presionado largo
        setupBackspaceHold();
        
        // Ocultar pantalla de carga al finalizar todo
        setTimeout(hideAppLoader, 500);
    } catch (error) {
        console.error('Error en inicialización:', error);
        fetchData();
        // Asegurar que la vista por defecto se muestre incluso si hay error
        switchView('view-calculator');
        setupBackspaceHold();
        hideAppLoader();
    }
});

function setupBackspaceHold() {
    const btn = document.getElementById('btn-backspace');
    if (!btn) return;
    
    let pressTimer = null;
    let isLongPress = false;
    
    const startHold = (e) => {
        isLongPress = false;
        if (pressTimer) clearTimeout(pressTimer);
        
        pressTimer = window.setTimeout(() => {
            isLongPress = true;
            clearAll();
            showToast('Calculadora reiniciada', 1500);
            pressTimer = null;
        }, 600);
    };
    
    const cancelHold = () => {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
    };
    
    const handleEnd = (e) => {
        if (e.type === 'touchend' && e.cancelable) {
            e.preventDefault(); // Evita que se lance el mouseup de forma emulada
        }
        cancelHold();
        if (!isLongPress) {
            backspace(); // Single click
        }
    };

    btn.addEventListener('mousedown', startHold);
    btn.addEventListener('touchstart', startHold, { passive: true });
    
    btn.addEventListener('mouseup', handleEnd);
    btn.addEventListener('touchend', handleEnd);
    
    btn.addEventListener('mouseleave', cancelHold);
    btn.addEventListener('touchcancel', cancelHold);
}

// Registrar Service Worker
if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js');
            
            // Detectar actualizaciones
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateNotification();
                    }
                });
            });

            // Si ya hay uno esperando al cargar
            if (registration.waiting) {
                showUpdateNotification();
            }

        } catch (err) {
            console.warn('Service Worker falló (posible entorno sin https):', err);
        }
    });

    // Recargar cuando el nuevo Service Worker tome el control
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            refreshing = true;
            window.location.reload();
        }
    });
} else if (window.location.protocol === 'file:') {
    console.warn('Modo local (file://) detectado: Service Worker y PWA deshabilitados. Usa un servidor local (ej. Live Server) para probar estas funciones.');
}

function showUpdateNotification() {
    const banner = document.getElementById('update-notification');
    if (banner) {
        banner.classList.remove('hidden');
        banner.classList.add('flex');
    }
}

// Eventos para el banner de actualización
document.getElementById('refresh-app-btn')?.addEventListener('click', () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(reg => {
            if (reg && reg.waiting) {
                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
        });
    }
});

document.getElementById('close-update-btn')?.addEventListener('click', () => {
    const banner = document.getElementById('update-notification');
    if (banner) {
        banner.classList.add('hidden');
        banner.classList.remove('flex');
    }
});

// --- PWA Install & Update Functionality ---

let deferredPrompt;

// Escuchar el evento beforeinstallprompt para mostrar el botón de instalar
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevenir que Chrome muestre el prompt automático
    e.preventDefault();
    // Guardar el evento para usarlo después
    deferredPrompt = e;
    // Mostrar el botón de instalar
    document.getElementById('install-app-btn')?.classList.remove('hidden');
});

// Manejar clic en botón de instalar
document.getElementById('install-app-btn')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    
    // Mostrar el prompt de instalación
    deferredPrompt.prompt();
    
    // Esperar a que el usuario responda
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
        console.log('Usuario aceptó instalar la PWA');
    } else {
        console.log('Usuario rechazó instalar la PWA');
    }
    
    // Ocultar el botón y limpiar el prompt guardado
    document.getElementById('install-app-btn')?.classList.add('hidden');
    deferredPrompt = null;
});

// Ocultar botón de instalar si la app ya está instalada
window.addEventListener('appinstalled', () => {
    console.log('PWA fue instalada');
    document.getElementById('install-app-btn')?.classList.add('hidden');
    deferredPrompt = null;
});

// Función para verificar si la app está en modo standalone
function checkStandaloneMode() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         navigator.standalone === true;
    
    if (isStandalone) {
        // Mostrar botón de actualizar solo si está instalada
        document.getElementById('update-app-btn')?.classList.remove('hidden');
        // Ocultar botón de instalar
        document.getElementById('install-app-btn')?.classList.add('hidden');
        // Mostrar badge de instalado
        document.getElementById('pwa-status-container')?.classList.remove('hidden');
    }
}

// Verificar modo standalone al cargar
checkStandaloneMode();

// --- PWA Update Logic with Version Check ---

async function checkForUpdates() {
    const statusContainer = document.getElementById('pwa-status-container');
    const updateBtn = document.getElementById('update-app-btn');
    
    try {
        // Fetch version.json from server with cache busting
        const response = await fetch(`./version.json?t=${Date.now()}`);
        if (!response.ok) throw new Error('No se pudo verificar la versión');
        
        const data = await response.json();
        const serverVersion = data.version;
        
        if (serverVersion === APP_VERSION) {
            showToast('El sistema ya está actualizado (v' + APP_VERSION + ')');
            if (statusContainer) {
                statusContainer.textContent = 'SISTEMA ACTUALIZADO (v' + APP_VERSION + ')';
                statusContainer.classList.remove('hidden');
            }
        } else {
            showUpdateNotification();
            showToast('Nueva versión disponible: v' + serverVersion);
        }
    } catch (error) {
        console.warn('Error al verificar versión:', error);
        // Si falla la verificación, al menos refrescamos datos
        fetchData(true);
    }
}

async function performSystemUpdate() {
    const overlay = document.getElementById('update-overlay');
    const progressBar = document.getElementById('update-progress-bar');
    const progressText = document.getElementById('update-progress-text');
    
    if (!overlay || !progressBar || !progressText) return;
    
    // Mostrar overlay
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
    
    const updateSteps = [
        { progress: 10, text: 'Iniciando actualización...' },
        { progress: 25, text: 'Cerrando conexiones de base de datos...' },
        { progress: 45, text: 'Limpiando caché de la aplicación...' },
        { progress: 65, text: 'Eliminando datos antiguos...' },
        { progress: 85, text: 'Preparando reinicio de sistema...' },
        { progress: 100, text: '¡Todo listo! Recargando...' }
    ];
    
    for (const step of updateSteps) {
        // Simular tiempo de procesamiento para feedback visual fluido
        await new Promise(resolve => setTimeout(resolve, 600));
        
        progressBar.style.width = `${step.progress}%`;
        progressText.textContent = `${step.progress}% Completado - ${step.text}`;
        
        // Acciones reales en pasos específicos
        if (step.progress === 25) {
            if (db) db.close();
        }
        if (step.progress === 45) {
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(name => caches.delete(name)));
            }
        }
        if (step.progress === 65) {
            indexedDB.deleteDatabase(DB_NAME);
        }
        if (step.progress === 85) {
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let registration of registrations) {
                    await registration.unregister();
                }
            }
        }
    }
    
    // Recarga final
    setTimeout(() => {
        window.location.reload(true);
    }, 500);
}

// Manejar clic en botón de buscar actualizaciones
document.getElementById('update-app-btn')?.addEventListener('click', async () => {
    // Primero verificamos si hay cambios en el servidor
    await checkForUpdates();
});

// Manejar clic en "Actualizar ahora" del banner
document.getElementById('refresh-app-btn')?.addEventListener('click', async () => {
    await performSystemUpdate();
});
