// ══════════════════════════════════════════════════════
//  MODULE: MultTools
//  Ferramentas em massa para todas as cidades
// ══════════════════════════════════════════════════════
var MultTools = class extends MultUtil {
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
                <span style="z-index:10;position:relative;">${this.t('mt_title')}</span>
                <span class="command_count"></span>
            </div>
            <div id="autoparty_types">
                <div class="split_content">
                    <div style="padding:5px;">
                        <p style="margin:0 0 4px;font-size:11px;font-weight:bold;">${this.t('mt_buildings_label')}</p>
                        <p style="margin:0 0 6px;font-size:11px;color:#888;">${this.t('mt_buildings_desc')}</p>
                        ${this.getButtonHtml('mult_preset_btn', '⚡ ' + this.t('apply'), this.applyPreset)}
                    </div>
                    <div style="padding:5px;">
                        <p style="margin:0 0 4px;font-size:11px;font-weight:bold;">Colonize Ships</p>
                        <p style="margin:0 0 6px;font-size:11px;color:#888;">${this.t('mt_colonize_desc')}</p>
                        ${this.getButtonHtml('mult_naval_btn', '⚓ ' + this.t('apply'), this.applyNavalPreset)}
                    </div>
                    <div style="padding:5px;">
                        <p style="margin:0 0 4px;font-size:11px;font-weight:bold;">${this.t('mt_research_label')}</p>
                        <p style="margin:0 0 6px;font-size:11px;color:#888;">${this.t('mt_research_desc')}</p>
                        ${this.getButtonHtml('mult_research_btn', '🔬 ' + this.t('apply'), this.applyResearchPreset)}
                    </div>
                    <div style="padding:5px;">
                        <p style="margin:0 0 4px;font-size:11px;font-weight:bold;">${this.t('mt_rename_label')}</p>
                        <p style="margin:0 0 6px;font-size:11px;color:#888;">${this.t('mt_rename_desc')}</p>
                        ${this.getButtonHtml('mult_rename_btn', '🏷️ ' + this.t('apply'), this.renameCities)}
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
            if (!autoBuild) { uw.$('#mult_status').text(this.t('mt_module_not_found', { name: 'Auto Build' })).css('color','#f87171'); return; }

            const count = autoBuild.applyPresetToAllTowns({ barracks: 5, wall: 0 });
            if (count === 0) { uw.$('#mult_status').text(this.t('mt_no_city_found')).css('color','#f87171'); return; }

            const msg = this.t('mt_preset_applied', { count });
            uw.$('#mult_status').text(msg).css('color','#4ade80');
            this.console.log('[MultTools] ' + msg);
        } catch (e) {
            uw.$('#mult_status').text(this.t('error') + ': ' + (e?.message ?? e)).css('color','#f87171');
            this.console.log('[MultTools] ' + this.t('error') + ': ' + (e?.message ?? e));
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
            if (!autoTrain) { uw.$('#mult_status').text(this.t('mt_module_not_found', { name: 'Auto Train' })).css('color','#f87171'); return; }

            const townIds = Object.keys(uw.ITowns.towns);
            if (townIds.length === 0) { uw.$('#mult_status').text(this.t('mt_no_city_found')).css('color','#f87171'); return; }

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

            const msg = this.t('mt_naval_applied', { count });
            uw.$('#mult_status').text(msg).css('color','#4ade80');
            this.console.log('[MultTools] ' + msg);
        } catch (e) {
            uw.$('#mult_status').text(this.t('error') + ': ' + (e?.message ?? e)).css('color','#f87171');
            this.console.log('[MultTools] ' + this.t('error') + ': ' + (e?.message ?? e));
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
                uw.$('#mult_status').text(this.t('mt_module_not_found', { name: this.t('mt_research_label') })).css('color','#f87171');
                return;
            }

            const townCount = Object.keys(uw.ITowns.towns).length;
            if (townCount === 0) { uw.$('#mult_status').text(this.t('mt_no_city_found')).css('color','#f87171'); return; }

            research.ensureActive();

            const msg = this.t('mt_research_applied', { count: townCount });
            uw.$('#mult_status').text(msg).css('color','#4ade80');
            this.console.log('[MultTools] ' + msg);
        } catch (e) {
            uw.$('#mult_status').text(this.t('error') + ': ' + (e?.message ?? e)).css('color','#f87171');
            this.console.log('[MultTools] ' + this.t('error') + ': ' + (e?.message ?? e));
        }
    };

    /* Calcula o oceano a partir da coordenada da ilha. Confirmado
       com 2 pontos reais capturados no jogo:
       (568,411) -> oceano 54 ; (560,393) -> oceano 53
       Formula: primeiro digito = X/100 (pra baixo), segundo
       digito = Y/100 (pra baixo). */
    getOceanNumber = (x, y) => {
        const tens = Math.floor(x / 100);
        const units = Math.floor(y / 100);
        return String(tens) + String(units);
    };

    /* Renomeia TODAS as cidades do jogador no formato OCxx-NN
       (oceano + sequencial dentro do oceano). A ordem sequencial
       dentro de cada oceano e pelo ID da cidade (proxy da ordem
       de fundacao) - se quiser outro criterio de ordenacao, e so
       trocar o sort abaixo.
       Confirmado via captura real de rede: model_url "Town/{id}",
       action_name "setTownName", arguments: { town_name }. */
    renameCities = async () => {
        try {
            const towns = Object.values(uw.ITowns.towns);
            if (towns.length === 0) { uw.$('#mult_status').text(this.t('mt_no_city_found')).css('color','#f87171'); return; }

            // Agrupa por oceano, ordenando dentro de cada grupo pelo ID da cidade
            const byOcean = {};
            for (const town of towns) {
                const x = town.getIslandCoordinateX();
                const y = town.getIslandCoordinateY();
                const ocean = this.getOceanNumber(x, y);
                if (!byOcean[ocean]) byOcean[ocean] = [];
                byOcean[ocean].push(town);
            }
            for (const ocean in byOcean) {
                byOcean[ocean].sort((a, b) => a.id - b.id);
            }

            let count = 0;
            for (const ocean in byOcean) {
                let seq = 1;
                for (const town of byOcean[ocean]) {
                    const name = 'OC' + ocean + '-' + String(seq).padStart(2, '0');
                    seq++;

                    try {
                        const data = {
                            model_url: 'Town/' + town.id,
                            action_name: 'setTownName',
                            captcha: null,
                            arguments: { town_name: name },
                            town_id: town.id,
                            nl_init: true,
                        };
                        const res = await this.ajaxPostWithTimeout('frontend_bridge', 'execute', data);
                        if (res && !res.error) {
                            const msg = this.t('mt_renamed_log', { town: town.getName(), name });
                            this.console.log('[MultTools] ' + msg);
                            count++;
                        } else {
                            this.console.log('[MultTools] ' + this.t('mt_rename_error', { town: town.getName(), msg: res?.error ?? '?' }));
                        }
                    } catch (e) {
                        this.console.log('[MultTools] ' + this.t('mt_rename_error', { town: town.getName(), msg: e?.message ?? e }));
                    }

                    await this.sleep(400);
                }
            }

            const msg = this.t('mt_rename_complete', { count });
            uw.$('#mult_status').text(msg).css('color','#4ade80');
            this.console.log('[MultTools] ' + msg);
        } catch (e) {
            uw.$('#mult_status').text(this.t('error') + ': ' + (e?.message ?? e)).css('color','#f87171');
            this.console.log('[MultTools] ' + this.t('error') + ': ' + (e?.message ?? e));
        }
    };
};
