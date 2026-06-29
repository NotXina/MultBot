class AutoTrain extends ModernUtil {
    POWER_LIST = ['call_of_the_ocean', 'spartan_training', 'fertility_improvement'];
    GROUND_ORDER = ['catapult', 'sword', 'archer', 'hoplite', 'slinger', 'rider', 'chariot'];
    NAVAL_ORDER = ['small_transporter', 'bireme', 'trireme', 'attack_ship', 'big_transporter', 'demolition_ship', 'colonize_ship'];
    SHIFT_LEVELS = {
        catapult: [5, 5],
        sword: [200, 50],
        archer: [200, 50],
        hoplite: [200, 50],
        slinger: [200, 50],
        rider: [100, 25],
        chariot: [100, 25],
        small_transporter: [10, 5],
        bireme: [50, 10],
        trireme: [50, 10],
        attack_ship: [50, 10],
        big_transporter: [50, 10],
        demolition_ship: [50, 10],
        colonize_ship: [5, 1],
    };

    constructor(c, s) {
        super(c, s);

        this.spell = this.storage.load('at_spell', false);
        this.percentual = this.storage.load('at_per', 1);
        this.city_troops = this.storage.load('troops', {});
        this.shiftHeld = false;

        this.interval = setInterval(this.main.bind(this), this.getRandomDelay(1000, 10000));

        // Observer registrado uma única vez — evita duplicatas ao reabrir a aba Train
        uw.$.Observer(uw.GameEvents.town.town_switch).subscribe('autoTrain_townSwitch', () => {
            this.setPolisInSettings(uw.ITowns.getCurrentTown().id);
            this.updatePolisInSettings(uw.ITowns.getCurrentTown().id);
        });
    }

    getRandomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    settings = () => {
        requestAnimationFrame(() => {
            this.setPolisInSettings(uw.ITowns.getCurrentTown().id);
            this.updatePolisInSettings(uw.ITowns.getCurrentTown().id);
            this.handlePercentual(this.percentual);
            this.handleSpell(this.spell);

            uw.$('#troops_lvl_buttons').on('mousedown', e => {
                this.shiftHeld = e.shiftKey;
            });
        });

        return `
        <div class="game_border" style="margin-bottom: 20px">
            <div class="game_border_top"></div>
            <div class="game_border_bottom"></div>
            <div class="game_border_left"></div>
            <div class="game_border_right"></div>
            <div class="game_border_corner corner1"></div>
            <div class="game_border_corner corner2"></div>
            <div class="game_border_corner corner3"></div>
            <div class="game_border_corner corner4"></div>
            <div class="game_header bold" style="position: relative; cursor: pointer"> 
            <span style="z-index: 10; position: relative;"> Settings </span>
            <span class="command_count"></span></div>

            <div class="split_content">
                <div style="padding: 5px;">
                ${this.getButtonHtml('train_passive', 'Passive', this.handleSpell, 0)}
                ${this.getButtonHtml('train_spell', 'Spell', this.handleSpell, 1)}
                </div>

                <div id="train_percentuals" style="padding: 5px;">
                ${this.getButtonHtml('train_percentuals_1', '80%', this.handlePercentual, 1)}
                ${this.getButtonHtml('train_percentuals_2', '90%', this.handlePercentual, 2)}
                ${this.getButtonHtml('train_percentuals_3', '100%', this.handlePercentual, 3)}
                </div>
            </div>
        </div>

        <div class="game_border">
            <div class="game_border_top"></div>
            <div class="game_border_bottom"></div>
            <div class="game_border_left"></div>
            <div class="game_border_right"></div>
            <div class="game_border_corner corner1"></div>
            <div class="game_border_corner corner2"></div>
            <div class="game_border_corner corner3"></div>
            <div class="game_border_corner corner4"></div>
            <div id="auto_train_title" class="game_header bold" style="position: relative; cursor: pointer" onclick="window.modernBot.autoTrain.trigger()"> 
            <span style="z-index: 10; position: relative;">Auto Train </span>
            <div style="position: absolute; right: 10px; top: 4px; font-size: 10px; z-index: 10"> (click to reset) </div>
            <span class="command_count"></span></div>
            <div id="troops_lvl_buttons"></div>    
        </div>
    `;
    };

    handleSpell = e => {
        e = !!e;
        if (this.spell != e) {
            this.spell = e;
            this.storage.save('at_spell', e);
        }
        if (e) {
            uw.$('#train_passive').addClass('disabled');
            uw.$('#train_spell').removeClass('disabled');
        } else {
            uw.$('#train_passive').removeClass('disabled');
            uw.$('#train_spell').addClass('disabled');
        }
    };

    handlePercentual = n => {
        let box = uw.$('#train_percentuals');
        let buttons = box.find('.button_new');
        buttons.addClass('disabled');
        uw.$(`#train_percentuals_${n}`).removeClass('disabled');
        if (this.percentual != n) {
            this.percentual = n;
            this.storage.save('at_per', n);
        }
    };

    getTotalPopulation = town_id => {
        const town = uw.ITowns.towns[town_id];
        const data = uw.GameData.units;
        const { models: orders } = town.getUnitOrdersCollection();

        let used = 0;
        for (let order of orders) {
            used += data[order.attributes.unit_type].population * (order.attributes.units_left / order.attributes.count) * order.attributes.count;
        }
        let units = town.units();
        for (let unit of Object.keys(units)) {
            used += data[unit].population * units[unit];
        }
        let outher = town.unitsOuter();
        for (let out of Object.keys(outher)) {
            used += data[out].population * outher[out];
        }
        return town.getAvailablePopulation() + used;
    };

    setPolisInSettings = town_id => {
        let town = uw.ITowns.towns[town_id];
        let researches = town.researches().attributes;
        let buildings = town.buildings().attributes;

        const isGray = troop => {
            if (!this.REQUIREMENTS.hasOwnProperty(troop)) return true;
            const { research, building, level } = this.REQUIREMENTS[troop];
            if (research && !researches[research]) return true;
            if (building && buildings[building] < level) return true;
            return false;
        };

        const getTroopHtml = (troop, bg) => {
            let gray = isGray(troop);
            if (gray) {
                return `
                <div class="auto_build_box">
                    <div class="item_icon auto_trade_troop" style="background-position: -${bg[0]}px -${bg[1]}px; filter: grayscale(1);"></div>
                </div>`;
            }
            return `
                <div class="auto_build_box">
                <div class="item_icon auto_trade_troop" onclick="window.modernBot.autoTrain.editTroopCount(${town_id}, '${troop}', 0)" style="background-position: -${bg[0]}px -${bg[1]}px; cursor: pointer">
                    <div class="auto_build_up_arrow" onclick="event.stopPropagation(); window.modernBot.autoTrain.editTroopCount(${town_id}, '${troop}', 1)"></div>
                    <div class="auto_build_down_arrow" onclick="event.stopPropagation(); window.modernBot.autoTrain.editTroopCount(${town_id}, '${troop}', -1)"></div>
                    <p style="color: red" id="troop_lvl_${troop}" class="auto_build_lvl">0</p>
                </div>
            </div>`;
        };

        uw.$('#troops_lvl_buttons').html(`
        <div id="troops_settings_${town_id}">
            <div style="width: 600px; margin-bottom: 3px; display: inline-flex">
                <a class="gp_town_link" href="${town.getLinkFragment()}">${town.getName()}</a>
                <p style="font-weight: bold; margin: 0px 5px"> [${town.getPoints()} pts] </p>
                <div class="population_icon_bot">
                    <p id="troops_lvl_population">${this.getTotalPopulation(town_id)}</p>
                </div>
            </div>
            <div style="width: 831px; display: inline-flex; gap: 1px;">
                ${getTroopHtml('sword',              [400,   0])}
                ${getTroopHtml('archer',             [ 50, 100])}
                ${getTroopHtml('hoplite',            [300,  50])}
                ${getTroopHtml('slinger',            [250, 350])}
                ${getTroopHtml('rider',              [ 50, 350])}
                ${getTroopHtml('chariot',            [200, 100])}
                ${getTroopHtml('catapult',           [150, 150])}
                ${getTroopHtml('big_transporter',    [  0, 150])}
                ${getTroopHtml('small_transporter',  [300, 350])}
                ${getTroopHtml('bireme',             [ 50, 150])}
                ${getTroopHtml('demolition_ship',    [250,   0])}
                ${getTroopHtml('attack_ship',        [150, 100])}
                ${getTroopHtml('trireme',            [400, 250])}
                ${getTroopHtml('colonize_ship',      [ 50, 200])}
            </div>
        </div>`);
    };

    editTroopCount = (town_id, troop, count) => {
        // Reinicia o interval para evitar spam imediato
        clearInterval(this.interval);
        this.interval = setInterval(this.main.bind(this), 2345);

        const { units } = uw.GameData;
        const { city_troops } = this;

        if (!city_troops.hasOwnProperty(town_id)) city_troops[town_id] = {};

        if (count) {
            const index = count > 0 ? 0 : 1;
            count = this.shiftHeld ? count * this.SHIFT_LEVELS[troop][index] : count;
        } else {
            count = 10000;
        }

        // Limita pela população disponível
        const total_pop = this.getTotalPopulation(town_id);
        const used_pop  = this.countPopulation(this.city_troops[town_id]);
        const unit_pop  = units[troop].population;
        if (total_pop - used_pop < unit_pop * count) count = parseInt((total_pop - used_pop) / unit_pop);

        if (troop in city_troops[town_id]) city_troops[town_id][troop] += count;
        else city_troops[town_id][troop] = count;

        if (city_troops[town_id][troop] <= 0) delete city_troops[town_id][troop];
        if (uw.$.isEmptyObject(city_troops[town_id])) delete this.city_troops[town_id];

        this.updatePolisInSettings(town_id);
        this.storage.save('troops', this.city_troops);
    };

    updatePolisInSettings = town_id => {
        const { units } = uw.GameData;
        const cityTroops = this.city_troops[town_id];

        Object.keys(units).forEach(troop => {
            const guiCount = cityTroops?.[troop] ?? 0;
            const selector = `#troops_settings_${town_id} #troop_lvl_${troop}`;
            if (guiCount > 0) uw.$(selector).css('color', 'orange').text(guiCount);
            else uw.$(selector).css('color', '').text('-');
        });

        const isTownActive = !!this.city_troops[town_id];
        uw.$('#auto_train_title').css('filter', isTownActive ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    };

    trigger = () => {
        const town_id = uw.ITowns.getCurrentTown().getId();
        if (this.city_troops[town_id]) {
            delete this.city_troops[town_id];
            [...this.NAVAL_ORDER, ...this.GROUND_ORDER].forEach(troop => {
                uw.$(`#troops_settings_${town_id} #troop_lvl_${troop}`).css('color', '').text('-');
            });
            uw.$('#auto_train_title').css('filter', '');
            this.storage.save('troops', this.city_troops);
        }
    };

    getUnitOrdersCount = (type, town_id) => {
        return uw.ITowns.getTown(town_id).getUnitOrdersCollection().where({ kind: type }).length;
    };

    getTroopCount = (troop, town_id) => {
        const town = uw.ITowns.getTown(town_id);
        if (!this.city_troops[town_id]?.[troop]) return 0;

        // Quanto falta recrutar (meta - já existentes - em fila)
        let count = this.city_troops[town_id][troop];
        for (let order of town.getUnitOrdersCollection().models) {
            if (order.attributes.unit_type === troop) count -= order.attributes.count;
        }
        const townUnits  = town.units();
        const outerUnits = town.unitsOuter();
        if (townUnits[troop])  count -= townUnits[troop];
        if (outerUnits[troop]) count -= outerUnits[troop];
        if (count <= 0) return 0; // meta já atingida

        // Quanto posso recrutar agora com os recursos atuais
        const resources = town.resources();
        const discount  = uw.GeneralModifications.getUnitBuildResourcesModification(town_id, uw.GameData.units[troop]);
        const { wood, stone, iron } = uw.GameData.units[troop].resources;
        const current = parseInt(Math.min(
            resources.wood  / Math.round(wood  * discount),
            resources.stone / Math.round(stone * discount),
            resources.iron  / Math.round(iron  * discount)
        ));
        if (current <= 0) return -1; // sem recursos agora

        // População disponível
        const duable_with_pop = parseInt(resources.population / uw.GameData.units[troop].population);
        if (duable_with_pop <= 0) return -1;

        // Limite máximo baseado no storage e no percentual configurado (1=80%, 2=90%, 3=100%)
        const pct = [0.8, 0.9, 1.0][(this.percentual ?? 1) - 1] ?? 0.85;
        const max = Math.min(
            parseInt(Math.min(
                resources.storage / (wood  * discount),
                resources.storage / (stone * discount),
                resources.storage / (iron  * discount)
            ) * pct),
            duable_with_pop
        );

        const toRecruit = Math.min(count, current, max);
        return toRecruit > 0 ? toRecruit : -1;
    };

    /* Check the given town for ground or naval — itera todas as tropas sem loop infinito */
    checkPolis = (type, town_id) => {
        if (this.getUnitOrdersCount(type, town_id) > 6) return 0;

        const order  = type === 'naval' ? this.NAVAL_ORDER : this.GROUND_ORDER;
        const troops = this.city_troops[town_id];
        if (!troops) return 0;

        for (const unit of order) {
            if (!troops[unit]) continue;       // não configurada
            const count = this.getTroopCount(unit, town_id);
            if (count === 0) continue;         // meta atingida, tenta próxima
            if (count < 0)   continue;         // sem recursos agora, tenta próxima
            this.buildPost(town_id, unit, count);
            return true;
        }
        return 0;
    };

    getPowerActive = () => {
        const { fragments } = uw.MM.getFirstTownAgnosticCollectionByName('CastedPowers');
        const towns_list = [];
        for (let town_id in this.city_troops) {
            const { models } = fragments[town_id];
            for (let power of models) {
                if (this.POWER_LIST.includes(power.attributes.power_id)) {
                    towns_list.push(town_id);
                    break;
                }
            }
        }
        return towns_list;
    };

    /* Envia o pedido de recrutamento ao servidor */
    buildPost = (town_id, unit, count) => {
        const endpoint = this.NAVAL_ORDER.includes(unit) ? 'building_docks' : 'building_barracks';
        this.console.log(`[AutoTrain] ${uw.ITowns.towns[town_id].getName()}: ${count}x ${unit}`);
        uw.gpAjax.ajaxPost(endpoint, 'build', { unit_id: unit, amount: count, town_id });
    };

    getActiveList = () => {
        if (!this.spell) return Object.keys(this.city_troops);
        return this.getPowerActive();
    };

    main = () => {
        const town_list = this.getActiveList();
        if (!town_list.length) return;
        town_list.forEach(town_id => {
            if (town_id in uw.ITowns.towns) {
                this.checkPolis('naval',  town_id);
                this.checkPolis('ground', town_id);
            } else {
                delete this.city_troops[town_id];
                this.storage.save('troops', this.city_troops);
            }
        });
    };
}
