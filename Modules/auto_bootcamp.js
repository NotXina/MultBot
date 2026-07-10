var AutoBootcamp = class extends MultUtil {
    constructor(console, storage) {
        super(console, storage);

        // Create the buttons for the settings
        this.$title = this.createTitle('auto_autobootcamp', this.t('abc_title'), this.toggle, this.t('click_to_toggle'));
        this.$button_only_off = this.createButton('autobootcamp_off', this.t('abc_only_off'), this.triggerUseDef);
        this.$button_off_def = this.createButton('autobootcamp_def', this.t('abc_off_def'), this.triggerUseDef);
        this.$settings = this.createSettingsHtml();

        // Save the state of the auto bootcamp
        if (this.storage.load('ab_active', false)) this.toggle();
        if (this.storage.load('bootcamp_use_def', false)) this.triggerUseDef();

        // Attach the observer to the window open event
        uw.$.Observer(uw.GameEvents.window.open).subscribe("multAttackSpot", this.updateWindow);
    }

    updateWindow = (event, handler) => {
        if (!handler.attributes || handler.attributes.window_type !== 'attack_spot') return

        const cid = handler.cid;
        const $window = uw.$(`#window_${cid}`);

        // Add height to the window
        $window.css('height', '660px');

        // Wait for the content to be loaded
        const interval = setInterval(() => {
            const $content = $window.find('.window_content');
            if ($content.length === 0) return;
            clearInterval(interval);
            $content.append(this.$settings);
        }, 100);
    }

    // Add the settings to the window, keep this for backwards compatibility
    settings = () => {
        return ""
    }

    createSettingsHtml = () => {
        // Create the settings box
        const $div = uw.$('<div>')
        $div.css({
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '10px',
        });

        // Add the buttons to the settings box
        $div.append(this.$button_only_off);
        $div.append(this.$button_off_def);

        // Create the box
        const $box = uw.$('<div>')
        $box.addClass('game_border')
        $box.css({
            margin: '20px',
        });
        $box.append(this.$title)
        $box.append($div);

        return $box;
    };

    /* Update the settings title and buttons */
    updateSettings = () => {
        if (this.use_def) {
            this.$button_only_off.addClass('disabled');
            this.$button_off_def.removeClass('disabled');
        } else {
            this.$button_off_def.addClass('disabled');
            this.$button_only_off.removeClass('disabled');
        }

        if (this.enable_auto_bootcamp) this.$title.addClass('enabled');
        else this.$title.removeClass('enabled');
    }

    // Toggle the use of def units
    triggerUseDef = () => {
        this.use_def = !this.use_def;
        this.storage.save('bootcamp_use_def', this.use_def);
        this.updateSettings();
    };

    toggle = () => {
        if (!this.enable_auto_bootcamp) {
            this.enable_auto_bootcamp = this.createGuardedInterval(this.main, 4000);
        } else {
            clearInterval(this.enable_auto_bootcamp);
            this.enable_auto_bootcamp = null;
        }
        this.storage.save('ab_active', !!this.enable_auto_bootcamp);
        this.updateSettings();
    };

    attackBootcamp = async () => {
        let cooldown = uw.MM.getModelByNameAndPlayerId('PlayerAttackSpot').getCooldownDuration();
        if (cooldown > 0) return false;

        let { MovementsUnits } = uw.MM.getModels();

        // Check if there is already an active attack
        if (MovementsUnits != null) {
            if (Object.keys(MovementsUnits).length > 0) {
                var attack_list = Object.keys(MovementsUnits);
                for (var i = 0; i < Object.keys(MovementsUnits).length; i++) {
                    if (MovementsUnits[attack_list[i]].attributes.destination_is_attack_spot) return false;
                    if (MovementsUnits[attack_list[i]].attributes.origin_is_attack_spot) return false;
                }
            }
        }

        // Get the units
        var units = { ...uw.ITowns.towns[uw.Game.townId].units() };
        delete units.militia;

        // Remove naval units
        for (let unit in units) {
            if (uw.GameData.units[unit].is_naval) delete units[unit];
        }

        // Remove def units if the setting is off
        if (!this.use_def) {
            delete units.sword;
            delete units.archer;
        }

        // If there are not enough units, return
        // TODO: here check if the units are enough to attack
        if (Object.keys(units).length === 0) return false;

        // Send the attack
        await this.postAttackBootcamp(units);

        return true;
    };

    rewardBootcamp = async () => {
        let model = uw.MM.getModelByNameAndPlayerId('PlayerAttackSpot');

        // Stop if level is not found
        if (typeof model.getLevel() == 'undefined') {
            this.toggle();
            return true;
        }

        // Check if there is a reward
        let hasReward = model.hasReward();
        if (!hasReward) return false;

        // Check if the reward is instant
        let reward = model.getReward();
        if (reward.power_id.includes('instant') && !reward.power_id.includes('favor')) {
            await this.useBootcampReward();
            return true;
        }

        // Check if the reward is stashable
        if (reward.stashable) await this.stashBootcampReward();
        else await this.useBootcampReward();

        return true;
    };

    /* Main function, call in loop */
    main = async () => {
        if (await this.rewardBootcamp()) return;
        if (await this.attackBootcamp()) return;
    };

    /* Send post request to attack with the given units */
    postAttackBootcamp = async units => {
        try {
            await this.ajaxPostWithTimeout('frontend_bridge', 'execute', {
                model_url: `PlayerAttackSpot/${uw.Game.player_id}`,
                action_name: 'attack',
                arguments: units,
            });
        } catch (e) {
            this.console.log('[AutoBootcamp] ' + this.t('abc_attack_error', { msg: e.message }));
        }
    };

    /* Send requesto to the server to use the reward */
    useBootcampReward = async () => {
        try {
            await this.ajaxPostWithTimeout('frontend_bridge', 'execute', {
                model_url: `PlayerAttackSpot/${uw.Game.player_id}`,
                action_name: 'useReward',
                arguments: {},
            });
        } catch (e) {
            this.console.log('[AutoBootcamp] ' + this.t('abc_use_reward_error', { msg: e.message }));
        }
    };

    /* Send request to the server to stash the reward. Se falhar,
       tenta usar a recompensa direto (mesmo fallback que existia
       antes via callback de erro do ajaxPost legado). */
    stashBootcampReward = async () => {
        try {
            await this.ajaxPostWithTimeout('frontend_bridge', 'execute', {
                model_url: `PlayerAttackSpot/${uw.Game.player_id}`,
                action_name: 'stashReward',
                arguments: {},
            });
        } catch (e) {
            this.console.log('[AutoBootcamp] ' + this.t('abc_stash_error', { msg: e.message }));
            await this.useBootcampReward();
        }
    };
};
