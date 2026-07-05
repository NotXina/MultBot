// ==UserScript==
// @name         MultBot
// @author       NotXina
// @description  ModernBot aprimorado com módulos adicionais para Grepolis
// @version      1.1.0
// @match        http://*.grepolis.com/game/*
// @match        https://*.grepolis.com/game/*
// @grant        none
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/NotXina/MultBot/main/index.js
// @downloadURL  https://raw.githubusercontent.com/NotXina/MultBot/main/index.js
// ==/UserScript==

(function () {
    'use strict';

    const BASE_URL = 'https://raw.githubusercontent.com/NotXina/MultBot/main/Modules';
    const MAX_RETRIES = 2;
    const FETCH_TIMEOUT_MS = 15000;

    const MODULES = [
        'core.js',
        'anti_rage.js',
        'auto_bootcamp.js',
        'auto_build.js',
        'auto_farm.js',
        'auto_gratis.js',
        'auto_hide.js',
        'auto_party.js',
        'auto_rural_level.js',
        'auto_rural_trade.js',
        'auto_trade.js',
        'auto_train.js',
        'status.js',
        'auto_militia.js',
        'auto_dodge.js',
        'auto_research.js',
        'auto_send_resources.js',
        'colonize_ship_sender.js',
        'mult_tools.js',
        'multbot.js',
    ];

    const codes = new Array(MODULES.length).fill(null);
    let completed = 0;

    function injectAll() {
        // Concatena tudo num único script tag — garante escopo compartilhado
        const fullCode = codes.join('\n\n');
        const script = document.createElement('script');
        script.textContent = fullCode;
        document.head.appendChild(script);
        script.remove();
        console.log('[MultBot] ✓ Todos os módulos injetados! (index.js v1.1.0)');
    }

    async function fetchModule(index, attempt = 0) {
        const mod = MODULES[index];
        const url = `${BASE_URL}/${mod}?_=${Date.now()}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

        try {
            const response = await fetch(url, {
                method: 'GET',
                cache: 'no-store',
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                retryOrFail(index, attempt, `HTTP ${response.status}`);
                return;
            }

            const text = await response.text();
            codes[index] = text;
            console.log(`[MultBot] ✓ baixado: ${mod}`);
            completed++;
            if (completed === MODULES.length) injectAll();
        } catch (err) {
            clearTimeout(timeoutId);
            const reason = err?.name === 'AbortError' ? 'Timeout' : (err?.message ?? 'Falha de rede');
            retryOrFail(index, attempt, reason);
        }
    }

    function retryOrFail(index, attempt, reason) {
        const mod = MODULES[index];
        if (attempt < MAX_RETRIES) {
            const nextAttempt = attempt + 1;
            console.warn(`[MultBot] ⚠ ${reason} ao baixar ${mod} — tentativa ${nextAttempt}/${MAX_RETRIES}`);
            setTimeout(() => fetchModule(index, nextAttempt), 800 * nextAttempt); // backoff crescente
        } else {
            codes[index] = `console.error('[MultBot] Falha definitiva ao carregar ${mod} após ${MAX_RETRIES} tentativas (${reason})');`;
            console.error(`[MultBot] ✗ Desistindo de ${mod} após ${MAX_RETRIES} tentativas: ${reason}`);
            completed++;
            if (completed === MODULES.length) injectAll();
        }
    }

    function waitForGame() {
        if (typeof Game !== 'undefined' && Game.player_id) {
            console.log('[MultBot] Game detectado, baixando módulos...');
            MODULES.forEach((_, i) => fetchModule(i));
        } else {
            setTimeout(waitForGame, 500);
        }
    }

    waitForGame();
})();
