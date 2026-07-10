// ══════════════════════════════════════════════════════
//  MODULE: StatusPanel
//  Painel de status em tempo real de todos os módulos
//
//  PDCA - correcao desta rodada: _getTownName local removido,
//  usa this.getTownName (herdado de MultUtil).
//
//  PDCA - nesta rodada: adicionadas linhas de Auto Ataque,
//  Auto Fuga (Dodge), Sacrificio de Ares e Auto Pesquisa,
//  que ja existiam no bot mas nao apareciam no painel.
// ══════════════════════════════════════════════════════
var StatusPanel = class extends MultUtil {
    constructor(c, s) {
        super(c, s);
        this._interval = null;
        this._refreshTimeoutId = null;
        this._countdownInterval = null;
        this._nextRefreshAt = null;
        this._refreshMinutes = this.storage.load('refresh_minutes', 0);

        if (this._refreshMinutes > 0) {
            this._scheduleRefresh();
        }
    }

    settings = () => {
        requestAnimationFrame(() => this._startVisuals());
        return `
        <div style="padding:5px 8px;border-bottom:1px solid rgba(0,0,0,0.1);display:flex;align-items:center;gap:8px;">
            <span style="font-weight:bold;font-size:12px;">${this.t('auto_refresh_label')}</span>
            <input id="refresh_minutes_input" type="number" min="0" max="999" value="${this._refreshMinutes}"
                style="width:55px;padding:2px 5px;" placeholder="min" />
            ${this.getButtonHtml('btn_set_refresh', this.t('apply'), this._applyRefresh)}
            <span id="refresh_status" style="font-size:11px;color:#5a3a0a;"></span>
            <span id="refresh_countdown" style="font-size:11px;color:#3a2a0a;font-weight:bold;margin-left:auto;"></span>
        </div>
        <div id="status_rows" style="padding:4px;"></div>`;
    };

    _applyRefresh = () => {
        const val = parseInt(uw.$('#refresh_minutes_input').val(), 10);

        this._clearRefresh();

        if (!val || val <= 0) {
            this._refreshMinutes = 0;
            this.storage.save('refresh_minutes', 0);
            uw.$('#refresh_status').text(this.t('status_disabled')).css('color', '#8a2a2a');
            uw.$('#refresh_countdown').text('');
            return;
        }

        this._refreshMinutes = val;
        this.storage.save('refresh_minutes', val);
        this._scheduleRefresh();
        uw.$('#refresh_status').text(this.t('status_reloads_every', { min: val })).css('color', '#1a6b2a');

        this.console.log(`[StatusPanel] Auto Refresh: ${val} minuto(s) (± jitter).`);
    };

    _clearRefresh() {
        if (this._refreshTimeoutId) {
            clearTimeout(this._refreshTimeoutId);
            this._refreshTimeoutId = null;
        }
        this._nextRefreshAt = null;
    }

    _scheduleRefresh() {
        this._clearRefresh();
        if (this._refreshMinutes <= 0) return;

        const base = this._refreshMinutes * 60 * 1000;
        const jitter = (Math.random() * 60000) - 30000;
        const ms = Math.max(base + jitter, 10000);

        this._nextRefreshAt = Date.now() + ms;
        this._refreshTimeoutId = setTimeout(() => location.reload(), ms);
    }

    _startVisuals() {
        if (this._interval) clearInterval(this._interval);
        this._render();
        this._interval = setInterval(() => this._render(), 3000);

        if (this._countdownInterval) clearInterval(this._countdownInterval);
        this._countdownInterval = setInterval(() => this._updateCountdown(), 1000);

        if (this._refreshMinutes > 0 && this._nextRefreshAt) {
            uw.$('#refresh_status').text(this.t('status_reloads_every', { min: this._refreshMinutes })).css('color', '#1a6b2a');
        } else if (this._refreshMinutes > 0) {
            this._scheduleRefresh();
            uw.$('#refresh_status').text(this.t('status_reloads_every', { min: this._refreshMinutes })).css('color', '#1a6b2a');
        }
        this._updateCountdown();
    }

    _updateCountdown() {
        if (!this._nextRefreshAt) {
            uw.$('#refresh_countdown').text('');
            return;
        }
        const remaining = Math.max(0, this._nextRefreshAt - Date.now());
        const totalSec = Math.floor(remaining / 1000);
        const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
        const ss = (totalSec % 60).toString().padStart(2, '0');
        uw.$('#refresh_countdown').text(`⏱ ${mm}:${ss}`);
    }

    _render() {
        try {
            const bot  = uw.multBot;
            const rows = [];

            const farmActive  = !!bot.autoFarm?.active;
            const ruralActive = !!bot.autoRuralLevel?.enable;
            const buildCount  = Object.keys(bot.autoBuild?.towns_buildings ?? {}).length;
            const trainCount  = Object.keys(bot.autoTrain?.city_troops ?? {}).length;
            const partyActive = !!bot.autoParty?.enable;
            const cel         = this._countCelebrations();
            const celStr      = [cel.party && `${cel.party} ${this.t('label_party')}`, cel.theater && `${cel.theater} ${this.t('label_theater')}`, cel.triumph && `${cel.triumph} ${this.t('label_triumph')}`].filter(Boolean).join(' · ') || '—';
            const gratisActive = !!bot.autoGratis?.autogratis;
            const cssActive   = !!bot.colonizeShipSender?._running;
            const asrActive   = !!bot.autoSendResources?._active;
            const militiaActive = !!bot.autoMilitia?._active;

            // These modules already existed and already expose
            // _active + toggle(), they just weren't being read here
            // on the panel yet.
            const attackActive   = !!bot.autoAttack?._active;
            const dodgeActive    = !!bot.autoDodge?._active;
            const aresActive     = !!bot.autoAresSacrifice?._active;
            const researchActive = !!bot.autoResearch?._active;

            rows.push(this._row(this.t('row_farm'),           farmActive,  farmActive  ? this.t('active')               : this.t('stopped'),             'autoFarm',           'toggle'));
            rows.push(this._row(this.t('row_rural'),    ruralActive, ruralActive ? this.t('level_label', { n: bot.autoRuralLevel.rural_level }) : this.t('stopped'), 'autoRuralLevel', 'toggle'));
            rows.push(this._row(this.t('row_build'),        buildCount > 0, buildCount > 0 ? this.t('cities_count', { n: buildCount }) : this.t('no_city'), null, null));
            rows.push(this._row(this.t('row_train'),      trainCount > 0, trainCount > 0 ? this.t('cities_count', { n: trainCount }) : this.t('no_city'), null, null));
            rows.push(this._row(this.t('row_party'),      partyActive, partyActive ? celStr : this.t('stopped'),     'autoParty',          'toggle'));
            rows.push(this._row(this.t('row_free_build'), gratisActive, gratisActive ? this.t('active') : this.t('stopped'), 'autoGratis',          'toggle'));
            rows.push(this._row(this.t('row_send_resources'), asrActive,   asrActive   ? this.t('active') : this.t('stopped'),   'autoSendResources',  'toggle'));
            rows.push(this._row(this.t('row_militia'),      militiaActive, militiaActive ? this.t('active') : this.t('stopped'), 'autoMilitia', militiaActive ? 'stop' : 'start'));
            rows.push(this._row(this.t('row_colonize_ship'), cssActive,   cssActive   ? `→ ${this.getTownName(bot.colonizeShipSender.config.targetTownId)}` : this.t('stopped'), 'colonizeShipSender', cssActive ? 'stop' : 'start'));

            // Rows added this round
            rows.push(this._row(this.t('row_attack'),        attackActive,   attackActive   ? this.t('active') : this.t('stopped'), 'autoAttack',        'toggle'));
            rows.push(this._row(this.t('row_dodge'),  dodgeActive,    dodgeActive    ? this.t('active') : this.t('stopped'), 'autoDodge',         'toggle'));
            rows.push(this._row(this.t('row_ares'),  aresActive,     aresActive     ? this.t('active') : this.t('stopped'), 'autoAresSacrifice', 'toggle'));
            rows.push(this._row(this.t('row_research'),       researchActive, researchActive ? this.t('active') : this.t('stopped'), 'autoResearch',      'toggle'));

            uw.$('#status_rows').html(rows.join(''));
        } catch(e) {
            uw.$('#status_rows').html(`<div style="padding:5px;color:red;">${this.t('error')}: ${e.message}</div>`);
        }
    }

    _row(label, active, value, module, method) {
        const onclick = module && method
            ? `window.multBot.${module}.${method}()`
            : null;

        const btn = onclick
            ? `<div class="button_new ${active ? '' : 'disabled'}" onclick="${onclick}" style="cursor:pointer;margin:0;">
                <div class="left"></div><div class="right"></div>
                <div class="caption js-caption">${active ? this.t('active') : this.t('stopped')}<div class="effect js-effect"></div></div>
               </div>`
            : `<span style="font-size:11px;color:#3a2a0a;font-style:italic;">${active ? '● ' + this.t('active') : '○ —'}</span>`;

        return `
        <div style="display:flex;justify-content:space-between;align-items:center;
            padding:4px 8px;border-bottom:1px solid rgba(0,0,0,0.08);
            ${active ? 'background:rgba(0,80,0,0.05);' : ''}">
            <span style="font-weight:bold;font-size:12px;">${label}</span>
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:11px;color:#5a3a0a;">${value}</span>
                ${btn}
            </div>
        </div>`;
    }

    _countCelebrations() {
        const result = { party: 0, theater: 0, triumph: 0 };
        try {
            const models = uw.MM.getModels().Celebration;
            if (!models) return result;
            for (const key in models) {
                const type = models[key].attributes.celebration_type;
                if (type in result) result[type]++;
            }
        } catch(e) {}
        return result;
    }
};
