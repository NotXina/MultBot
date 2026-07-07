// ══════════════════════════════════════════════════════
//  MODULE: AutoAresSacrifice
//  Monitora o FAVOR DE ARES (rastreado por conta, nao por
//  cidade - uw.ITowns.player_gods.attributes.ares_favor) e,
//  assim que atingir 100, lanca o poder "Sacrificio a Ares"
//  na cidade escolhida (via dropdown), acumulando furia ate
//  o limite de 5000. Para automaticamente ao atingir o limite.
//
//  Nome do deus exibido tenta usar getGameName('god', 'ares'),
//  que puxa direto de uw.GameData.gods (se essa fonte existir
//  neste mundo) - com fallback seguro para o texto fixo "Ares"
//  caso o dado nao esteja disponivel, sem quebrar a interface.
//
//  Endpoint confirmado via captura real:
//  model_url: "CastedPowers", action_name: "cast",
//  arguments: { power_id: "ares_sacrifice", target_id: <town_id> }
// ══════════════════════════════════════════════════════
class AutoAresSacrifice extends ModernUtil {
    GOD_ID = 'ares';
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

    /* Nome do deus para exibicao - tenta o nome nativo do jogo,
       cai no texto fixo "Ares" se a fonte de dados nao existir. */
    _getGodLabel() {
        const name = this.getGameName('god', this.GOD_ID);
        return (name && name !== this.GOD_ID) ? name : 'Ares';
    }

    settings = () => {
        requestAnimationFrame(() => {
            this._updateTitle();
            this._renderStatus();
        });

        const godLabel = this._getGodLabel();

        return (
            '<div class="game_border" style="margin-bottom:20px;">' +
            '<div class="game_border_top"></div><div class="game_border_bottom"></div>' +
            '<div class="game_border_left"></div><div class="game_border_right"></div>' +
            '<div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>' +
            '<div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>' +
            this.getTitleHtml('ares_sac_title', 'Auto Sacrificio de ' + godLabel, this.toggle, '', this._active) +
            '<div style="padding:5px 10px;font-weight:bold;">' +
            'Lanca o Sacrificio de ' + godLabel + ' assim que houver ' + this.FAVOR_COST + ' de favor acumulado, ate atingir ' + this.MAX_FURY + ' de furia. Verifica a cada 20s.' +
            '</div>' +
            '<div style="padding:8px 10px;display:flex;gap:8px;align-items:center;">' +
            '<label style="font-size:11px;font-weight:bold;">Cidade</label>' +
            '<select id="ares_sac_town_select" style="width:220px;padding:3px;">' +
            this._getTownOptionsHtml() +
            '</select>' +
            this.getButtonHtml('ares_sac_save_town_btn', 'Salvar', this.saveTown) +
            '</div>' +
            '<div id="ares_sac_status" style="padding:2px 10px;font-size:11px;color:#5a3a0a;"></div>' +
            '<div id="ares_sac_log" style="padding:2px 10px 8px;font-size:11px;color:#5a3a0a;min-height:16px;"></div>' +
            '</div>'
        );
    };

    _getTownOptionsHtml() {
        try {
            const towns = uw.ITowns.towns;
            const keys = Object.keys(towns).sort((a, b) => {
                const nameA = towns[a].getName ? towns[a].getName() : '';
                const nameB = towns[b].getName ? towns[b].getName() : '';
                return nameA.localeCompare(nameB);
            });

            let html = '<option value="">Selecione uma cidade...</option>';
            keys.forEach(id => {
                const t = towns[id];
                const name = t.getName ? t.getName() : ('#' + id);
                const selected = String(id) === String(this.townId) ? ' selected' : '';
                html += '<option value="' + id + '"' + selected + '>' + name + ' (#' + id + ')</option>';
            });
            return html;
        } catch (e) {
            return '<option value="">Erro ao carregar cidades</option>';
        }
    }

    saveTown = () => {
        const raw = (uw.$('#ares_sac_town_select').val() || '').trim();
        if (!raw) {
            this.console.log('[AutoAresSacrifice] Erro: nenhuma cidade selecionada.');
            uw.$('#ares_sac_log').text('Erro: selecione uma cidade.').css('color', '#f87171');
            return;
        }
        this.townId = raw;
        this.storage.save('ares_sac_town_id', raw);
        const townName = uw.ITowns.towns[raw]?.getName ? uw.ITowns.towns[raw].getName() : ('#' + raw);
        this.console.log('[AutoAresSacrifice] Cidade salva: ' + townName + ' (#' + raw + ')');
        uw.$('#ares_sac_log').text('Cidade salva: ' + townName).css('color', '#1a6b2a');
        this._renderStatus();
    };

    toggle = () => {
        if (this._active) this.stop();
        else this.start();
    };

    start() {
        if (this._active) return;
        if (!this.townId) {
            this.console.log('[AutoAresSacrifice] Aviso: selecione uma cidade antes de iniciar.');
            uw.$('#ares_sac_log').text('Selecione uma cidade antes de iniciar.').css('color', '#eab308');
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

    _getCurrentFury() {
        try {
            return uw.ITowns.player_gods.attributes.fury || 0;
        } catch (e) {
            return 0;
        }
    }

    _getAresFavor() {
        try {
            return uw.ITowns.player_gods.attributes[this.GOD_ID + '_favor'] || 0;
        } catch (e) {
            return 0;
        }
    }

    _renderStatus() {
        try {
            const fury = this._getCurrentFury();
            const godFavor = this._getAresFavor();
            const godLabel = this._getGodLabel();
            const town = this.townId ? uw.ITowns.towns[this.townId] : null;
            const townName = town && town.getName ? town.getName() : (this.townId ? '#' + this.townId + ' (nao encontrada)' : 'nenhuma selecionada');

            const html = 'Furia atual: <b>' + fury + ' / ' + this.MAX_FURY + '</b>' +
                ' | Favor de ' + godLabel + ' (conta): <b>' + godFavor + '</b>' +
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

            const godFavor = this._getAresFavor();
            this._renderStatus();

            if (godFavor < this.FAVOR_COST) return;

            const townName = town.getName ? town.getName() : ('#' + this.townId);
            const godLabel = this._getGodLabel();
            this.console.log('[AutoAresSacrifice] ' + townName + ': ' + godFavor + ' de favor de ' + godLabel + ' disponivel. Lancando sacrificio...');

            const result = await this._castAresSacrifice(this.townId);

            if (result.success) {
                const newFury = this._getCurrentFury();
                const newFavor = this._getAresFavor();
                this.console.log('[AutoAresSacrifice] ✓ Sacrificio lancado! Furia agora: ' + newFury + '/' + this.MAX_FURY + ' | Favor restante: ' + newFavor);
                uw.$('#ares_sac_log').text('✓ Sacrificio lancado! Furia: ' + newFury + '/' + this.MAX_FURY).css('color', '#1a6b2a');
                if (uw.HumanMessage) uw.HumanMessage.success('MultBot: Sacrificio de ' + godLabel + ' lancado (' + newFury + '/' + this.MAX_FURY + ')');
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

    _castAresSacrifice(townId) {
        return new Promise((resolve) => {
            const data = {
                model_url: 'CastedPowers',
                action_name: 'cast',
                captcha: null,
                arguments: {
                    power_id: this.GOD_ID + '_sacrifice',
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
