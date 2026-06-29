// ══════════════════════════════════════════════════════
//  MODULE: StatusPanel
//  Painel de status em tempo real de todos os módulos
// ══════════════════════════════════════════════════════
class StatusPanel extends ModernUtil {
    constructor(c, s) {
        super(c, s);
        this._interval        = null;
        this._refreshInterval = null;
    }

    settings = () => {
        requestAnimationFrame(() => this._startRefresh());
        return `
        <div style="padding:6px 10px;border-bottom:1px solid rgba(0,0,0,0.12);display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="font-weight:bold;font-size:12px;">🔄 Auto Refresh:</span>
            ${this.getButtonHtml('btn_refresh_off',  'Off',    this._setRefresh, 0)}
            ${this.getButtonHtml('btn_refresh_5',    '5 min',  this._setRefresh, 5)}
            ${this.getButtonHtml('btn_refresh_15',   '15 min', this._setRefresh, 15)}
            ${this.getButtonHtml('btn_refresh_30',   '30 min', this._setRefresh, 30)}
            ${this.getButtonHtml('btn_refresh_60',   '1h',     this._setRefresh, 60)}
            <span id="refresh_status" style="font-size:11px;color:#5a3a0a;margin-left:4px;"></span>
        </div>
        <div id="status_rows" style="padding:4px;"></div>`;
    };

    _startRefresh() {
        if (this._interval) clearInterval(this._interval);
        this._render();
        this._interval = setInterval(() => this._render(), 3000);

        // Retoma o auto refresh salvo e atualiza visual dos botões
        const saved = this.storage.load('refresh_minutes', 0);
        setTimeout(() => this._setRefresh(saved, true), 500);
    }

    _setRefresh = (minutes, silent = false) => {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = null;
        }

        this.storage.save('refresh_minutes', minutes);

        // Atualiza visual dos botões de seleção
        ['btn_refresh_off', 'btn_refresh_5', 'btn_refresh_15', 'btn_refresh_30', 'btn_refresh_60'].forEach(id => {
            uw.$(`#${id}`).removeClass('disabled').css('filter', '');
        });

        const activeMap = { 0: 'btn_refresh_off', 5: 'btn_refresh_5', 15: 'btn_refresh_15', 30: 'btn_refresh_30', 60: 'btn_refresh_60' };
        if (activeMap[minutes]) {
            uw.$(`#${activeMap[minutes]}`).css('filter', 'brightness(100%) saturate(186%) hue-rotate(241deg)');
        }

        if (minutes === 0) {
            uw.$('#refresh_status').text('desativado');
            return;
        }

        const ms = minutes * 60 * 1000;
        let nextReload = Date.now() + ms;

        const tick = () => {
            const remaining = Math.max(0, Math.round((nextReload - Date.now()) / 1000));
            const m = Math.floor(remaining / 60);
            const s = remaining % 60;
            uw.$('#refresh_status').text(`próximo reload em ${m}:${String(s).padStart(2,'0')}`);

            if (remaining <= 0) {
                uw.$('#refresh_status').text('recarregando...');
                clearInterval(this._refreshInterval);
                location.reload();
            }
        };

        tick();
        this._refreshInterval = setInterval(tick, 1000);

        if (!silent) this.console.log(`[Status] Auto Refresh: ${minutes} min`);
    };

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

            rows.push(this._row('🌾 Fazenda',           farmActive,  farmActive  ? 'Ativo'               : 'Parado',             'autoFarm',           'toggle'));
            rows.push(this._row('🏡 Aldeias Rurais',    ruralActive, ruralActive ? `Nível ${bot.autoRuralLevel.rural_level}` : 'Parado', 'autoRuralLevel', 'toggle'));
            rows.push(this._row('🏗 Construção',        buildCount > 0, buildCount > 0 ? `${buildCount} cidade(s)` : 'Nenhuma cidade', null, null));
            rows.push(this._row('⚔ Recrutamento',      trainCount > 0, trainCount > 0 ? `${trainCount} cidade(s)` : 'Nenhuma cidade', null, null));
            rows.push(this._row('🎉 Festividades',      partyActive, partyActive ? celStr : 'Parado',     'autoParty',          'toggle'));
            rows.push(this._row('⚡ Construção Grátis', gratisActive, gratisActive ? 'Ativo' : 'Parado', 'autoGratis',          'toggle'));
            const asrActive    = !!bot.autoSendResources?._active;
            rows.push(this._row('💰 Envio de Recursos', asrActive, asrActive ? 'Ativo' : 'Parado', 'autoSendResources', 'toggle'));

            const militiaActive = !!bot.autoMilitia?._active;
            rows.push(this._row('⚔️ Milícia Auto', militiaActive, militiaActive ? 'Ativo' : 'Parado', 'autoMilitia', militiaActive ? 'stop' : 'start'));

            rows.push(this._row('⚓ Navio Colonizador', cssActive,   cssActive   ? `→ ${this._getTownName(bot.colonizeShipSender.config.targetTownId)}` : 'Parado', 'colonizeShipSender', cssActive ? 'stop' : 'start'));

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

    _getTownName(townId) {
        if (!townId) return String(townId);
        const id  = parseInt(townId);
        const ids = String(townId);
        try {
            const t1 = uw.ITowns?.towns?.[id] ?? uw.ITowns?.towns?.[ids];
            if (t1) return t1.getName() + ' (#' + ids + ')';
            const allTowns = uw.MM.getOnlyCollectionByName('Town')?.models ?? [];
            for (const t of allTowns) {
                if (parseInt(t.attributes?.id ?? t.id) === id) {
                    return (t.attributes?.name ?? '?') + ' (#' + ids + ')';
                }
            }
            const wt = uw.WMap?.towns?.[id] ?? uw.WMap?.towns?.[ids];
            if (wt?.name) return wt.name + ' (#' + ids + ')';
        } catch(e) {}
        return '#' + ids;
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
