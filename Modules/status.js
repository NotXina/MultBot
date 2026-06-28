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
        return `<div id="status_rows" style="padding:4px;max-height:280px;overflow-y:auto;"></div>`;
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

            // Fazenda
            const farmActive = !!bot.autoFarm?.active;
            rows.push(this._row('🌾 Fazenda', farmActive, farmActive ? 'Ativo' : 'Parado', 'autoFarm', 'toggle'));

            // Aldeias Rurais
            const ruralActive = !!bot.autoRuralLevel?.enable;
            rows.push(this._row('🏡 Aldeias Rurais', ruralActive, ruralActive ? `Nível ${bot.autoRuralLevel.rural_level}` : 'Parado', 'autoRuralLevel', 'toggle'));

            // Construção
            const buildTowns = Object.keys(bot.autoBuild?.towns_buildings ?? {}).length;
            rows.push(this._row('🏗 Construção', buildTowns > 0, buildTowns > 0 ? `${buildTowns} cidade(s)` : 'Nenhuma cidade', null, null));

            // Recrutamento
            const trainTowns = Object.keys(bot.autoTrain?.city_troops ?? {}).length;
            rows.push(this._row('⚔ Recrutamento', trainTowns > 0, trainTowns > 0 ? `${trainTowns} cidade(s)` : 'Nenhuma cidade', null, null));

            // Festividades
            const partyActive = !!bot.autoParty?.enable;
            const cel = this._countCelebrations();
            const celStr = partyActive
                ? [cel.party && `${cel.party} festa`, cel.theater && `${cel.theater} teatro`, cel.triumph && `${cel.triumph} triunfo`].filter(Boolean).join(' · ') || 'Ativo'
                : 'Parado';
            rows.push(this._row('🎉 Festividades', partyActive, celStr, 'autoParty', 'toggle'));

            // Construção Grátis
            const gratisActive = !!bot.autoGratis?.autogratis;
            rows.push(this._row('⚡ Construção Grátis', gratisActive, gratisActive ? 'Ativo' : 'Parado', 'autoGratis', 'toggle'));

            // Campo de Treinamento
            const bootActive = !!bot.autoBootcamp?.enable_auto_bootcamp;
            rows.push(this._row('🥊 Campo de Treinamento', bootActive, bootActive ? 'Ativo' : 'Parado', 'autoBootcamp', 'toggle'));

            // Navio Colonizador
            const cssActive = !!bot.colonizeShipSender?._running;
            rows.push(this._row('⚓ Navio Colonizador', cssActive,
                cssActive ? `Rodando → #${bot.colonizeShipSender.config.targetTownId}` : 'Parado',
                'colonizeShipSender', cssActive ? 'stop' : 'start'));

            uw.$('#status_rows').html(rows.join(''));
        } catch(e) {
            uw.$('#status_rows').html(`<div style="padding:5px;color:red;">Erro: ${e.message}</div>`);
        }
    }

    _row(label, active, value, module, method) {
        const filter  = 'brightness(100%) saturate(186%) hue-rotate(241deg)';
        const onclick = module && method ? `onclick="window.modernBot.${module}.${method}()"` : '';
        const cursor  = onclick ? 'cursor:pointer;' : '';
        const dot     = active ? '●' : '○';
        const dotCol  = active ? 'color:#2d6a2d;' : 'color:#8a7a5a;';

        return `
        <div ${onclick} style="${cursor}display:flex;justify-content:space-between;
            align-items:center;padding:3px 8px;
            border-bottom:1px solid rgba(0,0,0,0.1);
            ${active ? 'background:rgba(0,80,0,0.06);' : ''}">
            <span style="font-weight:bold;font-size:12px;">
                <span style="${dotCol}">${dot}</span> ${label}
            </span>
            <span style="font-size:11px;color:#3a2a0a;">${value}</span>
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
