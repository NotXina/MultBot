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

    const BASE_URL = 'https://raw.githubusercontent.com/NotXina/MultBot/main';

    // Lock global para evitar conflito de Game.townId entre módulos
    window.__gp_townId_lock = false;

    const MODULES = [
        'multbot_base.js',           // ModernBot base completo
        'colonize_ship_sender.js',   // Envia colonize_ships automaticamente
        'mult_tools.js',             // Preset de construções em massa
    ];

    function loadModule(index) {
        if (index >= MODULES.length) {
            console.log('[MultBot] ✓ Todos os módulos carregados!');
            return;
        }
        const mod = MODULES[index];
        GM_xmlhttpRequest({
            method:  'GET',
            url:     `${BASE_URL}/${mod}?_=${Date.now()}`,
            headers: { 'Cache-Control': 'no-cache' },
            onload(r) {
                if (r.status === 200) {
                    try {
                        new Function(r.responseText)();
                        console.log(`[MultBot] ✓ ${mod}`);
                    } catch(e) {
                        console.error(`[MultBot] ✗ Erro em ${mod}:`, e.message);
                    }
                } else {
                    console.error(`[MultBot] ✗ HTTP ${r.status} ao carregar ${mod}`);
                }
                loadModule(index + 1);
            },
            onerror() {
                console.error(`[MultBot] ✗ Falha de rede: ${mod}`);
                loadModule(index + 1);
            }
        });
    }

    function waitForGame() {
        if (typeof Game !== 'undefined' && Game.player_id) {
            console.log('[MultBot] Game detectado, carregando módulos...');
            loadModule(0);
        } else {
            setTimeout(waitForGame, 500);
        }
    }

    waitForGame();
})();
