// ══════════════════════════════════════════════════════
//  MODULE: ColonizeShipSender
//  Envia colonize_ships de todas as cidades como apoio
//  para uma cidade-alvo configurada pelo usuário.
// ══════════════════════════════════════════════════════
var ColonizeShipSender = class extends MultUtil {
    constructor(c, s) {
        super(c, s);
        this._running    = false;
        this._stop       = false;
        this._intervalId = null;
        this.config = this.storage.load('css_config', {
            targetTownId:    '',
            intervalMinutes: 5
        });
        this.console.log('[ColonizeShipSender] Initialized');

        // Retoma automaticamente se estava ativo antes do reload
        if (this.storage.load('css_active', false)) {
            setTimeout(() => this.start(), 2000);
        }
    }

    settings = () => {
        const cfg = this.config;
        requestAnimationFrame(() => {
            this._updateTitle();
            uw.$('#css_target_town').off('keydown').on('keydown', e => { if (e.key === 'Enter') this._saveTarget(); });
            uw.$('#css_interval').off('keydown').on('keydown',    e => { if (e.key === 'Enter') this._saveInterval(); });
        });
        return `
        <div class="game_border" style="margin-bottom:20px;">
            <div class="game_border_top"></div><div class="game_border_bottom"></div>
            <div class="game_border_left"></div><div class="game_border_right"></div>
            <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>
            <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>
            ${this.getTitleHtml('css_title', this.t('css_title'), this.toggle, '', this._running)}
            <div id="autoparty_types">
                <div class="split_content">
                    <div style="padding:5px 8px;">
                        <label style="font-weight:bold;font-size:11px;">${this.t('css_target_label')}</label><br>
                        <div style="display:flex;gap:4px;margin-top:3px;align-items:center;">
                            <input id="css_target_town" type="text" placeholder="${this.t('css_target_placeholder')}"
                                value="${cfg.targetTownId || ''}"
                                style="width:120px;padding:2px 5px;" />
                            ${this.getButtonHtml('css_save_target', this.t('css_save'), this._saveTarget)}
                        </div>
                        <div id="css_target_status" style="font-size:11px;color:#5a3a0a;margin-top:3px;">
                            ${cfg.targetTownId ? '✓ ' + this.getTownName(cfg.targetTownId) : this.t('css_none_target')}
                        </div>
                    </div>
                    <div style="padding:5px 8px;">
                        <label style="font-weight:bold;font-size:11px;">${this.t('css_interval_label')}</label><br>
                        <div style="display:flex;gap:4px;margin-top:3px;align-items:center;">
                            <input id="css_interval" type="number" min="1" max="120"
                                value="${cfg.intervalMinutes || 5}"
                                style="width:55px;padding:2px 5px;" />
                            ${this.getButtonHtml('css_save_interval', this.t('css_save'), this._saveInterval)}
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    };

    toggle = () => {
        if (this._running) this.stop();
        else this.start();
    };

    _updateTitle() {
        uw.$('#css_title').css('filter', this._running
            ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    }
    _bindEvents() {
        uw.$('#css_target_town').off('keydown').on('keydown', e => { if (e.key === 'Enter') this._saveTarget(); });
        uw.$('#css_interval').off('keydown').on('keydown',   e => { if (e.key === 'Enter') this._saveInterval(); });
        this._updateButtons();
    }

    _updateButtons() {
        if (this._running) {
            uw.$('#css_start_btn').addClass('disabled');
            uw.$('#css_stop_btn').removeClass('disabled');
        } else {
            uw.$('#css_start_btn').removeClass('disabled');
            uw.$('#css_stop_btn').addClass('disabled');
        }
        uw.$('#css_status').text(this._running ? this.t('css_running') : this.t('css_stopped_status'))
            .css('color', this._running ? '#4ade80' : '#94a3b8');
    }

    _saveTarget = () => {
        const raw = (uw.$('#css_target_town').val() || '').trim();
        const id  = this._parseTownId(raw);
        if (!id) { uw.$('#css_target_status').text(this.t('css_invalid_id')).css('color','#f87171'); return; }
        this.config.targetTownId = id;
        this._saveConfig();
        const name = this.getTownName(id);
        uw.$('#css_target_status').text(this.t('css_target_saved', { name })).css('color','#4ade80');
        this.console.log('[ColonizeShipSender] ' + this.t('css_target_saved', { name }));
    };

    _saveInterval = () => {
        const val = parseInt(uw.$('#css_interval').val(), 10);
        if (!val || val < 1) { this._log(this.t('css_invalid_interval'), 'error'); return; }
        this.config.intervalMinutes = val;
        this._saveConfig();
        this._log(this.t('css_interval_saved', { val }), 'info');
        if (this._running) { this._stopLoop(); this._startLoop(); }
    };

    _startBtn = () => this.start();
    _stopBtn  = () => this.stop();

    start() {
        if (this._running) return;
        if (!this.config.targetTownId) { this._log(this.t('css_configure_target'), 'error'); return; }
        if (!uw.gpAjax || !uw.Game)    { this._log(this.t('css_game_not_ready'), 'error'); return; }
        this._stop = false;
        this._startLoop();
        this._updateTitle();
    }

    stop() {
        this._stop = true;
        this._stopLoop();
        this._log(this.t('css_loop_stopped'), 'warning');
        this._updateTitle();
    }

    _startLoop() {
        this._running = true;
        this._updateButtons();
        this.storage.save('css_active', true);
        this._log(this.t('css_loop_started', { min: this.config.intervalMinutes }), 'success');
        this._tick();
        const ms = this.config.intervalMinutes * 60 * 1000;
        this._intervalId = setInterval(() => { if (!this._stop) this._tick(); }, ms);
    }

    _stopLoop() {
        if (this._intervalId) { clearInterval(this._intervalId); this._intervalId = null; }
        this._running = false;
        this.storage.save('css_active', false);
    }

    _tick = async () => {
    if (window.__multbot_captcha_active) return;
    this._log(this.t('css_checking'), 'info');
    try {
        const townIds = Object.keys(uw.ITowns.towns);
        if (townIds.length === 0) { this._log(this.t('mt_no_city_found'), 'warning'); return; }

        // Filtra cidades com colonize_ship disponível
        const eligible = townIds.filter(townId =>
            String(townId) !== String(this.config.targetTownId) &&
            this._getColonizeShipCount(townId) > 0
        );

        if (eligible.length === 0) { this._log(this.t('css_no_ships_available'), 'info'); return; }

        // Envio SEQUENCIAL — evita corrida no swap de Game.townId
        let totalSent = 0;
        for (const townId of eligible) {
            if (this._stop) break;

            const count    = this._getColonizeShipCount(townId);
            const townName = uw.ITowns.towns[townId]?.getName?.() || townId;

            try {
                await this._sendSupport(townId, this.config.targetTownId, count);
                this._log(this.t('css_sent_log', { town: townName, count }), 'success');
                totalSent += count;
            } catch (e) {
                this._log(this.t('css_send_error', { town: townName, msg: e?.message ?? e }), 'error');
            }

            // Delay entre cada envio para não sobrecarregar e dar tempo do restore terminar
            await this.sleep(400 + Math.random() * 300);
        }

        if (totalSent > 0) this._log(this.t('css_cycle_complete', { count: totalSent }), 'success');
    } catch (e) {
        this._log(this.t('css_cycle_error', { msg: e?.message ?? e }), 'error');
    }
};
    _getColonizeShipCount(townId) {
        try { return uw.ITowns.towns[townId].units()?.colonize_ship ?? 0; } catch { return 0; }
    }

    _sendSupport(fromTownId, toTownId, count) {
        return this._withTownId(fromTownId, () => new Promise((resolve, reject) => {
            const data = {
                id:            parseInt(toTownId, 10),
                type:          'support',
                colonize_ship: count
            };
            uw.gpAjax.ajaxPost('town_info', 'send_units', data, false,
                res => {
                    if (res && res.success) resolve(res);
                    else reject(new Error(res?.error || 'Failed to send support'));
                },
                (r, status, txt) => reject(new Error('Network error: ' + txt))
            );
        }));
    }

    // Define Game.townId temporariamente para o envio
    async _withTownId(townId, fn) {
        const orig    = uw.Game.townId;
        const origStr = uw.Game.town_id;
        uw.Game.townId  = parseInt(townId, 10);
        uw.Game.town_id = parseInt(townId, 10);
        try {
            return await fn();
        } finally {
            uw.Game.townId  = orig;
            uw.Game.town_id = origStr;
        }
    }

    /* _getTownName foi removido daqui - a mesma logica (incluindo o
       fallback extra da Backbone Town collection que vivia so aqui)
       foi incorporada ao getTownName central em core.js, e beneficia
       tambem auto_attack.js, auto_dodge.js e status.js. */

    _parseTownId(input) {
        if (!input) return null;
        const bb = input.match(/\[town[^\]]*\](\d+)\[\/town\]/i);
        if (bb) return bb[1];
        for (const m of [...input.matchAll(/#([A-Za-z0-9+\/=]{8,})/g)]) {
            try { const o = JSON.parse(atob(m[1])); if (o?.id) return String(o.id); } catch {}
        }
        const n = input.trim().match(/^\d{3,}$/);
        if (n) return input.trim();
        return null;
    }

    _saveConfig() { this.storage.save('css_config', this.config); }

    _log(message, type = 'info') {
        this.console.log('[ColonizeShipSender] ' + message);
    }
};
