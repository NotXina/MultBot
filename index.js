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

    const BASE_URL = 'https://raw.githubusercontent.com/NotXina/MultBot/main/modules';

    // Lock global para evitar conflito de Game.townId entre módulos
    window.__gp_townId_lock = false;

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
        'colonize_ship_sender.js',
        'mult_tools.js',
        'multbot.js',
    ];

    // Injeta o código como <script> tag no DOM para garantir
    // que as classes ficam no escopo global da página
    function injectScript(code) {
        const script = document.createElement('script');
        script.textContent = code;
        document.head.appendChild(script);
        script.remove();
    }

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
                        injectScript(r.responseText);
                        console.log(`[MultBot] ✓ ${mod}`);
                    } catch(e) {
                        console.error(`[MultBot] ✗ Erro em ${mod}:`, e.message);
                    }
                } else {
                    console.error(`[MultBot] ✗ HTTP ${r.status}: ${mod}`);
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
