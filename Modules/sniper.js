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
//     injeta um painel extra com data/hora de chegada desejada.
//  3. Ao clicar "Agendar", le o "way_duration" (tempo de viagem)
//     DIRETO DO DOM - ja calculado pelo proprio jogo, sem risco
//     de formula errada - e calcula o horario de ENVIO
//     (chegada - duracao).
//  4. O agendamento fica salvo (sobrevive a fechar a janela e
//     ate a um reload da pagina). Quando o horario de envio
//     chega, dispara via a chamada de rede ja confirmada
//     (town_info/send_units), sem precisar da janela aberta.
//
//  IMPORTANTE - limitacao de navegador: setTimeout/setInterval
//  em abas em SEGUNDO PLANO podem atrasar (throttling do
//  navegador, ate 1+ minuto em casos extremos). Pra precisao de
//  sniper, a aba do jogo precisa ficar em primeiro plano perto
//  do horario agendado.
// ══════════════════════════════════════════════════════
var Sniper = class extends MultUtil {
    constructor(c, s) {
        super(c, s);
        this._scheduled = this.storage.load('sniper_scheduled', []);
        this._observer = null;
        this._checkerInterval = null;

        this._startWatching();
        this._startChecker();
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
            <div style="padding:5px 10px;font-weight:bold;">
                ${this.t('sniper_desc')}
            </div>
            <div style="padding:2px 10px 4px;font-size:11px;color:#8a2a2a;">
                ${this.t('sniper_background_warning')}
            </div>
            <div id="sniper_list" style="padding:4px 10px 10px;"></div>
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

            const panelId = 'mult_sniper_panel_' + targetId;
            const panel = document.createElement('div');
            panel.className = 'mult_sniper_panel';
            panel.id = panelId;
            panel.style.cssText = 'margin-top:8px;padding:6px;border:1px solid #8a6c3a;border-radius:4px;background:rgba(255,255,255,0.06);';
            panel.innerHTML = `
                <div style="font-weight:bold;font-size:11px;margin-bottom:4px;">🎯 ${this.t('sniper_panel_title')}</div>
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                    <input type="date" class="mult_sniper_date" style="padding:2px;" />
                    <input type="time" class="mult_sniper_time" step="1" style="padding:2px;" />
                    <div class="button_new" style="cursor:pointer;margin:0;" data-target-id="${targetId}">
                        <div class="left"></div><div class="right"></div>
                        <div class="caption js-caption">${this.t('sniper_schedule_btn')}<div class="effect js-effect"></div></div>
                    </div>
                </div>
                <div class="mult_sniper_status" style="font-size:10px;margin-top:3px;color:#5a3a0a;"></div>
            `;

            // Insere no fim da janela (mesmo container que tem os botoes nativos)
            const insertionPoint = windowEl.querySelector('.duration_container')?.parentElement || windowEl;
            insertionPoint.appendChild(panel);

            panel.querySelector('.button_new').addEventListener('click', (ev) => {
                this._onScheduleClick(windowEl, targetId, panel);
            });
        } catch (e) {
            this.console.log('[Sniper] ' + this.t('sniper_inject_error', { msg: e?.message ?? e }));
        }
    }

    _onScheduleClick(windowEl, targetId, panel) {
        try {
            const statusEl = panel.querySelector('.mult_sniper_status');
            const dateVal = panel.querySelector('.mult_sniper_date').value;
            const timeVal = panel.querySelector('.mult_sniper_time').value;

            if (!dateVal || !timeVal) {
                statusEl.textContent = this.t('sniper_missing_datetime');
                statusEl.style.color = '#f87171';
                return;
            }

            const arrivalDate = new Date(`${dateVal}T${timeVal}`);
            if (isNaN(arrivalDate.getTime())) {
                statusEl.textContent = this.t('sniper_invalid_datetime');
                statusEl.style.color = '#f87171';
                return;
            }

            const wayDurationEl = windowEl.querySelector('.way_duration');
            if (!wayDurationEl) {
                statusEl.textContent = this.t('sniper_no_duration_found');
                statusEl.style.color = '#f87171';
                return;
            }
            const durationSeconds = this._parseDuration(wayDurationEl.textContent);
            if (durationSeconds === null) {
                statusEl.textContent = this.t('sniper_duration_parse_error', { raw: wayDurationEl.textContent });
                statusEl.style.color = '#f87171';
                return;
            }

            const sendAt = arrivalDate.getTime() - (durationSeconds * 1000);
            if (sendAt <= Date.now()) {
                statusEl.textContent = this.t('sniper_too_late', { duration: this._formatDuration(durationSeconds) });
                statusEl.style.color = '#f87171';
                return;
            }

            const formEl = windowEl.querySelector('.send_units_form');
            const commandType = formEl?.dataset?.type || formEl?.getAttribute('data-type') || 'attack';

            const composition = this._readComposition(windowEl);
            if (!composition || Object.keys(composition).length === 0) {
                statusEl.textContent = this.t('sniper_no_units_found');
                statusEl.style.color = '#f87171';
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

            const compSummary = Object.entries(composition).map(([u, n]) => `${n}x ${this.getGameName('unit', u)}`).join(', ');
            statusEl.textContent = this.t('sniper_scheduled_ok', { time: arrivalDate.toLocaleString() });
            statusEl.style.color = '#1a6b2a';

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

    /* Checa a cada 5s se algum agendamento chegou na hora de
       disparar. respectSleep=false: um agendamento de horario
       exato nao deve ser pausado pelo Sleeper - o jogador pediu
       explicitamente esse horario. */
    _startChecker() {
        this._checkerInterval = this.createGuardedInterval(() => this._checkDue(), 5000, false);
    }

    async _checkDue() {
        const now = Date.now();
        const due = this._scheduled.filter(s => s.status === 'pending' && s.sendAt <= now);

        for (const snipe of due) {
            await this._fire(snipe);
        }

        if (due.length > 0) {
            this.storage.save('sniper_scheduled', this._scheduled);
            this._renderList();
        }
    }

    async _fire(snipe) {
        try {
            const data = {
                ...snipe.composition,
                id: parseInt(snipe.targetId, 10),
                type: snipe.type,
                town_id: parseInt(snipe.originTownId, 10),
                nl_init: true,
            };

            const res = await this.ajaxPostWithTimeout('town_info', 'send_units', data);
            if (res && !res.error) {
                snipe.status = 'sent';
                const msg = this.t('sniper_fired_ok', { target: snipe.targetName });
                this.console.log('[Sniper] ' + msg);
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
        this._scheduled = this._scheduled.filter(s => s.id !== id);
        this.storage.save('sniper_scheduled', this._scheduled);
        this._renderList();
        this.console.log('[Sniper] ' + this.t('sniper_cancelled_log'));
    };

    _renderList() {
        try {
            const rows = this._scheduled
                .slice()
                .sort((a, b) => a.sendAt - b.sendAt)
                .map(s => {
                    const compSummary = Object.entries(s.composition || {}).map(([u, n]) => `${n}x ${this.getGameName('unit', u)}`).join(', ');
                    const statusLabel = { pending: this.t('sniper_status_pending'), sent: this.t('sniper_status_sent'), failed: this.t('sniper_status_failed') }[s.status] || s.status;
                    const statusColor = { pending: '#5a3a0a', sent: '#1a6b2a', failed: '#f87171' }[s.status] || '#5a3a0a';
                    const cancelBtn = s.status === 'pending'
                        ? `<span onclick="window.multBot.sniper.cancelSnipe('${s.id}')" style="cursor:pointer;color:#f87171;font-weight:bold;margin-left:8px;">✕</span>`
                        : '';
                    return `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 6px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:11px;">
                        <div>
                            <b>${s.targetName}</b> (${s.type === 'attack' ? this.t('sniper_type_attack') : this.t('sniper_type_support')}) - ${compSummary}<br/>
                            ${this.t('sniper_row_arrival', { time: new Date(s.arrivalAt).toLocaleString() })}
                        </div>
                        <div style="text-align:right;color:${statusColor};">
                            ${statusLabel}${cancelBtn}
                        </div>
                    </div>`;
                }).join('');

            uw.$('#sniper_list').html(rows || `<div style="font-size:11px;color:#8a7a5a;padding:4px;">${this.t('sniper_none_scheduled')}</div>`);
        } catch (e) {}
    }
};
