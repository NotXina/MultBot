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
            <div id="autoparty_types">
                <div class="split_content">
                    <div style="padding:5px;">
                        <p style="margin:0 0 4px;font-size:11px;font-weight:bold;">Construções</p>
                        <p style="margin:0 0 6px;font-size:11px;color:#888;">Máximo em tudo. Quartel→5, Muro→0.</p>
                        ${this.getButtonHtml('mult_preset_btn', '⚡ Aplicar', this.applyPreset)}
                    </div>
                    <div style="padding:5px;">
                        <p style="margin:0 0 4px;font-size:11px;font-weight:bold;">Colonize Ships</p>
                        <p style="margin:0 0 6px;font-size:11px;color:#888;">Máximo de colonize_ship em todas.</p>
                        ${this.getButtonHtml('mult_naval_btn', '⚓ Aplicar', this.applyNavalPreset)}
                    </div>
                </div>
                <div style="padding:5px;">
                    <span id="mult_status" style="font-size:11px;color:#4ade80;"></span>
                </div>
            </div>
        </div>`;
    };

    applyPreset = () => {
        try {
            const buildings = ['main','storage','farm','academy','temple','barracks','docks','market','hide','lumber','stoner','ironer','wall'];
            const townIds   = Object.keys(uw.ITowns.towns);
            if (townIds.length === 0) { uw.$('#mult_status').text('Nenhuma cidade encontrada.').css('color','#f87171'); return; }

            let townsBuildings = uw.modernBot.autoBuild.towns_buildings;
            for (const townId of townIds) {
                const preset = {};
                for (const b of buildings) {
                    const maxLevel = uw.GameData.buildings[b]?.max_level ?? 45;
                    preset[b] = (b === 'barracks') ? 5 : (b === 'wall') ? 0 : maxLevel;
                }
                townsBuildings[townId] = preset;
            }
            uw.modernBot.autoBuild.towns_buildings = townsBuildings;
            uw.modernBot.autoBuild.storage.save('buildings', townsBuildings);
            if (!uw.modernBot.autoBuild.interval) uw.modernBot.autoBuild.startInterval();

            const msg = '✓ Preset construções: ' + townIds.length + ' cidade(s).';
            uw.$('#mult_status').text(msg).css('color','#4ade80');
            this.console.log('[MultTools] ' + msg);
        } catch (e) {
            uw.$('#mult_status').text('Erro: ' + (e?.message ?? e)).css('color','#f87171');
            this.console.log('[MultTools] Erro: ' + (e?.message ?? e));
        }
    };

    applyNavalPreset = () => {
        try {
            const townIds = Object.keys(uw.ITowns.towns);
            if (townIds.length === 0) { uw.$('#mult_status').text('Nenhuma cidade encontrada.').css('color','#f87171'); return; }

            let count = 0;
            for (const townId of townIds) {
                // Verifica se a cidade tem doca e pesquisa de colonize_ship
                const buildings  = uw.ITowns.towns[townId].buildings()?.attributes;
                const researches = uw.ITowns.towns[townId].researches()?.attributes;
                if (!buildings?.docks || buildings.docks < 10) continue;
                if (!researches?.colonize_ship) continue;

                // Max colonize_ship = população total da cidade / custo de população
                // Usa getTotalPopulation do AutoTrain para consistência
                const totalPop = uw.modernBot.autoTrain.getTotalPopulation(townId);
                const popCost  = uw.GameData.units['colonize_ship']?.population ?? 170;
                const maxQty   = Math.floor(totalPop / popCost);
                if (maxQty <= 0) continue;

                // Seta no AutoTrain
                if (!uw.modernBot.autoTrain.city_troops[townId]) {
                    uw.modernBot.autoTrain.city_troops[townId] = {};
                }
                uw.modernBot.autoTrain.city_troops[townId]['colonize_ship'] = maxQty;
                count++;
            }

            uw.modernBot.autoTrain.storage.save('troops', uw.modernBot.autoTrain.city_troops);

            const msg = `✓ Colonize ship configurado em ${count} cidade(s).`;
            uw.$('#mult_status').text(msg).css('color','#4ade80');
            this.console.log('[MultTools] ' + msg);
        } catch (e) {
            uw.$('#mult_status').text('Erro: ' + (e?.message ?? e)).css('color','#f87171');
            this.console.log('[MultTools] Erro: ' + (e?.message ?? e));
        }
    };
}
