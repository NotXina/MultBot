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
        this._networkCompensationMs = this.storage.load('sniper_network_comp', 300);

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
            <div style="margin:0 10px 8px;padding:6px 8px;background:rgba(0,0,0,0.04);border-radius:5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <label style="font-size:11px;font-weight:bold;">${this.t('sniper_network_comp_label')}</label>
                <input type="number" id="sniper_network_comp_input" min="0" max="5000" step="50" value="${this._networkCompensationMs}" style="width:65px;padding:2px 5px;" />
                <span style="font-size:11px;">ms</span>
                ${this.getButtonHtml('sniper_network_comp_save', this.t('apply'), this._saveNetworkComp)}
                <span style="font-size:10px;color:#8a7a5a;">(${this.t('sniper_network_comp_hint')})</span>
            </div>
            <div id="sniper_list" style="padding:0 10px 10px;"></div>
        </div>`;
    };

    _saveNetworkComp = () => {
        const val = parseInt(uw.$('#sniper_network_comp_input').val(), 10);
        this._networkCompensationMs = (!isNaN(val) && val >= 0) ? val : 0;
        this.storage.save('sniper_network_comp', this._networkCompensationMs);
        this.console.log('[Sniper] ' + this.t('sniper_network_comp_saved_log', { ms: this._networkCompensationMs }));
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

            const closest = this._getClosestOwnTowns(windowEl, 5);
            const closestHtml = closest.length
                ? closest.map((t, i) => `<div style="display:flex;justify-content:space-between;padding:2px 0;">
                    <span>${i + 1}. ${t.name}</span>
                    <span style="color:#8a7a5a;">${this.t('sniper_distance_units', { dist: t.dist.toFixed(1) })}</span>
                   </div>`).join('')
                : `<div style="color:#8a7a5a;">${this.t('sniper_no_closest_found')}</div>`;

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
                <div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(150,110,50,0.3);">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
                        <div style="font-weight:bold;font-size:10.5px;color:#5a3a0a;">📍 ${this.t('sniper_closest_title')}</div>
                        <span class="mult_sniper_refresh_closest" style="cursor:pointer;font-size:10px;color:#4a6fa5;text-decoration:underline;">🔄 ${this.t('sniper_refresh_btn')}</span>
                    </div>
                    <div class="mult_sniper_closest_list" style="font-size:10.5px;color:#3a2a0a;display:flex;flex-wrap:wrap;gap:2px 16px;">${closestHtml}</div>
                    <div style="font-size:9.5px;color:#9a8a6a;margin-top:2px;">${this.t('sniper_closest_hint')}</div>
                </div>
            `;

            // Insere no FINAL da janela inteira (largura total), nao numa
            // barra lateral estreita - windowEl e um bloco que ocupa a
            // largura toda da janela nativa.
            windowEl.appendChild(panel);

            panel.querySelector('.button_new').addEventListener('click', (ev) => {
                this._onScheduleClick(windowEl, targetId, panel);
            });

            panel.querySelector('.mult_sniper_refresh_closest').addEventListener('click', () => {
                this._refreshClosestList(windowEl, panel);
            });
        } catch (e) {
            this.console.log('[Sniper] ' + this.t('sniper_inject_error', { msg: e?.message ?? e }));
        }
    }

    _refreshClosestList(windowEl, panel) {
        const closest = this._getClosestOwnTowns(windowEl, 5);
        const closestHtml = closest.length
            ? closest.map((t, i) => `<div style="display:flex;justify-content:space-between;padding:2px 0;">
                <span>${i + 1}. ${t.name}</span>
                <span style="color:#8a7a5a;">${this.t('sniper_distance_units', { dist: t.dist.toFixed(1) })}</span>
               </div>`).join('')
            : `<div style="color:#8a7a5a;">${this.t('sniper_no_closest_found')}</div>`;
        panel.querySelector('.mult_sniper_closest_list').innerHTML = closestHtml;
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

    /* FIX: as tentativas anteriores via MM.getModels().Town (so tem
       as proprias 5 cidades do jogador) e MapChunks (nao guarda
       coordenadas nesse formato) nao funcionavam pra cidades de
       OUTROS jogadores. A aba "Informacao" da propria janela de
       ataque/apoio mostra "Oceano: NN (X,Y)" em texto visivel -
       le esse texto direto do DOM, sem depender de estrutura
       interna nenhuma. Só funciona se a aba Informacao ja tiver
       sido renderizada nessa janela em algum momento (pode nao
       estar presente se o jogador nunca clicou nela). */
    _getTargetCoordsFromWindow(windowEl) {
        try {
            /* FIX: innerText so pega texto de elementos VISIVEIS (respeita
               CSS/display:none) - quando a aba "Informacao" fica escondida
               de novo (voce volta pra aba Atacar), innerText do windowEl
               INTEIRO ignora esse texto, mesmo que ele continue no DOM.
               textContent nao tem esse problema - pega o texto de
               QUALQUER elemento, visivel ou nao. Esse era o motivo real
               de "nao funcionou" mesmo depois de clicar em Informacao. */
            const text = windowEl.textContent || windowEl.innerText || '';
            const match = text.match(/\((\d{2,4})\s*,\s*(\d{2,4})\)/);
            if (match) return { x: parseInt(match[1], 10), y: parseInt(match[2], 10) };
        } catch (e) {}
        return null;
    }

    /* Distancia em coordenadas de ilha (unidade relativa, NAO e
       "campos" exatos de viagem - serve so pra RANKING/ordenacao
       entre as proprias cidades, nao pra calcular tempo). O tempo
       de viagem real continua vindo do way_duration lido da tela,
       depois que voce escolhe a cidade e abre o ataque de la. */
    _getClosestOwnTowns(windowEl, limit = 5) {
        try {
            const targetCoords = this._getTargetCoordsFromWindow(windowEl);
            if (!targetCoords) return [];

            const ownTowns = Object.values(uw.ITowns.towns).map(t => {
                const x = t.getIslandCoordinateX();
                const y = t.getIslandCoordinateY();
                const dist = Math.sqrt(Math.pow(x - targetCoords.x, 2) + Math.pow(y - targetCoords.y, 2));
                return { id: t.id, name: t.getName(), dist };
            });

            ownTowns.sort((a, b) => a.dist - b.dist);
            return ownTowns.slice(0, limit);
        } catch (e) {
            return [];
        }
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
    _readComposition(windowEl) {
        const composition = {};
        try {
            const allUnitIds = Object.keys(uw.GameData.units);
            for (const unitId of allUnitIds) {
                const input = windowEl.querySelector(`input[name="${unitId}"], #unit_id_wrap_${unitId} input, [data-unit="${unitId}"] input`);
                if (!input) continue;
                const val = parseInt(input.value, 10);
                if (val > 0) composition[unitId] = val;
            }
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

        const target = snipe.sendAt - this._networkCompensationMs;
        const delay = target - Date.now();

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

    async _fire(snipe) {
        const fireStartedAt = Date.now();
        const localDeltaMs = fireStartedAt - snipe.sendAt; // positivo = disparou depois do alvo, negativo = antes

        try {
            const data = {
                ...snipe.composition,
                id: parseInt(snipe.targetId, 10),
                type: snipe.type,
                town_id: parseInt(snipe.originTownId, 10),
                nl_init: true,
            };

            const res = await this.ajaxPostWithTimeout('town_info', 'send_units', data);
            const roundTripMs = Date.now() - fireStartedAt;

            if (res && !res.error) {
                snipe.status = 'sent';
                const msg = this.t('sniper_fired_ok', { target: snipe.targetName });
                this.console.log('[Sniper] ' + msg);
                this.console.log('[Sniper] ' + this.t('sniper_timing_debug_log', { localDelta: localDeltaMs, roundTrip: roundTripMs }));
                if (uw.HumanMessage) uw.HumanMessage.success('MultBot Sniper: ' + msg);
            } else {
                snipe.status = 'failed';
                snipe.error = res?.error ?? '?';
                this.console.log('[Sniper] ' + this.t('sniper_fired_fail', { target: snipe.targetName, reason: snipe.error }));
            }
        } catch (e) {
            snipe.status = 'failed';
            snipe.error = e?.message ?? String(e);
            this.console.log('[Sniper] ' + this.t('sniper_fired_fail', { target: snipe.targetName, reason: snipe.error }));
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
