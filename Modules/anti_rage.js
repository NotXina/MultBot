var AntiRage = class extends MultUtil {
	GOODS_ICONS = {
		athena: 'js-power-icon.animated_power_icon.animated_power_icon_45x45.power_icon45x45.power.strength_of_heroes',
		zeus: 'js-power-icon.animated_power_icon.animated_power_icon_45x45.power_icon45x45.power.fair_wind',
		artemis: 'js-power-icon.animated_power_icon.animated_power_icon_45x45.power_icon45x45.power.effort_of_the_huntress',
	};

	constructor(c, s) {
		super(c, s);

		this.loop_funct = null;
		this.active_god_el = null;

		let commandId;
		const oldCreate = uw.GPWindowMgr.Create;
		uw.GPWindowMgr.Create = function (type, title, params, id) {
			if (type === uw.GPWindowMgr.TYPE_ATK_COMMAND && id) commandId = id;
			return oldCreate.apply(this, arguments);
		};

		/* Attach event to attack opening */
		uw.$.Observer(uw.GameEvents.window.open).subscribe((e, data) => {
			if (data.context != 'atk_command') return;
			//const id = data.wnd.getID();

			let max = 10;
			const addSpell = () => {
				let spellMenu = uw.$('#command_info-god')[0];
				if (!spellMenu) {
					if (max > 0) {
						max -= 1;
						setTimeout(addSpell, 50);
					}
					return;
				}

				// FIX: sem o .off() aqui, cada vez que a janela de ataque
				// reabre o listener antigo continua vivo e se soma ao novo,
				// fazendo o trigger() disparar 2x, 3x, 4x... na mesma sessão.
				uw.$(spellMenu).off('click', this.trigger).on('click', this.trigger);

				this.command_id = commandId;
			};

			setTimeout(addSpell, 50);
		});
	}

	handleGod = good => {
		const godEl = uw.$(`.god_mini.${good}.${good}`).eq(0);
		if (!godEl.length) return;

		const powerClassName = this.GOODS_ICONS[good];

		godEl.css({
			zIndex: 10,
			cursor: 'pointer',
			borderRadius: '100%',
			outline: 'none',
			boxShadow: '0px 0px 10px 5px rgba(255, 215, 0, 0.5)',
		});

		const powerEl = uw.$(`.${powerClassName}`).eq(0);
		if (!powerEl.length) return;

		godEl.click(() => {
			// deactivate the previously active god

			if (this.active_god_el && this.active_god_el.get(0) === godEl.get(0)) {
				clearInterval(this.loop_funct);
				this.loop_funct = null;
				this.setColor(this.active_god_el.get(0), false);
				this.active_god_el = null;
				return;
			}

			if (this.active_god_el && this.active_god_el.get(0) !== godEl.get(0)) {
				clearInterval(this.loop_funct);
				this.setColor(this.active_god_el.get(0), false);
			}

			this.loop_funct = setInterval(this.clicker, 1000, powerEl);
			this.active_god_el = godEl;
			this.setColor(godEl.get(0), true);
		});
	};

	setColor = (elm, apply) => {
		if (apply) {
			elm.style.filter = 'brightness(100%) sepia(100%) hue-rotate(90deg) saturate(1500%) contrast(0.8)';
		} else {
			elm.style.filter = '';
		}
	};

	trigger = () => {
		setTimeout(() => {
			this.handleGod('athena');
			this.handleGod('zeus');
			this.handleGod('artemis');

			// FIX: remove o popup/ícone antigo antes de recriar, senão a cada
			// reabertura da janela de ataque um novo #enchanted_rage é
			// empilhado em cima do anterior (elementos duplicados na DOM).
			uw.$('#enchanted_rage').remove();

			uw.$('.js-god-box[data-god_id="zeus"]').find('.powers').append(`
            <div id="enchanted_rage" class="js-power-icon animated_power_icon animated_power_icon_45x45 power_icon45x45 power transformation" style="filter: brightness(70%) sepia(104%) hue-rotate(14deg) saturate(1642%) contrast(0.8)">
                <div class="extend_spell">
                    <div class="gold"></div>
                </div>
                <div class="js-caption"></div>
            </div>
            `);

			const html = `
            <table class="popup" id="popup_div" cellpadding="0" cellspacing="0" style="display: block; left: 243px; top: 461px; opacity: 1; position: absolute; z-index: 6001; width: auto; max-width: 400px;">
                <tbody>
                    <tr class="popup_top">
                        <td class="popup_top_left"></td>
                        <td class="popup_top_middle"></td>
                        <td class="popup_top_right"></td>
                    </tr>
                    <tr>
                        <td class="popup_middle_left">&nbsp;</td>
                        <td class="popup_middle_middle" id="popup_content" style="width: auto;">
                            <div class="temple_power_popup ">
                                <div class="temple_power_popup_image power_icon86x86 transformation" style="filter: brightness(70%) sepia(104%) hue-rotate(14deg) saturate(1642%) contrast(0.8)"></div>
                                <div class="temple_power_popup_info">
                                    <h4>${this.t('ager_title')}</h4>
                                    <p> ${this.t('ager_desc1')} </p> 
                                    <p> ${this.t('ager_desc2')} </p>
                                    <p><b> ${this.t('ager_desc3')} </b></p>
                                    <div class="favor_cost_info">
                                        <div class="resource_icon favor"></div>
                                        <span>300 zeus + 200 artemis</span>
                                    </div>
                                </div>
                            </div>
                        </td>
                        <td class="popup_middle_right">&nbsp;</td>
                    </tr>
                    <tr class="popup_bottom">
                        <td class="popup_bottom_left"></td>
                        <td class="popup_bottom_middle"></td>
                        <td class="popup_bottom_right"></td>
                    </tr>
                </tbody>
            </table>`;

			const default_popup = `
            <table class="popup" id="popup_div" cellpadding="0" cellspacing="0" style="display: none; opacity: 0;">
	    	    <tbody><tr class="popup_top">
	    	    	<td class="popup_top_left"></td>
	    	    	<td class="popup_top_middle"></td>
	    	    	<td class="popup_top_right"></td>
	    	    </tr>
	    	    <tr>
	    	    	<td class="popup_middle_left">&nbsp;</td>
	    	    	<td class="popup_middle_middle" id="popup_content"></td>
	    	    	<td class="popup_middle_right">&nbsp;</td>
	    	    </tr>
	    	    <tr class="popup_bottom">
	    	    	<td class="popup_bottom_left"></td>
	    	    	<td class="popup_bottom_middle"></td>
	    	    	<td class="popup_bottom_right"></td>
	    	    </tr>
 	            </tbody>
            </table>`;

			const { artemis_favor, zeus_favor } = uw.ITowns.player_gods.attributes;
			const enable = artemis_favor >= 200 && zeus_favor >= 300;
			if (!enable) uw.$('#enchanted_rage').css('filter', 'grayscale(1)');

			// TODO: disable if not enable
			uw.$('#enchanted_rage').on({
				click: () => {
					if (!enable) return;
					this.enchanted('zeus');
				},
				mouseenter: event => {
					uw.$('#popup_div_curtain').html(html);
					const $popupDiv = uw.$('#popup_div');
					const offset = $popupDiv.offset();
					const height = $popupDiv.outerHeight();
					const width = $popupDiv.outerWidth();
					const left = event.pageX + 10;
					const top = event.pageY + 10;
					if (left + width > uw.$(window).width()) {
						offset.left -= width;
					} else {
						offset.left = left;
					}
					if (top + height > uw.$(window).height()) {
						offset.top -= height;
					} else {
						offset.top = top;
					}
					$popupDiv.css({
						left: offset.left + 'px',
						top: offset.top + 'px',
						display: 'block',
					});
				},
				mousemove: event => {
					const $popupDiv = uw.$('#popup_div');
					if ($popupDiv.is(':visible')) {
						const offset = $popupDiv.offset();
						const height = $popupDiv.outerHeight();
						const width = $popupDiv.outerWidth();
						const left = event.pageX + 10;
						const top = event.pageY + 10;
						if (left + width > uw.$(window).width()) {
							offset.left -= width;
						} else {
							offset.left = left;
						}
						if (top + height > uw.$(window).height()) {
							offset.top -= height;
						} else {
							offset.top = top;
						}
						$popupDiv.css({
							left: offset.left + 'px',
							top: offset.top + 'px',
						});
					}
				},
				mouseleave: () => {
					uw.$('#popup_div_curtain').html(default_popup);
				},
			});
		}, 100);
	};

	clicker = el => {
		// FIX: antes checava um seletor genérico em qualquer lugar da página
		// (podia deixar o autoclick rodando pra sempre / clique fantasma).
		// Agora verifica se o elemento ESPECÍFICO que estamos clicando
		// ainda está conectado à DOM (janela de ataque ainda aberta).
		if (!el || !el.length || !el.get(0) || !el.get(0).isConnected) {
			clearInterval(this.loop_funct);
			this.loop_funct = null;
			if (this.active_god_el) {
				this.setColor(this.active_god_el.get(0), false);
			}
			this.active_god_el = null;
			return;
		}
		el.click();
		let delta_time = 500;
		let rand = 500 + Math.floor(Math.random() * delta_time);
		clearInterval(this.loop_funct);
		this.loop_funct = setInterval(this.clicker, rand, el);
	};

	enchanted = async type => {
		if (type === 'zeus') {
			this.cast(this.command_id, 'cleanse');
			//await this.sleep(1);
			this.cast(this.command_id, 'transformation');
		}
	};

	cast = (id, type) => {
		let data = {
			model_url: 'Commands',
			action_name: 'cast',
			arguments: {
				id: id,
				power_id: type,
			},
		};
		uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data);
	};
};
