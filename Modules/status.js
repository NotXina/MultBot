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
        requestAnimationFrame(() => {
            this._startRefresh();
        });
        return `
        <div class="game_border" style="margin-bottom:20px;">
            <div class="game_border_top"></div><div class="game_border_bottom"></div>
            <div class="game_border_left"></div><div class="game_border_right"></div>
            <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>
            <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>
            <div class="game_header bold" style="position:relative;">
                <span style="z-index:10;position:relative;">Status</span>
                <span class="command_count"></span>
            </div>
            <div id="status_panel" style="padding:8px;font-size:12px;line-height:1.9;"></div>
        </div>`;
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

            // ── Farm ──
            const farmActive = !!bot.autoFarm?.active;
            rows.push(this._row('🌾 Fazenda', farmActive ? 'Ativo' : 'Parado', farmActive));

            // ── Rural Level ──
            const ruralActive = !!bot.autoRuralLevel?.enable;
            rows.push(this._row('🏡 Aldeias Rurais', ruralActive ? `Ativo (nível ${bot.autoRuralLevel.rural_level})` : 'Parado', ruralActive));

            // ── Build ──
            const buildTowns = Object.keys(bot.autoBuild?.towns_buildings ?? {});
            rows.push(this._row('🏗 Construção', buildTowns.length > 0
                ? `${buildTowns.length} cidade(s) ativa(s)`
                : 'Nenhuma cidade', buildTowns.length > 0));

            // ── Train ──
            const trainTowns = Object.keys(bot.autoTrain?.city_troops ?? {});
            rows.push(this._row('⚔ Recrutamento', trainTowns.length > 0
                ? `${trainTowns.length} cidade(s) ativa(s)`
                : 'Nenhuma cidade', trainTowns.length > 0));

            // ── Party ──
            const partyActive = !!bot.autoParty?.enable;
            const celebrations = this._countCelebrations();
            rows.push(this._row('🎉 Festividades', partyActive
                ? `Ativo — ${celebrations.party} festa, ${celebrations.theater} teatro, ${celebrations.triumph} triunfo`
                : 'Parado', partyActive));

            // ── Gratis ──
            const gratisActive = !!bot.autoGratis?.autogratis;
            rows.push(this._row('⚡ Construção Grátis', gratisActive ? 'Ativo' : 'Parado', gratisActive));

            // ── Bootcamp ──
            const bootActive = !!bot.autoBootcamp?.enable_auto_bootcamp;
            rows.push(this._row('🥊 Campo de Treinamento', bootActive ? 'Ativo' : 'Parado', bootActive));

            // ── Ships ──
            const cssActive = !!bot.colonizeShipSender?._running;
            rows.push(this._row('⚓ Navio Colonizador', cssActive
                ? `Rodando → #${bot.colonizeShipSender.config.targetTownId}`
                : 'Parado', cssActive));

            uw.$('#status_panel').html(rows.join(''));
        } catch(e) {
            uw.$('#status_panel').html(`<span style="color:#f87171">Erro: ${e.message}</span>`);
        }
    }

    _row(label, value, active) {
        const dot   = active ? '●' : '○';
        const color = active ? '#1a6b2a' : '#7a6a4a';
        return `<div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(0,0,0,0.08);padding:3px 4px;">
            <span style="color:${color};font-weight:bold;">${dot} ${label}</span>
            <span style="color:#3a2a0a;">${value}</span>
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
