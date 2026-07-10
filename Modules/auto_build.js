var AutoBuild = class extends MultUtil {
    /* Quando o jogo rejeita uma construcao por requisitos nao
       atendidos (ex: Porto precisa de outro predio num nivel
       minimo), esse predio fica "bloqueado" por esse tempo antes
       de ser tentado de novo - evita ficar re-tentando (e logando)
       a cada ciclo do main() enquanto o requisito nao e atendido. */
    BUILD_ERROR_COOLDOWN_MS = 5 * 60 * 1000;

    constructor(c, s) {
        super(c, s);
        /* Load settings, the polis in the settings are the active */
        this.towns_buildings = this.storage.load('buildings', {});
        /* Check if shift is pressed */
        this.shiftHeld = false;
        /* Guarda a ultima tentativa de construcao (cidade + predio),
           usada para dar contexto ao interceptar mensagens nativas de
           erro do jogo (ex: "requisitos de construcao nao preenchidos") */
        this._lastBuildAttempt = null;
        /* town_id:building -> timestamp ate quando fica bloqueado
           apos um erro de requisitos nao atendidos */
        this._buildBlockedUntil = {};
        this._hookNativeErrorMessages();
        /* Active always, check if the towns are in the active list */
        this.interval = setInterval(this.main.bind(this), 5000);
        /* Add listener that change the Senate look */
        try {
            uw.$.Observer(uw.GameEvents.window.open).subscribe("multSenate", this.updateSenate);
        } catch(e) {
            this.console.log('[AutoBuild] ' + this.t('ab_observer_error', { msg: e.message }));
        }
    }
    startInterval() {
        this.interval = setInterval(this.main.bind(this), 5000);
    }
    _buildKey(town_id, building) {
        return town_id + ':' + building;
    }
    /* Bloqueia um predio especifico numa cidade especifica por
       BUILD_ERROR_COOLDOWN_MS. Enquanto bloqueado, getNextBuild pula
       essa construcao e segue tentando as outras da composicao. */
    _blockBuilding(town_id, building) {
        const key = this._buildKey(town_id, building);
        this._buildBlockedUntil[key] = Date.now() + this.BUILD_ERROR_COOLDOWN_MS;
        const town = uw.ITowns.towns[town_id];
        const townName = town && town.getName ? town.getName() : ('#' + town_id);
        const buildingName = this.getGameName ? this.getGameName('building', building) : building;
        const minutes = Math.round(this.BUILD_ERROR_COOLDOWN_MS / 60000);
        this.console.log('[AutoBuild] ' + this.t('ab_blocked_log', { town: townName, building: buildingName, min: minutes }));
    }
    _isBuildBlocked(town_id, building) {
        const key = this._buildKey(town_id, building);
        const until = this._buildBlockedUntil[key];
        return !!(until && until > Date.now());
    }
    /* Intercepta uw.HumanMessage.error UMA UNICA VEZ (guard global via
       window, sobrevive a reloads normalmente ja que o flag reseta a
       cada carregamento de pagina). Sempre que uma mensagem de erro
       nativa do jogo disparar dentro de 3s de uma tentativa nossa de
       construir algo, loga no console qual cidade e qual predio
       estavam envolvidos - sem isso, o banner aparece na tela mas
       nunca sabemos qual construcao especifica foi rejeitada.
       Se a mensagem for de requisitos nao atendidos, alem de logar,
       bloqueia esse predio (ver _blockBuilding) para nao ficar
       spammando a mesma tentativa fadada a falhar a cada 5s. */
    _hookNativeErrorMessages() {
        if (window.__multbot_humanmessage_error_hooked) return;
        window.__multbot_humanmessage_error_hooked = true;
        try {
            const original = uw.HumanMessage.error.bind(uw.HumanMessage);
            const self = this;
            uw.HumanMessage.error = function (message, ...rest) {
                try {
                    const attempt = self._lastBuildAttempt;
                    if (attempt && (Date.now() - attempt.at) < 3000) {
                        const buildingName = self.getGameName ? self.getGameName('building', attempt.building) : attempt.building;
                        self.console.log('[AutoBuild] ' + self.t('ab_native_warning_log', { message, building: buildingName, town: attempt.townName }));

                        if (/requisit/i.test(message) && attempt.townId != null) {
                            self._blockBuilding(attempt.townId, attempt.building);
                        }
                    }
                } catch (e) {
                    // nunca deixa o hook quebrar a mensagem original do jogo
                }
                return original(message, ...rest);
            };
            this.console.log('[AutoBuild] ' + this.t('ab_error_hook_active'));
        } catch (e) {
            this.console.log('[AutoBuild] ' + this.t('ab_error_hook_failed', { msg: e.message }));
        }
    }
    settings = () => {
        /* Apply event to shift */
        requestAnimationFrame(() => {
            uw.$('#buildings_lvl_buttons').on('mousedown', e => {
                this.shiftHeld = e.shiftKey;
            });
            this.setPolisInSettings(uw.ITowns.getCurrentTown().id);
            this.updateTitle();
            uw.$.Observer(uw.GameEvents.town.town_switch).subscribe(() => {
                this.setPolisInSettings(uw.ITowns.getCurrentTown().id);
                this.updateTitle();
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
            <div id="auto_build_title" style="cursor: pointer; filter: ${this.interval ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : ''}" class="game_header bold" onclick="window.multBot.autoBuild.toggle()"> ${this.t('ab_title')} <span class="command_count"></span>
                <div style="position: absolute; right: 10px; top: 4px; font-size: 10px;"> ${this.t('click_to_toggle')} </div>
            </div>
            <div style="padding: 6px; display:flex; gap:6px; align-items:center; border-bottom: 1px solid rgba(0,0,0,0.1);">
                <span style="font-size:11px;font-weight:bold;" title="${this.t('ab_presets_tooltip')}">${this.t('ab_presets_label')}</span>
                ${this.getButtonHtml('auto_build_preset_naval', this.t('ab_preset_naval'), this.applyNavalPreset)}
                ${this.getButtonHtml('auto_build_preset_land', this.t('ab_preset_land'), this.applyLandPreset)}
            </div>
            <div id="buildings_lvl_buttons"></div>
        </div> `;
    };
    /* Monta o objeto de preset de construcoes: nivel maximo em tudo,
       exceto os overrides passados (ex: {barracks:5, wall:0}).
       Usado pelos presets de cidade unica (naval/terrestre) abaixo e
       por applyPresetToAllTowns(), pra nao duplicar a lista de
       construcoes e a busca de max_level em varios lugares. */
    _buildBuildingsPreset = (overrides = {}) => {
        const buildings = ['main', 'storage', 'farm', 'academy', 'temple', 'barracks', 'docks', 'market', 'hide', 'lumber', 'stoner', 'ironer', 'wall'];
        const preset = {};
        for (const b of buildings) {
            const maxLevel = uw.GameData.buildings[b]?.max_level ?? 45;
            preset[b] = overrides.hasOwnProperty(b) ? overrides[b] : maxLevel;
        }
        return preset;
    };
    /* Preset Naval: tudo no maximo, exceto quartel=5 e muro=0.
       Aplica SOMENTE na cidade atualmente ativa no jogo. */
    applyNavalPreset = () => {
        try {
            const town = uw.ITowns.getCurrentTown();
            const town_id = town.getId();
            this.towns_buildings[town_id] = this._buildBuildingsPreset({ barracks: 5, wall: 0 });
            this.storage.save('buildings', this.towns_buildings);
            if (!this.interval) this.startInterval();
            this.setPolisInSettings(town_id);
            this.updateTitle();
            const msg = this.t('ab_naval_applied', { town: town.getName() });
            this.console.log('[AutoBuild] ' + msg);
        } catch (e) {
            this.console.log('[AutoBuild] ' + this.t('ab_naval_error', { msg: e.message }));
        }
    };
    /* Preset Terrestre: tudo no maximo, exceto porto=5 e muro=0.
       Aplica SOMENTE na cidade atualmente ativa no jogo. */
    applyLandPreset = () => {
        try {
            const town = uw.ITowns.getCurrentTown();
            const town_id = town.getId();
            this.towns_buildings[town_id] = this._buildBuildingsPreset({ docks: 5, wall: 0 });
            this.storage.save('buildings', this.towns_buildings);
            if (!this.interval) this.startInterval();
            this.setPolisInSettings(town_id);
            this.updateTitle();
            const msg = this.t('ab_land_applied', { town: town.getName() });
            this.console.log('[AutoBuild] ' + msg);
        } catch (e) {
            this.console.log('[AutoBuild] ' + this.t('ab_land_error', { msg: e.message }));
        }
    };
    /* API publica: aplica o mesmo preset de construcoes (overrides) em
       TODAS as cidades do jogador de uma vez. Criado pra o MultTools
       (aba Mult) nao precisar mais ler/escrever this.towns_buildings
       diretamente - agora ele so chama esse metodo. Retorna quantas
       cidades foram afetadas. */
    applyPresetToAllTowns = (overrides = {}) => {
        const townIds = Object.keys(uw.ITowns.towns);
        if (townIds.length === 0) return 0;
        const preset = this._buildBuildingsPreset(overrides);
        for (const townId of townIds) {
            this.towns_buildings[townId] = { ...preset };
        }
        this.storage.save('buildings', this.towns_buildings);
        if (!this.interval) this.startInterval();
        return townIds.length;
    };
    /* Update the senate view */
    updateSenate = (event, handler) => {
        if (handler.context !== "building_senate") return;
        // Edit the width of the window to fit the new element
        handler.wnd.setWidth(850);
        // Compute the id of the window
        const id = `gpwnd_${handler.wnd.getID()}`;
        // Loop until the element is found
        const updateView = () => {
            const interval = setInterval(() => {
                const $window = uw.$('#' + id);
                const $mainTasks = $window.find('#main_tasks');
                if (!$mainTasks.length) return;
                $mainTasks.hide();
                let $newElement = uw.$('<div></div>').append(this.settings());
                $newElement.css({
                    position: $mainTasks.css('position'),
                    left: $mainTasks.css('left') - 20,
                    top: $mainTasks.css('top'),
                });
                $mainTasks.after($newElement);
                // Center the techTree
                const $techTree = $window.find('#techtree');
                $techTree.css({
                    position: 'relative',
                    left: "40px",
                });
                // Edit the width of the
                $window.css({
                    overflowY: 'visible',
                });
                clearInterval(interval);
            }, 10);
            // If the element is not found, stop the interval
            setTimeout(() => {
                clearInterval(interval);
            }, 100);
        };
        // subscribe to set content event
        const oldSetContent = handler.wnd.setContent2;
        handler.wnd.setContent2 = (...params) => {
            updateView();
            oldSetContent(...params);
        };
    };
    /* Given the town id, set the polis in the settings menu */
    setPolisInSettings = town_id => {
        let town = uw.ITowns.towns[town_id];
        /* If the town is in the active list set */
        let town_buildings = this.towns_buildings?.[town_id] ?? { ...town.buildings()?.attributes } ?? {};
        let buildings = { ...town.buildings().attributes };
        const getBuildingHtml = (building, bg) => {
            let color = 'lime';
            if (buildings[building] > town_buildings[building]) color = 'red';
            else if (buildings[building] < town_buildings[building]) color = 'orange';
            return `
                <div class="auto_build_box" onclick="window.multBot.autoBuild.editBuildingLevel(${town_id}, '${building}', 0)" style="cursor: pointer">
                <div class="item_icon auto_build_building" style="background-position: -${bg[0]}px -${bg[1]}px;">
                    <div class="auto_build_up_arrow" onclick="event.stopPropagation(); window.multBot.autoBuild.editBuildingLevel(${town_id}, '${building}', 1)" ></div>
                    <div class="auto_build_down_arrow" onclick="event.stopPropagation(); window.multBot.autoBuild.editBuildingLevel(${town_id}, '${building}', -1)"></div>
                    <p style="color: ${color}" id="build_lvl_${building}" class="auto_build_lvl"> ${town_buildings[building]} <p>
                </div>
            </div>`;
        };
        /* If the town is in a group, the groups */
        const groups =
            `(${Object.values(uw.ITowns.getTownGroups())
                .filter(group => group.id > 0 && group.id !== -1 && group.towns[town_id])
                .map(group => group.name)
                .join(', ')})` || '';
        uw.$('[id="buildings_lvl_buttons"]').html(`
        <div id="build_settings_${town_id}">
            <div style="width: 600px; margin-bottom: 3px; display: inline-flex">
            <a class="gp_town_link" href="${town.getLinkFragment()}">${town.getName()}</a>
            <p style="font-weight: bold; margin: 0px 5px"> [${town.getPoints()} pts] </p>
            <p style="font-weight: bold; margin: 0px 5px"> ${groups} </p>
            </div>
            <div style="width: 100%; display: inline-flex; gap: 6px;">
                ${getBuildingHtml('main', [450, 0])}
                ${getBuildingHtml('storage', [250, 50])}
                ${getBuildingHtml('farm', [150, 0])}
                ${getBuildingHtml('academy', [0, 0])}
                ${getBuildingHtml('temple', [300, 50])}
                ${getBuildingHtml('barracks', [50, 0])}
                ${getBuildingHtml('docks', [100, 0])}
                ${getBuildingHtml('market', [0, 50])}
                ${getBuildingHtml('hide', [200, 0])}
                ${getBuildingHtml('lumber', [400, 0])}
                ${getBuildingHtml('stoner', [200, 50])}
                ${getBuildingHtml('ironer', [250, 0])}
                ${getBuildingHtml('wall', [50, 100])}
            </div>
        </div>`);
    };
    /* call with town_id, building type and level to be added */
    editBuildingLevel = (town_id, name, d) => {
        const town = uw.ITowns.getTown(town_id);
        const { max_level, min_level } = uw.GameData.buildings[name];
        const town_buildings = this.towns_buildings?.[town_id] ?? { ...town.buildings()?.attributes } ?? {};
        const townBuildings = town.buildings().attributes;
        const current_lvl = parseInt(uw.$(`#build_lvl_${name}`).text());
        if (d) {
            /* if shift is pressed, add or remove 10 */
            d = this.shiftHeld ? d * 10 : d;
            /* Check if bottom or top overflow */
            town_buildings[name] = Math.min(Math.max(current_lvl + d, min_level), max_level);
        } else {
            if (town_buildings[name] == current_lvl) town_buildings[name] = Math.min(Math.max(50, min_level), max_level);
            else town_buildings[name] = townBuildings[name];
        }
        const color = town_buildings[name] > townBuildings[name] ? 'orange' : town_buildings[name] < townBuildings[name] ? 'red' : 'lime';
        uw.$(`#build_settings_${town_id} #build_lvl_${name}`).css('color', color).text(town_buildings[name]);
        if (town_id.toString() in this.towns_buildings) {
            this.towns_buildings[town_id] = town_buildings;
            this.storage.save('buildings', this.towns_buildings);
        }
    };
    isActive = town_id => {
        let town = uw.ITowns.towns[town_id];
        return !this.towns_buildings?.[town.id];
    };
    updateTitle = () => {
        let town = uw.ITowns.getCurrentTown();
        if (town.id.toString() in this.towns_buildings) {
            uw.$('[id="auto_build_title"]').css('filter', 'brightness(100%) saturate(186%) hue-rotate(241deg)');
        } else {
            uw.$('[id="auto_build_title"]').css('filter', '');
        }
    };
    /* Call to toggle on and off (trigger the current town) */
    toggle = () => {
        let town = uw.ITowns.getCurrentTown();
        if (!(town.id.toString() in this.towns_buildings)) {
            this.console.log(this.t('ab_on_log', { town: town.name }));
            this.towns_buildings[town.id] = {};
            let buildins = ['main', 'storage', 'farm', 'academy', 'temple', 'barracks', 'docks', 'market', 'hide', 'lumber', 'stoner', 'ironer', 'wall'];
            buildins.forEach(e => {
                let lvl = parseInt(uw.$(`#build_lvl_${e}`).text());
                this.towns_buildings[town.id][e] = lvl;
            });
            this.storage.save('buildings', this.towns_buildings);
        } else {
            delete this.towns_buildings[town.id];
            this.storage.save('buildings', this.towns_buildings);
            this.console.log(this.t('ab_off_log', { town: town.name }));
        }
        this.updateTitle();
    };
    /* Main loop for building — cidades em paralelo */
    main = async () => {
        if (window.__multbot_captcha_active) return;
        await Promise.allSettled(
            Object.keys(this.towns_buildings).map(async (town_id, i) => {
                await this.sleep(i * 300); // delay escalonado
                if (!uw.ITowns.towns[town_id]) {
                    delete this.towns_buildings[town_id];
                    this.storage.save('buildings', this.towns_buildings);
                    return;
                }
                if (this.isFullQueue(town_id)) return;
                if (this.isDone(town_id)) {
                    delete this.towns_buildings[town_id];
                    this.storage.save('buildings', this.towns_buildings);
                    this.updateTitle();
                    const town = uw.ITowns.getTown(town_id);
                    this.console.log(this.t('ab_done_log', { town: town.name }));
                    return;
                }
                await this.getNextBuild(town_id);
            })
        );
    };
    /* Make post request to the server to buildup the building.
       Registra a tentativa (cidade + predio) em _lastBuildAttempt
       ANTES de disparar a requisicao, para o interceptor de mensagens
       nativas de erro (_hookNativeErrorMessages) saber dar contexto
       caso o jogo mostre um banner de "requisitos nao preenchidos". */
    postBuild = async (type, town_id) => {
        const town = uw.ITowns.getTown(town_id);
        let { wood, stone, iron } = town.resources();
        let buildData = uw.MM.getModels().BuildingBuildData?.[town_id]?.attributes?.building_data?.[type];
        if (!buildData) return;
        let { resources_for, population_for } = buildData;
        if (town.getAvailablePopulation() < population_for) return;
        const m = 20;
        if (wood < resources_for.wood + m || stone < resources_for.stone + m || iron < resources_for.iron + m) return;
        this._lastBuildAttempt = { townName: town.getName(), townId: town_id, building: type, at: Date.now() };
        let data = {
            model_url: 'BuildingOrder',
            action_name: 'buildUp',
            arguments: { building_id: type },
            town_id: town_id,
        };
        uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data, false,
            res => {
                if (res && !res.error) {
                    this.console.log('[AutoBuild] ' + this.t('ab_build_up_log', { town: town.getName(), building: this.getGameName('building', type) }));
                } else {
                    this.console.log('[AutoBuild] ' + this.t('ab_build_up_error_log', { town: town.getName(), building: this.getGameName('building', type), error: res?.error ?? JSON.stringify(res) }));
                }
            }
        );
        await this.sleep(1234);
        return true;
    };
    /* Make post request to tear building down */
    postTearDown = async (type, town_id, town) => {
        let data = {
            model_url: 'BuildingOrder',
            action_name: 'tearDown',
            arguments: { building_id: type },
            town_id: town_id,
        };
        uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data);
        this.console.log(this.t('ab_build_down_log', { town: town.getName(), building: this.getGameName('building', type) }));
        await this.sleep(1234);
    };
    /* return true if the quee is full */
    isFullQueue = town_id => {
        const town = uw.ITowns.getTown(town_id);
        if (uw.GameDataPremium.isAdvisorActivated('curator') && town.buildingOrders().length >= 7) {
            return true;
        }
        if (!uw.GameDataPremium.isAdvisorActivated('curator') && town.buildingOrders().length >= 2) {
            return true;
        }
        return false;
    };
    /* return true if building match polis */
    isDone = town_id => {
        const town = uw.ITowns.getTown(town_id);
        let buildings = town.getBuildings().attributes;
        for (let build of Object.keys(this.towns_buildings[town_id])) {
            if (this.towns_buildings[town_id][build] != buildings[build]) {
                return false;
            }
        }
        return true;
    };
    /* Tenta construir tudo que for possível — sem ordem de prioridade.
       Predios em cooldown (ver _isBuildBlocked) sao pulados, entao um
       erro de requisitos numa unica construcao nao trava as outras. */
    getNextBuild = async town_id => {
        const town    = uw.ITowns.towns[town_id];
        const target  = this.towns_buildings[town_id];
        const current = { ...town.getBuildings().attributes };
        // Conta ordens já na fila
        for (const order of town.buildingOrders().models) {
            if (order.attributes.tear_down) current[order.attributes.building_type] -= 1;
            else                            current[order.attributes.building_type] += 1;
        }
        // Tenta cada edifício que ainda precisa de trabalho
        for (const build of Object.keys(target)) {
            if (this.isFullQueue(town_id)) break;
            if (target[build] > current[build]) {
                if (this._isBuildBlocked(town_id, build)) continue;
                const built = await this.postBuild(build, town_id);
                if (built) current[build] += 1;
            } else if (target[build] < current[build]) {
                await this.postTearDown(build, town_id, town);
                current[build] -= 1;
            }
        }
    };
};
