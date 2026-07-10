var MultBot = class {
    constructor() {
        this.console = new BotConsole();
        this.storage = new MultStorage();

        this.$ui = uw.$("#ui_box");
        this.$menu = this.createMultMenu();
        const $divider = uw.$('<div class="divider"></div>');

        this.autoFarm = this._safeInit('AutoFarm', () => new AutoFarm(this.console, this.storage));
        if (this.autoFarm) {
            this.$menu.append(this.autoFarm.$activity);
            this.$ui.append(this.autoFarm.$popup);
        }

        this.autoGratis         = this._safeInit('AutoGratis', () => new AutoGratis(this.console, this.storage));
        this.autoRuralLevel     = this._safeInit('AutoRuralLevel', () => new AutoRuralLevel(this.console, this.storage));
        this.autoBuild          = this._safeInit('AutoBuild', () => new AutoBuild(this.console, this.storage));
        this.autoRuralTrade     = this._safeInit('AutoRuralTrade', () => new AutoRuralTrade(this.console, this.storage));
        this.autoBootcamp       = this._safeInit('AutoBootcamp', () => new AutoBootcamp(this.console, this.storage));
        this.autoParty          = this._safeInit('AutoParty', () => new AutoParty(this.console, this.storage));
        this.autoTrain          = this._safeInit('AutoTrain', () => new AutoTrain(this.console, this.storage));
        this.autoHide           = this._safeInit('AutoHide', () => new AutoHide(this.console, this.storage));
        this.antiRage           = this._safeInit('AntiRage', () => new AntiRage(this.console, this.storage));
        this.autoTrade          = this._safeInit('AutoTrade', () => new AutoTrade(this.console, this.storage));
        this.colonizeShipSender = this._safeInit('ColonizeShipSender', () => new ColonizeShipSender(this.console, this.storage));
        this.multTools          = this._safeInit('MultTools', () => new MultTools(this.console, this.storage));
        this.autoQuest          = this._safeInit('AutoQuest', () => new AutoQuest(this.console, this.storage));
        this.autoMilitia        = this._safeInit('AutoMilitia', () => new AutoMilitia(this.console, this.storage));
        this.autoDodge          = this._safeInit('AutoDodge', () => new AutoDodge(this.console, this.storage));
        this.autoAttack         = this._safeInit('AutoAttack', () => new AutoAttack(this.console, this.storage));
        this.autoAresSacrifice  = this._safeInit('AutoAresSacrifice', () => new AutoAresSacrifice(this.console, this.storage));
        this.autoResearch       = this._safeInit('AutoResearch', () => new AutoResearch(this.console, this.storage));
        this.autoSendResources  = this._safeInit('AutoSendResources', () => new AutoSendResources(this.console, this.storage));
        this.statusPanel        = this._safeInit('StatusPanel', () => new StatusPanel(this.console, this.storage));

        this.settingsFactory = this._safeInit('SettingsWindow', () => new createGrepoWindow({
            id: 'MULT_BOT',
            title: 'MultBot',
            size: [845, 560],
            tabs: [
                {
                    title: multT('tab_status'),
                    id: 'status',
                    render: this.settingsStatus,
                },
                {
                    title: multT('tab_farm'),
                    id: 'farm',
                    render: this.settingsFarm,
                },
                {
                    title: multT('tab_build'),
                    id: 'build',
                    render: this.settingsBuild,
                },
                {
                    title: multT('tab_train'),
                    id: 'train',
                    render: this.settingsTrain,
                },
                {
                    title: multT('tab_mix'),
                    id: 'mix',
                    render: this.settingsMix,
                },
                {
                    title: multT('tab_attack'),
                    id: 'attack',
                    render: this.settingsAttack,
                },
                {
                    title: multT('tab_mult'),
                    id: 'mult',
                    render: this.settingsMult,
                },
                {
                    title: multT('tab_console'),
                    id: 'console',
                    render: this.console.renderSettings,
                },
            ],
            start_tab: 0,
        }));

        this.setup();
    }

    /* Instantiates a module isolated from failure: if a module's
       constructor throws an exception, the error goes to the console
       (game console + BotConsole) and the following modules keep
       getting instantiated normally. Without this, one broken module
       would kill the initialization of ALL modules declared after it
       in the constructor. */
    _safeInit = (name, factory) => {
        try {
            return factory();
        } catch (e) {
            const msg = `[MultBot] ✗ Failed to initialize module "${name}": ${e?.message ?? e}`;
            console.error(msg, e);
            try {
                if (this.console && typeof this.console.log === 'function') this.console.log(msg);
            } catch (_) {}
            return null;
        }
    };

    settingsStatus = () => {
        return this.statusPanel ? this.statusPanel.settings() : this._missingModuleHtml('Status');
    };

    settingsFarm = () => {
        let html = '';
        html += this.autoRuralLevel ? this.autoRuralLevel.settings() : this._missingModuleHtml('Auto Rural Level');
        html += this.autoRuralTrade ? this.autoRuralTrade.settings() : this._missingModuleHtml('Auto Rural Trade');
        html += this.autoSendResources ? this.autoSendResources.settings() : this._missingModuleHtml('Auto Send Resources');
        return html;
    };

    settingsBuild = () => {
        let html = '';
        html += this.autoGratis ? this.autoGratis.settings() : this._missingModuleHtml('Auto Gratis');
        html += this.autoBuild ? this.autoBuild.settings() : this._missingModuleHtml('Auto Build');
        return html;
    };

    settingsMix = () => {
        let html = '';
        html += this.autoBootcamp ? this.autoBootcamp.settings() : this._missingModuleHtml('Auto Bootcamp');
        html += this.autoParty ? this.autoParty.settings() : this._missingModuleHtml('Auto Party');
        html += this.autoHide ? this.autoHide.settings() : this._missingModuleHtml('Auto Hide');
        html += this.autoMilitia ? this.autoMilitia.settings() : this._missingModuleHtml('Auto Militia');
        html += this.autoDodge ? this.autoDodge.settings() : this._missingModuleHtml('Auto Dodge');
        html += this.autoQuest ? this.autoQuest.settings() : this._missingModuleHtml('Auto Quest');
        return html;
    };

    settingsAttack = () => {
        let html = '';
        html += this.autoAttack ? this.autoAttack.settings() : this._missingModuleHtml('Auto Attack');
        return html;
    };

    settingsTrain = () => {
        let html = '';
        html += this.autoTrain ? this.autoTrain.settings() : this._missingModuleHtml('Auto Train');
        return html;
    };

    /* Colonize Ships now renders here, inside the Mult tab,
       alongside the presets, Auto Research and Auto Sacrifice.
       The separate Ships tab was removed - it was the one that
       was broken because of this._getTownName. */
    settingsMult = () => {
        let html = '';
        html += this.multTools ? this.multTools.settings() : this._missingModuleHtml('Mult Tools');
        html += this.colonizeShipSender ? this.colonizeShipSender.settings() : this._missingModuleHtml('Colonize Ship Sender');
        html += this.autoResearch ? this.autoResearch.settings() : this._missingModuleHtml('Auto Research');
        html += this.autoAresSacrifice ? this.autoAresSacrifice.settings() : this._missingModuleHtml('Auto Ares Sacrifice');
        return html;
    };

    settingsTrade = () => {
        let html = ``;
        html += this.autoTrade ? this.autoTrade.settings() : this._missingModuleHtml('Auto Trade');
        return html;
    };

    /* Simple HTML shown in place of a module that failed to
       initialize, to make it clear in the UI (instead of throwing
       an exception when rendering the tab). */
    _missingModuleHtml = (name) => {
        return `<div class="game_border" style="margin-bottom:20px;">
            <div style="padding:8px;font-size:11px;color:#f87171;">
                ⚠ ${multT('module_failed', { name })}
            </div>
        </div>`;
    };

    setup = () => {
        if (this.settingsFactory) this.settingsFactory.activate();

        uw.$('.gods_area_buttons').append(`
            <div class='circle_button mult_bot_settings' onclick='window.multBot.settingsFactory.openWindow()'>
                <div style='width: 27px; height: 27px; display:flex; align-items:center; justify-content:center;' class='icon js-caption' title='MultBot'>
                    <img src="https://github.com/NotXina.png?size=64" width="23" height="23"
                         style="display:block; box-sizing:border-box; border-radius:50%; object-fit:cover; object-position:center; border:1px solid rgba(0,0,0,0.4); box-shadow:0 0 2px rgba(0,0,0,0.6);"
                         onerror="this.outerHTML='⚙️'" />
                </div>
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
                const both = `<div style='position: absolute; display:flex; align-items:center; justify-content:center; font-size:13px; margin: 1px; position: absolute; height: 20px; width: 25px; right: 18px;' title='${multT('tooltip_build_and_train')}'>🔨🔧</div>`;
                const build = `<div style='display:flex; align-items:center; justify-content:center; font-size:14px; margin: 1px; position: absolute; height: 20px; width: 25px; right: 18px;' title='${multT('tooltip_build')}'>🔨</div>`;
                const troop = `<div style='display:flex; align-items:center; justify-content:center; font-size:14px; margin: 1px; position: absolute; height: 20px; width: 25px; right: 18px;' title='${multT('tooltip_train')}'>🔧</div>`;
                const townIds = uw.multBot.autoBuild ? Object.keys(uw.multBot.autoBuild.towns_buildings) : [];
                const troopsIds = uw.multBot.autoTrain ? uw.multBot.autoTrain.getActiveList().map(entry => entry.toString()) : [];
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

    createMultMenu = () => {
        const $menu = uw.$('<div id="mult_menu" class="toolbar_activities"></div>');
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

};

if (!window.__multbot_loaded__) {
    window.__multbot_loaded__ = true;
    var _multbot_loader = setInterval(() => {
        if (uw.$("#loader").length > 0) return;
        uw.multBot = new MultBot();
        clearInterval(_multbot_loader);
    }, 100);
}
