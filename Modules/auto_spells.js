// ══════════════════════════════════════════════════════
//  MODULE: AutoSpells  (v3.0 — Per-spell city selector)
//
//  Aba exclusiva "Spells" com 4 feitiços independentes,
//  cada um com seu próprio dropdown de cidade alvo:
//
//  [🌍 Auto Terremoto]
//     power_id: earthquake           — cidade própria
//     Intervalo: 1 hora
//
//  [😊 Auto Felicidade]
//     power_id: happiness            — cidade própria
//     Intervalo: 3 horas
//     (Feitiço de HERA, não Zeus)
//
//  [🔥 Auto Sacrifício de Ares]
//     power_id: ares_sacrifice      — cidade própria
//     Verifica a cada 20s; requer favor >= 100
//     e >= 50 tropas terrestres próprias.
//     Para automaticamente em 5000 fúria.
//
//  [🎪 Auto Festival da Caridade]
//     power_id: charitable_festival  — todas as cidades
//     sem triumph ativo. Verifica a cada 30s.
//
//  STORAGE KEYS (por feitiço, independentes):
//    asp_eq_town_id      asp_eq_active
//    asp_hap_town_id     asp_hap_active
//    asp_ares_town_id    asp_ares_active
//    asp_carnival_active (sem cidade fixa — percorre todas)
// ══════════════════════════════════════════════════════

var AutoSpells = class extends MultUtil {

    // ── Constantes ───────────────────────────────────
    EQ_INTERVAL_MS     = 60 * 60 * 1000;
    HAP_INTERVAL_MS    = 3 * 60 * 60 * 1000;
    ARES_CHECK_MS      = 20 * 1000;
    CARNIVAL_CHECK_MS  = 30 * 1000;
    CLOCK_TICK_MS      = 1000;

    ARES_FAVOR_COST    = 100;
    ARES_MAX_FURY      = 5000;
    ARES_MIN_TROOPS    = 50;
    CARNIVAL_FAVOR_COST = 100;

    constructor(c, s) {
        super(c, s);

        // Estado e cidade de cada feitiço
        this._eqActive      = false;
        this._eqIntervalId  = null;
        this._nextEqTs      = null;
        this.eqTownId       = this.storage.load('asp_eq_town_id', '');

        this._hapActive     = false;
        this._hapIntervalId = null;
        this._nextHapTs     = null;
        this.hapTownId      = this.storage.load('asp_hap_town_id', '');

        this._aresActive     = false;
        this._aresIntervalId = null;
        this.aresTownId      = this.storage.load('asp_ares_town_id', '');

        this._carnivalActive     = false;
        this._carnivalIntervalId = null;

        this._clockIntervalId = null;

        if (this.storage.load('asp_eq_active',       false)) setTimeout(() => this._startEq(),       2500);
        if (this.storage.load('asp_hap_active',      false)) setTimeout(() => this._startHap(),      2600);
        if (this.storage.load('asp_ares_active',     false)) setTimeout(() => this._startAres(),     2700);
        if (this.storage.load('asp_carnival_active', false)) setTimeout(() => this._startCarnival(), 2800);
    }

    // ═════════════════════════════════════════════════
    //  UI
    // ═════════════════════════════════════════════════
    settings = () => {
        requestAnimationFrame(() => {
            this._refreshBtn('asp_eq_title',       this._eqActive);
            this._refreshBtn('asp_hap_title',      this._hapActive);
            this._refreshBtn('asp_ares_title',     this._aresActive);
            this._refreshBtn('asp_carnival_title', this._carnivalActive);
            this._renderAresStatus();
            this._startClock();
        });

        return '' +
        '<div class="game_border" style="margin-bottom:20px;">' +
        '  <div class="game_border_top"></div><div class="game_border_bottom"></div>' +
        '  <div class="game_border_left"></div><div class="game_border_right"></div>' +
        '  <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>' +
        '  <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>' +

        // ── Auto Terremoto ──
        this.getTitleHtml('asp_eq_title', this.t('asp_earthquake_title'), this._toggleEq, '', this._eqActive) +
        '  <div style="padding:2px 10px 3px;font-size:11px;">' + this.t('asp_earthquake_desc') + '</div>' +
        '  <div style="padding:3px 10px;display:flex;gap:6px;align-items:center;">' +
        '    <label style="font-size:11px;font-weight:bold;">' + this.t('asp_city_label') + '</label>' +
        '    <select id="asp_eq_town_sel" style="flex:1;padding:3px;font-size:11px;">' + this._townOpts('eqTownId') + '</select>' +
        this.getButtonHtml('asp_eq_save_btn', this.t('asp_save_btn'), this._saveEqTown) +
        '  </div>' +
        '  <div id="asp_eq_status" style="padding:1px 10px 8px;font-size:11px;color:#5a3a0a;min-height:16px;"></div>' +

        '</div>' +

        '<div class="game_border" style="margin-bottom:20px;">' +
        '  <div class="game_border_top"></div><div class="game_border_bottom"></div>' +
        '  <div class="game_border_left"></div><div class="game_border_right"></div>' +
        '  <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>' +
        '  <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>' +

        // ── Auto Felicidade ──
        this.getTitleHtml('asp_hap_title', this.t('asp_happiness_title'), this._toggleHap, '', this._hapActive) +
        '  <div style="padding:2px 10px 3px;font-size:11px;">' + this.t('asp_happiness_desc') + '</div>' +
        '  <div style="padding:3px 10px;display:flex;gap:6px;align-items:center;">' +
        '    <label style="font-size:11px;font-weight:bold;">' + this.t('asp_city_label') + '</label>' +
        '    <select id="asp_hap_town_sel" style="flex:1;padding:3px;font-size:11px;">' + this._townOpts('hapTownId') + '</select>' +
        this.getButtonHtml('asp_hap_save_btn', this.t('asp_save_btn'), this._saveHapTown) +
        '  </div>' +
        '  <div id="asp_hap_status" style="padding:1px 10px 8px;font-size:11px;color:#5a3a0a;min-height:16px;"></div>' +

        '</div>' +

        '<div class="game_border" style="margin-bottom:20px;">' +
        '  <div class="game_border_top"></div><div class="game_border_bottom"></div>' +
        '  <div class="game_border_left"></div><div class="game_border_right"></div>' +
        '  <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>' +
        '  <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>' +

        // ── Auto Sacrifício de Ares ──
        this.getTitleHtml('asp_ares_title', this.t('asp_ares_title'), this._toggleAres, '', this._aresActive) +
        '  <div style="padding:2px 10px 3px;font-size:11px;">' + this.t('asp_ares_desc', { favor: this.ARES_FAVOR_COST, troops: this.ARES_MIN_TROOPS, fury: this.ARES_MAX_FURY }) + '</div>' +
        '  <div style="padding:3px 10px;display:flex;gap:6px;align-items:center;">' +
        '    <label style="font-size:11px;font-weight:bold;">' + this.t('asp_city_label') + '</label>' +
        '    <select id="asp_ares_town_sel" style="flex:1;padding:3px;font-size:11px;">' + this._townOpts('aresTownId') + '</select>' +
        this.getButtonHtml('asp_ares_save_btn', this.t('asp_save_btn'), this._saveAresTown) +
        '  </div>' +
        '  <div id="asp_ares_status" style="padding:1px 10px 3px;font-size:11px;color:#5a3a0a;min-height:14px;"></div>' +
        '  <div id="asp_ares_log"    style="padding:0 10px 8px;font-size:11px;color:#5a3a0a;min-height:14px;"></div>' +

        '</div>' +

        '<div class="game_border" style="margin-bottom:20px;">' +
        '  <div class="game_border_top"></div><div class="game_border_bottom"></div>' +
        '  <div class="game_border_left"></div><div class="game_border_right"></div>' +
        '  <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>' +
        '  <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>' +

        // ── Auto Festival da Caridade ──
        this.getTitleHtml('asp_carnival_title', this.t('asp_carnival_title'), this._toggleCarnival, '', this._carnivalActive) +
        '  <div style="padding:2px 10px 3px;font-size:11px;">' + this.t('asp_carnival_desc') + '</div>' +
        '  <div id="asp_carnival_status" style="padding:0 10px 8px;font-size:11px;color:#5a3a0a;min-height:16px;"></div>' +

        '</div>';
    };

    // ═════════════════════════════════════════════════
    //  Dropdown helper — gera <option> para cidade alvo
    // ═════════════════════════════════════════════════
    _townOpts(currentFieldName) {
        try {
            const towns  = uw.ITowns.towns;
            const current = this[currentFieldName];
            const keys   = Object.keys(towns).sort((a, b) => {
                const na = towns[a].getName ? towns[a].getName() : '';
                const nb = towns[b].getName ? towns[b].getName() : '';
                return na.localeCompare(nb);
            });
            let html = '<option value="">' + this.t('aas_select_city') + '</option>';
            keys.forEach(id => {
                const name = towns[id].getName ? towns[id].getName() : ('#' + id);
                const sel  = String(id) === String(current) ? ' selected' : '';
                html += '<option value="' + id + '"' + sel + '>' + name + ' (#' + id + ')</option>';
            });
            return html;
        } catch (e) {
            return '<option value="">' + this.t('aas_error_loading_cities') + '</option>';
        }
    }

    // ═════════════════════════════════════════════════
    //  Salvar cidade — cada feitiço independente
    // ═════════════════════════════════════════════════
    _saveEqTown = () => {
        const id = (uw.$('#asp_eq_town_sel').val() || '').trim();
        if (!id) { uw.$('#asp_eq_status').text(this.t('aas_select_city_log')).css('color', '#f87171'); return; }
        this.eqTownId = id;
        this.storage.save('asp_eq_town_id', id);
        const name = this._townName(id);
        uw.$('#asp_eq_status').text(this.t('asp_city_saved', { name, id })).css('color', '#1a6b2a');
        this.console.log('[AutoSpells/EQ] ' + this.t('asp_city_saved', { name, id }));
    };

    _saveHapTown = () => {
        const id = (uw.$('#asp_hap_town_sel').val() || '').trim();
        if (!id) { uw.$('#asp_hap_status').text(this.t('aas_select_city_log')).css('color', '#f87171'); return; }
        this.hapTownId = id;
        this.storage.save('asp_hap_town_id', id);
        const name = this._townName(id);
        uw.$('#asp_hap_status').text(this.t('asp_city_saved', { name, id })).css('color', '#1a6b2a');
        this.console.log('[AutoSpells/HAP] ' + this.t('asp_city_saved', { name, id }));
    };

    _saveAresTown = () => {
        const id = (uw.$('#asp_ares_town_sel').val() || '').trim();
        if (!id) { uw.$('#asp_ares_log').text(this.t('aas_select_city_log')).css('color', '#f87171'); return; }
        this.aresTownId = id;
        this.storage.save('asp_ares_town_id', id);
        const name = this._townName(id);
        uw.$('#asp_ares_log').text(this.t('aas_city_saved_status', { name })).css('color', '#1a6b2a');
        this.console.log('[AutoSpells/Ares] ' + this.t('aas_city_saved_log', { name, id }));
        this._renderAresStatus();
    };

    // ═════════════════════════════════════════════════
    //  TERREMOTO
    // ═════════════════════════════════════════════════
    _toggleEq = () => { if (this._eqActive) this._stopEq(); else this._startEq(); };

    _startEq() {
        if (this._eqActive) return;
        if (!this.eqTownId) {
            uw.$('#asp_eq_status').text(this.t('asp_select_before_start')).css('color', '#eab308');
            return;
        }
        this._eqActive = true;
        this.storage.save('asp_eq_active', true);
        this._refreshBtn('asp_eq_title', true);
        this._castEarthquake();
        this._nextEqTs = Date.now() + this.EQ_INTERVAL_MS;
        this._eqIntervalId = this.createGuardedInterval(() => {
            this._castEarthquake();
            this._nextEqTs = Date.now() + this.EQ_INTERVAL_MS;
        }, this.EQ_INTERVAL_MS);
        this.console.log('[AutoSpells/EQ] Iniciado. Alvo: ' + this._townName(this.eqTownId));
        this._startClock();
    }

    _stopEq() {
        this._eqActive = false;
        this.storage.save('asp_eq_active', false);
        if (this._eqIntervalId) { clearInterval(this._eqIntervalId); this._eqIntervalId = null; }
        this._nextEqTs = null;
        this._refreshBtn('asp_eq_title', false);
        uw.$('#asp_eq_status').text(this.t('asp_stopped_log'));
        this.console.log('[AutoSpells/EQ] Parado.');
        this._maybeStopClock();
    }

    _castEarthquake = async () => {
        if (window.__multbot_captcha_active) return;
        if (!this.eqTownId) return;
        try {
            const res = await this.ajaxPostWithTimeout('frontend_bridge', 'execute', {
                model_url: 'CastedPowers', action_name: 'cast', captcha: null,
                arguments: { power_id: 'earthquake',          target_id: parseInt(this.eqTownId, 10) },
            });
            const name = this._townName(this.eqTownId);
            if (res && !res.error) {
                this.console.log('[AutoSpells/EQ] ' + this.t('asp_earthquake_cast_log', { name }));
            } else {
                const reason = (res && res.error) ? res.error : this.t('asp_unknown_reason');
                this.console.log('[AutoSpells/EQ] ' + this.t('asp_earthquake_fail_log', { reason }));
                uw.$('#asp_eq_status').text(this.t('asp_earthquake_fail_log', { reason })).css('color', '#f87171');
            }
        } catch (e) {
            this.console.log('[AutoSpells/EQ] ' + this.t('asp_earthquake_fail_log', { reason: this.t('asp_network_error') }));
        }
    };

    // ═════════════════════════════════════════════════
    //  FELICIDADE (HERA — hera_divine_sign)
    // ═════════════════════════════════════════════════
    _toggleHap = () => { if (this._hapActive) this._stopHap(); else this._startHap(); };

    _startHap() {
        if (this._hapActive) return;
        if (!this.hapTownId) {
            uw.$('#asp_hap_status').text(this.t('asp_select_before_start')).css('color', '#eab308');
            return;
        }
        this._hapActive = true;
        this.storage.save('asp_hap_active', true);
        this._refreshBtn('asp_hap_title', true);
        this._castHappiness();
        this._nextHapTs = Date.now() + this.HAP_INTERVAL_MS;
        this._hapIntervalId = this.createGuardedInterval(() => {
            this._castHappiness();
            this._nextHapTs = Date.now() + this.HAP_INTERVAL_MS;
        }, this.HAP_INTERVAL_MS);
        this.console.log('[AutoSpells/HAP] Iniciado. Alvo: ' + this._townName(this.hapTownId));
        this._startClock();
    }

    _stopHap() {
        this._hapActive = false;
        this.storage.save('asp_hap_active', false);
        if (this._hapIntervalId) { clearInterval(this._hapIntervalId); this._hapIntervalId = null; }
        this._nextHapTs = null;
        this._refreshBtn('asp_hap_title', false);
        uw.$('#asp_hap_status').text(this.t('asp_stopped_log'));
        this.console.log('[AutoSpells/HAP] Parado.');
        this._maybeStopClock();
    }

    _castHappiness = async () => {
        if (window.__multbot_captcha_active) return;
        if (!this.hapTownId) return;
        try {
            const res = await this.ajaxPostWithTimeout('frontend_bridge', 'execute', {
                model_url: 'CastedPowers', action_name: 'cast', captcha: null,
                // HERA — não Zeus
                arguments: { power_id: 'happiness',        target_id: parseInt(this.hapTownId, 10) },
            });
            const name = this._townName(this.hapTownId);
            if (res && !res.error) {
                this.console.log('[AutoSpells/HAP] ' + this.t('asp_happiness_cast_log', { name }));
            } else {
                const reason = (res && res.error) ? res.error : this.t('asp_unknown_reason');
                this.console.log('[AutoSpells/HAP] ' + this.t('asp_happiness_fail_log', { reason }));
                uw.$('#asp_hap_status').text(this.t('asp_happiness_fail_log', { reason })).css('color', '#f87171');
            }
        } catch (e) {
            this.console.log('[AutoSpells/HAP] ' + this.t('asp_happiness_fail_log', { reason: this.t('asp_network_error') }));
        }
    };

    // ═════════════════════════════════════════════════
    //  SACRIFÍCIO DE ARES
    // ═════════════════════════════════════════════════
    _toggleAres = () => { if (this._aresActive) this._stopAres(); else this._startAres(); };

    _startAres() {
        if (this._aresActive) return;
        if (!this.aresTownId) {
            uw.$('#asp_ares_log').text(this.t('aas_select_before_start_status')).css('color', '#eab308');
            return;
        }
        this._aresActive = true;
        this.storage.save('asp_ares_active', true);
        this._refreshBtn('asp_ares_title', true);
        this.console.log('[AutoSpells/Ares] ' + this.t('ar_started'));
        this._tickAres();
        this._aresIntervalId = this.createGuardedInterval(() => this._tickAres(), this.ARES_CHECK_MS);
    }

    _stopAres() {
        this._aresActive = false;
        this.storage.save('asp_ares_active', false);
        if (this._aresIntervalId) { clearInterval(this._aresIntervalId); this._aresIntervalId = null; }
        this._refreshBtn('asp_ares_title', false);
        uw.$('#asp_ares_log').text(this.t('ar_stopped_log'));
        this.console.log('[AutoSpells/Ares] ' + this.t('ar_stopped_log'));
    }

    _isSpecialUnit(unitId) {
        try { const d = uw.GameData.units[unitId]; return !d || !!(d.is_naval || d.god_id); } catch (e) { return true; }
    }

    _getLandTroopCount(town) {
        try {
            const units = town.units() || {};
            let support = {};
            try { support = town.unitsSupport() || {}; } catch (e) {}
            let total = 0;
            for (const unit of Object.keys(units)) {
                if (unit === 'militia' || this._isSpecialUnit(unit)) continue;
                total += Math.max(0, (units[unit] || 0) - (support[unit] || 0));
            }
            return total;
        } catch (e) { return 0; }
    }

    _getAresFavor() {
        try { return uw.ITowns.player_gods.attributes.ares_favor || 0; } catch (e) { return 0; }
    }

    _getCurrentFury() {
        try { return uw.ITowns.player_gods.attributes.fury || 0; } catch (e) { return 0; }
    }

    _renderAresStatus() {
        try {
            const fury     = this._getCurrentFury();
            const favor    = this._getAresFavor();
            const town     = this.aresTownId ? uw.ITowns.towns[this.aresTownId] : null;
            const townName = town && town.getName ? town.getName()
                           : (this.aresTownId ? '#' + this.aresTownId + ' (' + this.t('aas_not_found') + ')'
                                              : this.t('aas_none_selected'));
            const troops   = town ? this._getLandTroopCount(town) : 0;
            const color    = troops >= this.ARES_MIN_TROOPS ? '#1a6b2a' : '#8a2a2a';
            uw.$('#asp_ares_status').html(
                this.t('aas_current_fury',    { fury, max: this.ARES_MAX_FURY }) +
                this.t('aas_favor_account',   { god: 'Ares', favor }) +
                this.t('aas_city_status',     { name: townName }) +
                this.t('aas_own_land_troops', { color, count: troops, min: this.ARES_MIN_TROOPS })
            );
        } catch (e) {}
    }

    async _tickAres() {
        if (window.__multbot_captcha_active) return;
        if (!this.aresTownId) return;
        try {
            const fury = this._getCurrentFury();
            if (fury >= this.ARES_MAX_FURY) {
                this.console.log('[AutoSpells/Ares] ' + this.t('aas_max_fury_reached_log', { max: this.ARES_MAX_FURY }));
                uw.$('#asp_ares_log').text(this.t('aas_max_fury_reached_status')).css('color', '#1a6b2a');
                this._stopAres();
                return;
            }
            const town = uw.ITowns.towns[this.aresTownId];
            if (!town) return;
            const favor = this._getAresFavor();
            this._renderAresStatus();
            if (favor < this.ARES_FAVOR_COST) return;
            const troops   = this._getLandTroopCount(town);
            const townName = this._townName(this.aresTownId);
            if (troops < this.ARES_MIN_TROOPS) {
                this.console.log('[AutoSpells/Ares] ' + this.t('aas_waiting_reinforcement_log', { town: townName, count: troops, min: this.ARES_MIN_TROOPS }));
                return;
            }
            this.console.log('[AutoSpells/Ares] ' + this.t('aas_casting_log', { town: townName, favor, god: 'Ares', count: troops }));
            const res = await this.ajaxPostWithTimeout('frontend_bridge', 'execute', {
                model_url: 'CastedPowers', action_name: 'cast', captcha: null,
                arguments: { power_id: 'ares_sacrifice', target_id: parseInt(this.aresTownId, 10) },
            });
            if (res && !res.error) {
                const newFury  = this._getCurrentFury();
                const newFavor = this._getAresFavor();
                this.console.log('[AutoSpells/Ares] ' + this.t('aas_cast_success_log', { fury: newFury, max: this.ARES_MAX_FURY, favor: newFavor }));
                uw.$('#asp_ares_log').text(this.t('aas_cast_success_status', { fury: newFury, max: this.ARES_MAX_FURY })).css('color', '#1a6b2a');
                this._renderAresStatus();
            } else {
                const reason = (res && res.error) ? res.error : this.t('aas_unknown_reason');
                this.console.log('[AutoSpells/Ares] ' + this.t('aas_cast_fail_log', { reason }));
                uw.$('#asp_ares_log').text(this.t('aas_cast_fail_status', { reason })).css('color', '#f87171');
            }
        } catch (e) {
            this.console.log('[AutoSpells/Ares] ' + this.t('aas_tick_error', { msg: e && e.message ? e.message : e }));
        }
    }

    // ═════════════════════════════════════════════════
    //  FESTIVAL DA CARIDADE
    // ═════════════════════════════════════════════════
    _toggleCarnival = () => { if (this._carnivalActive) this._stopCarnival(); else this._startCarnival(); };

    _startCarnival() {
        if (this._carnivalActive) return;
        this._carnivalActive = true;
        this.storage.save('asp_carnival_active', true);
        this._refreshBtn('asp_carnival_title', true);
        this.console.log('[AutoSpells/Carnival] ' + this.t('asp_carnival_started_log'));
        this._tickCarnival();
        this._carnivalIntervalId = this.createGuardedInterval(() => this._tickCarnival(), this.CARNIVAL_CHECK_MS);
    }

    _stopCarnival() {
        this._carnivalActive = false;
        this.storage.save('asp_carnival_active', false);
        if (this._carnivalIntervalId) { clearInterval(this._carnivalIntervalId); this._carnivalIntervalId = null; }
        this._refreshBtn('asp_carnival_title', false);
        uw.$('#asp_carnival_status').text(this.t('asp_stopped_log'));
        this.console.log('[AutoSpells/Carnival] ' + this.t('asp_stopped_log'));
    }

    async _tickCarnival() {
        if (window.__multbot_captcha_active) return;
        try {
            const favor = this._getAresFavor();
            if (favor < this.CARNIVAL_FAVOR_COST) {
                uw.$('#asp_carnival_status').text(this.t('asp_carnival_low_favor', { favor, cost: this.CARNIVAL_FAVOR_COST })).css('color', '#eab308');
                return;
            }
            const activeTriumphs = this._getActiveCelebrationTowns('triumph');
            const candidates = Object.keys(uw.ITowns.towns).filter(id => !activeTriumphs.includes(parseInt(id, 10)));
            if (!candidates.length) {
                uw.$('#asp_carnival_status').text(this.t('asp_carnival_all_have_triumph')).css('color', '#5a3a0a');
                return;
            }
            let castCount = 0;
            let avail = favor;
            for (const townId of candidates) {
                if (avail < this.CARNIVAL_FAVOR_COST) break;
                const ok = await this._castCarnival(townId);
                if (ok) { castCount++; avail -= this.CARNIVAL_FAVOR_COST; await this.sleep(800); }
            }
            const msg = castCount > 0
                ? this.t('asp_carnival_cast_log', { count: castCount })
                : this.t('asp_carnival_none_cast');
            uw.$('#asp_carnival_status').text(msg).css('color', castCount > 0 ? '#1a6b2a' : '#5a3a0a');
            if (castCount > 0) this.console.log('[AutoSpells/Carnival] ' + msg);
        } catch (e) {
            this.console.log('[AutoSpells/Carnival] Erro: ' + (e && e.message ? e.message : e));
        }
    }

    _getActiveCelebrationTowns(type) {
        try {
            const models = uw.MM.getModels().Celebration;
            if (!models) return [];
            return Object.values(models).filter(m => m.attributes.celebration_type === type).map(m => m.attributes.town_id);
        } catch (e) { return []; }
    }

    _castCarnival = async (townId) => {
        try {
            const res = await this.ajaxPostWithTimeout('frontend_bridge', 'execute', {
                model_url: 'CastedPowers', action_name: 'cast', captcha: null,
                arguments: { power_id: 'charitable_festival', target_id: parseInt(townId, 10) },
            });
            return !!(res && !res.error);
        } catch (e) { return false; }
    };

    // ═════════════════════════════════════════════════
    //  COUNTDOWN CLOCK
    // ═════════════════════════════════════════════════
    _startClock() {
        if (this._clockIntervalId) return;
        this._clockIntervalId = setInterval(() => this._updateCountdowns(), this.CLOCK_TICK_MS);
    }

    _maybeStopClock() {
        if (this._eqActive || this._hapActive) return;
        if (this._clockIntervalId) { clearInterval(this._clockIntervalId); this._clockIntervalId = null; }
    }

    _updateCountdowns() {
        const now = Date.now();
        if (this._eqActive && this._nextEqTs) {
            const rem = Math.max(0, this._nextEqTs - now);
            uw.$('#asp_eq_status').text(this.t('asp_next_eq', { time: this._formatMs(rem) })).css('color', '#5a3a0a');
        }
        if (this._hapActive && this._nextHapTs) {
            const rem = Math.max(0, this._nextHapTs - now);
            uw.$('#asp_hap_status').text(this.t('asp_next_hap', { time: this._formatMs(rem) })).css('color', '#5a3a0a');
        }
    }

    // ═════════════════════════════════════════════════
    //  HELPERS
    // ═════════════════════════════════════════════════
    _refreshBtn(id, active) {
        uw.$('#' + id).css('filter', active ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    }

    _formatMs(ms) {
        const total = Math.floor(ms / 1000);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        return (h > 0 ? String(h).padStart(2, '0') + ':' : '') +
               String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    _townName(id) {
        try { const t = uw.ITowns.towns[id]; return t && t.getName ? t.getName() : ('#' + id); } catch (e) { return '#' + id; }
    }
};
