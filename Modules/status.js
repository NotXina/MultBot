// ══════════════════════════════════════════════════════
//  MODULE: StatusPanel
//  Painel de status em tempo real de todos os módulos
// ══════════════════════════════════════════════════════
class StatusPanel extends ModernUtil {
    constructor(c, s) {
        super(c, s);
        this._interval = null;
    }

    settings = () => {
        requestAnimationFrame(() => this._startRefresh());
        return `<div id="status_rows" style="padding:4px;"></div>`;
    };

    _startRefresh() {
        if (this._interval) clearInterval(this._interval);
        this._render();
        this._interval = setInterval(() => this._render(), 3000);
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

            rows.push(this._row('🌾 Fazenda',           farmActive,  farmActive  ? 'Ativo'               : 'Parado',             'autoFarm',           'toggle'));
            rows.push(this._row('🏡 Aldeias Rurais',    ruralActive, ruralActive ? `Nível ${bot.autoRuralLevel.rural_level}` : 'Parado', 'autoRuralLevel', 'toggle'));
            rows.push(this._row('🏗 Construção',        buildCount > 0, buildCount > 0 ? `${buildCount} cidade(s)` : 'Nenhuma cidade', null, null));
            rows.push(this._row('⚔ Recrutamento',      trainCount > 0, trainCount > 0 ? `${trainCount} cidade(s)` : 'Nenhuma cidade', null, null));
            rows.push(this._row('🎉 Festividades',      partyActive, partyActive ? celStr : 'Parado',     'autoParty',          'toggle'));
            rows.push(this._row('⚡ Construção Grátis', gratisActive, gratisActive ? 'Ativo' : 'Parado', 'autoGratis',          'toggle'));
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
