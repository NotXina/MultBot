// ==UserScript==
// @name         MultBot
// @author       NotXina
// @description  Automação modular para Grepolis: construção, recrutamento, ataque, defesa, farm e mais.
// @version      1.8.0
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
        'auto_quest.js',
        'sniper.js',
        'discord_alert.js',
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
           de virar um identificador global. A flag __multbot_classes_declared__
           e marcada como a PRIMEIRA linha executada, ANTES de qualquer
           "class" - diferente de checar uw.multBot (que so existe
           depois que TODA a inicializacao termina, deixando uma janela
           de corrida de segundos onde duas execucoes quase simultaneas
           passam pela checagem antes de qualquer uma declarar algo).
           Com a flag marcada primeiro, a segunda tentativa - mesmo que
           comece so alguns milissegundos depois - ja encontra a flag
           true e aborta ANTES de tentar declarar qualquer classe. */
        const fullCode =
            '(function () {\n' +
            '  var __uw = (typeof unsafeWindow == "undefined") ? window : unsafeWindow;\n' +
            '  if (__uw.__multbot_classes_declared__) {\n' +
            '    console.warn("[MultBot] \\u26a0 Classes ja declaradas nesta pagina - reinjecao abortada antes de declarar qualquer classe.");\n' +
            '    return;\n' +
            '  }\n' +
            '  __uw.__multbot_classes_declared__ = true;\n' +
            codes.join('\n\n') +
            '\n})();';

        /* Usa new Function(...) em vez de um <script> tag: um <script>
           injetado executa como um "top-level script" a parte - se der
           SyntaxError (ex: redeclaracao de classe, apesar de tudo
           acima), esse erro NAO pode ser capturado por nenhum try/catch
           nosso, aparecendo sempre como "Uncaught" no console mesmo com
           todas as protecoes. new Function() parseia o codigo de forma
           sincrona e catchavel - se por algum motivo ainda assim colidir
           com algo ja declarado na pagina, viramos um aviso tratado em
           vez de deixar estourar solto pro usuario. */
        try {
            const runBundle = new Function(fullCode);
            runBundle();
            console.log('[MultBot] ✓ Todos os módulos injetados! (index.js v1.8.0)');
        } catch (e) {
            /* Se AINDA ASSIM colidir (ex: essa PRIMEIRA tentativa real
               esbarrando em lixo de uma sessao anterior preservada pelo
               bfcache do navegador, ou uma extensao que reinjeta o
               userscript sem recarregar a pagina de verdade), nao tem
               como "desdeclarar" uma classe ja existente no ambiente JS
               em tempo de execucao - a unica saida real e um reload
               completo da pagina (Ctrl+Shift+R). Deixamos isso bem
               explicito no aviso, em vez de so logar o erro tecnico. */
            console.warn('[MultBot] ⚠ Falha ao injetar o bundle: ' + (e?.message ?? e));
            console.warn('[MultBot] ⚠ Se o bot não carregou, dê um refresh completo na página (Ctrl+Shift+R) — o ambiente JS desta aba ficou com resíduo de uma execução anterior que não dá pra limpar sem recarregar.');
        }
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
