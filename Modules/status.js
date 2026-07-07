// ══════════════════════════════════════════════════════
//  MODULE: StatusPanel
//  Painel de status em tempo real de todos os módulos
//
//  PDCA - correcao desta rodada: _getTownName local removido,
//  usa this.getTownName (herdado de ModernUtil).
//
//  PDCA - nesta rodada: adicionadas linhas de Auto Ataque,
//  Auto Fuga (Dodge), Sacrificio de Ares e Auto Pesquisa,
//  que ja existiam no bot mas nao apareciam no painel.
// ══════════════════════════════════════════════════════
class StatusPanel extends ModernUtil {
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
            <span style="font-weight:bold;font-size:12px;">Auto Refresh:</span>
            <input id="refresh_minutes_input" type="number" min="0" max="999" value="${this._refreshMinutes}"
                style="width:55px;padding:2px 5px;" placeholder="min" />
            ${this.getButtonHtml('btn_set_refresh', 'Aplicar', this._applyRefresh)}
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
            uw.$('#refresh_status').text('Desativado').css('color', '#8a2a2a');
            uw.$('#refresh_countdown').text('');
            return;
        }

        this._refreshMinutes = val;
        this.storage.save('refresh_minutes', val);
        this._scheduleRefresh();
        uw.$('#refresh_status').text(`✓ Recarrega a cada ${val} min (±30s)`).css('color', '#1a6b2a');

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
            uw.$('#refresh_status').text(`✓ Recarrega a cada ${this._refreshMinutes} min (±30s)`).css('color', '#1a6b2a');
        } else if (this._refreshMinutes > 0) {
            this._scheduleRefresh();
            uw.$('#refresh_status').text(`✓ Recarrega a cada ${this._refreshMinutes} min (±30s)`).css('color', '#1a6b2a');
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
            const bot  = uw.modernBot;
            const rows = [];

            const farmActive  = !!bot.autoFarm?.active;
            const ruralActive = !!bot.autoRuralLevel?.enable;
            const buildCount  = Object.keys(bot.autoBuild?.towns_buildings ?? {}).length;
            const trainCount  = Object.keys(bot.autoTrain?.city_troops ?? {}).length;
            const partyActive = !!bot.autoParty?.enable;
            const cel         = this._countCelebrations();
            const celStr      = [cel.party && `${cel.party} festa`, cel.theater && `${cel.theater} teatro`, cel.triumph && `${cel.triumph} triunfo`].filter(Boolean).join(' · ') || '—';
            const gratisActive = !!bot.autoGratis?.autogratis;
            const cssActive   = !!bot.colonizeShipSender?._running;
            const asrActive   = !!bot.autoSendResources?._active;
            const militiaActive = !!bot.autoMilitia?._active;

            // NOVO: esses módulos já existiam e já expõem _active + toggle(),
            // só não estavam sendo lidos aqui no painel.
            const attackActive   = !!bot.autoAttack?._active;
            const dodgeActive    = !!bot.autoDodge?._active;
            const aresActive     = !!bot.autoAresSacrifice?._active;
            const researchActive = !!bot.autoResearch?._active;

            rows.push(this._row('🌾 Fazenda',           farmActive,  farmActive  ? 'Ativo'               : 'Parado',             'autoFarm',           'toggle'));
            rows.push(this._row('🏡 Aldeias Rurais',    ruralActive, ruralActive ? `Nível ${bot.autoRuralLevel.rural_level}` : 'Parado', 'autoRuralLevel', 'toggle'));
            rows.push(this._row('🏗 Construção',        buildCount > 0, buildCount > 0 ? `${buildCount} cidade(s)` : 'Nenhuma cidade', null, null));
            rows.push(this._row('⚔ Recrutamento',      trainCount > 0, trainCount > 0 ? `${trainCount} cidade(s)` : 'Nenhuma cidade', null, null));
            rows.push(this._row('🎉 Festividades',      partyActive, partyActive ? celStr : 'Parado',     'autoParty',          'toggle'));
            rows.push(this._row('⚡ Construção Grátis', gratisActive, gratisActive ? 'Ativo' : 'Parado', 'autoGratis',          'toggle'));
            rows.push(this._row('💰 Envio de Recursos', asrActive,   asrActive   ? 'Ativo' : 'Parado',   'autoSendResources',  'toggle'));
            rows.push(this._row('⚔️ Milícia Auto',      militiaActive, militiaActive ? 'Ativo' : 'Parado', 'autoMilitia', militiaActive ? 'stop' : 'start'));
            rows.push(this._row('⚓ Navio Colonizador', cssActive,   cssActive   ? `→ ${this.getTownName(bot.colonizeShipSender.config.targetTownId)}` : 'Parado', 'colonizeShipSender', cssActive ? 'stop' : 'start'));

            // NOVO: linhas adicionadas nesta rodada
            rows.push(this._row('🗡️ Auto Ataque',        attackActive,   attackActive   ? 'Ativo' : 'Parado', 'autoAttack',        'toggle'));
            rows.push(this._row('🛡️ Auto Fuga (Dodge)',  dodgeActive,    dodgeActive    ? 'Ativo' : 'Parado', 'autoDodge',         'toggle'));
            rows.push(this._row('🔥 Sacrifício de Ares',  aresActive,     aresActive     ? 'Ativo' : 'Parado', 'autoAresSacrifice', 'toggle'));
            rows.push(this._row('📚 Auto Pesquisa',       researchActive, researchActive ? 'Ativo' : 'Parado', 'autoResearch',      'toggle'));

            uw.$('#status_rows').html(rows.join(''));
        } catch(e) {
            uw.$('#status_rows').html(`<div style="padding:5px;color:red;">Erro: ${e.message}</div>`);
        }
    }

    _row(label, active, value, module, method) {
        const onclick = module && method
            ? `window.modernBot.${module}.${method}()`
            : null;

        const btn = onclick
            ? `<div class="button_new ${active ? '' : 'disabled'}" onclick="${onclick}" style="cursor:pointer;margin:0;">
                <div class="left"></div><div class="right"></div>
                <div class="caption js-caption">${active ? 'Ativo' : 'Parado'}<div class="effect js-effect"></div></div>
               </div>`
            : `<span style="font-size:11px;color:#3a2a0a;font-style:italic;">${active ? '● Ativo' : '○ —'}</span>`;

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
}
