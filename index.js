// ==UserScript==
// @name         MultBot
// @author       NotXina
// @description  ModernBot aprimorado com módulos adicionais para Grepolis
// @version      1.0.0
// @match        http://*.grepolis.com/game/*
// @match        https://*.grepolis.com/game/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @require      http://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/NotXina/MultBot/main/index.js
// @downloadURL  https://raw.githubusercontent.com/NotXina/MultBot/main/index.js
// ==/UserScript==

(function () {
    'use strict';

    const BASE_URL = 'https://raw.githubusercontent.com/NotXina/MultBot/main/Modules';

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
        console.log('[MultBot] ✓ Todos os módulos injetados!');
    }

    function fetchModule(index) {
        const mod = MODULES[index];
        GM_xmlhttpRequest({
            method:  'GET',
            url:     `${BASE_URL}/${mod}?_=${Date.now()}`,
            headers: { 'Cache-Control': 'no-cache' },
            onload(r) {
                if (r.status === 200) {
                    codes[index] = r.responseText;
                    console.log(`[MultBot] ✓ baixado: ${mod}`);
                } else {
                    codes[index] = `console.error('[MultBot] HTTP ${r.status}: ${mod}');`;
                    console.error(`[MultBot] ✗ HTTP ${r.status}: ${mod}`);
                }
                completed++;
                if (completed === MODULES.length) injectAll();
            },
            onerror() {
                codes[index] = `console.error('[MultBot] Falha de rede: ${mod}');`;
                console.error(`[MultBot] ✗ Falha de rede: ${mod}`);
                completed++;
                if (completed === MODULES.length) injectAll();
            }
        });
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
