// ══════════════════════════════════════════════════════
//  MODULE: DiscordAlert
//  Avisa via webhook do Discord assim que um ataque a caminho e
//  detectado - sem repetir aviso pro mesmo ataque.
//
//  Deteccao de ataque reaproveitada do auto_dodge.js (ja
//  confirmada em producao): uw.MM.getModels().MovementsUnits,
//  filtrando type === 'attack'/'attack_with_spy' com
//  target_town_id sendo uma cidade sua.
//
//  Webhook do Discord: POST direto pra URL configurada (fora do
//  jogo, chamada via fetch() do navegador, nao via uw.gpAjax -
//  webhooks do Discord sao feitos pra aceitar chamada direta de
//  qualquer pagina, documentado publicamente pela propria API
//  do Discord).
// ══════════════════════════════════════════════════════
var DiscordAlert = class extends MultUtil {
    constructor(c, s) {
        super(c, s);
        this._active = this.storage.load('discord_alert_active', false);
        this._webhookUrl = this.storage.load('discord_alert_webhook', '');
        this._notifiedIds = new Set();
        this._intervalId = null;

        if (this._active) {
            setTimeout(() => this.start(), 2500);
        }
    }

    settings = () => {
        requestAnimationFrame(() => this._updateTitle());

        return `
        <div class="game_border" style="margin-bottom:20px;">
            <div class="game_border_top"></div><div class="game_border_bottom"></div>
            <div class="game_border_left"></div><div class="game_border_right"></div>
            <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>
            <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>
            ${this.getTitleHtml('discord_alert_title', this.t('da_title'), this.toggle, '', this._active)}
            <div style="padding:5px 10px;font-weight:bold;">
                ${this.t('da_desc')}
            </div>
            <div style="padding:4px 10px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                <label style="font-size:11px;font-weight:bold;">${this.t('da_webhook_label')}</label>
                <input type="text" id="da_webhook_input" value="${this._webhookUrl}" placeholder="https://discord.com/api/webhooks/..." style="flex:1;min-width:220px;padding:3px 5px;" />
                ${this.getButtonHtml('da_save_btn', this.t('apply'), this.saveWebhook)}
                ${this.getButtonHtml('da_test_btn', this.t('da_test_btn'), this.testWebhook)}
            </div>
            <div id="da_status" style="padding:2px 10px 8px;font-size:11px;color:#5a3a0a;"></div>
        </div>`;
    };

    saveWebhook = () => {
        const url = (uw.$('#da_webhook_input').val() || '').trim();
        this._webhookUrl = url;
        this.storage.save('discord_alert_webhook', url);
        const msg = url ? this.t('da_webhook_saved') : this.t('da_webhook_cleared');
        uw.$('#da_status').text(msg).css('color', '#1a6b2a');
        this.console.log('[DiscordAlert] ' + msg);
    };

    testWebhook = async () => {
        if (!this._webhookUrl) {
            uw.$('#da_status').text(this.t('da_no_webhook')).css('color', '#f87171');
            return;
        }
        uw.$('#da_status').text(this.t('da_sending_test')).css('color', '#5a3a0a');

        const embed = {
            title: '🔔 ' + this.t('da_test_title'),
            description: this.t('da_test_desc'),
            color: 3901635, // azul
            timestamp: new Date().toISOString(),
        };

        try {
            const res = await fetch(this._webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ embeds: [embed] }),
            });
            if (res.ok) {
                uw.$('#da_status').text(this.t('da_test_ok')).css('color', '#1a6b2a');
                this.console.log('[DiscordAlert] ' + this.t('da_test_ok'));
            } else {
                const txt = await res.text();
                uw.$('#da_status').text(this.t('da_test_fail', { status: res.status })).css('color', '#f87171');
                this.console.log('[DiscordAlert] ' + this.t('da_test_fail_log', { status: res.status, body: txt }));
            }
        } catch (e) {
            uw.$('#da_status').text(this.t('da_test_error')).css('color', '#f87171');
            this.console.log('[DiscordAlert] ' + this.t('da_test_error_log', { msg: e?.message ?? e }));
        }
    };

    toggle = () => {
        if (this._active) this.stop();
        else this.start();
    };

    start() {
        if (this._active) return;
        this._active = true;
        this.storage.save('discord_alert_active', true);
        this._updateTitle();
        this.console.log('[DiscordAlert] ' + this.t('ar_started'));
        this._tick();
        this._intervalId = this.createGuardedInterval(() => this._tick(), 15000);
    }

    stop() {
        this._active = false;
        this.storage.save('discord_alert_active', false);
        if (this._intervalId) { clearInterval(this._intervalId); this._intervalId = null; }
        this._updateTitle();
        this.console.log('[DiscordAlert] ' + this.t('ar_stopped_log'));
    }

    _updateTitle() {
        uw.$('#discord_alert_title').css('filter', this._active
            ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    }

    /* Mesma logica de deteccao ja confirmada e em producao no
       auto_dodge.js - reaproveitada aqui sem alteracao. */
    _getIncomingAttacks() {
        try {
            const models = uw.MM.getModels().MovementsUnits;
            if (!models) return [];

            const attacks = [];
            for (const key in models) {
                const mv = models[key].attributes;
                if (!mv) continue;
                const isAttack = mv.type === 'attack' || mv.type === 'attack_with_spy';
                const targetExists = uw.ITowns && uw.ITowns.towns && uw.ITowns.towns[mv.target_town_id];
                if (isAttack && targetExists) {
                    attacks.push(mv);
                }
            }
            return attacks;
        } catch (e) {
            return [];
        }
    }

    async _tick() {
        if (!this._webhookUrl) return;

        try {
            const attacks = this._getIncomingAttacks();
            const currentIds = new Set(attacks.map(a => String(a.id)));

            // Limpa notificacoes de ataques que ja sumiram da lista
            // (chegaram ou foram cancelados) - mantem o Set do tamanho
            // dos ataques realmente pendentes, nao cresce sem limite.
            for (const id of this._notifiedIds) {
                if (!currentIds.has(id)) this._notifiedIds.delete(id);
            }

            for (const atk of attacks) {
                const id = String(atk.id);
                if (this._notifiedIds.has(id)) continue;
                this._notifiedIds.add(id);
                await this._sendAlert(atk);
            }
        } catch (e) {
            this.console.log('[DiscordAlert] ' + this.t('da_tick_error', { msg: e?.message ?? e }));
        }
    }

    _formatDuration(totalSeconds) {
        const s = Math.max(0, totalSeconds);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = Math.floor(s % 60);
        return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':');
    }

    async _sendAlert(atk) {
        try {
            const townName = this.getTownName(atk.target_town_id);
            const arrival = atk.arrival_at || atk.time_of_arrival || 0;
            if (!arrival) return;

            const arrivalDate = new Date(arrival * 1000);
            const now = Math.floor(Date.now() / 1000);
            const secondsLeft = arrival - now;

            const embed = {
                title: '🚨 ' + this.t('da_alert_title'),
                description: this.t('da_alert_desc', { town: townName }),
                color: 15158332, // vermelho
                fields: [
                    { name: '⏰ ' + this.t('da_field_arrival'), value: arrivalDate.toLocaleString(), inline: true },
                    { name: '⏳ ' + this.t('da_field_remaining'), value: this._formatDuration(secondsLeft), inline: true },
                ],
                timestamp: new Date().toISOString(),
            };

            const res = await fetch(this._webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ embeds: [embed] }),
            });

            if (res.ok) {
                this.console.log('[DiscordAlert] ' + this.t('da_alert_sent_log', { town: townName }));
            } else {
                this.console.log('[DiscordAlert] ' + this.t('da_alert_fail_log', { town: townName, status: res.status }));
            }
        } catch (e) {
            this.console.log('[DiscordAlert] ' + this.t('da_alert_error_log', { msg: e?.message ?? e }));
        }
    }
};
