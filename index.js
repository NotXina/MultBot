// ==UserScript==
// @name         MultBot
// @author       NotXina
// @description  Automação modular para Grepolis: construção, recrutamento, ataque, defesa, farm e mais.
// @version      1.4.1
// @match        http://*.grepolis.com/game/*
// @match        https://*.grepolis.com/game/*
// @grant        none
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/NotXina/MultBot/main/index.js
// @downloadURL  https://raw.githubusercontent.com/NotXina/MultBot/main/index.js
// ==/UserScript==

(function () {
    'use strict';

    /* uw aponta pra janela REAL da pagina (unsafeWindow), igual ao
       resto do projeto (core.js, multbot.js, etc). Isso importa aqui:
       em alguns gerenciadores de userscript (ex: a extensao nativa
       "UserScripts" do Firefox), o `window` do proprio script pode
       rodar isolado da pagina real - um guard em `window` puro pode
       nao "grudar" se o script for reinjetado sem reload completo
       (ex: troca de tela dentro do Grepolis sem F5), causando SyntaxError
       de redeclaracao de classe quando os modulos sao injetados de novo
       em cima do que ja estava la. */
    var uw;
    if (typeof unsafeWindow == 'undefined') {
        uw = window;
    } else {
        uw = unsafeWindow;
    }

    if (uw.__multbot_index_running__) {
        console.warn('[MultBot] ⚠ index.js já está rodando nesta página — execução duplicada ignorada.');
        return;
    }
    uw.__multbot_index_running__ = true;

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
        'auto_attack.js',
        'auto_ares_sacrifice.js',
        'auto_research.js',
        'auto_send_resources.js',
        'colonize_ship_sender.js',
        'mult_tools.js',
        'multbot.js',
    ];

    const codes = new Array(MODULES.length).fill(null);
    let completed = 0;

    function injectAll() {
        /* Segunda trava, agora bem na hora de injetar de fato no DOM
           real da pagina - mesmo que o guard la em cima (uw.__multbot_index_running__)
           tenha falhado por algum motivo (ex: sandbox reiniciado sem
           persistir a flag), essa aqui impede o <script> de subir duas
           vezes e recriar as classes em cima do que ja existe. */
        if (uw.__multbot_modules_injected__) {
            console.warn('[MultBot] ⚠ Módulos já haviam sido injetados nesta página — injeção duplicada bloqueada.');
            return;
        }
        uw.__multbot_modules_injected__ = true;

        /* Envolve o bundle inteiro numa IIFE: cada "class X" declarada
           por um modulo fica LOCAL a essa execucao especifica, em vez
           de virar um identificador global. Mesmo que injectAll() acabe
           rodando mais de uma vez por qualquer motivo (ex: o guard acima
           nao persistir por causa de isolamento de sandbox especifico
           de algum gerenciador de userscript), duas execucoes nunca mais
           colidem entre si com "Identifier X ja foi declarado" - cada
           uma tem seu proprio escopo de classes. O que precisa vazar pra
           fora (uw.multBot = new MultBot(), guardado por
           window.__multbot_loaded__ dentro do proprio multbot.js) continua
           funcionando normalmente, ja que "uw"/"window" dentro da IIFE
           ainda apontam pro escopo global de verdade - so as declaracoes
           de classe passam a ser locais. */
        const fullCode = '(function () {\n' + codes.join('\n\n') + '\n})();';
        const script = document.createElement('script');
        script.textContent = fullCode;
        document.head.appendChild(script);
        script.remove();
        console.log('[MultBot] ✓ Todos os módulos injetados! (index.js v1.4.1)');
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
            setTimeout(() => fetchModule(index, nextAttempt), 800 * nextAttempt);
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
