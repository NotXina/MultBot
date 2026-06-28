// ══════════════════════════════════════════════════════
//  MODULE: MultTools
//  Ferramentas em massa para todas as cidades
// ══════════════════════════════════════════════════════
class MultTools extends ModernUtil {
    constructor(c, s) {
        super(c, s);
    }

    settings = () => {
        return `
        <div class="game_border" style="margin-bottom: 20px;">
            <div class="game_border_top"></div>
            <div class="game_border_bottom"></div>
            <div class="game_border_left"></div>
            <div class="game_border_right"></div>
            <div class="game_border_corner corner1"></div>
            <div class="game_border_corner corner2"></div>
            <div class="game_border_corner corner3"></div>
            <div class="game_border_corner corner4"></div>
            <div class="game_header bold" style="position:relative;">
                <span style="z-index:10;position:relative;">Preset de Construções</span>
                <span class="command_count"></span>
            </div>
            <div style="padding:12px; display:flex; flex-direction:column; gap:10px;">
                <div style="font-size:12px; color:#aaa; line-height:1.6;">
                    Aplica em <b>todas as cidades</b> o nível máximo de cada edifício,
                    exceto <b>Quartel → nível 5</b>.<br>
                    Os alvos são salvos no AutoBuild automaticamente.
                </div>
                ${this.getButtonHtml('mult_preset_btn', '⚡ Aplicar preset em todas as cidades', this.applyPreset)}
                <div id="mult_status" style="font-size:11px; color:#4ade80; min-height:16px;"></div>
            </div>
        </div>`;
    };

    applyPreset = () => {
        try {
            const buildings = ['main','storage','farm','academy','temple','barracks','docks','market','hide','lumber','stoner','ironer','wall'];
            const townIds   = Object.keys(uw.ITowns.towns);

            if (townIds.length === 0) {
                uw.$('#mult_status').text('Nenhuma cidade encontrada.').css('color','#f87171');
                return;
            }

            let townsBuildings = uw.modernBot.autoBuild.towns_buildings;

            for (const townId of townIds) {
                const preset = {};
                for (const b of buildings) {
                    const maxLevel = uw.GameData.buildings[b]?.max_level ?? 45;
                    preset[b] = (b === 'barracks') ? 5 : (b === 'wall') ? 0 : maxLevel;
                }
                townsBuildings[townId] = preset;
            }

            // Sincroniza o objeto interno do AutoBuild e persiste
            uw.modernBot.autoBuild.towns_buildings = townsBuildings;
            uw.modernBot.autoBuild.storage.save('buildings', townsBuildings);
            // Garante que o interval do AutoBuild está ativo
            if (!uw.modernBot.autoBuild.interval) {
                uw.modernBot.autoBuild.startInterval();
            }

            const msg = '✓ Preset aplicado em ' + townIds.length + ' cidade(s).';
            uw.$('#mult_status').text(msg).css('color','#4ade80');
            this.console.log('[MultTools] ' + msg);
        } catch (e) {
            uw.$('#mult_status').text('Erro: ' + (e?.message ?? e)).css('color','#f87171');
            this.console.log('[MultTools] Erro: ' + (e?.message ?? e));
        }
    };
}
