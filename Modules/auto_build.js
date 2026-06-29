class AutoBuild extends ModernUtil {
    constructor(c, s) {
        super(c, s);

        /* Load settings, the polis in the settings are the active */
        this.towns_buildings = this.storage.load('buildings', {});

        /* Check if shift is pressed */
        this.shiftHeld = false;

        /* Active always, check if the towns are in the active list */
        this.interval = setInterval(this.main.bind(this), 5000);

        /* Add listener that change the Senate look */
        try {
            uw.$.Observer(uw.GameEvents.window.open).subscribe("modernSenate", this.updateSenate);
        } catch(e) {
            this.console.log('[AutoBuild] Observer error: ' + e.message);
        }

        this.simulateCaptcha = false;
        this.captchaActive = false;

        /* Check for captcha conditions every 300ms */
        this.checkCaptchaInterval = setInterval(() => {
            if (this.simulateCaptcha || uw.$('.botcheck').length || uw.$('#recaptcha_window').length) {
                if (!this.captchaActive) {
                    this.console.log('Captcha active, autobuild stopped working');
                    clearInterval(this.interval);
                    this.captchaActive = true;
                }
            } else {
                if (this.captchaActive) {
                    this.console.log('Captcha resolved, autobuild resumed');
                    this.startInterval(); // Restart autobuild
                    this.captchaActive = false;
                }
            }
        }, 300);
    }

    startInterval() {
        this.interval = setInterval(this.main.bind(this), 5000);
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
            <div id="auto_build_title" style="cursor: pointer; filter: ${this.interval ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : ''}" class="game_header bold" onclick="window.modernBot.autoBuild.toggle()"> Auto Build <span class="command_count"></span>
                <div style="position: absolute; right: 10px; top: 4px; font-size: 10px;"> (click to toggle) </div>
            </div>
            <div id="buildings_lvl_buttons"></div>    
        </div> `;
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
                <div class="auto_build_box" onclick="window.modernBot.autoBuild.editBuildingLevel(${town_id}, '${building}', 0)" style="cursor: pointer">
                <div class="item_icon auto_build_building" style="background-position: -${bg[0]}px -${bg[1]}px;">
                    <div class="auto_build_up_arrow" onclick="event.stopPropagation(); window.modernBot.autoBuild.editBuildingLevel(${town_id}, '${building}', 1)" ></div>
                    <div class="auto_build_down_arrow" onclick="event.stopPropagation(); window.modernBot.autoBuild.editBuildingLevel(${town_id}, '${building}', -1)"></div>
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
            this.console.log(`${town.name}: Auto Build On`);
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
            this.console.log(`${town.name}: Auto Build Off`);
        }

        this.updateTitle();
    };

    /* Main loop for building — cidades em paralelo */
    main = async () => {
        await Promise.allSettled(
            Object.keys(this.towns_buildings).map(async (town_id, i) => {
                await this.sleep(i * 300); // delay escalonado

                if (!uw.ITowns.towns[town_id]) {
                    delete this.towns_buildings[town_id];
                    this.storage.save('buildings', this.towns_buildings);
                    return; // continue → return dentro de async map
                }

                if (this.isFullQueue(town_id)) return;

                if (this.isDone(town_id)) {
                    delete this.towns_buildings[town_id];
                    this.storage.save('buildings', this.towns_buildings);
                    this.updateTitle();
                    const town = uw.ITowns.getTown(town_id);
                    this.console.log(`${town.name}: Auto Build Done`);
                    return;
                }

                await this.getNextBuild(town_id);
            })
        );
    };

    /* Make post request to the server to buildup the building */
    postBuild = async (type, town_id) => {
        const town = uw.ITowns.getTown(town_id);
        let { wood, stone, iron } = town.resources();
        let buildData = uw.MM.getModels().BuildingBuildData?.[town_id]?.attributes?.building_data?.[type];
        if (!buildData) return;
        let { resources_for, population_for } = buildData;

        if (town.getAvailablePopulation() < population_for) return;
        const m = 20;
        if (wood < resources_for.wood + m || stone < resources_for.stone + m || iron < resources_for.iron + m) return;
        let data = {
            model_url: 'BuildingOrder',
            action_name: 'buildUp',
            arguments: { building_id: type },
            town_id: town_id,
        };
        uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data, false,
            res => {
                if (res && !res.error) {
                    this.console.log(`[AutoBuild] ${town.getName()}: Build Up ${type}`);
                } else {
                    this.console.log(`[AutoBuild] ✗ ${town.getName()}: ${type} — ${res?.error ?? JSON.stringify(res)}`);
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
        this.console.log(`${town.getName()}: Build Down ${type}`);
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

    /* Tenta construir tudo que for possível — sem ordem de prioridade */
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
                const built = await this.postBuild(build, town_id);
                if (built) current[build] += 1;
            } else if (target[build] < current[build]) {
                await this.postTearDown(build, town_id, town);
                current[build] -= 1;
            }
        }
    };
}
