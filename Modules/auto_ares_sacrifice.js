// ══════════════════════════════════════════════════════
//  MODULE: AutoAresSacrifice
//  Monitora o favor de uma cidade escolhida e, assim que
//  atingir 100 de favor, lanca o poder "Sacrificio a Ares",
//  acumulando furia (global na conta) ate o limite de 5000.
//  Para automaticamente ao atingir o limite.
//
//  Endpoint confirmado via captura real:
//  model_url: "CastedPowers", action_name: "cast",
//  arguments: { power_id: "ares_sacrifice", target_id: <town_id> }
//
//  Observacao: o jogo tambem exige uma populacao minima na cidade
//  (visto um hint "ares_sacrifice_not_enough_population" durante a
//  captura). Nao bloqueamos por populacao no cliente - se faltar,
//  o proprio servidor recusa e o motivo aparece logado.
// ══════════════════════════════════════════════════════
class AutoAresSacrifice extends ModernUtil {
    FAVOR_COST = 100;
    MAX_FURY = 5000;
    CHECK_INTERVAL_MS = 20000;

    constructor(c, s) {
        super(c, s);
        this._active = false;
        this._intervalId = null;
        this.townId = this.storage.load('ares_sac_town_id', '');

        if (this.storage.load('ares_sac_active', false)) {
            setTimeout(() => this.start(), 2000);
        }
    }

    settings = () => {
        requestAnimationFrame(() => {
            this._updateTitle();
            this._renderStatus();
        });

        return (
            '<div class="game_border" style="margin-bottom:20px;">' +
            '<div class="game_border_top"></div><div class="game_border_bottom"></div>' +
            '<div class="game_border_left"></div><div class="game_border_right"></div>' +
            '<div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>' +
            '<div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>' +
            this.getTitleHtml('ares_sac_title', 'Auto Sacrificio de Ares', this.toggle, '', this._active) +
            '<div style="padding:5px 10px;font-weight:bold;">' +
            'Lanca o Sacrificio a Ares assim que a cidade escolhida tiver ' + this.FAVOR_COST + ' de favor, ate acumular ' + this.MAX_FURY + ' de furia. Verifica a cada 20s.' +
            '</div>' +
            '<div style="padding:8px 10px;display:flex;gap:8px;align-items:center;">' +
            '<label style="font-size:11px;font-weight:bold;">Cidade (ID)</label>' +
            '<input type="text" id="ares_sac_town_input" value="' + (this.townId || '') + '" placeholder="ex: 5342" style="width:100px;padding:3px;">' +
            this.getButtonHtml('ares_sac_save_town_btn', 'Salvar', this.saveTown) +
            '</div>' +
            '<div id="ares_sac_status" style="padding:2px 10px;font-size:11px;color:#5a3a0a;"></div>' +
            '<div id="ares_sac_log" style="padding:2px 10px 8px;font-size:11px;color:#5a3a0a;min-height:16px;"></div>' +
            '</div>'
        );
    };

    saveTown = () => {
        const raw = (uw.$('#ares_sac_town_input').val() || '').trim();
        if (!raw || !/^\d+$/.test(raw)) {
            this.console.log('[AutoAresSacrifice] Erro: ID de cidade invalido.');
            uw.$('#ares_sac_log').text('Erro: ID de cidade invalido.').css('color', '#f87171');
            return;
        }
        this.townId = raw;
        this.storage.save('ares_sac_town_id', raw);
        this.console.log('[AutoAresSacrifice] Cidade salva: #' + raw);
        uw.$('#ares_sac_log').text('Cidade salva: #' + raw).css('color', '#1a6b2a');
        this._renderStatus();
    };

    toggle = () => {
        if (this._active) this.stop();
        else this.start();
    };

    start() {
        if (this._active) return;
        if (!this.townId) {
            this.console.log('[AutoAresSacrifice] Aviso: configure uma cidade antes de iniciar.');
            uw.$('#ares_sac_log').text('Configure uma cidade antes de iniciar.').css('color', '#eab308');
            return;
        }
        this._active = true;
        this.storage.save('ares_sac_active', true);
        this._updateTitle();
        this.console.log('[AutoAresSacrifice] Iniciado.');
        this._tick();
        this._intervalId = setInterval(() => this._tick(), this.CHECK_INTERVAL_MS);
    }

    stop() {
        this._active = false;
        this.storage.save('ares_sac_active', false);
        if (this._intervalId) { clearInterval(this._intervalId); this._intervalId = null; }
        this._updateTitle();
        this.console.log('[AutoAresSacrifice] Parado.');
    }

    _updateTitle() {
        uw.$('#ares_sac_title').css('filter', this._active
            ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    }

    /* Furia e um valor GLOBAL da conta (nao por cidade), lido de
       uw.ITowns.player_gods.attributes.fury - confirmado no dump
       anterior de PlayerGods (fury: 0, max_fury: 5000). */
    _getCurrentFury() {
        try {
            return uw.ITowns.player_gods.attributes.fury || 0;
        } catch (e) {
            return 0;
        }
    }

    _renderStatus() {
        try {
            const fury = this._getCurrentFury();
            const town = this.townId ? uw.ITowns.towns[this.townId] : null;
            const favor = town ? (town.resources().favor || 0) : null;
            const townName = town && town.getName ? town.getName() : (this.townId ? '#' + this.townId + ' (nao encontrada)' : 'nenhuma configurada');

            let html = 'Furia atual: <b>' + fury + ' / ' + this.MAX_FURY + '</b>';
            if (favor !== null) {
                html += ' | Cidade: <b>' + townName + '</b> | Favor: <b>' + favor + '</b>';
            } else {
                html += ' | Cidade: ' + townName;
            }
            uw.$('#ares_sac_status').html(html);
        } catch (e) {}
    }

    async _tick() {
        if (window.__multbot_captcha_active) return;
        if (!this.townId) return;

        try {
            const fury = this._getCurrentFury();
            if (fury >= this.MAX_FURY) {
                this.console.log('[AutoAresSacrifice] Furia maxima (' + this.MAX_FURY + ') atingida. Parando automaticamente.');
                uw.$('#ares_sac_log').text('Furia maxima atingida! Modulo parado.').css('color', '#1a6b2a');
                this.stop();
                return;
            }

            const town = uw.ITowns.towns[this.townId];
            if (!town) {
                this.console.log('[AutoAresSacrifice] Aviso: cidade #' + this.townId + ' nao encontrada.');
                return;
            }

            const favor = town.resources().favor || 0;
            this._renderStatus();

            if (favor < this.FAVOR_COST) return; // ainda nao tem favor suficiente

            const townName = town.getName ? town.getName() : ('#' + this.townId);
            this.console.log('[AutoAresSacrifice] ' + townName + ': ' + favor + ' de favor disponivel. Lancando Sacrificio a Ares...');

            const result = await this._castAresSacrifice(this.townId);

            if (result.success) {
                const newFury = this._getCurrentFury();
                this.console.log('[AutoAresSacrifice] ✓ Sacrificio lancado! Furia agora: ' + newFury + '/' + this.MAX_FURY);
                uw.$('#ares_sac_log').text('✓ Sacrificio lancado! Furia: ' + newFury + '/' + this.MAX_FURY).css('color', '#1a6b2a');
                if (uw.HumanMessage) uw.HumanMessage.success('MultBot: Sacrificio a Ares lancado (' + newFury + '/' + this.MAX_FURY + ')');
                this._renderStatus();
            } else {
                this.console.log('[AutoAresSacrifice] ✗ Falha ao lancar o sacrificio: ' + result.reason);
                uw.$('#ares_sac_log').text('✗ Falha: ' + result.reason).css('color', '#f87171');
            }
        } catch (e) {
            const msg = e && e.message ? e.message : e;
            this.console.log('[AutoAresSacrifice] Erro no tick: ' + msg);
        }
    }

    /* Endpoint confirmado via captura real do jogo:
       model_url "CastedPowers", action_name "cast",
       arguments.target_id = ID da cidade (nao usa town_id separado). */
    _castAresSacrifice(townId) {
        return new Promise((resolve) => {
            const data = {
                model_url: 'CastedPowers',
                action_name: 'cast',
                captcha: null,
                arguments: {
                    power_id: 'ares_sacrifice',
                    target_id: parseInt(townId, 10),
                },
            };

            uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data, false,
                res => {
                    this.console.log('[AutoAresSacrifice] Resposta do servidor: ' + JSON.stringify(res));
                    if (res && !res.error) {
                        resolve({ success: true });
                    } else {
                        const reason = (res && res.error) ? res.error : 'motivo desconhecido';
                        resolve({ success: false, reason: reason });
                    }
                },
                err => {
                    this.console.log('[AutoAresSacrifice] Erro de rede: ' + err);
                    resolve({ success: false, reason: 'erro de rede' });
                }
            );
        });
    }
}
