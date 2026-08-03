// ══════════════════════════════════════════════════════
//  MODULE: AutoSpells
//  Dois feitiços automáticos na mesma aba:
//
//  [🌍 Auto Terremoto]
//     Lança o feitiço "Earthquake" (Terremoto) via
//     CastedPowers/cast na cidade-alvo a cada 1 hora.
//     power_id: "poseidon_earthquake"
//     Endpoint confirmado igual ao padrão CastedPowers
//     usado em AutoAresSacrifice.
//
//  [😊 Auto Felicidade]
//     Lança o feitiço "Divine Sign" (Felicidade) via
//     CastedPowers/cast na mesma cidade-alvo a cada 3h.
//     power_id: "zeus_divine_sign"
//
//  REGRAS:
//  - Um único campo de ID de cidade configura o alvo
//    para os dois feitiços
//  - Cada feitiço tem seu próprio toggle independente
//  - O módulo usa createGuardedInterval para respeitar
//    o Sleeper (pausa noturna)
//  - Próximo disparo é exibido na UI em contagem
//    regressiva atualizada a cada segundo
//  - Ambos os feitiços podem rodar simultaneamente ou
//    ser ligados/desligados de forma independente
// ══════════════════════════════════════════════════════

var AutoSpells = class extends MultUtil {

    // ── Constantes de tempo ──────────────────────────
    EQ_INTERVAL_MS  = 60 * 60 * 1000;   // 1 hora
    HAP_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 horas
    CLOCK_TICK_MS   = 1000;              // atualiza o countdown a cada 1s

    constructor(c, s) {
        super(c, s);

        // Estado interno de cada feitiço
        this._eqActive   = false;
        this._hapActive  = false;

        // IDs dos intervals
        this._eqIntervalId    = null;
        this._hapIntervalId   = null;
        this._clockIntervalId = null;

        // Próximos disparos (timestamp ms)
        this._nextEqTs  = null;
        this._nextHapTs = null;

        // ID da cidade alvo (string)
        this.targetId = this.storage.load('asp_target_id', '');

        // Auto-start se estava ativo antes de recarregar
        if (this.storage.load('asp_eq_active', false)) {
            setTimeout(() => this._startEq(), 2500);
        }
        if (this.storage.load('asp_hap_active', false)) {
            setTimeout(() => this._startHap(), 2600);
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  UI — Settings Panel
    // ─────────────────────────────────────────────────────────────
    settings = () => {
        requestAnimationFrame(() => {
            this._refreshEqBtn();
            this._refreshHapBtn();
            this._startClock();
        });

        return '' +
        '<div class="game_border" style="margin-bottom:20px;">' +
        '  <div class="game_border_top"></div><div class="game_border_bottom"></div>' +
        '  <div class="game_border_left"></div><div class="game_border_right"></div>' +
        '  <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>' +
        '  <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>' +

        // ── Título geral ──
        this.getTitleHtml('asp_panel_title', this.t('asp_title'), null, '', false) +

        // ── Configuração da cidade alvo ──
        '  <div style="padding:6px 10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
        '    <span style="font-size:11px;font-weight:bold;">' + this.t('asp_city_label') + '</span>' +
        '    <input id="asp_city_input" type="text" placeholder="' + this.t('asp_city_placeholder') + '"' +
        '           value="' + (this.targetId || '') + '" style="width:120px;padding:3px 5px;font-size:12px;" />' +
        this.getButtonHtml('asp_save_city_btn', this.t('asp_save_btn'), this._saveCity) +
        '    <span id="asp_city_status" style="font-size:11px;color:#5a3a0a;"></span>' +
        '  </div>' +

        // ── Auto Terremoto ──
        '  <div class="game_border" style="margin:6px 10px;padding:6px 8px;">' +
        '    <div class="game_border_top"></div><div class="game_border_bottom"></div>' +
        '    <div class="game_border_left"></div><div class="game_border_right"></div>' +
        '    <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>' +
        '    <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>' +
        this.getTitleHtml('asp_eq_title', this.t('asp_earthquake_title'), this._toggleEq, '', this._eqActive) +
        '    <div style="padding:2px 6px 4px;font-size:11px;">' + this.t('asp_earthquake_desc') + '</div>' +
        '    <div id="asp_eq_status" style="padding:0 6px 6px;font-size:11px;color:#5a3a0a;min-height:16px;"></div>' +
        '  </div>' +

        // ── Auto Felicidade ──
        '  <div class="game_border" style="margin:6px 10px 10px;padding:6px 8px;">' +
        '    <div class="game_border_top"></div><div class="game_border_bottom"></div>' +
        '    <div class="game_border_left"></div><div class="game_border_right"></div>' +
        '    <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>' +
        '    <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>' +
        this.getTitleHtml('asp_hap_title', this.t('asp_happiness_title'), this._toggleHap, '', this._hapActive) +
        '    <div style="padding:2px 6px 4px;font-size:11px;">' + this.t('asp_happiness_desc') + '</div>' +
        '    <div id="asp_hap_status" style="padding:0 6px 6px;font-size:11px;color:#5a3a0a;min-height:16px;"></div>' +
        '  </div>' +

        '</div>';
    };

    // ─────────────────────────────────────────────────────────────
    //  Salvar cidade alvo
    // ─────────────────────────────────────────────────────────────
    _saveCity = () => {
        const raw = (uw.$('#asp_city_input').val() || '').trim();
        if (!raw || isNaN(parseInt(raw, 10))) {
            uw.$('#asp_city_status').text(this.t('asp_city_invalid')).css('color', '#f87171');
            return;
        }
        const id   = String(parseInt(raw, 10));
        const town = uw.ITowns.towns[id];
        if (!town) {
            uw.$('#asp_city_status').text(this.t('asp_city_not_found', { id })).css('color', '#f87171');
            return;
        }
        this.targetId = id;
        this.storage.save('asp_target_id', id);
        const name = town.getName ? town.getName() : ('#' + id);
        uw.$('#asp_city_status').text(this.t('asp_city_saved', { name, id })).css('color', '#1a6b2a');
        this.console.log('[AutoSpells] ' + this.t('asp_city_saved', { name, id }));
    };

    // ─────────────────────────────────────────────────────────────
    //  Toggle Terremoto
    // ─────────────────────────────────────────────────────────────
    _toggleEq = () => {
        if (this._eqActive) this._stopEq();
        else this._startEq();
    };

    _startEq() {
        if (this._eqActive) return;
        if (!this._validateTarget()) return;

        this._eqActive = true;
        this.storage.save('asp_eq_active', true);
        this._refreshEqBtn();

        // Dispara imediatamente na primeira vez, depois a cada 1h
        this._castEarthquake();
        this._nextEqTs = Date.now() + this.EQ_INTERVAL_MS;

        this._eqIntervalId = this.createGuardedInterval(() => {
            this._castEarthquake();
            this._nextEqTs = Date.now() + this.EQ_INTERVAL_MS;
        }, this.EQ_INTERVAL_MS);

        const name = this._getTargetName();
        this.console.log('[AutoSpells] ' + this.t('asp_started_log', { name }));
        this._startClock();
    }

    _stopEq() {
        this._eqActive = false;
        this.storage.save('asp_eq_active', false);
        if (this._eqIntervalId) { clearInterval(this._eqIntervalId); this._eqIntervalId = null; }
        this._nextEqTs = null;
        this._refreshEqBtn();
        uw.$('#asp_eq_status').text(this.t('asp_stopped_log'));
        this.console.log('[AutoSpells] Terremoto ' + this.t('asp_stopped_log'));
        this._maybeStopClock();
    }

    _refreshEqBtn() {
        uw.$('#asp_eq_title').css('filter', this._eqActive
            ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    }

    // ─────────────────────────────────────────────────────────────
    //  Toggle Felicidade
    // ─────────────────────────────────────────────────────────────
    _toggleHap = () => {
        if (this._hapActive) this._stopHap();
        else this._startHap();
    };

    _startHap() {
        if (this._hapActive) return;
        if (!this._validateTarget()) return;

        this._hapActive = true;
        this.storage.save('asp_hap_active', true);
        this._refreshHapBtn();

        // Dispara imediatamente na primeira vez, depois a cada 3h
        this._castHappiness();
        this._nextHapTs = Date.now() + this.HAP_INTERVAL_MS;

        this._hapIntervalId = this.createGuardedInterval(() => {
            this._castHappiness();
            this._nextHapTs = Date.now() + this.HAP_INTERVAL_MS;
        }, this.HAP_INTERVAL_MS);

        const name = this._getTargetName();
        this.console.log('[AutoSpells] ' + this.t('asp_started_log', { name }));
        this._startClock();
    }

    _stopHap() {
        this._hapActive = false;
        this.storage.save('asp_hap_active', false);
        if (this._hapIntervalId) { clearInterval(this._hapIntervalId); this._hapIntervalId = null; }
        this._nextHapTs = null;
        this._refreshHapBtn();
        uw.$('#asp_hap_status').text(this.t('asp_stopped_log'));
        this.console.log('[AutoSpells] Felicidade ' + this.t('asp_stopped_log'));
        this._maybeStopClock();
    }

    _refreshHapBtn() {
        uw.$('#asp_hap_title').css('filter', this._hapActive
            ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    }

    // ─────────────────────────────────────────────────────────────
    //  Cast Terremoto
    //  power_id confirmado pelo padrão CastedPowers do jogo.
    //  O endpoint é frontend_bridge/execute com model_url CastedPowers
    //  e action_name cast — mesmo padrão do AutoAresSacrifice.
    // ─────────────────────────────────────────────────────────────
    _castEarthquake = async () => {
        if (window.__multbot_captcha_active) return;
        const id = this.targetId;
        if (!id) return;

        try {
            const res = await this.ajaxPostWithTimeout('frontend_bridge', 'execute', {
                model_url:   'CastedPowers',
                action_name: 'cast',
                captcha:     null,
                arguments: {
                    power_id:  'poseidon_earthquake',
                    target_id: parseInt(id, 10),
                },
            });

            if (res && !res.error) {
                const name = this._getTargetName();
                this.console.log('[AutoSpells] ' + this.t('asp_earthquake_cast_log', { name }));
                uw.$('#asp_eq_status').text(this.t('asp_earthquake_cast_log', { name })).css('color', '#1a6b2a');
            } else {
                const reason = (res && res.error) ? res.error : this.t('asp_unknown_reason');
                this.console.log('[AutoSpells] ' + this.t('asp_earthquake_fail_log', { reason }));
                uw.$('#asp_eq_status').text(this.t('asp_earthquake_fail_log', { reason })).css('color', '#f87171');
            }
        } catch (e) {
            const reason = this.t('asp_network_error');
            this.console.log('[AutoSpells] ' + this.t('asp_earthquake_fail_log', { reason }));
            uw.$('#asp_eq_status').text(this.t('asp_earthquake_fail_log', { reason })).css('color', '#f87171');
        }
    };

    // ─────────────────────────────────────────────────────────────
    //  Cast Felicidade
    //  power_id: "zeus_divine_sign" (Sinal Divino - Felicidade)
    //  Mesmo endpoint CastedPowers/cast
    // ─────────────────────────────────────────────────────────────
    _castHappiness = async () => {
        if (window.__multbot_captcha_active) return;
        const id = this.targetId;
        if (!id) return;

        try {
            const res = await this.ajaxPostWithTimeout('frontend_bridge', 'execute', {
                model_url:   'CastedPowers',
                action_name: 'cast',
                captcha:     null,
                arguments: {
                    power_id:  'zeus_divine_sign',
                    target_id: parseInt(id, 10),
                },
            });

            if (res && !res.error) {
                const name = this._getTargetName();
                this.console.log('[AutoSpells] ' + this.t('asp_happiness_cast_log', { name }));
                uw.$('#asp_hap_status').text(this.t('asp_happiness_cast_log', { name })).css('color', '#1a6b2a');
            } else {
                const reason = (res && res.error) ? res.error : this.t('asp_unknown_reason');
                this.console.log('[AutoSpells] ' + this.t('asp_happiness_fail_log', { reason }));
                uw.$('#asp_hap_status').text(this.t('asp_happiness_fail_log', { reason })).css('color', '#f87171');
            }
        } catch (e) {
            const reason = this.t('asp_network_error');
            this.console.log('[AutoSpells] ' + this.t('asp_happiness_fail_log', { reason }));
            uw.$('#asp_hap_status').text(this.t('asp_happiness_fail_log', { reason })).css('color', '#f87171');
        }
    };

    // ─────────────────────────────────────────────────────────────
    //  Relógio de countdown — atualiza status a cada 1s
    // ─────────────────────────────────────────────────────────────
    _startClock() {
        if (this._clockIntervalId) return; // ja rodando
        this._clockIntervalId = setInterval(() => this._updateCountdowns(), this.CLOCK_TICK_MS);
    }

    _maybeStopClock() {
        if (this._eqActive || this._hapActive) return; // ainda tem algum ativo
        if (this._clockIntervalId) {
            clearInterval(this._clockIntervalId);
            this._clockIntervalId = null;
        }
    }

    _updateCountdowns() {
        const now = Date.now();

        if (this._eqActive && this._nextEqTs) {
            const remaining = Math.max(0, this._nextEqTs - now);
            const formatted = this._formatMs(remaining);
            uw.$('#asp_eq_status').text(this.t('asp_next_eq', { time: formatted })).css('color', '#5a3a0a');
        }

        if (this._hapActive && this._nextHapTs) {
            const remaining = Math.max(0, this._nextHapTs - now);
            const formatted = this._formatMs(remaining);
            uw.$('#asp_hap_status').text(this.t('asp_next_hap', { time: formatted })).css('color', '#5a3a0a');
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  Helpers
    // ─────────────────────────────────────────────────────────────

    // Formata millisegundos em HH:MM:SS
    _formatMs(ms) {
        const total = Math.floor(ms / 1000);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        return (h > 0 ? String(h).padStart(2, '0') + ':' : '') +
               String(m).padStart(2, '0') + ':' +
               String(s).padStart(2, '0');
    }

    _getTargetName() {
        try {
            const town = uw.ITowns.towns[this.targetId];
            return town && town.getName ? town.getName() : ('#' + this.targetId);
        } catch (e) {
            return '#' + this.targetId;
        }
    }

    // Valida se a cidade alvo está configurada e acessível;
    // exibe erro na UI se não estiver.
    _validateTarget() {
        if (!this.targetId) {
            this.console.log('[AutoSpells] ' + this.t('asp_select_before_start'));
            uw.$('#asp_city_status').text(this.t('asp_select_before_start')).css('color', '#eab308');
            return false;
        }
        return true;
    }
};
