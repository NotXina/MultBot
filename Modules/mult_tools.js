// ══════════════════════════════════════════════════════
//  MODULE: MultTools
//  Ferramentas em massa para todas as cidades
// ══════════════════════════════════════════════════════
class MultTools extends MultUtil {
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
                    <div style="padding:5px;">
                        <p style="margin:0 0 4px;font-size:11px;font-weight:bold;">Auto Pesquisa</p>
                        <p style="margin:0 0 6px;font-size:11px;color:#888;">Liga a pesquisa automática em todas.</p>
                        ${this.getButtonHtml('mult_research_btn', '🔬 Aplicar', this.applyResearchPreset)}
                    </div>
                </div>
                <div style="padding:5px;">
                    <span id="mult_status" style="font-size:11px;color:#4ade80;"></span>
                </div>
            </div>
        </div>`;
    };

    /* Preset em massa: aplica em TODAS as cidades via a API publica
       do AutoBuild (applyPresetToAllTowns), em vez de ler/escrever
       uw.multBot.autoBuild.towns_buildings diretamente. Se o AutoBuild
       nao inicializou, avisa em vez de estourar exceção. */
    applyPreset = () => {
        try {
            const autoBuild = uw.multBot.autoBuild;
            if (!autoBuild) { uw.$('#mult_status').text('Auto Build não encontrado.').css('color','#f87171'); return; }

            const count = autoBuild.applyPresetToAllTowns({ barracks: 5, wall: 0 });
            if (count === 0) { uw.$('#mult_status').text('Nenhuma cidade encontrada.').css('color','#f87171'); return; }

            const msg = '✓ Preset construções: ' + count + ' cidade(s).';
            uw.$('#mult_status').text(msg).css('color','#4ade80');
            this.console.log('[MultTools] ' + msg);
        } catch (e) {
            uw.$('#mult_status').text('Erro: ' + (e?.message ?? e)).css('color','#f87171');
            this.console.log('[MultTools] Erro: ' + (e?.message ?? e));
        }
    };

    /* Preset em massa de colonize_ship: a elegibilidade (doca >= 10,
       pesquisa colonize_ship feita) continua checada aqui, cidade a
       cidade, mas a escrita da quantidade-alvo vai pela API publica
       setTroopTarget do AutoTrain, em vez de mexer em city_troops
       diretamente. */
    applyNavalPreset = () => {
        try {
            const autoTrain = uw.multBot.autoTrain;
            if (!autoTrain) { uw.$('#mult_status').text('Auto Train não encontrado.').css('color','#f87171'); return; }

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
                const totalPop = autoTrain.getTotalPopulation(townId);
                const popCost  = uw.GameData.units['colonize_ship']?.population ?? 170;
                const maxQty   = Math.floor(totalPop / popCost);
                if (maxQty <= 0) continue;

                autoTrain.setTroopTarget(townId, 'colonize_ship', maxQty);
                count++;
            }

            const msg = `✓ Colonize ship configurado em ${count} cidade(s).`;
            uw.$('#mult_status').text(msg).css('color','#4ade80');
            this.console.log('[MultTools] ' + msg);
        } catch (e) {
            uw.$('#mult_status').text('Erro: ' + (e?.message ?? e)).css('color','#f87171');
            this.console.log('[MultTools] Erro: ' + (e?.message ?? e));
        }
    };

    /* Liga o Auto Pesquisa (AutoResearch) para todas as cidades de uma vez.
       O módulo em si já roda automaticamente em todas as cidades do jogador
       assim que ativo — aqui só garantimos que está ligado, via a API
       publica ensureActive(), sem precisar checar _active/_tick aqui. */
    applyResearchPreset = () => {
        try {
            const research = uw.multBot.autoResearch;
            if (!research) {
                uw.$('#mult_status').text('Auto Pesquisa não encontrado.').css('color','#f87171');
                return;
            }

            const townCount = Object.keys(uw.ITowns.towns).length;
            if (townCount === 0) { uw.$('#mult_status').text('Nenhuma cidade encontrada.').css('color','#f87171'); return; }

            research.ensureActive();

            const msg = `✓ Auto Pesquisa ativo em ${townCount} cidade(s).`;
            uw.$('#mult_status').text(msg).css('color','#4ade80');
            this.console.log('[MultTools] ' + msg);
        } catch (e) {
            uw.$('#mult_status').text('Erro: ' + (e?.message ?? e)).css('color','#f87171');
            this.console.log('[MultTools] Erro: ' + (e?.message ?? e));
        }
    };
}
