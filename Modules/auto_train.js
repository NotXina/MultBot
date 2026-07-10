var AutoTrain = class extends MultUtil {
    POWER_LIST = ['call_of_the_ocean', 'spartan_training', 'fertility_improvement'];
    GROUND_ORDER    = ['catapult', 'sword', 'archer', 'hoplite', 'slinger', 'rider', 'chariot'];
    NAVAL_ORDER     = ['small_transporter', 'bireme', 'trireme', 'attack_ship', 'big_transporter', 'demolition_ship', 'colonize_ship'];
    MYTHICAL_GROUND = ['minotaur', 'manticore', 'zyklop', 'harpy', 'medusa', 'centaur', 'cerberus', 'fury', 'griffin', 'calydonian_boar', 'satyr', 'spartoi', 'ladon', 'pegasus', 'godsent'];
    MYTHICAL_NAVAL  = ['sea_monster', 'siren'];

    /* Depois que o primeiro lote grande esgota o que estava guardado
       no armazem, sobra so a producao por hora entre um tick e outro
       do bot (poucos segundos) - o suficiente pra 1 unidade, no
       maximo. Sem essa trava, o bot manda uma ordem de "1 unidade" a
       cada tick, enchendo a fila de pedidos minusculos em vez de
       treinar em lotes maiores.
       MIN_BATCH_RATIO = fracao do byStorage (o teto que o percentual
       de armazem configurado permite) que precisa estar disponivel
       AGORA pra a ordem valer a pena disparar. Ex: 0.3 = so dispara
       quando der pra pagar pelo menos 30% do teto do armazem de uma
       vez. Sobe esse numero pra lotes maiores (com esperas mais
       longas entre ordens) ou desce pra reagir mais rapido (lotes
       menores, mais ordens). Sempre dispara direto, ignorando essa
       trava, quando o lote calculado ja fecha 100% da meta restante -
       nesse caso nao ha motivo pra esperar mais. */
    MIN_BATCH_RATIO = 0.3;

    // Mapeamento de fallback (usado so se GameData.units[troop].god_id nao existir
    // nesse mundo especifico). godsent nao precisa entrar aqui - seu god_id real
    // ("all") ja vem direto do GameData, sem precisar de fallback.
    MYTHICAL_GOD = {
        minotaur:         'zeus',
        manticore:        'zeus',
        zyklop:           'poseidon',
        sea_monster:      'poseidon',
        centaur:          'athena',
        pegasus:          'athena',
        harpy:            'hera',
        medusa:           'hera',
        cerberus:         'hades',
        fury:             'hades',
        griffin:          'artemis',
        calydonian_boar:  'artemis',
        satyr:            'aphrodite',
        siren:            'aphrodite',
        ladon:            'ares',
        spartoi:          'ares',
    };

    SHIFT_LEVELS = {
        catapult:           [5,   5],
        sword:              [200, 50],
        archer:             [200, 50],
        hoplite:            [200, 50],
        slinger:            [200, 50],
        rider:              [100, 25],
        chariot:            [100, 25],
        small_transporter:  [10,  5],
        bireme:             [50,  10],
        trireme:            [50,  10],
        attack_ship:        [50,  10],
        big_transporter:    [50,  10],
        demolition_ship:    [50,  10],
        colonize_ship:      [5,   1],
        minotaur:           [5,   1],
        manticore:          [5,   1],
        zyklop:             [5,   1],
        harpy:              [10,  2],
        medusa:             [10,  2],
        centaur:            [10,  2],
        cerberus:           [5,   1],
        fury:               [5,   1],
        griffin:            [5,   1],
        calydonian_boar:    [10,  2],
        satyr:              [10,  2],
        spartoi:            [20,  5],
        ladon:              [2,   1],
        pegasus:            [10,  2],
        sea_monster:        [2,   1],
        siren:              [10,  2],
        godsent:            [5,   1],
    };

    constructor(c, s) {
        super(c, s);

        this.spell = this.storage.load('at_spell', false);
        this.percentual = this.storage.load('at_per', 1);
        this.city_troops = this.storage.load('troops', {});
        this.shiftHeld = false;

        this.interval = setInterval(this.main.bind(this), this.getRandomDelay(1000, 10000));
    }

    getRandomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    startInterval() {
        const randomDelay = this.getRandomDelay(1000, 10000);
        this.interval = setInterval(this.main.bind(this), randomDelay);
    }

    settings = () => {
        requestAnimationFrame(() => {
            this.setPolisInSettings(uw.ITowns.getCurrentTown().id);
            this.updatePolisInSettings(uw.ITowns.getCurrentTown().id);
            this.handlePercentual(this.percentual);
            this.handleSpell(this.spell);

            uw.$.Observer(uw.GameEvents.town.town_switch).subscribe(() => {
                this.setPolisInSettings(uw.ITowns.getCurrentTown().id);
                this.updatePolisInSettings(uw.ITowns.getCurrentTown().id);
            });

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
            <span style="z-index: 10; position: relative;"> ${this.t('at_settings')} </span>
            <span class="command_count"></span></div>

            <div class="split_content">
                <div style="padding: 5px;">
                ${this.getButtonHtml('train_passive', this.t('at_passive'), this.handleSpell, 0)}
                ${this.getButtonHtml('train_spell', this.t('at_spell'), this.handleSpell, 1)}
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
            <div id="auto_train_title" class="game_header bold" style="position: relative; cursor: pointer" onclick="window.multBot.autoTrain.trigger()"> 
            <span style="z-index: 10; position: relative;">${this.t('at_title')} </span>
            <div style="position: absolute; right: 10px; top: 4px; font-size: 10px; z-index: 10"> ${this.t('click_to_reset')} </div>
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

    /* Favor disponivel na cidade */
    _getFavor = (town_id) => {
        try {
            return uw.ITowns.towns[town_id]?.resources?.()?.favor ?? 0;
        } catch (e) { return 0; }
    };

    _isMythical = (troop) => {
        return this.MYTHICAL_GROUND.includes(troop) || this.MYTHICAL_NAVAL.includes(troop);
    };

    /* Descobre qual deus a cidade esta adorando (deus do templo).
       Confirmado: town.god() retorna string minuscula, ex: 'poseidon'. */
    _getTownGod = (town_id) => {
        try {
            return uw.ITowns.towns[town_id]?.god?.() ?? null;
        } catch (e) {
            return null;
        }
    };

    /* Deus dono de uma unidade mitica. Prioriza o dado nativo do jogo
       (GameData.units[troop].god_id, ex: "zeus", "poseidon", ou "all"
       para o Enviado Divino), com fallback pro mapeamento fixo caso
       esse mundo nao exponha o campo. */
    _getMythGod = (troop) => {
        return uw.GameData.units[troop]?.god_id ?? this.MYTHICAL_GOD[troop] ?? null;
    };

    /* true se a unidade e mitica e NAO pertence ao deus atual da cidade.
       Unidades com god_id "all" (ex: Enviado Divino) NUNCA sao bloqueadas
       por deus - estao sempre disponiveis independente de qual deus a
       cidade esta adorando, desde que haja favor suficiente (a checagem
       de favor em getTroopCount ja cuida disso naturalmente). */
    _isWrongGodMythical = (troop, town_id) => {
        if (!this._isMythical(troop)) return false;
        const requiredGod = this._getMythGod(troop);
        if (requiredGod === 'all') return false;
        const townGod = this._getTownGod(town_id);
        if (!requiredGod || !townGod) return true; // sem certeza -> trava por seguranca
        return townGod !== requiredGod;
    };

    setPolisInSettings = town_id => {
        let town = uw.ITowns.towns[town_id];
        let researches = town.researches().attributes;
        let buildings = town.buildings().attributes;

        const isGray = troop => {
            // Miticas: cinza se pertencem a um deus diferente do escolhido nesta
            // cidade. Enviado Divino (god_id "all") nunca fica cinza por esse
            // motivo - so a disponibilidade de favor decide na hora de treinar.
            if (this._isMythical(troop)) {
                return this._isWrongGodMythical(troop, town_id);
            }

            if (!this.REQUIREMENTS.hasOwnProperty(troop)) {
                return true; // Troop type not recognized
            }

            const { research, building, level } = this.REQUIREMENTS[troop];
            if (research && !researches[research]) return true;
            if (building && buildings[building] < level) return true;
            return false;
        };

        /* Usa a classe NATIVA do jogo (unit_icon50x50 + nome da unidade).
           O CSS do core.js cuida do encaixe dentro do quadradinho. */
        const getTroopHtml = (troop) => {
            let gray = isGray(troop);

            if (gray) {
                return `
                <div class="auto_build_box">
                    <div class="unit_icon50x50 ${troop}" style="filter: grayscale(1);"></div>
                </div>
                `;
            }
            return `
                <div class="auto_build_box">
                <div class="unit_icon50x50 ${troop}" onclick="window.multBot.autoTrain.editTroopCount(${town_id}, '${troop}', 0)" style="cursor: pointer">
                    <div class="auto_build_up_arrow" onclick="event.stopPropagation(); window.multBot.autoTrain.editTroopCount(${town_id}, '${troop}', 1)" ></div>
                    <div class="auto_build_down_arrow" onclick="event.stopPropagation(); window.multBot.autoTrain.editTroopCount(${town_id}, '${troop}', -1)"></div>
                    <p style="color: red" id="troop_lvl_${troop}" class="auto_build_lvl"> 0 <p>
                </div>
            </div>`;
        };

        uw.$('#troops_lvl_buttons').html(`
        <div id="troops_settings_${town_id}">
            <div style="width: 600px; margin-bottom: 3px; display: inline-flex">
            <a class="gp_town_link" href="${town.getLinkFragment()}">${town.getName()}</a> 
            <p style="font-weight: bold; margin: 0px 5px"> [${town.getPoints()} pts] </p>
            <p style="font-weight: bold; margin: 0px 5px"> </p>
            <div class="population_icon_bot">
                <p id="troops_lvl_population"> ${this.getTotalPopulation(town_id)} <p>
            </div>
            </div>
            <div style="width: 831px; display: inline-flex; gap: 1px;">
            ${getTroopHtml('sword')}
            ${getTroopHtml('archer')}
            ${getTroopHtml('hoplite')}
            ${getTroopHtml('slinger')}
            ${getTroopHtml('rider')}
            ${getTroopHtml('chariot')}
            ${getTroopHtml('catapult')}

            ${getTroopHtml('big_transporter')}
            ${getTroopHtml('small_transporter')}
            ${getTroopHtml('bireme')}
            ${getTroopHtml('demolition_ship')}
            ${getTroopHtml('attack_ship')}
            ${getTroopHtml('trireme')}
            ${getTroopHtml('colonize_ship')}
            </div>
            <div style="width: 831px; display: inline-flex; gap: 1px; margin-top: 4px; border-top: 1px solid rgba(0,0,0,0.15); padding-top: 4px;">
            ${getTroopHtml('minotaur')}
            ${getTroopHtml('manticore')}
            ${getTroopHtml('zyklop')}
            ${getTroopHtml('harpy')}
            ${getTroopHtml('medusa')}
            ${getTroopHtml('centaur')}
            ${getTroopHtml('pegasus')}
            ${getTroopHtml('cerberus')}
            ${getTroopHtml('fury')}
            ${getTroopHtml('griffin')}
            ${getTroopHtml('calydonian_boar')}
            ${getTroopHtml('satyr')}
            ${getTroopHtml('spartoi')}
            ${getTroopHtml('ladon')}
            ${getTroopHtml('sea_monster')}
            ${getTroopHtml('siren')}
            ${getTroopHtml('godsent')}
            </div>
        </div>`);
    };

    editTroopCount = (town_id, troop, count) => {
        /* Bloqueia edicao de unidade mitica de deus errado, mesmo se
           alguem tentar clicar via onclick manual/injecao de HTML */
        if (this._isWrongGodMythical(troop, town_id)) return;

        /* restart the interval to prevent spam*/
        clearInterval(this.interval);
        this.interval = setInterval(this.main.bind(this), 2345);

        const { units } = uw.GameData;
        const { city_troops } = this;

        // Add the town to the city_troops object if it doesn't already exist
        if (!city_troops.hasOwnProperty(town_id)) city_troops[town_id] = {};

        if (count) {
            // Modify count based on whether the shift key is held down
            const index = count > 0 ? 0 : 1;
            const levels = this.SHIFT_LEVELS[troop] ?? [10, 5];
            count = this.shiftHeld ? count * levels[index] : count;
        } else {
            count = 10000;
        }

        // Check if the troop count can be increased without exceeding population capacity
        const total_pop = this.getTotalPopulation(town_id);
        const used_pop = this.countPopulation(this.city_troops[town_id]);
        const unit_pop = units[troop]?.population ?? 1;
        if (total_pop - used_pop < unit_pop * count) count = parseInt((total_pop - used_pop) / unit_pop);

        // Update the troop count for the specified town and troop type
        if (troop in city_troops[town_id]) city_troops[town_id][troop] += count;
        else city_troops[town_id][troop] = count;

        /* Clenaup */
        if (city_troops[town_id][troop] <= 0) delete city_troops[town_id][troop];
        if (uw.$.isEmptyObject(city_troops[town_id])) delete this.city_troops[town_id];

        this.updatePolisInSettings(town_id);
        this.storage.save('troops', this.city_troops);
    };

    /* API publica: seta a quantidade ALVO (valor absoluto, nao
       incremental) de uma unidade numa cidade. Diferente de
       editTroopCount (que e feito pra UI: soma/subtrai com base no
       shift e mexe no DOM do painel de configuracoes), esse metodo
       nao depende de nada estar renderizado na tela. Criado pra o
       MultTools (aba Mult) configurar colonize_ship em massa sem
       tocar em this.city_troops diretamente. */
    setTroopTarget = (town_id, troop, count) => {
        if (!this.city_troops[town_id]) this.city_troops[town_id] = {};
        if (count > 0) this.city_troops[town_id][troop] = count;
        else delete this.city_troops[town_id][troop];
        if (uw.$.isEmptyObject(this.city_troops[town_id])) delete this.city_troops[town_id];
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

        const isTownActive = this.city_troops[town_id];
        uw.$('#auto_train_title').css('filter', isTownActive ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    };

    trigger = () => {
        const town = uw.ITowns.getCurrentTown();
        const town_id = town.getId();
        if (this.city_troops[town_id]) {
            delete this.city_troops[town_id];
            [...this.NAVAL_ORDER, ...this.GROUND_ORDER, ...this.MYTHICAL_GROUND, ...this.MYTHICAL_NAVAL].forEach(troop => {
                const selector = `#troops_settings_${town_id} #troop_lvl_${troop}`;
                uw.$(selector).css('color', '').text('-');
            });
            uw.$('#auto_train_title').css('filter', '');
            this.storage.save('troops', this.city_troops);
        }
    };

    /* return the count of the order type (naval or ground) */
    getUnitOrdersCount = (type, town_id) => {
        const town = uw.ITowns.getTown(town_id);
        return town.getUnitOrdersCollection().where({ kind: type }).length;
    };

    /* Quanto de uma tropa ainda falta recrutar, e o quanto e possivel agora.
       0   = meta ja atingida
       -1  = sem recursos/favor/populacao suficiente agora (tenta a proxima tropa)
       N>0 = quantidade a recrutar agora */
    getTroopCount = (troop, town_id) => {
        const town = uw.ITowns.getTown(town_id);
        if (!this.city_troops[town_id]?.[troop]) return 0;

        const unitData = uw.GameData.units[troop];
        if (!unitData) return 0; // unidade nao existe neste mundo/servidor

        // Quanto falta recrutar (meta - ja existentes - em fila)
        let count = this.city_troops[town_id][troop];
        for (let order of town.getUnitOrdersCollection().models) {
            if (order.attributes.unit_type === troop) count -= order.attributes.count;
        }
        const townUnits  = town.units();
        const outerUnits = town.unitsOuter();
        if (townUnits[troop])  count -= townUnits[troop];
        if (outerUnits[troop]) count -= outerUnits[troop];
        if (count <= 0) return 0; // meta ja atingida

        const resources = town.resources();
        const discount  = uw.GeneralModifications.getUnitBuildResourcesModification(town_id, unitData);
        const { wood, stone, iron } = unitData.resources;

        // Limite por recursos normais
        let byResources;
        if (wood === 0 && stone === 0 && iron === 0) {
            byResources = count; // godsent tem custo 0/0/0 - sem gargalo de recursos
        } else {
            byResources = parseInt(Math.min(
                resources.wood  / Math.round(wood  * discount),
                resources.stone / Math.round(stone * discount),
                resources.iron  / Math.round(iron  * discount)
            ));
        }
        if (byResources <= 0) return -1;

        // Limite por favor (apenas miticas) - e aqui que "deus errado" e
        // naturalmente filtrado tambem para deuses especificos: sem favor
        // pra esse deus, retorna -1 sempre. Godsent (god_id "all") usa o
        // favor que a cidade tiver acumulado com o deus atual, sem
        // restricao de qual deus e.
        let byFavor = count;
        if (this._isMythical(troop) && unitData.favor > 0) {
            const favor = this._getFavor(town_id);
            byFavor = Math.floor(favor / unitData.favor);
            if (byFavor <= 0) return -1;
        }

        // Limite por populacao
        const byPop = parseInt(resources.population / unitData.population);
        if (byPop <= 0) return -1;

        // Limite maximo por storage e percentual configurado (1=80%, 2=90%, 3=100%)
        const pct = [0.8, 0.9, 1.0][(this.percentual ?? 1) - 1] ?? 0.85;
        let byStorage = count;
        if (wood > 0 || stone > 0 || iron > 0) {
            byStorage = parseInt(Math.min(
                resources.storage / (wood  * discount),
                resources.storage / (stone * discount),
                resources.storage / (iron  * discount)
            ) * pct);
        } // godsent nao tem custo de recursos, entao nao ha limite de storage a aplicar

        const toRecruit = Math.min(count, byResources, byFavor, byPop, byStorage);
        if (toRecruit <= 0) return -1;

        /* So dispara quando o lote vale a pena (ver MIN_BATCH_RATIO
           acima) - evita ficar mandando ordem de 1 unidade a cada
           tick assim que o armazem esvazia depois do primeiro lote
           grande. So se aplica a unidades com custo em recursos -
           godsent (custo 0/0/0) sempre dispara direto, ja que nao
           tem esse gargalo de "esperar acumular". Tambem dispara
           direto se esse lote ja fecha 100% da meta restante. */
        if (wood > 0 || stone > 0 || iron > 0) {
            const minWorthwhile = Math.max(1, Math.floor(byStorage * this.MIN_BATCH_RATIO));
            if (toRecruit < minWorthwhile && toRecruit < count) return -1;
        }

        return toRecruit;
    };

    /* Check the given town, for ground or naval - sem risco de loop infinito.
       Miticas de deus errado sao puladas antes de gastar qualquer verificacao. */
    checkPolis = (type, town_id) => {
        const order_count = this.getUnitOrdersCount(type, town_id);
        if (order_count > 6) return 0;

        const troops = this.city_troops[town_id];
        if (!troops) return 0;

        const normalOrder   = type === 'naval' ? this.NAVAL_ORDER : this.GROUND_ORDER;
        const mythicalOrder = type === 'naval' ? this.MYTHICAL_NAVAL : this.MYTHICAL_GROUND;
        const unitOrder = [...normalOrder, ...mythicalOrder];

        for (const unit of unitOrder) {
            if (!troops[unit]) continue; // nao configurada
            if (this._isWrongGodMythical(unit, town_id)) continue; // deus errado, pula
            const count = this.getTroopCount(unit, town_id);
            if (count === 0) continue; // meta atingida
            if (count < 0) continue;   // sem recursos/favor agora
            this.buildPost(town_id, unit, count);
            return true;
        }
        return 0;
    };

    /* Return list of town that have power active */
    getPowerActive = () => {
        const { fragments } = uw.MM.getFirstTownAgnosticCollectionByName('CastedPowers');
        let towns_list = [];
        for (let town_id in this.city_troops) {
            const { models } = fragments[town_id];
            for (let power of models) {
                let { attributes } = power;
                if (this.POWER_LIST.includes(attributes.power_id)) {
                    towns_list.push(town_id);
                    break;
                }
            }
        }
        return towns_list;
    };

    /* Make build request to the server.
       Roteia entre docks (naval) e barracks (terrestre), cobrindo
       unidades normais e miticas navais (sea_monster, siren). Godsent
       (categoria mythological_ground, is_naval: false) e roteado
       corretamente para building_barracks, mesmo local onde o jogo
       treina Enviados Divinos de verdade. */
    buildPost = (town_id, unit, count) => {
        const isNaval = this.NAVAL_ORDER.includes(unit) || this.MYTHICAL_NAVAL.includes(unit);
        const endpoint = isNaval ? 'building_docks' : 'building_barracks';

        const data = {
            unit_id: unit,
            amount: count,
            town_id: town_id,
        };

        this.console.log(this.t('at_recruiting_log', {
            town: uw.ITowns.towns[town_id].getName(),
            count,
            unit: this.getGameName('unit', unit),
            endpoint,
        }));

        uw.gpAjax.ajaxPost(endpoint, 'build', data);
    };

    /* return the active towns */
    getActiveList = () => {
        if (!this.spell) return Object.keys(this.city_troops);
        return this.getPowerActive();
    };

    /* Main function - treina ground + naval em todas as cidades */
    main = () => {
        if (window.__multbot_captcha_active) return;
        const town_list = this.getActiveList();
        if (!town_list.length) return;
        town_list.forEach(town_id => {
            if (town_id in uw.ITowns.towns) {
                this.checkPolis('naval', town_id);
                this.checkPolis('ground', town_id);
            } else {
                delete this.city_troops[town_id];
                this.storage.save('troops', this.city_troops);
            }
        });
    };
};
