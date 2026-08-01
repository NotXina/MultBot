// ══════════════════════════════════════════════════════
//  MODULE: AutoAresSacrifice
//  Monitora o FAVOR DE ARES (rastreado por conta, nao por
//  cidade - uw.ITowns.player_gods.attributes.ares_favor) e,
//  assim que atingir 100, lanca o poder "Sacrificio a Ares"
//  na cidade escolhida (via dropdown), acumulando furia ate
//  o limite de 5000. Para automaticamente ao atingir o limite.
//
//  So lanca o sacrificio se a cidade tiver pelo menos
//  MIN_LAND_TROOPS (50) tropas terrestres COMUNS e PROPRIAS
//  disponiveis - excluindo navais, unidades miticas, Enviados
//  Divinos E tropas de apoio recebidas (de si mesmo ou de
//  aliados) estacionadas ali. O desconto de apoio usa
//  town.unitsSupport() (confirmado existir no jogo), subtraindo
//  cada unidade de town.units() - cobre tanto o caso de units()
//  vir somado com o apoio quanto o caso de ja vir separado.
//
//  Deteccao de mitica/enviado divino e automatica: qualquer
//  unidade com o campo "god_id" no GameData.units.
//
//  Favor de Ares e rastreado POR CONTA, nao por cidade.
//
//  Endpoint confirmado via captura real:
//  model_url: "CastedPowers", action_name: "cast",
//  arguments: { power_id: "ares_sacrifice", target_id: <town_id> }
// ══════════════════════════════════════════════════════
var AutoAresSacrifice = class extends MultUtil {
    GOD_ID = 'ares';
    FAVOR_COST = 100;
    MAX_FURY = 5000;
    MIN_LAND_TROOPS = 50;
    // Intervalo de 2s: favor de Ares acumula lentamente (1 por vitoria)
    // — 500ms era 4x por segundo sem necessidade.
    CHECK_INTERVAL_MS = 2000;

    constructor(c, s) {
        super(c, s);
        this._active = false;
        this._intervalId = null;
        this.townId = this.storage.load('ares_sac_town_id', '');

        if (this.storage.load('ares_sac_active', false)) {
            setTimeout(() => this.start(), 2000);
        }
    }

    _getGodLabel() {
        const name = this.getGameName('god', this.GOD_ID);
        return (name && name !== this.GOD_ID) ? name : 'Ares';
    }

    settings = () => {
        requestAnimationFrame(() => {
            this._updateTitle();
            this._renderStatus();
        });

        const godLabel = this._getGodLabel();

        return (
            '<div class="game_border" style="margin-bottom:20px;">' +
            '<div class="game_border_top"></div><div class="game_border_bottom"></div>' +
            '<div class="game_border_left"></div><div class="game_border_right"></div>' +
            '<div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>' +
            '<div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>' +
            this.getTitleHtml('ares_sac_title', this.t('aas_title', { god: godLabel }), this.toggle, '', this._active) +
            '<div style="padding:5px 10px;font-weight:bold;">' +
            this.t('aas_desc', { god: godLabel, favor: this.FAVOR_COST, troops: this.MIN_LAND_TROOPS, fury: this.MAX_FURY }) +
            '</div>' +
            '<div style="padding:8px 10px;display:flex;gap:8px;align-items:center;">' +
            '<label style="font-size:11px;font-weight:bold;">' + this.t('aas_city_label') + '</label>' +
            '<select id="ares_sac_town_select" style="width:220px;padding:3px;">' +
            this._getTownOptionsHtml() +
            '</select>' +
            this.getButtonHtml('ares_sac_save_town_btn', this.t('apply'), this.saveTown) +
            '</div>' +
            '<div id="ares_sac_status" style="padding:2px 10px;font-size:11px;color:#5a3a0a;"></div>' +
            '<div id="ares_sac_log" style="padding:2px 10px 8px;font-size:11px;color:#5a3a0a;min-height:16px;"></div>' +
            '</div>'
        );
    };

    _getTownOptionsHtml() {
        try {
            const towns = uw.ITowns.towns;
            const keys = Object.keys(towns).sort((a, b) => {
                const nameA = towns[a].getName ? towns[a].getName() : '';
                const nameB = towns[b].getName ? towns[b].getName() : '';
                return nameA.localeCompare(nameB);
            });

            let html = '<option value="">' + this.t('aas_select_city') + '</option>';
            keys.forEach(id => {
                const t = towns[id];
                const name = t.getName ? t.getName() : ('#' + id);
                const selected = String(id) === String(this.townId) ? ' selected' : '';
                html += '<option value="' + id + '"' + selected + '>' + name + ' (#' + id + ')</option>';
            });
            return html;
        } catch (e) {
            return '<option value="">' + this.t('aas_error_loading_cities') + '</option>';
        }
    }

    saveTown = () => {
        const raw = (uw.$('#ares_sac_town_select').val() || '').trim();
        if (!raw) {
            this.console.log('[AutoAresSacrifice] ' + this.t('aas_no_city_selected_log'));
            uw.$('#ares_sac_log').text(this.t('aas_select_city_log')).css('color', '#f87171');
            return;
        }
        this.townId = raw;
        this.storage.save('ares_sac_town_id', raw);
        const townName = uw.ITowns.towns[raw]?.getName ? uw.ITowns.towns[raw].getName() : ('#' + raw);
        this.console.log('[AutoAresSacrifice] ' + this.t('aas_city_saved_log', { name: townName, id: raw }));
        uw.$('#ares_sac_log').text(this.t('aas_city_saved_status', { name: townName })).css('color', '#1a6b2a');
        this._renderStatus();
    };

    toggle = () => {
        if (this._active) this.stop();
        else this.start();
    };

    start() {
        if (this._active) return;
        if (!this.townId) {
            this.console.log('[AutoAresSacrifice] ' + this.t('aas_select_before_start_log'));
            uw.$('#ares_sac_log').text(this.t('aas_select_before_start_status')).css('color', '#eab308');
            return;
        }
        this._active = true;
        this.storage.save('ares_sac_active', true);
        this._updateTitle();
        this.console.log('[AutoAresSacrifice] ' + this.t('ar_started'));

        // Backbone: reage imediatamente quando o favor de Ares muda
        // (player_gods e um modelo Backbone — confirmado via inspecao
        // de ITowns.player_gods.attributes hoje)
        this._hookFavorChange();

        this._tick();
        this._intervalId = this.createGuardedInterval(() => this._tick(), this.CHECK_INTERVAL_MS);
    }

    stop() {
        this._active = false;
        this.storage.save('ares_sac_active', false);
        if (this._intervalId) { clearInterval(this._intervalId); this._intervalId = null; }
        this._unhookFavorChange();
        this._updateTitle();
        this.console.log('[AutoAresSacrifice] ' + this.t('ar_stopped_log'));
    }

    // ─────────────────────────────────────────────────────────────
    //  BACKBONE — reage imediatamente ao acumulo de favor de Ares
    // ─────────────────────────────────────────────────────────────

    _hookFavorChange() {
        try {
            const playerGods = uw.ITowns.player_gods;
            if (!playerGods) return;

            this._boundOnFavorChange = () => {
                if (!this._active) return;
                // Reage imediatamente quando o favor muda — sem esperar
                // o proximo ciclo do createGuardedInterval
                this._tick();
            };

            playerGods.on('change:' + this.GOD_ID + '_favor', this._boundOnFavorChange);
            playerGods.on('change:fury', this._boundOnFavorChange);
            this.console.log('[AutoAresSacrifice] Backbone hook ativo — reage ao acumulo de favor.');
        } catch (e) {
            this.console.log('[AutoAresSacrifice] _hookFavorChange erro: ' + (e?.message ?? e));
        }
    }

    _unhookFavorChange() {
        try {
            const playerGods = uw.ITowns.player_gods;
            if (playerGods && this._boundOnFavorChange) {
                playerGods.off('change:' + this.GOD_ID + '_favor', this._boundOnFavorChange);
                playerGods.off('change:fury', this._boundOnFavorChange);
            }
        } catch (e) {}
        this._boundOnFavorChange = null;
    }

    _updateTitle() {
        uw.$('#ares_sac_title').css('filter', this._active
            ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    }

    _getCurrentFury() {
        try {
            return uw.ITowns.player_gods.attributes.fury || 0;
        } catch (e) {
            return 0;
        }
    }

    _getAresFavor() {
        try {
            return uw.ITowns.player_gods.attributes[this.GOD_ID + '_favor'] || 0;
        } catch (e) {
            return 0;
        }
    }

    /* Unidade naval, mitica ou Enviado Divino - identificado
       automaticamente via is_naval / god_id no GameData, sem
       lista manual. */
    _isSpecialUnit(unitId) {
        try {
            const unitData = uw.GameData.units[unitId];
            if (!unitData) return true; // desconhecida - por seguranca, nao conta
            if (unitData.is_naval) return true;
            if (unitData.god_id) return true;
            return false;
        } catch (e) {
            return true;
        }
    }

    /* Conta o total de tropas TERRESTRES COMUNS e PROPRIAS
       disponiveis na cidade:
       1) Parte de town.units() (garrison total exibido pelo jogo)
       2) Subtrai, unidade por unidade, o que estiver em
          town.unitsSupport() - tropas de apoio recebidas (suas
          ou de aliados) estacionadas ali, que NAO contam como
          defesa propria da cidade para efeito desta regra.
       3) Exclui militia, navais, miticas e Enviados Divinos
          (via _isSpecialUnit).
       O resultado nunca fica negativo por unidade (protegido com
       Math.max(0, ...) em cada tipo). */
    _getLandTroopCount(town) {
        try {
            const units = town.units() || {};
            let support = {};
            try {
                support = town.unitsSupport() || {};
            } catch (e) {
                support = {};
            }

            let total = 0;
            for (const unit of Object.keys(units)) {
                if (unit === 'militia') continue;
                if (this._isSpecialUnit(unit)) continue;

                const totalCount = units[unit] || 0;
                const supportCount = support[unit] || 0;
                const ownCount = Math.max(0, totalCount - supportCount);

                total += ownCount;
            }
            return total;
        } catch (e) {
            return 0;
        }
    }

    _renderStatus() {
        try {
            const fury = this._getCurrentFury();
            const godFavor = this._getAresFavor();
            const godLabel = this._getGodLabel();
            const town = this.townId ? uw.ITowns.towns[this.townId] : null;
            const townName = town && town.getName ? town.getName() : (this.townId ? '#' + this.townId + ' (' + this.t('aas_not_found') + ')' : this.t('aas_none_selected'));
            const landTroops = town ? this._getLandTroopCount(town) : 0;
            const troopColor = landTroops >= this.MIN_LAND_TROOPS ? '#1a6b2a' : '#8a2a2a';

            const html = this.t('aas_current_fury', { fury, max: this.MAX_FURY }) +
                this.t('aas_favor_account', { god: godLabel, favor: godFavor }) +
                this.t('aas_city_status', { name: townName }) +
                this.t('aas_own_land_troops', { color: troopColor, count: landTroops, min: this.MIN_LAND_TROOPS });
            uw.$('#ares_sac_status').html(html);
        } catch (e) {}
    }

    async _tick() {
        if (window.__multbot_captcha_active) return;
        if (!this.townId) return;

        try {
            const fury = this._getCurrentFury();
            if (fury >= this.MAX_FURY) {
                this.console.log('[AutoAresSacrifice] ' + this.t('aas_max_fury_reached_log', { max: this.MAX_FURY }));
                uw.$('#ares_sac_log').text(this.t('aas_max_fury_reached_status')).css('color', '#1a6b2a');
                this.stop();
                return;
            }

            const town = uw.ITowns.towns[this.townId];
            if (!town) {
                this.console.log('[AutoAresSacrifice] ' + this.t('aas_city_not_found_log', { id: this.townId }));
                return;
            }

            const godFavor = this._getAresFavor();
            this._renderStatus();

            if (godFavor < this.FAVOR_COST) return;

            const landTroops = this._getLandTroopCount(town);
            const townName = town.getName ? town.getName() : ('#' + this.townId);

            if (landTroops < this.MIN_LAND_TROOPS) {
                this.console.log('[AutoAresSacrifice] ' + this.t('aas_waiting_reinforcement_log', { town: townName, count: landTroops, min: this.MIN_LAND_TROOPS }));
                return;
            }

            const godLabel = this._getGodLabel();
            this.console.log('[AutoAresSacrifice] ' + this.t('aas_casting_log', { town: townName, favor: godFavor, god: godLabel, count: landTroops }));

            const result = await this._castAresSacrifice(this.townId);

            if (result.success) {
                const newFury = this._getCurrentFury();
                const newFavor = this._getAresFavor();
                this.console.log('[AutoAresSacrifice] ' + this.t('aas_cast_success_log', { fury: newFury, max: this.MAX_FURY, favor: newFavor }));
                uw.$('#ares_sac_log').text(this.t('aas_cast_success_status', { fury: newFury, max: this.MAX_FURY })).css('color', '#1a6b2a');
                if (uw.HumanMessage) uw.HumanMessage.success(this.t('aas_human_message_success', { god: godLabel, fury: newFury, max: this.MAX_FURY }));
                this._renderStatus();
            } else {
                this.console.log('[AutoAresSacrifice] ' + this.t('aas_cast_fail_log', { reason: result.reason }));
                uw.$('#ares_sac_log').text(this.t('aas_cast_fail_status', { reason: result.reason })).css('color', '#f87171');
            }
        } catch (e) {
            const msg = e && e.message ? e.message : e;
            this.console.log('[AutoAresSacrifice] ' + this.t('aas_tick_error', { msg }));
        }
    }

    /* Migrado pro ajaxPostWithTimeout - a Promise manual anterior nao
       tinha timeout nenhum, o mesmo risco de travar pra sempre que ja
       identificamos e corrigimos em outros modulos (auto_farm.js). */
    _castAresSacrifice = async (townId) => {
        const data = {
            model_url: 'CastedPowers',
            action_name: 'cast',
            captcha: null,
            arguments: {
                power_id: this.GOD_ID + '_sacrifice',
                target_id: parseInt(townId, 10),
            },
        };

        try {
            const res = await this.ajaxPostWithTimeout('frontend_bridge', 'execute', data);
            this.console.log('[AutoAresSacrifice] ' + this.t('aas_server_response_log', { res: JSON.stringify(res) }));
            if (res && !res.error) {
                return { success: true };
            }
            const reason = (res && res.error) ? res.error : this.t('aas_unknown_reason');
            return { success: false, reason };
        } catch (e) {
            this.console.log('[AutoAresSacrifice] ' + this.t('aas_network_error_log', { err: e?.message ?? e }));
            return { success: false, reason: this.t('aas_network_error_reason') };
        }
    };
};
