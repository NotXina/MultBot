var AutoFarm = class extends MultUtil {
    constructor(c, s) {
        super(c, s);

        // Load the settings
        this.timing = this.storage.load('af_level', 300000);
        this.percent = this.storage.load('af_percent', 1);
        this.active = this.storage.load('af_active', false);
        this.gui = this.storage.load('af_gui', false);

        // Create the elements for the new menu
        const { $activity, $count } = this.createActivity("url(https://gpit.innogamescdn.com/images/game/premium_features/feature_icons_2.08.png) no-repeat 0 -240px");
        this.$activity = $activity
        this.$count = $count
        this.$activity.on('click', this.toggle)

        this.createDropdown();
        this.updateButtons();

        this.timer = 0;
        this.lastTime = Date.now();
        if (this.active) this.active = setInterval(this.main, 5000);
    }

    /* Create the dropdown menu */
    createDropdown = () => {
        this.$content = uw.$("<div></div>")
        this.$title = uw.$("<p></p>").text(this.t('af_title')).css({ "text-align": "center", "margin": "2px", "font-weight": "bold", "font-size": "16px" })
        this.$content.append(this.$title)

        this.$duration = uw.$("<p></p>").text(this.t('af_duration')).css({ "text-align": "left", "margin": "2px", "font-weight": "bold" })
        this.$button5 = this.createButton("mult_farm_5", "5 min", this.toggleDuration)
        this.$button10 = this.createButton("mult_farm_10", "10 min", this.toggleDuration)
        this.$button20 = this.createButton("mult_farm_20", "20 min", this.toggleDuration)
        this.$content.append(this.$duration, this.$button5, this.$button10, this.$button20)

        this.$storage = uw.$("<p></p>").text(this.t('af_storage')).css({ "text-align": "left", "margin": "2px", "font-weight": "bold" })
        this.$button80 = this.createButton("mult_farm_80", "80%", this.toggleStorage).css({ "width": "70px" })
        this.$button90 = this.createButton("mult_farm_90", "90%", this.toggleStorage).css({ "width": "80px" })
        this.$button100 = this.createButton("mult_farm_100", "100%", this.toggleStorage).css({ "width": "80px" })
        this.$content.append(this.$storage, this.$button80, this.$button90, this.$button100)

        this.$gui = uw.$("<p></p>").text(this.t('af_gui')).css({ "text-align": "left", "margin": "2px", "font-weight": "bold" })
        this.$guiOn = this.createButton("mult_farm_gui_on", "ON", this.toggleGui)
        this.$guiOff = this.createButton("mult_farm_gui_off", "OFF", this.toggleGui)
        this.$content.append(this.$gui, this.$guiOn, this.$guiOff)

        this.$popup = this.createPopup(423, 250, 170, this.$content)
        this.dropdown_active = false

        // Open and close the dropdown with the mouse
        const close = () => {
            if (!this.dropdown_active) this.$popup.hide()
            this.dropdown_active = false
        }

        const open = () => {
            if (this.dropdown_active) this.$popup.show()
        }

        this.$activity.on({
            mouseenter: () => {
                this.dropdown_active = true
                setTimeout(open, 1000)
            },
            mouseleave: () => {
                this.dropdown_active = false
                setTimeout(close, 50)
            }
        })

        this.$popup.on({
            mouseenter: () => {
                this.dropdown_active = true
            },
            mouseleave: () => {
                this.dropdown_active = false
                setTimeout(close, 50)
            }
        })
    }

    /* Update the buttons */
    updateButtons = () => {
        this.$button5.addClass('disabled')
        this.$button10.addClass('disabled')
        this.$button20.addClass('disabled')
        this.$button80.addClass('disabled')
        this.$button90.addClass('disabled')
        this.$button100.addClass('disabled')

        if (this.timing == 300000) this.$button5.removeClass('disabled')
        if (this.timing == 600000) this.$button10.removeClass('disabled')
        if (this.timing == 1200000) this.$button20.removeClass('disabled')

        if (this.percent == 0.8) this.$button80.removeClass('disabled')
        if (this.percent == 0.9) this.$button90.removeClass('disabled')
        if (this.percent == 1) this.$button100.removeClass('disabled')

        if (!this.active) {
            this.$count.css('color', "red")
            this.$count.text("")
        }

        this.$guiOn.addClass('disabled')
        this.$guiOff.addClass('disabled')
        if (this.gui) this.$guiOn.removeClass('disabled')
        else this.$guiOff.removeClass('disabled')
    }

    toggleDuration = (event) => {
        const { id } = event.currentTarget

        // Update the timer
        if (id == "mult_farm_5") this.timing = 300_000
        if (id == "mult_farm_10") this.timing = 600_000
        if (id == "mult_farm_20") this.timing = 1_200_000

        // Save the settings and update the buttons
        this.storage.save('af_level', this.timing);
        this.updateButtons()
    }

    toggleStorage = (event) => {
        const { id } = event.currentTarget

        // Update the percent
        if (id == "mult_farm_80") this.percent = 0.8
        if (id == "mult_farm_90") this.percent = 0.9
        if (id == "mult_farm_100") this.percent = 1

        // Save the settings and update the buttons
        this.storage.save('af_percent', this.percent);
        this.updateButtons()
    }


    toggleGui = (event) => {
        const { id } = event.currentTarget

        // Update the gui
        if (id == "mult_farm_gui_on") this.gui = true
        if (id == "mult_farm_gui_off") this.gui = false

        // Save the settings and update the buttons
        this.storage.save('af_gui', this.gui);
        this.updateButtons()
    }

    /* generate the list containing 1 polis per island */
    generateList = () => {
        const islands_list = new Set();
        const polis_list = [];
        let minResource = 0;
        let min_percent = 0;

        const { models: towns } = uw.MM.getOnlyCollectionByName('Town');

        for (const town of towns) {
            const { on_small_island, island_id, id } = town.attributes;
            if (on_small_island || islands_list.has(island_id)) continue;

            // Marca a ilha como já visitada ANTES de decidir se entra na
            // lista, senão outra cidade da mesma ilha tentaria de novo.
            islands_list.add(island_id);

            // FIX: esse filtro estava comentado, então o percentual de
            // storage configurado no menu (80/90/100%) nunca era usado —
            // o bot sempre coletava de todas as ilhas, ignorando o ajuste.
            // Além disso, antes o continue vinha DEPOIS do push, então
            // mesmo descomentado não teria efeito nenhum.
            const { wood, stone, iron, storage } = uw.ITowns.getTown(id).resources();
            minResource = Math.min(wood, stone, iron);
            min_percent = storage > 0 ? minResource / storage : 0;

            if (min_percent < this.percent) continue;

            polis_list.push(town.id);
        }

        return polis_list;
    };

    toggle = () => {
        if (this.active) {
            clearInterval(this.active);
            this.active = null;
            this.updateButtons();
        }
        else {
            this.updateTimer();
            this.active = setInterval(this.main, 5000);
        }

        // Save the settings
        this.storage.save('af_active', !!this.active);
    };

    /* return the time before the next collection */
    getNextCollection = () => {
        /* FIX: antes acessava via uw.MM.getCollections().FarmTownPlayerRelation[0],
           diferente do padrão usado no resto do arquivo/projeto
           (getOnlyCollectionByName) e sem nenhuma proteção - se essa
           collection viesse undefined (conta nova, timing de carregamento
           da página, etc), o acesso [0].models estourava exceção sem
           try/catch, travando o main() inteiro a cada tick, silenciosamente. */
        const collection = uw.MM.getOnlyCollectionByName('FarmTownPlayerRelation');
        const models = collection?.models ?? [];
        if (models.length === 0) return 0;

        const lootCounts = {};
        for (const model of models) {
            const { lootable_at } = model.attributes;
            lootCounts[lootable_at] = (lootCounts[lootable_at] || 0) + 1;
        }

        let maxLootableTime = 0;
        let maxValue = 0;
        for (const lootableTime in lootCounts) {
            const value = lootCounts[lootableTime];
            if (value < maxValue) continue;
            maxLootableTime = lootableTime;
            maxValue = value;
        }

        const seconds = maxLootableTime - Math.floor(Date.now() / 1000);
        return seconds > 0 ? seconds * 1000 : 0;
    };

    /* Call to update the timer */
    updateTimer = () => {
        const currentTime = Date.now();
        this.timer -= currentTime - this.lastTime;
        this.lastTime = currentTime;

        // Update the count
        const isCaptainActive = uw.GameDataPremium.isAdvisorActivated('captain');
        this.$count.text(Math.round(Math.max(this.timer, 0) / 1000));
        this.$count.css('color', isCaptainActive ? "#1aff1a" : "yellow");
    };

    claim = async () => {
        const isCaptainActive = uw.GameDataPremium.isAdvisorActivated('captain');
        const polis_list = this.generateList();

        // If the captain is active, claim all the resources at once and fake the opening
        if (isCaptainActive && !this.gui) {
            try {
                await this.fakeOpening();
                await this.sleep(Math.random() * 2000 + 1000); // random between 1 second and 3
                await this.fakeSelectAll();
                await this.sleep(Math.random() * 2000 + 1000);
                if (this.timing <= 600_000) await this.claimMultiple(300, 600);
                if (this.timing > 600_000) await this.claimMultiple(1200, 2400);
                await this.fakeUpdate();

                setTimeout(() => uw.WMap.removeFarmTownLootCooldownIconAndRefreshLootTimers(), 2000);
                return;
            } catch (e) {
                /* Se o caminho do Captain (claim em massa) falhar por
                   qualquer motivo (timeout, erro do servidor, etc), cai
                   pro caminho de coleta individual abaixo em vez de
                   ficar preso repetindo o mesmo erro pra sempre a cada
                   ciclo - assim o farm continua funcionando (mais
                   devagar) mesmo quando o caminho em massa está com
                   problema. */
                this.console.log('[AutoFarm] Caminho do Captain falhou (' + (e?.message ?? e) + '), usando coleta individual como alternativa.');
            }
        }

        if (isCaptainActive && this.gui) {
            try {
                await this.fakeGuiUpdate();
                return;
            } catch (e) {
                this.console.log('[AutoFarm] Caminho do Captain (GUI) falhou (' + (e?.message ?? e) + '), usando coleta individual como alternativa.');
            }
        }

        // If the captain is not active (or the captain path failed above), claim the resources one by one, but limit the number of claims
        await this._claimOneByOne(polis_list);
    };

    /* Coleta cidade a cidade, respeitando o limite de 60 por ciclo.
       Usado quando o Captain não está ativo, e também como fallback
       quando o caminho em massa (claimMultiple) falha. */
    _claimOneByOne = async (polis_list) => {
        let max = 60;
        const { models: player_relation_models } = uw.MM.getOnlyCollectionByName('FarmTownPlayerRelation');
        const { models: farm_town_models } = uw.MM.getOnlyCollectionByName('FarmTown');
        const now = Math.floor(Date.now() / 1000);
        for (let town_id of polis_list) {
            let town = uw.ITowns.towns[town_id];
            let x = town.getIslandCoordinateX();
            let y = town.getIslandCoordinateY();

            for (let farm_town of farm_town_models) {
                if (farm_town.attributes.island_x != x) continue;
                if (farm_town.attributes.island_y != y) continue;

                for (let relation of player_relation_models) {
                    if (farm_town.attributes.id != relation.attributes.farm_town_id) continue;
                    if (relation.attributes.relation_status !== 1) continue;
                    if (relation.attributes.lootable_at !== null && now < relation.attributes.lootable_at) continue;

                    this.claimSingle(town_id, relation.attributes.farm_town_id, relation.id, Math.ceil(this.timing / 600_000));
                    await this.sleep(500);
                    if (!max) return;
                    else max -= 1;
                }
            }
        }

        setTimeout(() => uw.WMap.removeFarmTownLootCooldownIconAndRefreshLootTimers(), 2000);
    };

    /* Return the total resources of the polis in the list */
    getTotalResources = () => {
        const polis_list = this.generateList();

        let total = {
            wood: 0,
            stone: 0,
            iron: 0,
            storage: 0,
        };

        for (let town_id of polis_list) {
            const town = uw.ITowns.getTown(town_id);
            const { wood, stone, iron, storage } = town.resources();
            total.wood += wood;
            total.stone += stone;
            total.iron += iron;
            total.storage += storage;
        }

        return total;
    };

    main = async () => {
        if (window.__multbot_captcha_active) return;
        try {
            // Check that the timer is not too high
            const next_collection = this.getNextCollection();
            if (next_collection && (this.timer > next_collection + 60 * 1_000 || this.timer < next_collection)) {
                this.timer = next_collection + Math.floor(Math.random() * 20_000) + 10_000;
            }

            // Claim resources when timer has passed
            if (this.timer < 1) {
                // Generate the list of polis and claim resources
                this.polis_list = this.generateList();

                // Claim the resources, stop the interval and restart it
                clearInterval(this.active);
                this.active = null;

                await this.claim();
                this.active = setInterval(this.main, 5000);

                // Set the new timer 
                const rand = Math.floor(Math.random() * 20_000) + 10_000;
                this.timer = this.timing + rand;
                if (this.timer < next_collection) this.timer = next_collection + rand;
            }

            // update the timer
            this.updateTimer();
        } catch (e) {
            this.console.log('[AutoFarm] Erro no main(): ' + (e?.message ?? e));
            // Garante que o interval nao fica travado (parado) se o erro
            // aconteceu depois do clearInterval mas antes de recria-lo.
            if (!this.active) this.active = setInterval(this.main, 5000);
        }
    };

    /* Claim resources from a single polis */
    claimSingle = async (town_id, farm_town_id, relation_id, option = 1) => {
        const data = {
            model_url: `FarmTownPlayerRelation/${relation_id}`,
            action_name: 'claim',
            arguments: {
                farm_town_id: farm_town_id,
                type: 'resources',
                option: option,
            },
            town_id: town_id,
        };
        try {
            await this.ajaxPostWithTimeout('frontend_bridge', 'execute', data);
        } catch (e) {
            this.console.log('[AutoFarm] Erro ao coletar rural: ' + (e?.message ?? e));
        }
    };

    /* Claim resources from multiple polis */
    claimMultiple = async (base = 300, boost = 600) => {
        const polis_list = this.generateList();
        const data = {
            towns: polis_list,
            time_option_base: base,
            time_option_booty: boost,
            claim_factor: 'normal',
            /* Somado (mesmo padrão confirmado por captura nas outras 2
               chamadas dessa janela - fakeOpening/fakeSelectAll). Ainda
               não temos captura da chamada de claim em si, mas town_id +
               nl_init:true parecem ser exigidos em toda a sequência. */
            town_id: uw.ITowns.getCurrentTown().id,
            nl_init: true,
        };
        try {
            /* Timeout aumentado de 15s (default) pra 45s: esse endpoint
               processa TODAS as cidades de uma vez no servidor (ao
               contrario das outras chamadas do bot, que sao rapidas e
               pontuais) - com muitas cidades, 15s pode simplesmente nao
               ser tempo suficiente pra resposta chegar, mesmo que o
               pedido esteja correto e vá dar certo. */
            await this.ajaxPostWithTimeout('farm_town_overviews', 'claim_loads_multiple', data, 45000);
        } catch (e) {
            this.console.log('[AutoFarm] Erro em claimMultiple: ' + (e?.message ?? e));
            throw e;
        }
    };

    /* Pretend that the window it's opening */
    fakeOpening = async () => {
        try {
            /* Confirmado via captura real de rede: a chamada nativa de
               'index' manda {town_id, nl_init:true} - antes mandavamos
               um objeto vazio {}, o que pode nao inicializar o contexto
               certo no servidor pros passos seguintes (select_all,
               update, claim_loads_multiple). */
            const town_id = uw.ITowns.getCurrentTown().id;
            await this.ajaxGetWithTimeout('farm_town_overviews', 'index', { town_id: town_id, nl_init: true });
            await this.sleep(10);
            await this.fakeUpdate();
        } catch (e) {
            this.console.log('[AutoFarm] Erro em fakeOpening: ' + (e?.message ?? e));
            throw e;
        }
    };

    /* Fake the user selecting the list */
    fakeSelectAll = async () => {
        /* Confirmado via captura real de rede: faltavam town_id (cidade
           atual) e nl_init:true - mandavamos só town_ids antes. */
        const data = {
            town_ids: this.polis_list,
            town_id: uw.ITowns.getCurrentTown().id,
            nl_init: true,
        };
        try {
            await this.ajaxGetWithTimeout('farm_town_overviews', 'get_farm_towns_from_multiple_towns', data);
        } catch (e) {
            this.console.log('[AutoFarm] Erro em fakeSelectAll: ' + (e?.message ?? e));
            throw e;
        }
    };

    /* Fake the window update*/
    fakeUpdate = async () => {
        const town = uw.ITowns.getCurrentTown();
        const { attributes: booty } = town.getResearches();
        const { attributes: trade_office } = town.getBuildings();
        const data = {
            island_x: town.getIslandCoordinateX(),
            island_y: town.getIslandCoordinateY(),
            current_town_id: town.id,
            booty_researched: booty ? 1 : 0,
            diplomacy_researched: '',
            trade_office: trade_office ? 1 : 0,
            /* Somado (não confirmado por captura específica desta chamada,
               mas presente nas outras 2 chamadas da mesma janela que já
               capturamos - town_id + nl_init:true parecem ser um padrão
               comum a toda a sequência do farm_town_overviews). */
            town_id: town.id,
            nl_init: true,
        };
        try {
            await this.ajaxGetWithTimeout('farm_town_overviews', 'get_farm_towns_for_town', data);
        } catch (e) {
            this.console.log('[AutoFarm] Erro em fakeUpdate: ' + (e?.message ?? e));
            throw e;
        }
    };

    /* Fake the gui update */
    fakeGuiUpdate = () =>
        new Promise(async (myResolve, myReject) => {
            // Open the farm town overview
            uw.$(".toolbar_button.premium .icon").trigger('mouseenter')
            await this.sleep(1019.39, 127.54)

            // Click on the farm town overview
            uw.$(".farm_town_overview a").trigger('click')
            await this.sleep(1156.65, 165.62)

            // Select all the polis
            uw.$(".checkbox.select_all").trigger("click")
            await this.sleep(1036.20, 135.69)

            // Claim the resources
            uw.$("#fto_claim_button").trigger("click")
            await this.sleep(1036.20, 135.69)

            // Confirm the claim if needed
            const el = uw.$(".confirmation .btn_confirm.button_new")
            if (el.length) {
                el.trigger("click")
                await this.sleep(1036.20, 135.69)
            }

            // Close the window
            uw.$(".icon_right.icon_type_speed.ui-dialog-titlebar-close").trigger("click")
            myResolve();
        });
};
