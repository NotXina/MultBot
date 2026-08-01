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
    // Margem fixa de seguranca: dispara sempre esse tanto mais cedo
    // que o horario calculado (chegada - duracao), desde a primeira
    // tentativa.
    EARLY_MARGIN_MS = 3000;

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
            <div style="padding:0 10px 6px;display:flex;justify-content:flex-end;">
                ${this.getButtonHtml('sniper_clear_done_btn', this.t('sniper_clear_done'), this.clearDone)}
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

                <div style="margin-top:10px;border-top:1px solid rgba(163,128,63,0.4);padding-top:8px;">
                    <div style="margin-bottom:4px;">
                        <span style="font-weight:bold;font-size:11px;color:#5a3a0a;">📍 ${this.t('sniper_closest_title')}</span>
                    </div>
                    <div id="sniper_closest_panel_${targetId}" style="min-height:18px;font-size:11px;color:#5a3a0a;">
                        <span style="color:#9a7a4a;font-style:italic;">${this.t('sniper_closest_hint')}</span>
                    </div>
                </div>
            `;

            // Injecao: o painel vai dentro da attack_support_window
            // (dentro do gpwindow_content). Quando o jogador troca pra
            // aba Info, o jogo substitui o gpwindow_content inteiro e
            // o painel some — mas o MutationObserver global (_startWatching)
            // ja re-detecta a attack_support_window quando o jogador
            // volta pra aba Atacar e reinjecta tudo automaticamente.
            // Coordenadas: guardadas em this._coordsCache[targetId] assim
            // que sao lidas pela primeira vez (aba Info), pra nao perder
            // ao trocar de aba.
            windowEl.appendChild(panel);

            panel.querySelector('.button_new[data-target-id]').addEventListener('click', (ev) => {
                this._onScheduleClick(windowEl, targetId, panel);
            });

            // MutationObserver interno: vigia o gpwindow_content esperando
            // o gp_island_link aparecer (so existe na aba Info).
            // Salva as coords em cache pra poder re-renderizar mesmo
            // depois de trocar de aba e perder o link do DOM.
            const gpContent = windowEl.closest('.gpwindow_content') || windowEl.parentElement;
            const tabObserver = new MutationObserver(() => {
                if (this._coordsCache && this._coordsCache[targetId]) {
                    // Ja tem coords em cache — popula e desconecta
                    this._renderClosestPanel(windowEl, targetId);
                    tabObserver.disconnect();
                    return;
                }
                const coords = this._getTargetCoords(gpContent);
                if (coords) {
                    if (!this._coordsCache) this._coordsCache = {};
                    this._coordsCache[targetId] = coords;
                    this._renderClosestPanel(windowEl, targetId);
                    tabObserver.disconnect();
                }
            });
            tabObserver.observe(gpContent, { childList: true, subtree: true });

            // Se ja temos coords em cache desta cidade (aba Info ja foi
            // visitada numa abertura anterior da janela), popula na hora
            if (this._coordsCache && this._coordsCache[targetId]) {
                this._renderClosestPanel(windowEl, targetId);
            }

        } catch (e) {
            this.console.log('[Sniper] ' + this.t('sniper_inject_error', { msg: e?.message ?? e }));
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  5 CIDADES MAIS PROXIMAS DO ALVO
    // ─────────────────────────────────────────────────────────────

    /* Extrai coordenadas da ilha do alvo via link gp_island_link.
       Confirmado via captura real de DOM (aba Informacao):
       o href contem JSON em Base64 com ix (island_x) e iy (island_y).
       Ex: {"tp":"island","id":62739,"ix":591,"iy":539,...}
       Esse link so aparece DEPOIS que a aba Informacao e aberta
       ao menos uma vez - por isso existe o botao Refresh. */
    _getTargetCoords(windowEl) {
        try {
            // Sobe ate o js-window-main-container ou gpwindow_content,
            // o que vier primeiro — ambos sao raizes validas dependendo
            // de qual elemento foi passado (attack_support_window ou
            // gpwindow_content direto do tabObserver)
            const container = windowEl.closest('.js-window-main-container')
                || windowEl.closest('.gpwindow_content')
                || windowEl;
            const link = container.querySelector('a.gp_island_link');
            if (!link) return null;

            const hash = link.href.split('#')[1];
            if (!hash) return null;

            const json = JSON.parse(atob(hash));
            if (typeof json.ix === 'number' && typeof json.iy === 'number') {
                return { x: json.ix, y: json.iy };
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    /* Converte segundos em string HH:MM:SS */
    _formatTravelTime(seconds) {
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = Math.floor(seconds % 60);
        return [h, m, s].map(function(n) { return String(n).padStart(2, '0'); }).join(':');
    }

    /* Retorna as N cidades do jogador mais proximas do alvo,
       ordenadas por distancia crescente.
       Formula confirmada (mesma do Commander):
       dist = sqrt(dx^2 + dy^2) * 1.415
       Tempo de viagem: dist / speed * 3600 segundos.
       Velocidades confirmadas via GameData:
         attack_ship (Farol): speed 39
         bireme:              speed 45 */
    _getClosestTowns(targetX, targetY, limit) {
        limit = limit || 5;
        // Velocidades confirmadas via uw.GameData.units (captura real)
        var SPEED_FAROL  = uw.GameData.units['attack_ship'] ? uw.GameData.units['attack_ship'].speed : 39;
        var SPEED_BIREME = uw.GameData.units['bireme']      ? uw.GameData.units['bireme'].speed      : 45;
        try {
            var towns = Object.values(uw.ITowns.towns);
            var withDist = towns.map(function(t) {
                var tx = t.getIslandCoordinateX();
                var ty = t.getIslandCoordinateY();
                var dx = tx - targetX;
                var dy = ty - targetY;
                var dist = Math.sqrt(dx * dx + dy * dy) * 1.415;
                // travel_s = dist / speed * 3600  (formula confirmada, Commander)
                var travelFarol  = dist / SPEED_FAROL  * 3600;
                var travelBireme = dist / SPEED_BIREME * 3600;
                return {
                    town: t,
                    dist: Math.round(dist),
                    travelFarol:  Math.round(travelFarol),
                    travelBireme: Math.round(travelBireme),
                };
            });
            withDist.sort(function(a, b) { return a.dist - b.dist; });
            return withDist.slice(0, limit);
        } catch (e) {
            return [];
        }
    }

    /* Renderiza o painel "5 cidades mais proximas" dentro do panel
       ja injetado na janela de ataque/apoio.
       targetId e passado explicitamente pra montar o id do elemento
       sem precisar buscar no DOM. */
    _renderClosestPanel(windowEl, targetId) {
        try {
            const panelEl = windowEl.querySelector('#sniper_closest_panel_' + targetId);
            if (!panelEl) return;

            // Usa coords do cache (salvo quando aba Info foi visitada)
            // ou tenta ler do DOM se ainda estiver disponivel
            const coords = (this._coordsCache && this._coordsCache[targetId])
                || this._getTargetCoords(windowEl);
            if (!coords) return;

            const closest = this._getClosestTowns(coords.x, coords.y, 5);
            if (!closest.length) {
                panelEl.innerHTML = '<span style="color:#9a7a4a;">' + this.t('sniper_no_closest_found') + '</span>';
                return;
            }

            var html = '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
            html += '<tr style="color:#7a5a2a;font-size:10px;border-bottom:1px solid rgba(163,128,63,0.3);">';
            html += '<th style="text-align:left;padding:1px 4px;">#</th>';
            html += '<th style="text-align:left;padding:1px 4px;">Cidade</th>';
            html += '<th style="text-align:center;padding:1px 4px;">⚡ Farol</th>';
            html += '<th style="text-align:center;padding:1px 4px;">🛡️ Birreme</th>';
            html += '</tr>';

            for (var i = 0; i < closest.length; i++) {
                var entry = closest[i];
                var townId = entry.town.id;
                var bg = i % 2 === 0 ? 'rgba(0,0,0,0.03)' : 'transparent';
                html += '<tr style="background:' + bg + ';">';
                html += '<td style="padding:2px 4px;color:#9a7a4a;">' + (i + 1) + '</td>';
                // Nome clicavel: usa window.multBot.sniper._goToTown() como
                // ponto de entrada publico — uw nao e acessivel em onclick inline
                // (mesmo padrao do cancelSnipe que usa window.multBot.sniper.cancelSnipe)
                html += '<td style="padding:2px 4px;">';
                html += '<a href="#" onclick="window.multBot.sniper._goToTown(' + townId + ');return false;" ';
                html += 'style="color:#5a3a0a;font-weight:bold;text-decoration:underline;cursor:pointer;">';
                html += entry.town.getName();
                html += '</a></td>';
                html += '<td style="padding:2px 4px;text-align:center;color:#3a2a0a;">' + this._formatTravelTime(entry.travelFarol) + '</td>';
                html += '<td style="padding:2px 4px;text-align:center;color:#3a2a0a;">' + this._formatTravelTime(entry.travelBireme) + '</td>';
                html += '</tr>';
            }
            html += '</table>';

            panelEl.innerHTML = html;
        } catch (e) {
            this.console.log('[Sniper] closest panel error: ' + (e?.message ?? e));
        }
    }

    /* SELECIONA uma cidade do jogador como cidade ativa — chamado
       via onclick inline do painel de cidades proximas.
       Confirmado via teste real no console (2 passos necessarios):
       1. Game.townId = id        → troca a cidade logicamente
       2. town_switch publish     → atualiza a UI (sem isso a barra
          de recursos/nome nao muda visivelmente)
       So seleciona — nao move o mapa. */
    _goToTown(townId) {
        try {
            var id = parseInt(townId, 10);
            if (!uw.ITowns.towns[id]) return;
            uw.Game.townId = id;
            uw.$.Observer(uw.GameEvents.town.town_switch).publish({ town_id: id });
        } catch (e) {
            this.console.log('[Sniper] _goToTown erro: ' + (e?.message ?? e));
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
            const sendAt = arrivalDate.getTime() - (durationSeconds * 1000) - this.EARLY_MARGIN_MS;
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

            let originTownId;
            try {
                originTownId = uw.ITowns.getCurrentTown().id;
            } catch (e) {
                statusEl.textContent = this.t('sniper_schedule_error', { msg: 'getCurrentTown() falhou — tente novamente' });
                statusEl.style.color = '#c0392b';
                return;
            }
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

    /* CONFIRMADO via codigo fonte real do jogo
       (WndHandlerAttack.prototype.getSelectedUnits): o seletor certo
       e "input.unit_input" - cada input tem .name (id da unidade) e
       .value (quantidade). */
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
            const container = windowEl.closest('.js-window-main-container');
            if (!container) return null;
            // Preferencia: header especifico da janela de ataque/apoio.
            // Evita o seletor generico ".title" que pode pegar qualquer
            // elemento <title> ou .title dentro do container (ex: titulos
            // de secao interna), retornando texto errado.
            const titleEl = container.querySelector('.window_header')
                || container.querySelector('.gp_wnd_header');
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
        const originStr = String(originId);
        const targetStr = String(targetId);
        for (let attempt = 0; attempt < 8; attempt++) {
            try {
                const models = uw.MM.getModels().MovementsUnits;
                for (const key in models) {
                    const mv = models[key]?.attributes;
                    if (!mv) continue;
                    if (String(mv.home_town_id) !== originStr) continue;
                    if (String(mv.target_town_id) !== targetStr) continue;
                    const cid = mv.command_id ?? mv.id;
                    if (existingIds.has(cid)) continue;
                    return mv;
                }
            } catch (e) {}
            await this.sleep(200);
        }
        this.console.log('[Sniper] ' + this.t('sniper_no_command_found'));
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
       chegada contra o desejado, e se nao bater dentro da janela
       aceitavel - cancela e ESPERA as tropas voltarem antes de
       reenviar. So desiste se realmente nao sobrar tempo.
       Faixa aceitavel por tipo:
       - Ataque: min:-1, max:0 (nunca atrasado)
       - Apoio:  min:0,  max:2 (nunca adiantado) */
    _getToleranceRange(type) {
        if (type === 'support') return { min: 0, max: 2 };
        return { min: -1, max: 0 };
    }

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

                const cancelableUntil = result.command.cancelable_until;
                const canCancel = cancelableUntil && (Date.now() / 1000) < cancelableUntil;
                const observedTravelMs = Math.max(0, (actualArrivalSec * 1000) - Date.now());
                const timeLeftMs = snipe.arrivalAt - Date.now();
                const maxWaitForTroopsMs = timeLeftMs - observedTravelMs - 1000;

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

    /* Remove todos os agendamentos com status 'sent' ou 'failed' —
       mantém apenas os pendentes e em disparo. */
    clearDone = () => {
        const before = this._scheduled.length;
        this._scheduled = this._scheduled.filter(s => s.status === 'pending' || s.status === 'firing');
        const removed = before - this._scheduled.length;
        this.storage.save('sniper_scheduled', this._scheduled);
        this._renderList();
        this.console.log('[Sniper] ' + this.t('sniper_clear_done_log', { count: removed }));
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
