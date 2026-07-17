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
    // PDCA (pedido explicito - configuravel pela UI em vez de fixo no
    // codigo): valores default preservam o comportamento anterior.
    // - toleranceAttackSec/toleranceSupportSec: quantos segundos de
    //   folga sao aceitos SEM precisar re-tentar (a direcao continua
    //   fixa por seguranca - ataque nunca atrasa, apoio nunca
    //   adianta - so o TAMANHO da janela fica ajustavel).
    // - earlyMarginMs: quanto antes do horario calculado o envio
    //   dispara, pra cobrir atraso de rede entre o clique local e o
    //   servidor realmente registrar.

    DEFAULT_TOLERANCE_ATTACK_SEC = 1;
    DEFAULT_TOLERANCE_SUPPORT_SEC = 2;
    DEFAULT_EARLY_MARGIN_MS = 3000;

    constructor(c, s) {
        super(c, s);
        this._scheduled = this.storage.load('sniper_scheduled', []);
        this._observer = null;
        this._checkerInterval = null;
        this._armedTimeouts = {};

        this.toleranceAttackSec = this.storage.load('sniper_cfg_tol_attack', this.DEFAULT_TOLERANCE_ATTACK_SEC);
        this.toleranceSupportSec = this.storage.load('sniper_cfg_tol_support', this.DEFAULT_TOLERANCE_SUPPORT_SEC);
        this.earlyMarginMs = this.storage.load('sniper_cfg_early_margin', this.DEFAULT_EARLY_MARGIN_MS);

        this._startWatching();
        this._startChecker();
        this._armAllPending();
    }

    settings = () => {
        requestAnimationFrame(() => {
            this._renderList();
            this._bindConfigInputs();
        });

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
            <div style="padding:6px 10px;border-top:1px solid rgba(0,0,0,0.1);border-bottom:1px solid rgba(0,0,0,0.1);display:flex;flex-wrap:wrap;gap:12px;font-size:11px;">
                <label style="display:flex;align-items:center;gap:4px;" title="${this.t('sniper_cfg_tol_attack_tip')}">
                    ${this.t('sniper_cfg_tol_attack_label')}
                    <input type="number" id="sniper_cfg_tol_attack" min="0" max="10" step="1" value="${this.toleranceAttackSec}" style="width:42px;padding:2px;" />s
                </label>
                <label style="display:flex;align-items:center;gap:4px;" title="${this.t('sniper_cfg_tol_support_tip')}">
                    ${this.t('sniper_cfg_tol_support_label')}
                    <input type="number" id="sniper_cfg_tol_support" min="0" max="10" step="1" value="${this.toleranceSupportSec}" style="width:42px;padding:2px;" />s
                </label>
                <label style="display:flex;align-items:center;gap:4px;" title="${this.t('sniper_cfg_early_margin_tip')}">
                    ${this.t('sniper_cfg_early_margin_label')}
                    <input type="number" id="sniper_cfg_early_margin" min="0" max="15000" step="100" value="${this.earlyMarginMs}" style="width:58px;padding:2px;" />ms
                </label>
            </div>
            <div id="sniper_list" style="padding:0 10px 10px;"></div>
        </div>`;
    };

    /* Liga os campos de configuracao (tolerancia/margem/minimo de
       tentativas) - salva no storage a cada mudanca e valida os
       limites (nunca deixa negativo/NaN quebrar a logica de disparo). */
    _bindConfigInputs = () => {
        const bindNumber = (id, min, max, getter, setter, storageKey) => {
            const el = document.getElementById(id);
            if (!el || el.dataset.multBound) return;
            el.dataset.multBound = '1';
            el.addEventListener('change', () => {
                let val = parseInt(el.value, 10);
                if (isNaN(val)) val = getter();
                val = Math.min(max, Math.max(min, val));
                el.value = val;
                setter(val);
                this.storage.save(storageKey, val);
            });
        };

        bindNumber('sniper_cfg_tol_attack', 0, 10, () => this.toleranceAttackSec, v => this.toleranceAttackSec = v, 'sniper_cfg_tol_attack');
        bindNumber('sniper_cfg_tol_support', 0, 10, () => this.toleranceSupportSec, v => this.toleranceSupportSec = v, 'sniper_cfg_tol_support');
        bindNumber('sniper_cfg_early_margin', 0, 15000, () => this.earlyMarginMs, v => this.earlyMarginMs = v, 'sniper_cfg_early_margin');
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

            // Margem de seguranca fixa: dispara 3s mais cedo que o horario
            // calculado (chegada - duracao), ja desde a primeira tentativa -
            // pedido explicito, pra ter folga em vez de mirar exatamente
            // no limite.
            const sendAt = arrivalDate.getTime() - (durationSeconds * 1000) - this.earlyMarginMs;
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
            // FIX: CONFIRMADO via captura real do DOM (dump de todos os
            // elementos-folha da janela) - o seletor antigo (".window_header,
            // .title") pegava por engano os rotulos das ABAS INTERNAS da
            // janela ("Tipos", "Feiticos" - DIV.title), nunca o nome do
            // alvo de verdade. O nome real da cidade/jogador-alvo fica no
            // span padrao de titulo do jQuery UI Dialog (".ui-dialog-title",
            // ex: "OC54-02"), na barra de titulo da janela nativa.
            const titleEl = windowEl.closest('.js-window-main-container')?.querySelector('.ui-dialog-title');
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
       conjunto "antes"). Reduzido de 15 tentativas/400ms (ate 6s) pra
       8 tentativas/200ms (ate 1.6s) - a busca longa estava consumindo
       o tempo que sobrava pra decidir se vale cancelar e tentar de
       novo (tempo antes da chegada / antes da janela de cancelamento
       fechar), fazendo o retry desistir na primeira tentativa mesmo
       quando ainda daria tempo de corrigir. */
    async _findNewCommand(originId, targetId, existingIds) {
        // FIX (pedido explicito): reagir mais rapido a cada tentativa -
        // reduzido de 8x200ms (1.6s max) pra 16x100ms (1.6s max, mesmo
        // teto, mas detecta o comando novo em media 2x mais rapido) -
        // sobra mais tempo de verdade pro reenvio corrigido quando da
        // pra tentar de novo.
        for (let attempt = 0; attempt < 16; attempt++) {
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
            await this.sleep(100);
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
        // PDCA: tamanho da janela agora vem da configuracao (UI),
        // direcao continua fixa por seguranca - ataque nunca atrasa
        // (min sempre negativo/zero), apoio nunca adianta (max
        // sempre positivo/zero).
        if (type === 'support') return { min: 0, max: Math.max(0, this.toleranceSupportSec) };
        return { min: -Math.max(0, this.toleranceAttackSec), max: 0 }; // attack (padrao)
    }

    /* Espera a MESMA composicao ficar disponivel de novo na cidade de
       origem (depois de cancelar um envio, as tropas voltam aos
       poucos, nao na hora) - poll a cada 500ms, ate maxWaitMs ou ate
       ficar pronto, o que vier primeiro. */
    async _waitForTroopsAvailable(snipe, maxWaitMs) {
        // FIX (pedido explicito): poll de 500ms -> 200ms, pra detectar o
        // retorno das tropas mais rapido e sobrar mais tempo real pro
        // reenvio corrigido.
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
            await this.sleep(200);
        }
        return false;
    }

    async _fire(snipe) {
        const MAX_ATTEMPTS = 30;
        // PDCA (pedido explicito - "se acertar nao e pra cancelar"):
        // assim que uma tentativa cai dentro da tolerancia, o Sniper
        // finaliza NA HORA, seja na 1a tentativa ou na 10a - nunca
        // cancela um envio que ja esta certo so pra "completar" um
        // numero de tentativas.
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
                const withinTolerance = diffSeconds >= toleranceMin && diffSeconds <= toleranceMax;

                this.console.log('[Sniper] ' + this.t('sniper_attempt_log', {
                    attempt, max: MAX_ATTEMPTS, target: snipe.targetName, diff: diffSeconds,
                }));

                if (withinTolerance) {
                    // Acertou - encerra na hora, sem cancelar de novo.
                    snipe.status = 'sent';
                    const msg = this.t('sniper_fired_ok_precise', { target: snipe.targetName, diff: diffSeconds });
                    this.console.log('[Sniper] ' + msg);
                    if (uw.HumanMessage) uw.HumanMessage.success('MultBot Sniper: ' + msg);
                    return;
                }

                // FIX (pedido explicito): se chegou DEPOIS do horario
                // desejado (diffSeconds > toleranceMax), desiste na hora -
                // nao tenta de novo.
                // Motivo estrutural: so descobrimos que chegou atrasado
                // DEPOIS que a chegada real ja aconteceu, ou seja, o
                // horario desejado (snipe.arrivalAt) ja ficou no passado
                // no momento em que estamos avaliando esse resultado.
                // Reenviar nao pode "voltar no tempo" - qualquer novo
                // envio vai necessariamente chegar ainda mais tarde
                // (cancelar + esperar tropas + reenviar consome mais tempo
                // real).
                if (diffSeconds > toleranceMax) {
                    snipe.status = 'sent';
                    const msg = this.t('sniper_fired_ok_imprecise', { target: snipe.targetName, diff: diffSeconds, attempts: attempt, reason: this.t('sniper_reason_late_no_retry') });
                    this.console.log('[Sniper] ' + msg);
                    if (uw.HumanMessage) uw.HumanMessage.success('MultBot Sniper: ' + msg);
                    return;
                }

                // Chegou ADIANTADO, fora da tolerancia (se estivesse
                // dentro, ja teria retornado acima). Checa se ainda vale a
                // pena cancelar e tentar de novo: precisa ainda ser
                // cancelavel, e precisa sobrar tempo suficiente pra (1) as
                // tropas voltarem e (2) viajar de novo ate o alvo antes do
                // horario desejado. observedTravelMs: duracao de viagem
                // OBSERVADA nesse proprio envio (arrival_at real menos
                // agora) - mais confiavel que a estimativa original do
                // way_duration.
                const cancelableUntil = result.command.cancelable_until;
                const canCancel = cancelableUntil && (Date.now() / 1000) < cancelableUntil;
                const observedTravelMs = Math.max(0, (actualArrivalSec * 1000) - Date.now());
                const timeLeftMs = snipe.arrivalAt - Date.now();
                const maxWaitForTroopsMs = timeLeftMs - observedTravelMs - 1000; // 1s de folga pro reenvio em si

                if (attempt === MAX_ATTEMPTS || !canCancel || maxWaitForTroopsMs < 500) {
                    // Sem tempo/possibilidade real de mais um ciclo - desiste
                    // e registra como "sent" impreciso (chegou aqui porque
                    // NAO estava dentro da tolerancia - se estivesse, ja
                    // teria retornado no gate withinTolerance acima).
                    // DIAGNOSTICO: antes essa mensagem sempre dizia o mesmo
                    // texto generico ("ran out of time/attempts/cancel
                    // window"), sem dizer QUAL dos motivos foi. Agora
                    // aponta o motivo exato, pra nao precisar adivinhar na
                    // proxima vez que isso acontecer.
                    let reasonKey;
                    if (attempt === MAX_ATTEMPTS) reasonKey = 'sniper_reason_max_attempts';
                    else if (!canCancel) reasonKey = 'sniper_reason_not_cancelable';
                    else reasonKey = 'sniper_reason_no_time_for_retry';

                    snipe.status = 'sent';
                    const msg = this.t('sniper_fired_ok_imprecise', { target: snipe.targetName, diff: diffSeconds, attempts: attempt, reason: this.t(reasonKey) });
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

                // FIX PRINCIPAL: assim que as tropas voltam, o proximo
                // envio calcula o momento exato de disparo com a duracao
                // de viagem REAL observada (nao mais a estimativa
                // original) e ESPERA ate la antes de reenviar - mesma
                // logica usada no agendamento original (_onScheduleClick),
                // so que com o dado real em vez do estimado.
                const correctedSendAt = snipe.arrivalAt - observedTravelMs - this.earlyMarginMs;
                const waitForCorrectSendMs = correctedSendAt - Date.now();
                if (waitForCorrectSendMs > 0) {
                    await this.sleep(waitForCorrectSendMs);
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
