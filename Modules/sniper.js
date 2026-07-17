// ══════════════════════════════════════════════════════
//  MODULE: Sniper
//  Agenda o ENVIO de um ataque/apoio pra que ele CHEGUE num
//  horario exato escolhido pelo jogador.
//
//  Fluxo (assistido, nao 100% automatico):
//  1. Jogador abre a janela nativa de ataque/apoio normalmente,
//     escolhe tropas e o alvo (do jeito que sempre faz).
//  2. O Sniper detecta essa janela via MutationObserver (nao
//     depende do GameEvents.window.open - confirmado que essa
//     janela especifica e "old style" e nao passa por la) e
//     injeta um painel extra com data/hora de chegada desejada
//     (data pre-preenchida com hoje).
//  3. Ao clicar "Agendar", le o "way_duration" (tempo de viagem)
//     DIRETO DO DOM - ja calculado pelo proprio jogo, sem risco
//     de formula errada - e calcula o horario de ENVIO
//     (chegada - duracao - compensacao de rede).
//  4. O agendamento fica salvo (sobrevive a fechar a janela e
//     ate a um reload da pagina). O disparo usa setTimeout
//     calculado pro momento EXATO (nao fica preso a um poll
//     periodico, que sozinho ja seria uma fonte de atraso) - um
//     poller de 5s continua rodando so como rede de seguranca
//     (ex: caso a pagina tenha sido reaberta e o setTimeout
//     original tenha se perdido).
//
//  IMPORTANTE - limitacao de navegador: setTimeout em abas em
//  SEGUNDO PLANO pode atrasar (throttling do navegador, ate 1+
//  minuto em casos extremos). Pra precisao de sniper, a aba do
//  jogo precisa ficar em primeiro plano perto do horario
//  agendado. A "Compensacao de rede" ajuda a compensar o atraso
//  entre o disparo local e o servidor realmente registrar o
//  envio, mas nao compensa esse throttling do navegador.
// ══════════════════════════════════════════════════════
var Sniper = class extends MultUtil {
    constructor(c, s) {
        super(c, s);
        this._scheduled = this.storage.load('sniper_scheduled', []);
        this._observer = null;
        this._checkerInterval = null;
        this._armedTimeouts = {};

        this._startWatching();
        this._startChecker();
        this._armAllPending();
    }

    settings = () => {
        requestAnimationFrame(() => this._renderList());

        return `
        <div class="game_border" style="margin-bottom:20px;">
            <div class="game_border_top"></div><div class="game_border_bottom"></div>
            <div class="game_border_left"></div><div class="game_border_right"></div>
            <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>
            <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>
            <div class="game_header bold">${this.t('sniper_title')}</div>
            <div style="padding:8px 10px 4px;font-weight:bold;">
                ${this.t('sniper_desc')}
            </div>
            <div style="padding:0 10px 6px;font-size:11px;color:#8a5a2a;">
                ⚠ ${this.t('sniper_background_warning')}
            </div>
            <div id="sniper_list" style="padding:0 10px 10px;"></div>
        </div>`;
    };

    /* Observa a pagina inteira por qualquer elemento que apareca
       com a classe "attack_support_window" - a janela nativa de
       ataque/apoio. Nao depende de GameEvents.window.open
       (confirmado nao funcionar pra essa janela especifica). */
    _startWatching() {
        if (this._observer) return;

        this._observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    let el = null;
                    if (node.classList && node.classList.contains('attack_support_window')) {
                        el = node;
                    } else if (node.querySelector) {
                        el = node.querySelector('.attack_support_window');
                    }
                    if (el) this._onWindowFound(el);
                }
            }
        });

        this._observer.observe(document.body, { childList: true, subtree: true });
    }

    _onWindowFound(windowEl) {
        try {
            // Evita injetar duas vezes na mesma janela
            if (windowEl.querySelector('.mult_sniper_panel')) return;

            // Extrai o target_id do nome da classe:
            // attack_support_tab_target_34908 -> 34908
            const classAttr = windowEl.className || '';
            const match = classAttr.match(/attack_support_tab_target_(\d+)/);
            const targetId = match ? match[1] : null;
            if (!targetId) return;

            const today = new Date();
            const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');

            const panelId = 'mult_sniper_panel_' + targetId;
            const panel = document.createElement('div');
            panel.className = 'mult_sniper_panel';
            panel.id = panelId;
            panel.style.cssText = 'width:100%;box-sizing:border-box;margin-top:10px;padding:10px 12px;border:1px solid #a3803f;border-radius:6px;background:linear-gradient(180deg, rgba(255,246,222,0.9), rgba(240,222,180,0.7));box-shadow:0 1px 3px rgba(0,0,0,0.15);clear:both;';
            panel.innerHTML = `
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                    <span style="font-size:16px;">🎯</span>
                    <span style="font-weight:bold;font-size:12px;color:#5a3a0a;">${this.t('sniper_panel_title')}</span>
                </div>
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                    <input type="date" class="mult_sniper_date" value="${todayStr}" style="padding:3px 5px;border-radius:3px;border:1px solid #b8935a;font-size:11px;" />
                    <input type="time" class="mult_sniper_time" step="1" style="padding:3px 5px;border-radius:3px;border:1px solid #b8935a;font-size:11px;" />
                    <div class="button_new" style="cursor:pointer;margin:0;" data-target-id="${targetId}">
                        <div class="left"></div><div class="right"></div>
                        <div class="caption js-caption">🎯 ${this.t('sniper_schedule_btn')}<div class="effect js-effect"></div></div>
                    </div>
                </div>
                <div class="mult_sniper_status" style="font-size:10.5px;margin-top:5px;color:#5a3a0a;"></div>
            `;

            // Insere no FINAL da janela inteira (largura total), nao numa
            // barra lateral estreita - windowEl e um bloco que ocupa a
            // largura toda da janela nativa.
            windowEl.appendChild(panel);

            panel.querySelector('.button_new').addEventListener('click', (ev) => {
                this._onScheduleClick(windowEl, targetId, panel);
            });
        } catch (e) {
            this.console.log('[Sniper] ' + this.t('sniper_inject_error', { msg: e?.message ?? e }));
        }
    }

    /* Generico: entre todos os elementos que baterem com o
       seletor dentro de root, retorna o primeiro que estiver
       VISIVEL na tela (nao escondido pela aba inativa). */
    _getVisibleEl(root, selector) {
        try {
            const els = root.querySelectorAll(selector);
            for (const el of els) {
                if (el.offsetParent !== null) return el;
            }
            return els[0] || null;
        } catch (e) {
            return null;
        }
    }

    /* Retorna o formulario de envio VISIVEL no momento - a janela
       de ataque/apoio pode manter os dois formularios (aba Atacar
       e aba Apoiar) no mesmo DOM ao mesmo tempo, so alternando
       visibilidade via CSS. Pegar "o primeiro que aparecer" sem
       checar visibilidade arriscaria ler o formulario ERRADO (ex:
       ler "attack" mesmo com a aba Apoiar selecionada). */
    _getActiveForm(windowEl) {
        return this._getVisibleEl(windowEl, '.send_units_form');
    }

    _onScheduleClick(windowEl, targetId, panel) {
        try {
            const statusEl = panel.querySelector('.mult_sniper_status');
            const dateVal = panel.querySelector('.mult_sniper_date').value;
            const timeVal = panel.querySelector('.mult_sniper_time').value;

            if (!dateVal || !timeVal) {
                statusEl.textContent = this.t('sniper_missing_datetime');
                statusEl.style.color = '#c0392b';
                return;
            }

            const arrivalDate = new Date(`${dateVal}T${timeVal}`);
            if (isNaN(arrivalDate.getTime())) {
                statusEl.textContent = this.t('sniper_invalid_datetime');
                statusEl.style.color = '#c0392b';
                return;
            }

            const wayDurationEl = this._getVisibleEl(windowEl, '.way_duration');
            if (!wayDurationEl) {
                statusEl.textContent = this.t('sniper_no_duration_found');
                statusEl.style.color = '#c0392b';
                return;
            }
            const durationSeconds = this._parseDuration(wayDurationEl.textContent);
            if (durationSeconds === null) {
                statusEl.textContent = this.t('sniper_duration_parse_error', { raw: wayDurationEl.textContent });
                statusEl.style.color = '#c0392b';
                return;
            }

            const sendAt = arrivalDate.getTime() - (durationSeconds * 1000);
            if (sendAt <= Date.now()) {
                statusEl.textContent = this.t('sniper_too_late', { duration: this._formatDuration(durationSeconds) });
                statusEl.style.color = '#c0392b';
                return;
            }

            const formEl = this._getActiveForm(windowEl);
            const commandType = formEl?.dataset?.type || formEl?.getAttribute('data-type') || 'attack';

            // Escopo de leitura da composicao: o container que envolve o
            // formulario ativo (nao a janela toda), pra nao pegar por
            // engano os inputs da OUTRA aba (Atacar vs Apoiar) se os
            // dois estiverem no mesmo DOM.
            const compositionScope = formEl?.closest('.town_units_wrapper') || formEl || windowEl;
            const composition = this._readComposition(compositionScope);
            if (!composition || Object.keys(composition).length === 0) {
                statusEl.textContent = this.t('sniper_no_units_found');
                statusEl.style.color = '#c0392b';
                return;
            }

            const originTownId = uw.ITowns.getCurrentTown().id;
            const targetName = this._getTargetNameFromWindow(windowEl) || ('#' + targetId);

            const snipe = {
                id: Date.now() + '_' + Math.floor(Math.random() * 10000),
                originTownId,
                targetId,
                targetName,
                type: commandType,
                composition,
                sendAt,
                arrivalAt: arrivalDate.getTime(),
                durationSeconds,
                status: 'pending',
            };

            this._scheduled.push(snipe);
            this.storage.save('sniper_scheduled', this._scheduled);
            this._armTimeout(snipe);

            const compSummary = Object.entries(composition).map(([u, n]) => `${n}x ${this.getGameName('unit', u)}`).join(', ');
            statusEl.innerHTML = '✓ ' + this.t('sniper_scheduled_ok', { time: arrivalDate.toLocaleString() });
            statusEl.style.color = '#1a6b2a';
            statusEl.style.fontWeight = 'bold';

            this.console.log('[Sniper] ' + this.t('sniper_scheduled_log', {
                target: targetName, type: commandType, comp: compSummary,
                send: new Date(sendAt).toLocaleString(), arrival: arrivalDate.toLocaleString()
            }));

            this._renderList();
        } catch (e) {
            this.console.log('[Sniper] ' + this.t('sniper_schedule_error', { msg: e?.message ?? e }));
        }
    }

    /* PENDENTE DE CONFIRMACAO: a leitura dos campos de quantidade
       de tropa ainda depende de confirmar o id/name exato desses
       inputs no DOM real do jogo. Estrutura abaixo e uma tentativa
       razoavel (baseada no padrao id="unit_id_wrap_<unidade>" tipico
       do Grepolis) mas NAO deve ser usada em producao sem validar
       contra uma captura real - o preview no console (compSummary
       acima) existe justamente pra conferir visualmente antes de
       confiar no agendamento. */
    /* CONFIRMADO via codigo fonte real do jogo
       (WndHandlerAttack.prototype.getSelectedUnits): o seletor certo
       e "input.unit_input" - cada input tem .name (id da unidade) e
       .value (quantidade). Antes isso era uma tentativa adivinhada
       (3 seletores diferentes, nenhum confirmado). */
    _readComposition(windowEl) {
        const composition = {};
        try {
            const inputs = windowEl.querySelectorAll('input.unit_input');
            inputs.forEach((input) => {
                const name = input.name;
                const val = parseInt(input.value, 10);
                if (name && val > 0) composition[name] = val;
            });
        } catch (e) {
            this.console.log('[Sniper] ' + this.t('sniper_read_composition_error', { msg: e?.message ?? e }));
        }
        return composition;
    }

    _getTargetNameFromWindow(windowEl) {
        try {
            const titleEl = windowEl.closest('.js-window-main-container')?.querySelector('.window_header, .title');
            return titleEl ? titleEl.textContent.trim() : null;
        } catch (e) {
            return null;
        }
    }

    /* Converte "~00:09:42" (ou "00:09:42") em segundos totais. */
    _parseDuration(raw) {
        if (!raw) return null;
        const clean = raw.replace('~', '').trim();
        const parts = clean.split(':').map(Number);
        if (parts.length !== 3 || parts.some(isNaN)) return null;
        const [h, m, s] = parts;
        return h * 3600 + m * 60 + s;
    }

    _formatDuration(totalSeconds) {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
    }

    /* Agenda um setTimeout PRECISO pro momento exato de disparo
       (sendAt - compensacao de rede), em vez de depender so do
       poller periodico - um poll de 5s sozinho ja seria uma fonte
       de ate 5s de atraso, o que explica o "nao foi pontual"
       observado. O poller de 5s continua rodando como rede de
       seguranca (ex: se a pagina foi fechada e reaberta, o
       setTimeout anterior se perdeu, mas o poller pega no proximo
       ciclo). */
    _armTimeout(snipe) {
        if (this._armedTimeouts[snipe.id]) clearTimeout(this._armedTimeouts[snipe.id]);

        const delay = snipe.sendAt - Date.now();

        if (delay <= 0) {
            this._fireIfPending(snipe.id);
            return;
        }

        this._armedTimeouts[snipe.id] = setTimeout(() => this._fireIfPending(snipe.id), delay);
    }

    _armAllPending() {
        for (const snipe of this._scheduled) {
            if (snipe.status === 'pending') this._armTimeout(snipe);
        }
    }

    /* Rede de seguranca: roda a cada 5s, pega qualquer agendamento
       pendente que por algum motivo o setTimeout nao tenha
       disparado (ex: pagina recarregada). respectSleep=false: um
       agendamento de horario exato nao deve ser pausado pelo
       Sleeper - o jogador pediu explicitamente esse horario. */
    _startChecker() {
        this._checkerInterval = this.createGuardedInterval(() => this._checkDue(), 5000, false);
    }

    async _checkDue() {
        const now = Date.now();
        const due = this._scheduled.filter(s => s.status === 'pending' && s.sendAt <= now);
        for (const snipe of due) {
            await this._fireIfPending(snipe.id);
        }
    }

    /* FIX: bug de concorrencia real - o setTimeout exato e o poller
       de seguranca de 5s podem disparar quase ao mesmo tempo pro
       MESMO agendamento. Como o status so mudava pra 'sent'/'failed'
       DEPOIS que a chamada de rede terminava (dentro de _fire), os
       dois caminhos podiam ver 'pending' ainda e disparar o envio
       DUAS VEZES. Agora trava como 'firing' de forma SINCRONA, antes
       de qualquer await - fecha a janela de corrida por completo. */
    async _fireIfPending(id) {
        const snipe = this._scheduled.find(s => s.id === id);
        if (!snipe || snipe.status !== 'pending') return;

        snipe.status = 'firing';

        if (this._armedTimeouts[id]) {
            clearTimeout(this._armedTimeouts[id]);
            delete this._armedTimeouts[id];
        }

        await this._fire(snipe);
        this.storage.save('sniper_scheduled', this._scheduled);
        this._renderList();
    }

    /* Confirmado via captura real: cancelar um envio usa
       frontend_bridge/execute com model_url:"Commands",
       action_name:"cancelCommand", arguments:{id:<command_id>}. So
       funciona por um tempo curto depois do envio (o campo
       cancelable_until do movimento diz ate quando). */
    /* Confirmado via captura real de rede: cancelar usa command_info
       (controller) / cancel_command (action), payload direto
       {id, town_id, nl_init} - NAO e frontend_bridge/execute com
       model_url "Commands" como eu tinha suposto antes (esse era o
       endpoint errado, nunca confirmado por captura). */
    async _cancelCommand(townId, commandId) {
        try {
            const data = {
                id: parseInt(commandId, 10),
                town_id: parseInt(townId, 10),
                nl_init: true,
            };
            const res = await this.ajaxPostWithTimeout('command_info', 'cancel_command', data);
            return !!(res && !res.error);
        } catch (e) {
            this.console.log('[Sniper] ' + this.t('sniper_cancel_error', { msg: e?.message ?? e }));
            return false;
        }
    }

    /* IDs de comandos JA existentes entre essas duas cidades antes de
       disparar - usado pra achar sem ambiguidade qual comando NOVO
       apareceu depois do envio. Nao filtra mais por "tipo" exato -
       o campo type do movimento pode ter uma variacao (ex: "normal",
       um subtipo de ataque) diferente do "attack"/"support" que a
       gente mandou, o que causava falso-negativo (nunca achava o
       comando, mesmo ele existindo). Origem+destino ja e suficiente
       pra identificar sem ambiguidade nesse contexto. */
    _getExistingCommandIds(originId, targetId) {
        const ids = new Set();
        try {
            const models = uw.MM.getModels().MovementsUnits;
            for (const key in models) {
                const mv = models[key]?.attributes;
                if (!mv) continue;
                if (String(mv.home_town_id) !== String(originId)) continue;
                if (String(mv.target_town_id) !== String(targetId)) continue;
                ids.add(mv.command_id ?? mv.id);
            }
        } catch (e) {}
        return ids;
    }

    /* Acha o comando NOVO que apareceu depois do envio (nao estava no
       conjunto "antes"). Aumentado de 6 tentativas (~1.8s) pra 15
       tentativas (~6s) com espera maior - o movimento pode demorar
       mais que o esperado inicialmente pra aparecer na collection
       local depois do envio. */
    /* Acha o comando NOVO que apareceu depois do envio (nao estava no
       conjunto "antes"). Reduzido de 15 tentativas/400ms (ate 6s) pra
       8 tentativas/200ms (ate 1.6s) - a busca longa estava consumindo
       o tempo que sobrava pra decidir se vale cancelar e tentar de
       novo (tempo antes da chegada / antes da janela de cancelamento
       fechar), fazendo o retry desistir na primeira tentativa mesmo
       quando ainda daria tempo de corrigir. */
    async _findNewCommand(originId, targetId, existingIds) {
        for (let attempt = 0; attempt < 8; attempt++) {
            try {
                const models = uw.MM.getModels().MovementsUnits;
                for (const key in models) {
                    const mv = models[key]?.attributes;
                    if (!mv) continue;
                    if (String(mv.home_town_id) !== String(originId)) continue;
                    if (String(mv.target_town_id) !== String(targetId)) continue;
                    const cid = mv.command_id ?? mv.id;
                    if (existingIds.has(cid)) continue;
                    return mv;
                }
            } catch (e) {}
            await this.sleep(200);
        }
        return null;
    }

    /* Um unico envio - manda e retorna o comando resultante (se
       achou), sem decidir nada sobre repetir. */
    async _fireOnce(snipe) {
        const data = {
            ...snipe.composition,
            id: parseInt(snipe.targetId, 10),
            type: snipe.type,
            town_id: parseInt(snipe.originTownId, 10),
            nl_init: true,
        };

        const existingIds = this._getExistingCommandIds(snipe.originTownId, snipe.targetId);
        const res = await this.ajaxPostWithTimeout('town_info', 'send_units', data);

        if (!res || res.error) {
            return { ok: false, error: res?.error ?? '?' };
        }

        const command = await this._findNewCommand(snipe.originTownId, snipe.targetId, existingIds);
        return { ok: true, command };
    }

    /* Tenta ate 10 vezes: envia, confere o horario REAL de chegada
       (que o proprio jogo calculou pro comando resultante) contra o
       desejado, e se nao bater dentro de 1 segundo de tolerancia -
       E ainda der tempo e tentativas - cancela e tenta de novo.
       Pedido explicitamente: imitar tentativa humana repetida ate
       acertar o segundo exato, em vez de confiar cegamente no
       primeiro envio. */
    /* Faixa aceitavel por tipo de comando (assimetrica, nao +/- igual):
       - Ataque: nunca atrasado (perderia a janela certa) - aceita de
         1s adiantado ate exatamente no horario (min:-1, max:0).
       - Apoio: nunca adiantado (nao ajuda em nada chegar cedo) -
         aceita do horario exato ate 2s atrasado (min:0, max:2). */
    _getToleranceRange(type) {
        if (type === 'support') return { min: 0, max: 2 };
        return { min: -1, max: 0 }; // attack (padrao)
    }

    /* Tenta ate MAX_ATTEMPTS vezes: envia, confere o horario REAL de
       chegada (que o proprio jogo calculou pro comando resultante)
       contra o desejado, e se nao bater dentro da janela aceitavel -
       cancela e ESPERA de verdade as tropas voltarem (elas nao ficam
       disponiveis na hora so por cancelar) antes de reenviar. So
       desiste se realmente nao sobrar tempo antes da chegada
       desejada. Pedido explicitamente: ser mais insistente, mesmo
       que precise esperar o retorno das tropas entre tentativas. */
    /* Faixa aceitavel por tipo de comando (assimetrica, nao +/- igual):
       - Ataque: nunca atrasado (perderia a janela certa) - aceita de
         1s adiantado ate exatamente no horario (min:-1, max:0).
       - Apoio: nunca adiantado (nao ajuda em nada chegar cedo) -
         aceita do horario exato ate 2s atrasado (min:0, max:2). */
    _getToleranceRange(type) {
        if (type === 'support') return { min: 0, max: 2 };
        return { min: -1, max: 0 }; // attack (padrao)
    }

    /* Espera a MESMA composicao ficar disponivel de novo na cidade de
       origem (depois de cancelar um envio, as tropas voltam aos
       poucos, nao na hora) - poll a cada 500ms, ate maxWaitMs ou ate
       ficar pronto, o que vier primeiro. */
    async _waitForTroopsAvailable(snipe, maxWaitMs) {
        const start = Date.now();
        while (Date.now() - start < maxWaitMs) {
            try {
                const town = uw.ITowns.towns[snipe.originTownId];
                const available = town ? town.units() : {};
                const ready = Object.entries(snipe.composition).every(
                    ([unit, qty]) => (available[unit] || 0) >= qty
                );
                if (ready) return true;
            } catch (e) {}
            await this.sleep(500);
        }
        return false;
    }

    async _fire(snipe) {
        const MAX_ATTEMPTS = 30;
        const { min: toleranceMin, max: toleranceMax } = this._getToleranceRange(snipe.type);

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                const result = await this._fireOnce(snipe);

                if (!result.ok) {
                    snipe.status = 'failed';
                    snipe.error = result.error;
                    this.console.log('[Sniper] ' + this.t('sniper_fired_fail', { target: snipe.targetName, reason: snipe.error }));
                    return;
                }

                if (!result.command) {
                    // Enviou mas nao achou o comando resultante pra conferir -
                    // aceita como enviado, nao arrisca cancelar as cegas.
                    snipe.status = 'sent';
                    const msg = this.t('sniper_fired_ok', { target: snipe.targetName });
                    this.console.log('[Sniper] ' + msg + ' ' + this.t('sniper_no_command_found'));
                    if (uw.HumanMessage) uw.HumanMessage.success('MultBot Sniper: ' + msg);
                    return;
                }

                const actualArrivalSec = result.command.arrival_at;
                const desiredArrivalSec = Math.floor(snipe.arrivalAt / 1000);
                const diffSeconds = actualArrivalSec - desiredArrivalSec;

                this.console.log('[Sniper] ' + this.t('sniper_attempt_log', {
                    attempt, max: MAX_ATTEMPTS, target: snipe.targetName, diff: diffSeconds,
                }));

                if (diffSeconds >= toleranceMin && diffSeconds <= toleranceMax) {
                    snipe.status = 'sent';
                    const msg = this.t('sniper_fired_ok_precise', { target: snipe.targetName, diff: diffSeconds });
                    this.console.log('[Sniper] ' + msg);
                    if (uw.HumanMessage) uw.HumanMessage.success('MultBot Sniper: ' + msg);
                    return;
                }

                // Nao bateu - checa se ainda vale a pena cancelar e tentar
                // de novo: precisa ainda ser cancelavel, e precisa sobrar
                // tempo suficiente pra (1) as tropas voltarem e (2) viajar
                // de novo ate o alvo antes do horario desejado.
                // FIX: usa a duracao de viagem OBSERVADA nesse proprio
                // envio (arrival_at real menos agora), nao mais a
                // estimativa original do way_duration - se a viagem real
                // for mais rapida que a estimada (diff negativo, chegou
                // adiantado), usar a estimativa antiga (mais lenta) fazia
                // a conta dar negativa e desistir na hora, mesmo sobrando
                // tempo de verdade.
                const cancelableUntil = result.command.cancelable_until;
                const canCancel = cancelableUntil && (Date.now() / 1000) < cancelableUntil;
                const observedTravelMs = Math.max(0, (actualArrivalSec * 1000) - Date.now());
                const timeLeftMs = snipe.arrivalAt - Date.now();
                const maxWaitForTroopsMs = timeLeftMs - observedTravelMs - 1000; // 1s de folga pro reenvio em si

                if (attempt === MAX_ATTEMPTS || !canCancel || maxWaitForTroopsMs < 500) {
                    snipe.status = 'sent';
                    const msg = this.t('sniper_fired_ok_imprecise', { target: snipe.targetName, diff: diffSeconds, attempts: attempt });
                    this.console.log('[Sniper] ' + msg);
                    if (uw.HumanMessage) uw.HumanMessage.success('MultBot Sniper: ' + msg);
                    return;
                }

                await this._cancelCommand(snipe.originTownId, result.command.command_id);
                this.console.log('[Sniper] ' + this.t('sniper_waiting_troops_log', { target: snipe.targetName }));

                const troopsReady = await this._waitForTroopsAvailable(snipe, maxWaitForTroopsMs);
                if (!troopsReady) {
                    // As tropas nao voltaram a tempo - nao da mais pra
                    // reenviar e chegar no horario. O comando anterior ja
                    // foi cancelado, entao registra como falha (melhor ser
                    // honesto que fingir sucesso de um envio que nao existe
                    // mais).
                    snipe.status = 'failed';
                    snipe.error = this.t('sniper_troops_not_back_error');
                    this.console.log('[Sniper] ' + this.t('sniper_fired_fail', { target: snipe.targetName, reason: snipe.error }));
                    return;
                }
            } catch (e) {
                snipe.status = 'failed';
                snipe.error = e?.message ?? String(e);
                this.console.log('[Sniper] ' + this.t('sniper_fired_fail', { target: snipe.targetName, reason: snipe.error }));
                return;
            }
        }
    }

    cancelSnipe = (id) => {
        if (this._armedTimeouts[id]) {
            clearTimeout(this._armedTimeouts[id]);
            delete this._armedTimeouts[id];
        }
        this._scheduled = this._scheduled.filter(s => s.id !== id);
        this.storage.save('sniper_scheduled', this._scheduled);
        this._renderList();
        this.console.log('[Sniper] ' + this.t('sniper_cancelled_log'));
    };

    _renderList() {
        try {
            const sorted = this._scheduled.slice().sort((a, b) => a.sendAt - b.sendAt);
            const nextPendingId = sorted.find(s => s.status === 'pending')?.id;

            const STATUS_STYLE = {
                pending: { bg: '#fdf1d6', fg: '#8a5a0a', label: this.t('sniper_status_pending') },
                firing:  { bg: '#e0e8f5', fg: '#3a5a9a', label: this.t('sniper_status_firing') },
                sent:    { bg: '#dff3e3', fg: '#1a6b2a', label: this.t('sniper_status_sent') },
                failed:  { bg: '#fbe0e0', fg: '#c0392b', label: this.t('sniper_status_failed') },
            };

            const rows = sorted.map(s => {
                const compSummary = Object.entries(s.composition || {}).map(([u, n]) => `${n}x ${this.getGameName('unit', u)}`).join(', ');
                const st = STATUS_STYLE[s.status] || { bg: '#eee', fg: '#555', label: s.status };
                const isNext = s.id === nextPendingId;
                const cancelBtn = s.status === 'pending'
                    ? `<span onclick="window.multBot.sniper.cancelSnipe('${s.id}')" title="${this.t('sniper_cancel_tooltip')}" style="cursor:pointer;color:#c0392b;font-weight:bold;margin-left:10px;font-size:13px;">✕</span>`
                    : '';
                const typeIcon = s.type === 'attack' ? '⚔️' : '🛡️';

                return `
                <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:8px 10px;margin-bottom:5px;border-radius:6px;font-size:11.5px;
                    background:${isNext ? 'rgba(255, 215, 130, 0.25)' : 'rgba(0,0,0,0.025)'};
                    border-left:3px solid ${isNext ? '#c9a227' : 'transparent'};">
                    <div>
                        <div style="font-weight:bold;color:#3a2a0a;">${typeIcon} ${s.targetName}</div>
                        <div style="color:#6a5a3a;margin-top:1px;">${compSummary}</div>
                        <div style="color:#8a7a5a;font-size:10.5px;margin-top:2px;">${this.t('sniper_row_arrival', { time: new Date(s.arrivalAt).toLocaleString() })}</div>
                    </div>
                    <div style="text-align:right;white-space:nowrap;">
                        <span style="background:${st.bg};color:${st.fg};padding:2px 8px;border-radius:10px;font-weight:bold;font-size:10.5px;">${st.label}</span>
                        ${cancelBtn}
                    </div>
                </div>`;
            }).join('');

            uw.$('#sniper_list').html(rows || `<div style="font-size:11px;color:#8a7a5a;padding:10px;text-align:center;">${this.t('sniper_none_scheduled')}</div>`);
        } catch (e) {}
    }
};
