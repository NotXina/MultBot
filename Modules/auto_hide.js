var AutoHide = class extends MultUtil {
    constructor(c, s) {
        super(c, s);

        this.activePolis = this.storage.load('autohide_active', 0);

        this.createGuardedInterval(this.main, 5000);

        const addButton = () => {
            let box = uw.$('.order_count');
            if (box.length) {
                let butt = uw.$('<div/>', {
                    class: 'button_new',
                    id: 'autoCaveButton',
                    style: 'float: right; margin: 0px; left: 169px; position: absolute; top: 56px; width: 66px',
                    html: '<div onclick="window.multBot.autoHide.toggle()"><div class="left"></div><div class="right"></div><div class="caption js-caption"> ' + this.t('ah_auto_label') + ' <div class="effect js-effect"></div></div><div>'
                });
                box.prepend(butt);
                this.updateSettings(uw.ITowns.getCurrentTown().id);
            } else {
                setTimeout(addButton, 100);
            }
        };

        uw.$.Observer(uw.GameEvents.window.open).subscribe('autoHide_windowOpen', (e, i) => {
            if (!i.attributes) return;
            if (i.attributes.window_type !== 'hide') return;
            setTimeout(addButton, 100);
        })

        uw.$.Observer(uw.GameEvents.town.town_switch).subscribe('autoHide_townSwitch', () => {
            this.updateSettings(uw.ITowns.getCurrentTown().id);
            let cave = document.getElementsByClassName(
                'js-window-main-container classic_window hide',
            )[0];
            if (!cave) return;
            setTimeout(addButton, 1);
        });
    }

    settings = () => {
        requestAnimationFrame(() => {
            this.updateSettings(uw.ITowns.getCurrentTown().id);
        })

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
            <div id="auto_cave_title" style="cursor: pointer; filter: ${this.autogratis ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : ''
            }" class="game_header bold" onclick="window.multBot.autoHide.toggle()"> ${this.t('ah_title')} <span class="command_count"></span>
                <div style="position: absolute; right: 10px; top: 4px; font-size: 10px;"> ${this.t('click_to_toggle')} </div>
            </div>
            <div style="padding: 5px; font-weight: 600">
                ${this.t('ah_desc')}
            </div>    
        </div>
        `;
    };

    toggle = (town_id) => {
        let town = town_id ? uw.ITowns.towns[town_id] : uw.ITowns.getCurrentTown();
        let hide = town.buildings().attributes.hide
        if (this.activePolis == town.id) {
            this.activePolis = 0
        } else {
            if (hide == 10) this.activePolis = town.id;
            else uw.HumanMessage.error(this.t('ah_error_hide_level'));
        }
        this.storage.save("autohide_active", this.activePolis)
        this.updateSettings(town.id)
    }

    updateSettings = (town_id) => {
        if (town_id == this.activePolis) {
            uw.$('#auto_cave_title').css({
                'filter': 'brightness(100%) saturate(186%) hue-rotate(241deg)'
            });
            uw.$('#autoCaveButton').css({
                'filter': ' brightness(100%) sepia(100%) hue-rotate(90deg) saturate(1500%) contrast(0.8)'
            });
        } else {
            uw.$('#auto_cave_title, #autoCaveButton').css({
                'filter': ''
            });
        }
    }

    main = async () => {
        if (this.activePolis == 0) return;
        const town = uw.ITowns.towns[this.activePolis];
        const { iron } = town.resources()
        if (iron > 15000) {
            await this.storeIron(this.activePolis, iron)
        }
    }

    storeIron = async (town_id, count) => {
        try {
            await this.ajaxPostWithTimeout('frontend_bridge', 'execute', {
                "model_url": "BuildingHide",
                "action_name": "storeIron",
                "arguments": {
                    "iron_to_store": count
                },
                "town_id": town_id,
            });
        } catch (e) {
            this.console.log('[AutoHide] ' + this.t('ah_store_error', { msg: e.message }));
        }
    }

};
