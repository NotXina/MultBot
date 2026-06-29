class ModernBot {
    constructor() {
        this.console = new BotConsole();
        this.storage = new ModernStorage();

        this.$ui = uw.$("#ui_box");
        // Create the quick menu and the divider element
        this.$menu = this.createModernMenu();
        const $divider = uw.$('<div class="divider"></div>');

        // Cada módulo é iniciado de forma independente — erro em um não derruba os outros
        const _load = (name, fn) => {
            try { return fn(); }
            catch(e) { console.error(`[MultBot] Erro ao iniciar ${name}:`, e); return null; }
        };

        this.autoFarm = _load('AutoFarm', () => {
            const m = new AutoFarm(this.console, this.storage);
            this.$menu.append(m.$activity);
            this.$ui.append(m.$popup);
            return m;
        });
        this.autoGratis        = _load('AutoGratis',        () => new AutoGratis(this.console, this.storage));
        this.autoRuralLevel    = _load('AutoRuralLevel',    () => new AutoRuralLevel(this.console, this.storage));
        this.autoBuild         = _load('AutoBuild',         () => new AutoBuild(this.console, this.storage));
        this.autoRuralTrade    = _load('AutoRuralTrade',    () => new AutoRuralTrade(this.console, this.storage));
        this.autoBootcamp      = _load('AutoBootcamp',      () => new AutoBootcamp(this.console, this.storage));
        this.autoParty         = _load('AutoParty',         () => new AutoParty(this.console, this.storage));
        this.autoTrain         = _load('AutoTrain',         () => new AutoTrain(this.console, this.storage));
        this.autoHide          = _load('AutoHide',          () => new AutoHide(this.console, this.storage));
        this.antiRage          = _load('AntiRage',          () => new AntiRage(this.console, this.storage));
        this.autoTrade         = _load('AutoTrade',         () => new AutoTrade(this.console, this.storage));
        this.colonizeShipSender = _load('ColonizeShipSender', () => new ColonizeShipSender(this.console, this.storage));
        this.multTools         = _load('MultTools',         () => new MultTools(this.console, this.storage));
        this.autoMilitia       = _load('AutoMilitia',       () => new AutoMilitia(this.console, this.storage));
        this.autoSendResources = _load('AutoSendResources', () => new AutoSendResources(this.console, this.storage));
        this.statusPanel       = _load('StatusPanel',       () => new StatusPanel(this.console, this.storage));

        this.settingsFactory = new createGrepoWindow({
            id: 'MODERN_BOT',
            title: 'ModernBot',
            size: [845, 380],
            tabs: [
                {
                    title: 'Status',
                    id: 'status',
                    render: this.settingsStatus,
                },
                {
                    title: 'Farm',
                    id: 'farm',
                    render: this.settingsFarm,
                },
                {
                    title: 'Build',
                    id: 'build',
                    render: this.settingsBuild,
                },
                {
                    title: 'Train',
                    id: 'train',
                    render: this.settingsTrain,
                } /*
				{
					title: 'Trade',
					id: 'trade',
					render: this.settingsTrade,
				},*/,
                {
                    title: 'Mix',
                    id: 'mix',
                    render: this.settingsMix,
                },
                {
                    title: 'Mult',
                    id: 'mult',
                    render: this.settingsMult,
                },
                {
                    title: 'Ships',
                    id: 'ships',
                    render: this.settingsShips,
                },
                {
                    title: 'Console',
                    id: 'console',
                    render: this.console.renderSettings,
                },
            ],
            start_tab: 0,
        });

        this.setup();
    }

    settingsStatus = () => {
        return this.statusPanel?.settings() ?? '';
    };

    settingsFarm = () => {
        let html = '';
        html += this.autoRuralLevel?.settings()    ?? '';
        html += this.autoRuralTrade?.settings()    ?? '';
        html += this.autoSendResources?.settings() ?? '';
        return html;
    };

    settingsBuild = () => {
        let html = '';
        html += this.autoGratis?.settings() ?? '';
        html += this.autoBuild?.settings()  ?? '';
        return html;
    };

    settingsMix = () => {
        let html = '';
        html += this.autoBootcamp?.settings() ?? '';
        html += this.autoParty?.settings()    ?? '';
        html += this.autoHide?.settings()     ?? '';
        html += this.autoMilitia?.settings()  ?? '';
        return html;
    };

    settingsTrain = () => {
        return this.autoTrain?.settings() ?? '<div style="padding:10px;color:red;">[AutoTrain] Falha ao iniciar — veja o console do navegador.</div>';
    };

    settingsMult = () => {
        return this.multTools?.settings() ?? '';
    };

    settingsShips = () => {
        return this.colonizeShipSender?.settings() ?? '';
    };

    settingsTrade = () => {
        let html = ``;
        html += this.autoTrade.settings();
        return html;
    };

    setup = () => {
        /* Activate */
        this.settingsFactory.activate();
        uw.$('.gods_area_buttons').append("<div class='circle_button modern_bot_settings' onclick='window.modernBot.settingsFactory.openWindow()'><div style='width: 27px; height: 27px; background: url(https://raw.githubusercontent.com/Sau1707/ModernBot/main/img/gear.png) no-repeat 6px 5px' class='icon js-caption'></div></div>");

        /* Add event to polis list menu */
        const editController = () => {
            const townController = uw.layout_main_controller.sub_controllers.find(controller => controller.name === 'town_name_area');
            if (!townController) {
                setTimeout(editController, 2500);
                return;
            }

            const oldRender = townController.controller.town_groups_list_view.render;
            townController.controller.town_groups_list_view.render = function () {
                oldRender.call(this);
                const both = `<div style='position: absolute; background-image: url(https://raw.githubusercontent.com/Sau1707/ModernBot/main/img/hammer_wrench.png); background-size: 19px 19px; margin: 1px; background-repeat: no-repeat; position: absolute; height: 20px; width: 25px; right: 18px;'></div>`;
                const build = `<div style='background-image: url(https://raw.githubusercontent.com/Sau1707/ModernBot/main/img/hammer_only.png); background-size: 19px 19px; margin: 1px; background-repeat: no-repeat; position: absolute; height: 20px; width: 25px; right: 18px;'></div>`;
                const troop = `<div style='background-image: url(https://raw.githubusercontent.com/Sau1707/ModernBot/main/img/wrench.png); background-size: 19px 19px; margin: 1px; background-repeat: no-repeat; position: absolute; height: 20px; width: 25px; right: 18px;'></div>`;
                const townIds = Object.keys(uw.modernBot.autoBuild?.towns_buildings ?? {});
                const troopsIds = (uw.modernBot.autoTrain?.getActiveList() ?? []).map(entry => entry.toString());
                uw.$('.town_group_town').each(function () {
                    const townId = parseInt(uw.$(this).attr('data-townid'));
                    const is_build = townIds.includes(townId.toString());
                    const id_troop = troopsIds.includes(townId.toString());
                    if (!id_troop && !is_build) return;
                    if (id_troop && !is_build) uw.$(this).prepend(troop);
                    else if (is_build && !id_troop) uw.$(this).prepend(build);
                    else uw.$(this).prepend(both);
                });
            };
        };

        setTimeout(editController, 2500);

        // Move o botão do ModernBot para posição customizada
        const moveBtn = () => {
            const btn = document.querySelector('.modern_bot_settings');
            if (btn) {
                btn.style.setProperty('top', '95px', 'important');
                btn.style.setProperty('right', '113px', 'important');
            }
        };
        const btnObserver = new MutationObserver(moveBtn);
        btnObserver.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => btnObserver.disconnect(), 15000);
    };

    /* New quick menu */
    // Create the html of an activity in the new quick menu
    createModernMenu = () => {
        const $menu = uw.$('<div id="modern_menu" class="toolbar_activities"></div>');
        $menu.css({
            'position': 'absolute',
            'top': '3px',
            'left': '400px',
            'z-index': '1000',
        });

        // Add left, middle, right
        const $left = uw.$('<div class="left"></div>');
        const $middle = uw.$('<div class="middle"></div>');
        const $right = uw.$('<div class="right"></div>');

        $menu.append($left, $middle, $right);
        uw.$("#ui_box").prepend($menu);

        return $middle
    }

}


// Load the bot when the loader is ready (guard against double injection)
if (!window.__multbot_loaded__) {
    window.__multbot_loaded__ = true;
    var _multbot_loader = setInterval(() => {
        if (uw.$("#loader").length > 0) return;
        uw.modernBot = new ModernBot();
        clearInterval(_multbot_loader);
    }, 100);
}
