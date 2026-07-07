// ══════════════════════════════════════════════════════
//  MODULE: AutoAresSacrifice
//  Monitora o FAVOR DE ARES (rastreado por conta, nao por
//  cidade - uw.ITowns.player_gods.attributes.ares_favor) e,
//  assim que atingir 100, lanca o poder "Sacrificio a Ares"
//  na cidade escolhida, acumulando furia ate o limite de 5000.
//  Para automaticamente ao atingir o limite.
//
//  BUGFIX: favor e rastreado POR DEUS, a nivel de conta -
//  campos tipo ares_favor, zeus_favor, artemis_favor ficam em
//  player_gods.attributes (confirmado no dump do PlayerGods e
//  ja usado com sucesso no anti_rage.js). town.resources().favor
//  e o favor GERAL da cidade (do deus que ela adora agora, seja
//  qual for) - nao e o mesmo campo e nunca deveria ser usado
//  para checar favor de um deus especifico.
//
//  Endpoint confirmado via captura real:
//  model_url: "CastedPowers", action_name: "cast",
//  arguments: { power_id: "ares_sacrifice", target_id: <town_id> }
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
            'Lanca o Sacrificio a Ares assim que houver ' + this.FAVOR_COST + ' de favor de Ares acumulado, ate atingir ' + this.MAX_FURY + ' de furia. Verifica a cada 20s.' +
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

    /* Furia e um valor GLOBAL da conta, lido de
       uw.ITowns.player_gods.attributes.fury - confirmado no dump
       anterior de PlayerGods (fury: 0, max_fury: 5000). */
    _getCurrentFury() {
        try {
            return uw.ITowns.player_gods.attributes.fury || 0;
        } catch (e) {
            return 0;
        }
    }

    /* BUGFIX: favor de Ares e rastreado POR CONTA, nao por cidade.
       O campo correto e player_gods.attributes.ares_favor - mesmo
       padrao ja usado no anti_rage.js para artemis_favor/zeus_favor.
       town.resources().favor e o favor GERAL da cidade (do deus que
       ela adora no momento) e NUNCA deve ser usado para checar o
       favor de um deus especifico como Ares. */
    _getAresFavor() {
        try {
            return uw.ITowns.player_gods.attributes.ares_favor || 0;
        } catch (e) {
            return 0;
        }
    }

    _renderStatus() {
        try {
            const fury = this._getCurrentFury();
            const aresFavor = this._getAresFavor();
            const town = this.townId ? uw.ITowns.towns[this.townId] : null;
            const townName = town && town.getName ? town.getName() : (this.townId ? '#' + this.townId + ' (nao encontrada)' : 'nenhuma configurada');

            const html = 'Furia atual: <b>' + fury + ' / ' + this.MAX_FURY + '</b>' +
                ' | Favor de Ares (conta): <b>' + aresFavor + '</b>' +
                ' | Cidade: <b>' + townName + '</b>';
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

            const aresFavor = this._getAresFavor();
            this._renderStatus();

            if (aresFavor < this.FAVOR_COST) return; // ainda nao tem favor de Ares suficiente

            const townName = town.getName ? town.getName() : ('#' + this.townId);
            this.console.log('[AutoAresSacrifice] ' + townName + ': ' + aresFavor + ' de favor de Ares disponivel. Lancando Sacrificio a Ares...');

            const result = await this._castAresSacrifice(this.townId);

            if (result.success) {
                const newFury = this._getCurrentFury();
                const newAresFavor = this._getAresFavor();
                this.console.log('[AutoAresSacrifice] ✓ Sacrificio lancado! Furia agora: ' + newFury + '/' + this.MAX_FURY + ' | Favor de Ares restante: ' + newAresFavor);
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
