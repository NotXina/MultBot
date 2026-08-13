// ══════════════════════════════════════════════════════
//  MODULE: DiscordAlert  v2.0  (Instant + Guardian)
//
//  DETECCAO IMEDIATA: listener Backbone no MovementsUnits.on('add')
//  dispara no mesmo instante que o jogo recebe o ataque via websocket/poll.
//
//  GUARDIAN PERSISTENTE: interval de 15s como fallback de seguranca
//  (cobre reconexao de pagina, ataques que ja existiam ao ativar, etc).
//
//  Webhook: POST direto via fetch() - webhooks do Discord aceitam
//  chamada direta de qualquer pagina (API publica do Discord).
// ══════════════════════════════════════════════════════
var DiscordAlert = class extends MultUtil {
    constructor(c, s) {
        super(c, s);
        this._active = this.storage.load('discord_alert_active', false);
        this._webhookUrl = this.storage.load('discord_alert_webhook', '');
        this._notifiedIds = new Set();
        this._intervalId = null;
        this._boundOnAdd = null; // referencia ao listener para poder remover

        if (this._active) {
            setTimeout(() => this.start(), 2500);
        }
    }

    settings = () => {
        requestAnimationFrame(() => this._updateTitle());

        return '<div class="game_border" style="margin-bottom:20px;">' +
            '<div class="game_border_top"></div><div class="game_border_bottom"></div>' +
            '<div class="game_border_left"></div><div class="game_border_right"></div>' +
            '<div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>' +
            '<div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>' +
            this.getTitleHtml('discord_alert_title', this.t('da_title'), this.toggle, '', this._active) +
            '<div style="padding:5px 10px;font-weight:bold;">' + this.t('da_desc') + '</div>' +
            '<div style="padding:4px 10px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
                '<label style="font-size:11px;font-weight:bold;">' + this.t('da_webhook_label') + '</label>' +
                '<input type="text" id="da_webhook_input" value="' + this._webhookUrl + '" placeholder="https://discord.com/api/webhooks/..." style="flex:1;min-width:220px;padding:3px 5px;" />' +
                this.getButtonHtml('da_save_btn', this.t('apply'), this.saveWebhook) +
                this.getButtonHtml('da_test_btn', this.t('da_test_btn'), this.testWebhook) +
            '</div>' +
            '<div id="da_status" style="padding:2px 10px 8px;font-size:11px;color:#5a3a0a;"></div>' +
        '</div>';
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
            color: 3901635,
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

        // ── 1) LISTENER IMEDIATO ─────────────────────────────────
        // Registra no evento Backbone 'add' da colecao MovementsUnits.
        // Dispara no exato momento que o jogo insere um novo movimento
        // na colecao (via websocket ou primeiro poll).
        this._attachInstantListener();

        // ── 2) GUARDIAN PERSISTENTE (fallback) ──────────────────
        // Varre todos os ataques existentes agora (ataques que ja
        // estavam ativos quando o modulo foi ligado) e continua
        // verificando a cada 15s (reconexao de pagina, etc).
        this._tick();
        this._intervalId = this.createGuardedInterval(() => this._tick(), 15000);
    }

    stop() {
        this._active = false;
        this.storage.save('discord_alert_active', false);
        this._detachInstantListener();
        if (this._intervalId) { clearInterval(this._intervalId); this._intervalId = null; }
        this._updateTitle();
        this.console.log('[DiscordAlert] ' + this.t('ar_stopped_log'));
    }

    // ── LISTENER BACKBONE ────────────────────────────────────────────
    // MovementsUnits e uma colecao Backbone - o evento 'add' e emitido
    // toda vez que um novo modelo e adicionado (novo ataque/apoio
    // chegando do servidor). Usamos isso para deteccao instantanea.
    _attachInstantListener() {
        try {
            const collection = uw.MM.getModels().MovementsUnits;
            if (!collection || typeof collection.on !== 'function') {
                this.console.log('[DiscordAlert] MovementsUnits nao e colecao Backbone - apenas guardian ativo.');
                return;
            }

            // Guarda referencia para poder remover depois (off precisa da mesma funcao)
            this._boundOnAdd = (model) => {
                try {
                    const mv = model && model.attributes ? model.attributes : model;
                    if (!mv) return;
                    const isAttack = mv.type === 'attack' || mv.type === 'attack_with_spy';
                    const targetExists = uw.ITowns && uw.ITowns.towns && uw.ITowns.towns[mv.target_town_id];
                    if (!isAttack || !targetExists) return;

                    const id = String(mv.id);
                    if (this._notifiedIds.has(id)) return;

                    this.console.log('[DiscordAlert] ⚡ Ataque detectado INSTANTANEAMENTE (id=' + id + ')');
                    // Envia o alerta de forma assincrona - nao bloqueia o evento Backbone
                    this._sendAlert(mv).then((sent) => {
                        if (sent) this._notifiedIds.add(id);
                    }).catch((e) => {
                        this.console.log('[DiscordAlert] Erro no listener instantaneo: ' + (e?.message ?? e));
                    });
                } catch (e) {
                    this.console.log('[DiscordAlert] Erro no callback do listener: ' + (e?.message ?? e));
                }
            };

            collection.on('add', this._boundOnAdd);
            this.console.log('[DiscordAlert] ⚡ Listener instantaneo registrado em MovementsUnits.');
        } catch (e) {
            this.console.log('[DiscordAlert] Nao foi possivel registrar listener instantaneo: ' + (e?.message ?? e));
        }
    }

    _detachInstantListener() {
        try {
            if (!this._boundOnAdd) return;
            const collection = uw.MM.getModels().MovementsUnits;
            if (collection && typeof collection.off === 'function') {
                collection.off('add', this._boundOnAdd);
                this.console.log('[DiscordAlert] Listener instantaneo removido.');
            }
        } catch (e) {
            // silencioso - nao critico ao parar
        }
        this._boundOnAdd = null;
    }

    // ── UPDATETITLE ──────────────────────────────────────────────────
    _updateTitle() {
        uw.$('#discord_alert_title').css('filter', this._active
            ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    }

    // ── DETECCAO (poll) ───────────────────────────────────────────────
    // Mesma logica confirmada em producao no auto_dodge.js.
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

    // ── TICK (guardian 15s) ───────────────────────────────────────────
    async _tick() {
        if (!this._webhookUrl) return;

        try {
            const attacks = this._getIncomingAttacks();
            const currentIds = new Set(attacks.map(a => String(a.id)));

            // Limpa ids de ataques que ja passaram/foram cancelados
            for (const id of this._notifiedIds) {
                if (!currentIds.has(id)) this._notifiedIds.delete(id);
            }

            for (const atk of attacks) {
                const id = String(atk.id);
                if (this._notifiedIds.has(id)) continue;
                // Marca DEPOIS de confirmar entrega do webhook
                const sent = await this._sendAlert(atk);
                if (sent) this._notifiedIds.add(id);
            }
        } catch (e) {
            this.console.log('[DiscordAlert] ' + this.t('da_tick_error', { msg: e?.message ?? e }));
        }
    }

    // ── UTILITARIOS ───────────────────────────────────────────────────
    _formatDuration(totalSeconds) {
        const s = Math.max(0, totalSeconds);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = Math.floor(s % 60);
        return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':');
    }

    // Confirmado via captura real: data-player_name no HTML de town_info/info
    async _resolveAttackerName(homeTownId) {
        try {
            const activeTownId = uw.ITowns.getCurrentTown().id;
            const res = await this.ajaxGetWithTimeout('town_info', 'info', {
                id: parseInt(homeTownId, 10),
                town_id: activeTownId,
                nl_init: true,
            }, 15000, true);
            const html = res?.html || res?.plain?.html || res?.json?.plain?.html || '';
            const match = html.match(/data-player_name="([^"]*)"/);
            if (match) {
                const name = match[1].trim();
                if (name) return name;
            }
            this.console.log('[DiscordAlert] ' + this.t('da_resolve_name_no_match', {
                keys: Object.keys(res || {}).join(', '),
            }));
        } catch (e) {
            this.console.log('[DiscordAlert] ' + this.t('da_resolve_name_error', { msg: e?.message ?? e }));
        }
        return null;
    }

    _getOwnPlayerName() {
        try {
            return uw.Game?.player_name || this.t('da_unknown');
        } catch (e) {
            return this.t('da_unknown');
        }
    }

    // ── ENVIO DO ALERTA ───────────────────────────────────────────────
    async _sendAlert(atk) {
        try {
            const townName = this.getTownName(atk.target_town_id);
            const originName = atk.town_name_origin || this.getTownName(atk.home_town_id);
            const attackerName = await this._resolveAttackerName(atk.home_town_id);
            const defenderName = this._getOwnPlayerName();
            const arrival = atk.arrival_at || atk.time_of_arrival || 0;
            if (!arrival) return false;

            const arrivalDate = new Date(arrival * 1000);
            const now = Math.floor(Date.now() / 1000);
            const remaining = arrival - now;
            const isSpy = atk.type === 'attack_with_spy';

            const embed = {
                author: { name: this.t('da_brand_name') },
                title: '🚨 ' + this.t('da_alert_title'),
                color: 15158332,
                fields: [
                    { name: '⚔️ ' + this.t('da_field_enemy'),    value: '\u200b', inline: false },
                    { name: this.t('da_field_player'),            value: attackerName || this.t('da_unknown'), inline: true },
                    { name: this.t('da_field_city'),              value: originName  || this.t('da_unknown'), inline: true },
                    { name: '🛡️ ' + this.t('da_field_defender'), value: '\u200b', inline: false },
                    { name: this.t('da_field_player'),            value: defenderName, inline: true },
                    { name: this.t('da_field_city'),              value: townName,     inline: true },
                    { name: '\u200b',                             value: '\u200b', inline: false },
                    { name: '⚔️ ' + this.t('da_field_type'),     value: isSpy ? this.t('da_type_spy') : this.t('da_type_normal'), inline: true },
                    { name: '⏰ ' + this.t('da_field_arrival'),  value: arrivalDate.toLocaleString(), inline: true },
                    { name: '⏳ ' + this.t('da_field_remaining'), value: this._formatDuration(remaining), inline: true },
                ],
                footer: { text: this.t('da_brand_footer') },
                timestamp: new Date().toISOString(),
            };

            const res = await fetch(this._webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ embeds: [embed] }),
            });

            if (res.ok) {
                this.console.log('[DiscordAlert] ' + this.t('da_alert_sent_log', { town: townName }));
                return true;
            } else {
                this.console.log('[DiscordAlert] ' + this.t('da_alert_fail_log', { town: townName, status: res.status }));
                return false;
            }
        } catch (e) {
            this.console.log('[DiscordAlert] ' + this.t('da_alert_error_log', { msg: e?.message ?? e }));
            return false;
        }
    }
};
