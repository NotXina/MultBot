class ModernBot {
    constructor() {
        this.console = new BotConsole();
        this.storage = new ModernStorage();

        this.$ui = uw.$("#ui_box");
        this.$menu = this.createModernMenu();
        const $divider = uw.$('<div class="divider"></div>');

        this.autoFarm = new AutoFarm(this.console, this.storage);
        this.$menu.append(this.autoFarm.$activity)
        this.$ui.append(this.autoFarm.$popup)

        this.autoGratis = new AutoGratis(this.console, this.storage);
        this.autoRuralLevel = new AutoRuralLevel(this.console, this.storage);
        this.autoBuild = new AutoBuild(this.console, this.storage);
        this.autoRuralTrade = new AutoRuralTrade(this.console, this.storage);
        this.autoBootcamp = new AutoBootcamp(this.console, this.storage);
        this.autoParty = new AutoParty(this.console, this.storage);
        this.autoTrain = new AutoTrain(this.console, this.storage);
        this.autoHide = new AutoHide(this.console, this.storage);
        this.antiRage = new AntiRage(this.console, this.storage);
        this.autoTrade = new AutoTrade(this.console, this.storage);
        this.colonizeShipSender = new ColonizeShipSender(this.console, this.storage);
        this.multTools    = new MultTools(this.console, this.storage);
        this.autoMilitia      = new AutoMilitia(this.console, this.storage);
        this.autoDodge        = new AutoDodge(this.console, this.storage);
        this.autoAttack       = new AutoAttack(this.console, this.storage);
        this.autoAresSacrifice = new AutoAresSacrifice(this.console, this.storage);
        this.autoResearch     = new AutoResearch(this.console, this.storage);
        this.autoSendResources = new AutoSendResources(this.console, this.storage);
        this.statusPanel  = new StatusPanel(this.console, this.storage);

        this.settingsFactory = new createGrepoWindow({
            id: 'MODERN_BOT',
            title: 'ModernBot (MultBot)',
            size: [845, 560],
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
                },
                {
                    title: 'Mix',
                    id: 'mix',
                    render: this.settingsMix,
                },
                {
                    title: 'Attack',
                    id: 'attack',
                    render: this.settingsAttack,
                },
                {
                    title: 'Mult',
                    id: 'mult',
                    render: this.settingsMult,
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
        return this.statusPanel.settings();
    };

    settingsFarm = () => {
        let html = '';
        html += this.autoRuralLevel.settings();
        html += this.autoRuralTrade.settings();
        html += this.autoSendResources.settings();
        return html;
    };

    settingsBuild = () => {
        let html = '';
        html += this.autoGratis.settings();
        html += this.autoBuild.settings();
        return html;
    };

    settingsMix = () => {
        let html = '';
        html += this.autoBootcamp.settings();
        html += this.autoParty.settings();
        html += this.autoHide.settings();
        html += this.autoMilitia.settings();
        html += this.autoDodge.settings();
        return html;
    };

    settingsAttack = () => {
        let html = '';
        html += this.autoAttack.settings();
        return html;
    };

    settingsTrain = () => {
        let html = '';
        html += this.autoTrain.settings();
        return html;
    };

    /* Colonize Ships agora renderiza aqui dentro, na aba Mult,
       junto com os presets, Auto Pesquisa e Auto Sacrificio.
       A aba Ships separada foi removida - era ela que estava
       quebrada por causa do this._getTownName. */
    settingsMult = () => {
        let html = '';
        html += this.multTools.settings();
        html += this.colonizeShipSender.settings();
        html += this.autoResearch.settings();
        html += this.autoAresSacrifice.settings();
        return html;
    };

    settingsTrade = () => {
        let html = ``;
        html += this.autoTrade.settings();
        return html;
    };

    setup = () => {
        this.settingsFactory.activate();

        uw.$('.gods_area_buttons').append(`
            <div class='circle_button modern_bot_settings' onclick='window.modernBot.settingsFactory.openWindow()'>
                <div style='width: 27px; height: 27px; background: url(https://raw.githubusercontent.com/Sau1707/ModernBot/main/img/gear.png) no-repeat 6px 5px' class='icon js-caption'></div>
            </div>
        `);

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
                const townIds = Object.keys(uw.modernBot.autoBuild.towns_buildings);
                const troopsIds = uw.modernBot.autoTrain.getActiveList().map(entry => entry.toString());
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
    };

    createModernMenu = () => {
        const $menu = uw.$('<div id="modern_menu" class="toolbar_activities"></div>');
        $menu.css({
            'position': 'absolute',
            'top': '3px',
            'left': '400px',
            'z-index': '1000',
        });

        const $left = uw.$('<div class="left"></div>');
        const $middle = uw.$('<div class="middle"></div>');
        const $right = uw.$('<div class="right"></div>');

        $menu.append($left, $middle, $right);
        uw.$("#ui_box").prepend($menu);

        return $middle
    }

}

if (!window.__multbot_loaded__) {
    window.__multbot_loaded__ = true;
    var _multbot_loader = setInterval(() => {
        if (uw.$("#loader").length > 0) return;
        uw.modernBot = new ModernBot();
        clearInterval(_multbot_loader);
    }, 100);
}
