// ══════════════════════════════════════════════════════
//  MODULE: AutoSpells  (v2.0 — Unified Spells Hub)
//
//  Reúne em uma única aba todos os feitiços automáticos:
//
//  [🌍 Auto Terremoto]
//     Lança poseidon_earthquake na cidade-alvo a cada 1h.
//
//  [😊 Auto Felicidade]
//     Lança zeus_divine_sign na cidade-alvo a cada 3h.
//
//  [🔥 Auto Sacrifício de Ares]  ← absorvido do AutoAresSacrifice
//     Lança ares_sacrifice assim que houver 100 de favor
//     E >= 50 tropas terrestres próprias na cidade escolhida.
//     Para automaticamente ao atingir 5000 de fúria.
//     Cada cidade tem seu próprio dropdown (ex-comportamento).
//
//  [🎪 Auto Festival da Caridade]
//     Antes de cada Desfile (triumph), tenta lançar o
//     Festival da Caridade (ares_carnival) na mesma cidade.
//     Só lança se o favor de Ares for suficiente.
//     Integrado ao fluxo do checkTriumph do AutoParty.
//     OBS: O AutoParty continua no módulo auto_party.js;
//     aqui apenas adicionamos a chamada de pré-desfile.
//     power_id: "ares_carnival"
//
//  ARQUITETURA:
//  - Terremoto e Felicidade usam cidade-alvo única (ID)
//  - Sacrifício de Ares usa dropdown de cidade própria
//  - Festival da Caridade atua em TODAS as cidades com
//    desfile disponível (não requer cidade fixa)
//  - Todos os intervals respeitam createGuardedInterval
//  - Countdown em tempo real (HH:MM:SS) para Terremoto
//    e Felicidade
//  - Auto-start persistido por feitiço individualmente
// ══════════════════════════════════════════════════════

var AutoSpells = class extends MultUtil {

    // ── Constantes ───────────────────────────────────
    EQ_INTERVAL_MS     = 60 * 60 * 1000;      // Terremoto: 1 hora
    HAP_INTERVAL_MS    = 3 * 60 * 60 * 1000;  // Felicidade: 3 horas
    ARES_CHECK_MS      = 20 * 1000;            // Sacrifício: verifica a cada 20s
    CARNIVAL_CHECK_MS  = 30 * 1000;            // Festival: verifica a cada 30s
    CLOCK_TICK_MS      = 1000;

    // Ares
    ARES_GOD_ID        = 'ares';
    ARES_FAVOR_COST    = 100;
    ARES_MAX_FURY      = 5000;
    ARES_MIN_TROOPS    = 50;

    // Carnival
    CARNIVAL_FAVOR_COST = 100;  // custo estimado — confirmar via DevTools
    CARNIVAL_POWER_ID   = 'ares_carnival';

    constructor(c, s) {
        super(c, s);

        // ── Estado: Terremoto ────────────────────────
        this._eqActive       = false;
        this._eqIntervalId   = null;
        this._nextEqTs       = null;

        // ── Estado: Felicidade ───────────────────────
        this._hapActive      = false;
        this._hapIntervalId  = null;
        this._nextHapTs      = null;

        // ── Estado: Sacrifício de Ares ───────────────
        this._aresActive     = false;
        this._aresIntervalId = null;
        this.aresTownId      = this.storage.load('asp_ares_town_id', '');

        // ── Estado: Festival da Caridade ─────────────
        this._carnivalActive     = false;
        this._carnivalIntervalId = null;

        // ── Cidade alvo de Terremoto / Felicidade ────
        this.targetId = this.storage.load('asp_target_id', '');

        // ── Clock de countdown ───────────────────────
        this._clockIntervalId = null;

        // ── Auto-start ───────────────────────────────
        if (this.storage.load('asp_eq_active',       false)) setTimeout(() => this._startEq(),       2500);
        if (this.storage.load('asp_hap_active',      false)) setTimeout(() => this._startHap(),      2600);
        if (this.storage.load('asp_ares_active',     false)) setTimeout(() => this._startAres(),     2700);
        if (this.storage.load('asp_carnival_active', false)) setTimeout(() => this._startCarnival(), 2800);
    }

    // ═════════════════════════════════════════════════
    //  UI — Settings Panel
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

        // Título principal
        this.getTitleHtml('asp_panel_title', this.t('asp_title'), null, '', false) +

        // ── Seção: Terremoto + Felicidade compartilham cidade alvo ──
        '  <div style="padding:6px 10px 2px;font-weight:bold;font-size:11px;border-bottom:1px solid #c9a96e;">🎯 ' + this.t('asp_spell_target_section') + '</div>' +
        '  <div style="padding:6px 10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
        '    <span style="font-size:11px;font-weight:bold;">' + this.t('asp_city_label') + '</span>' +
        '    <input id="asp_city_input" type="text" placeholder="' + this.t('asp_city_placeholder') + '"' +
        '           value="' + (this.targetId || '') + '" style="width:110px;padding:3px 5px;font-size:12px;" />' +
        this.getButtonHtml('asp_save_city_btn', this.t('asp_save_btn'), this._saveCity) +
        '    <span id="asp_city_status" style="font-size:11px;color:#5a3a0a;"></span>' +
        '  </div>' +

        // ── Auto Terremoto ──────────────────────────────────────────
        '  <div class="game_border" style="margin:4px 10px;padding:5px 8px;">' +
        '    <div class="game_border_top"></div><div class="game_border_bottom"></div>' +
        '    <div class="game_border_left"></div><div class="game_border_right"></div>' +
        '    <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>' +
        '    <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>' +
        this.getTitleHtml('asp_eq_title', this.t('asp_earthquake_title'), this._toggleEq, '', this._eqActive) +
        '    <div style="padding:1px 6px 3px;font-size:11px;">' + this.t('asp_earthquake_desc') + '</div>' +
        '    <div id="asp_eq_status" style="padding:0 6px 5px;font-size:11px;color:#5a3a0a;min-height:14px;"></div>' +
        '  </div>' +

        // ── Auto Felicidade ─────────────────────────────────────────
        '  <div class="game_border" style="margin:4px 10px;padding:5px 8px;">' +
        '    <div class="game_border_top"></div><div class="game_border_bottom"></div>' +
        '    <div class="game_border_left"></div><div class="game_border_right"></div>' +
        '    <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>' +
        '    <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>' +
        this.getTitleHtml('asp_hap_title', this.t('asp_happiness_title'), this._toggleHap, '', this._hapActive) +
        '    <div style="padding:1px 6px 3px;font-size:11px;">' + this.t('asp_happiness_desc') + '</div>' +
        '    <div id="asp_hap_status" style="padding:0 6px 5px;font-size:11px;color:#5a3a0a;min-height:14px;"></div>' +
        '  </div>' +

        // ── Seção: Feitiços de Ares ─────────────────────────────────
        '  <div style="padding:6px 10px 2px;font-weight:bold;font-size:11px;border-bottom:1px solid #c9a96e;">🔥 ' + this.t('asp_ares_section') + '</div>' +

        // ── Auto Sacrifício de Ares ─────────────────────────────────
        '  <div class="game_border" style="margin:4px 10px;padding:5px 8px;">' +
        '    <div class="game_border_top"></div><div class="game_border_bottom"></div>' +
        '    <div class="game_border_left"></div><div class="game_border_right"></div>' +
        '    <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>' +
        '    <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>' +
        this.getTitleHtml('asp_ares_title', this.t('asp_ares_title'), this._toggleAres, '', this._aresActive) +
        '    <div style="padding:1px 6px 3px;font-size:11px;">' + this.t('asp_ares_desc', { favor: this.ARES_FAVOR_COST, troops: this.ARES_MIN_TROOPS, fury: this.ARES_MAX_FURY }) + '</div>' +
        '    <div style="padding:3px 6px;display:flex;gap:6px;align-items:center;">' +
        '      <label style="font-size:11px;font-weight:bold;">' + this.t('aas_city_label') + '</label>' +
        '      <select id="asp_ares_town_select" style="flex:1;padding:3px;font-size:11px;">' + this._getAresTownOptionsHtml() + '</select>' +
        this.getButtonHtml('asp_ares_save_btn', this.t('apply'), this._saveAresTown) +
        '    </div>' +
        '    <div id="asp_ares_status" style="padding:1px 6px 3px;font-size:11px;color:#5a3a0a;min-height:14px;"></div>' +
        '    <div id="asp_ares_log"    style="padding:0 6px 5px;font-size:11px;color:#5a3a0a;min-height:14px;"></div>' +
        '  </div>' +

        // ── Auto Festival da Caridade ───────────────────────────────
        '  <div class="game_border" style="margin:4px 10px 10px;padding:5px 8px;">' +
        '    <div class="game_border_top"></div><div class="game_border_bottom"></div>' +
        '    <div class="game_border_left"></div><div class="game_border_right"></div>' +
        '    <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>' +
        '    <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>' +
        this.getTitleHtml('asp_carnival_title', this.t('asp_carnival_title'), this._toggleCarnival, '', this._carnivalActive) +
        '    <div style="padding:1px 6px 3px;font-size:11px;">' + this.t('asp_carnival_desc') + '</div>' +
        '    <div id="asp_carnival_status" style="padding:0 6px 5px;font-size:11px;color:#5a3a0a;min-height:14px;"></div>' +
        '  </div>' +

        '</div>';
    };

    // ═════════════════════════════════════════════════
    //  CIDADE ALVO: Terremoto + Felicidade
    // ═════════════════════════════════════════════════
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

    // ═════════════════════════════════════════════════
    //  TERREMOTO
    // ═════════════════════════════════════════════════
    _toggleEq = () => { if (this._eqActive) this._stopEq(); else this._startEq(); };

    _startEq() {
        if (this._eqActive) return;
        if (!this._validateSpellTarget()) return;
        this._eqActive = true;
        this.storage.save('asp_eq_active', true);
        this._refreshBtn('asp_eq_title', true);
        this._castEarthquake();
        this._nextEqTs = Date.now() + this.EQ_INTERVAL_MS;
        this._eqIntervalId = this.createGuardedInterval(() => {
            this._castEarthquake();
            this._nextEqTs = Date.now() + this.EQ_INTERVAL_MS;
        }, this.EQ_INTERVAL_MS);
        this.console.log('[AutoSpells] Terremoto iniciado. Alvo: ' + this._getTargetName());
        this._startClock();
    }

    _stopEq() {
        this._eqActive = false;
        this.storage.save('asp_eq_active', false);
        if (this._eqIntervalId) { clearInterval(this._eqIntervalId); this._eqIntervalId = null; }
        this._nextEqTs = null;
        this._refreshBtn('asp_eq_title', false);
        uw.$('#asp_eq_status').text(this.t('asp_stopped_log'));
        this.console.log('[AutoSpells] Terremoto parado.');
        this._maybeStopClock();
    }

    _castEarthquake = async () => {
        if (window.__multbot_captcha_active) return;
        if (!this.targetId) return;
        try {
            const res = await this.ajaxPostWithTimeout('frontend_bridge', 'execute', {
                model_url: 'CastedPowers', action_name: 'cast', captcha: null,
                arguments: { power_id: 'poseidon_earthquake', target_id: parseInt(this.targetId, 10) },
            });
            const name = this._getTargetName();
            if (res && !res.error) {
                this.console.log('[AutoSpells] ' + this.t('asp_earthquake_cast_log', { name }));
            } else {
                const reason = (res && res.error) ? res.error : this.t('asp_unknown_reason');
                this.console.log('[AutoSpells] ' + this.t('asp_earthquake_fail_log', { reason }));
                uw.$('#asp_eq_status').text(this.t('asp_earthquake_fail_log', { reason })).css('color', '#f87171');
            }
        } catch (e) {
            const reason = this.t('asp_network_error');
            this.console.log('[AutoSpells] ' + this.t('asp_earthquake_fail_log', { reason }));
        }
    };

    // ═════════════════════════════════════════════════
    //  FELICIDADE
    // ═════════════════════════════════════════════════
    _toggleHap = () => { if (this._hapActive) this._stopHap(); else this._startHap(); };

    _startHap() {
        if (this._hapActive) return;
        if (!this._validateSpellTarget()) return;
        this._hapActive = true;
        this.storage.save('asp_hap_active', true);
        this._refreshBtn('asp_hap_title', true);
        this._castHappiness();
        this._nextHapTs = Date.now() + this.HAP_INTERVAL_MS;
        this._hapIntervalId = this.createGuardedInterval(() => {
            this._castHappiness();
            this._nextHapTs = Date.now() + this.HAP_INTERVAL_MS;
        }, this.HAP_INTERVAL_MS);
        this.console.log('[AutoSpells] Felicidade iniciada. Alvo: ' + this._getTargetName());
        this._startClock();
    }

    _stopHap() {
        this._hapActive = false;
        this.storage.save('asp_hap_active', false);
        if (this._hapIntervalId) { clearInterval(this._hapIntervalId); this._hapIntervalId = null; }
        this._nextHapTs = null;
        this._refreshBtn('asp_hap_title', false);
        uw.$('#asp_hap_status').text(this.t('asp_stopped_log'));
        this.console.log('[AutoSpells] Felicidade parada.');
        this._maybeStopClock();
    }

    _castHappiness = async () => {
        if (window.__multbot_captcha_active) return;
        if (!this.targetId) return;
        try {
            const res = await this.ajaxPostWithTimeout('frontend_bridge', 'execute', {
                model_url: 'CastedPowers', action_name: 'cast', captcha: null,
                arguments: { power_id: 'zeus_divine_sign', target_id: parseInt(this.targetId, 10) },
            });
            const name = this._getTargetName();
            if (res && !res.error) {
                this.console.log('[AutoSpells] ' + this.t('asp_happiness_cast_log', { name }));
            } else {
                const reason = (res && res.error) ? res.error : this.t('asp_unknown_reason');
                this.console.log('[AutoSpells] ' + this.t('asp_happiness_fail_log', { reason }));
                uw.$('#asp_hap_status').text(this.t('asp_happiness_fail_log', { reason })).css('color', '#f87171');
            }
        } catch (e) {
            const reason = this.t('asp_network_error');
            this.console.log('[AutoSpells] ' + this.t('asp_happiness_fail_log', { reason }));
        }
    };

    // ═════════════════════════════════════════════════
    //  SACRIFÍCIO DE ARES
    //  Migrado integralmente de AutoAresSacrifice.
    //  Mesma lógica de favor, fúria, tropas mínimas e
    //  exclusão de unidades especiais.
    // ═════════════════════════════════════════════════
    _toggleAres = () => { if (this._aresActive) this._stopAres(); else this._startAres(); };

    _getAresTownOptionsHtml() {
        try {
            const towns = uw.ITowns.towns;
            const keys  = Object.keys(towns).sort((a, b) => {
                const na = towns[a].getName ? towns[a].getName() : '';
                const nb = towns[b].getName ? towns[b].getName() : '';
                return na.localeCompare(nb);
            });
            let html = '<option value="">' + this.t('aas_select_city') + '</option>';
            keys.forEach(id => {
                const name = towns[id].getName ? towns[id].getName() : ('#' + id);
                const sel  = String(id) === String(this.aresTownId) ? ' selected' : '';
                html += '<option value="' + id + '"' + sel + '>' + name + ' (#' + id + ')</option>';
            });
            return html;
        } catch (e) {
            return '<option value="">' + this.t('aas_error_loading_cities') + '</option>';
        }
    }

    _saveAresTown = () => {
        const raw = (uw.$('#asp_ares_town_select').val() || '').trim();
        if (!raw) {
            uw.$('#asp_ares_log').text(this.t('aas_select_city_log')).css('color', '#f87171');
            return;
        }
        this.aresTownId = raw;
        this.storage.save('asp_ares_town_id', raw);
        const town = uw.ITowns.towns[raw];
        const name = town && town.getName ? town.getName() : ('#' + raw);
        uw.$('#asp_ares_log').text(this.t('aas_city_saved_status', { name })).css('color', '#1a6b2a');
        this.console.log('[AutoSpells/Ares] ' + this.t('aas_city_saved_log', { name, id: raw }));
        this._renderAresStatus();
    };

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
        try {
            const d = uw.GameData.units[unitId];
            if (!d) return true;
            return !!(d.is_naval || d.god_id);
        } catch (e) { return true; }
    }

    _getLandTroopCount(town) {
        try {
            const units   = town.units() || {};
            let support   = {};
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
        try { return uw.ITowns.player_gods.attributes[this.ARES_GOD_ID + '_favor'] || 0; } catch (e) { return 0; }
    }

    _getCurrentFury() {
        try { return uw.ITowns.player_gods.attributes.fury || 0; } catch (e) { return 0; }
    }

    _renderAresStatus() {
        try {
            const fury      = this._getCurrentFury();
            const favor     = this._getAresFavor();
            const town      = this.aresTownId ? uw.ITowns.towns[this.aresTownId] : null;
            const townName  = town && town.getName ? town.getName()
                            : (this.aresTownId ? '#' + this.aresTownId + ' (' + this.t('aas_not_found') + ')'
                                               : this.t('aas_none_selected'));
            const troops    = town ? this._getLandTroopCount(town) : 0;
            const color     = troops >= this.ARES_MIN_TROOPS ? '#1a6b2a' : '#8a2a2a';
            uw.$('#asp_ares_status').html(
                this.t('aas_current_fury', { fury, max: this.ARES_MAX_FURY }) +
                this.t('aas_favor_account', { god: 'Ares', favor }) +
                this.t('aas_city_status',   { name: townName }) +
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
            if (!town) { this.console.log('[AutoSpells/Ares] ' + this.t('aas_city_not_found_log', { id: this.aresTownId })); return; }
            const favor = this._getAresFavor();
            this._renderAresStatus();
            if (favor < this.ARES_FAVOR_COST) return;
            const troops   = this._getLandTroopCount(town);
            const townName = town.getName ? town.getName() : ('#' + this.aresTownId);
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
    //  FESTIVAL DA CARIDADE (ares_carnival)
    //  Percorre TODAS as cidades com Desfile (triumph)
    //  disponível. Para cada uma, tenta lançar o Festival
    //  da Caridade antes — se o favor de Ares for
    //  suficiente. O jogo recusa silenciosamente se o
    //  feitiço já estiver ativo na cidade (nenhum dano).
    //
    //  FLUXO:
    //  1. Lista cidades onde triumph está disponível
    //     (cidades sem triumph ativo no momento)
    //  2. Para cada uma, checa favor de Ares >= custo
    //  3. Lança ares_carnival nessa cidade
    //  4. Aguarda 800ms entre cada envio (anti-spam)
    //  5. Não lança o triumph aqui — o AutoParty cuida
    //     disso no próprio módulo
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
                uw.$('#asp_carnival_status').text(
                    this.t('asp_carnival_low_favor', { favor, cost: this.CARNIVAL_FAVOR_COST })
                ).css('color', '#eab308');
                return;
            }

            // Cidades que JÁ têm triumph ativo (não precisam de carnival agora)
            const activeTriumphs = this._getActiveCelebrationTowns('triumph');

            // Todas as cidades do jogador que NÃO têm triumph ativo
            // são candidatas a receber o carnival pré-desfile
            const candidateTowns = Object.keys(uw.ITowns.towns)
                .filter(id => !activeTriumphs.includes(parseInt(id, 10)));

            if (candidateTowns.length === 0) {
                uw.$('#asp_carnival_status').text(this.t('asp_carnival_all_have_triumph')).css('color', '#5a3a0a');
                return;
            }

            let castCount = 0;
            let availFavor = favor;

            for (const townId of candidateTowns) {
                if (availFavor < this.CARNIVAL_FAVOR_COST) break;
                const ok = await this._castCarnival(townId);
                if (ok) {
                    castCount++;
                    availFavor -= this.CARNIVAL_FAVOR_COST;
                    await this.sleep(800); // pausa anti-spam entre cidades
                }
            }

            if (castCount > 0) {
                const msg = this.t('asp_carnival_cast_log', { count: castCount });
                this.console.log('[AutoSpells/Carnival] ' + msg);
                uw.$('#asp_carnival_status').text(msg).css('color', '#1a6b2a');
            } else {
                uw.$('#asp_carnival_status').text(this.t('asp_carnival_none_cast')).css('color', '#5a3a0a');
            }
        } catch (e) {
            this.console.log('[AutoSpells/Carnival] Erro: ' + (e && e.message ? e.message : e));
        }
    }

    // Retorna lista de town_id (número) com celebration_type ativo
    _getActiveCelebrationTowns(type) {
        try {
            const models = uw.MM.getModels().Celebration;
            if (!models) return [];
            return Object.values(models)
                .filter(m => m.attributes.celebration_type === type)
                .map(m => m.attributes.town_id);
        } catch (e) { return []; }
    }

    _castCarnival = async (townId) => {
        try {
            const res = await this.ajaxPostWithTimeout('frontend_bridge', 'execute', {
                model_url: 'CastedPowers', action_name: 'cast', captcha: null,
                arguments: { power_id: this.CARNIVAL_POWER_ID, target_id: parseInt(townId, 10) },
            });
            // Sucesso: sem erro. Jogo retorna erro se já ativo — ignoramos.
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
    //  HELPERS COMPARTILHADOS
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

    _getTargetName() {
        try {
            const t = uw.ITowns.towns[this.targetId];
            return t && t.getName ? t.getName() : ('#' + this.targetId);
        } catch (e) { return '#' + this.targetId; }
    }

    _validateSpellTarget() {
        if (!this.targetId) {
            uw.$('#asp_city_status').text(this.t('asp_select_before_start')).css('color', '#eab308');
            return false;
        }
        return true;
    }
};
