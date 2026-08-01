// ══════════════════════════════════════════════════════
//  MODULE: DiscordAlert
//  Avisa via webhook do Discord assim que um ataque a caminho e
//  detectado - sem repetir aviso pro mesmo ataque.
//
//  Deteccao de ataque via EVENTO BACKBONE (add no
//  MovementsUnits) - reage instantaneamente quando o jogo
//  adiciona um novo movimento ao cache, sem esperar o proximo
//  poll periodico. O poll de 15s continua rodando so como
//  rede de seguranca (ex: ataques que ja existiam ao ativar
//  o modulo, ou em caso de perda de evento).
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
        this._boundOnAdd = null; // referencia da funcao vinculada ao evento backbone

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
        this.console.log('[DiscordAlert] ' + this.t('da_started_log'));

        // Escuta eventos instantaneos do backbone: qualquer novo
        // movimento adicionado ao cache e verificado na hora.
        this._hookBackbone();

        // Poll de seguranca: pega ataques ja existentes ao ativar,
        // e cobre qualquer evento perdido (ex: recarregamento de pagina).
        this._tick();
        this._intervalId = this.createGuardedInterval(() => this._tick(), 15000);
    }

    stop() {
        this._active = false;
        this.storage.save('discord_alert_active', false);
        if (this._intervalId) { clearInterval(this._intervalId); this._intervalId = null; }
        this._unhookBackbone();
        this._updateTitle();
        this.console.log('[DiscordAlert] ' + this.t('da_stopped_log'));
    }

    // ─────────────────────────────────────────────────────────────
    //  EVENTO BACKBONE — deteccao instantanea
    // ─────────────────────────────────────────────────────────────

    /* Vincula ao evento "add" da colecao Backbone MovementsUnits.
       O jogo adiciona cada novo movimento (ataque, apoio, etc) a
       essa colecao assim que o servidor confirma — por isso e
       instantaneo em vez de depender de um poll de N segundos.
       A colecao pode ainda nao estar populada na hora do start()
       (ex: pagina acabou de carregar) — tenta a cada 500ms ate
       achar, com timeout de 10s pra nao ficar rodando pra sempre
       caso o jogo nao tenha essa colecao disponivel. */
    _hookBackbone() {
        this._unhookBackbone(); // garante que nao duplica se chamado duas vezes

        const MAX_WAIT_MS = 10000;
        const RETRY_MS = 500;
        const start = Date.now();

        const tryHook = () => {
            try {
                const collection = uw.MM.getOnlyCollectionByName('MovementsUnits');
                if (!collection) {
                    if (Date.now() - start < MAX_WAIT_MS) {
                        setTimeout(tryHook, RETRY_MS);
                    } else {
                        this.console.log('[DiscordAlert] MovementsUnits collection nao encontrada - so o poll periodico ativo.');
                    }
                    return;
                }

                // Arrow function pra manter "this" da classe; guardada
                // em _boundOnAdd pra poder remover depois com .off()
                this._boundOnAdd = (model) => {
                    try {
                        const mv = model?.attributes;
                        if (!mv) return;
                        const isAttack = mv.type === 'attack' || mv.type === 'attack_with_spy';
                        const isOurTown = uw.ITowns && uw.ITowns.towns && uw.ITowns.towns[mv.target_town_id];
                        if (isAttack && isOurTown) {
                            const id = String(mv.id);
                            if (!this._notifiedIds.has(id)) {
                                this._sendAlert(mv).then(sent => {
                                    if (sent) this._notifiedIds.add(id);
                                });
                            }
                        }
                    } catch (e) {
                        this.console.log('[DiscordAlert] backbone onAdd error: ' + (e?.message ?? e));
                    }
                };

                collection.on('add', this._boundOnAdd);
                this.console.log('[DiscordAlert] Backbone hook ativo — alertas instantaneos.');
                this._collection = collection; // guarda referencia pra poder fazer .off() depois
            } catch (e) {
                this.console.log('[DiscordAlert] _hookBackbone error: ' + (e?.message ?? e));
            }
        };

        tryHook();
    }

    /* Remove o listener do backbone ao parar o modulo. */
    _unhookBackbone() {
        try {
            if (this._collection && this._boundOnAdd) {
                this._collection.off('add', this._boundOnAdd);
            }
        } catch (e) {}
        this._collection = null;
        this._boundOnAdd = null;
    }

    _updateTitle() {
        uw.$('#discord_alert_title').css('filter', this._active
            ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    }

    /* Mesma logica de deteccao ja confirmada e em producao no
       auto_dodge.js - usada pelo poll periodico de seguranca. */
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
            for (const id of this._notifiedIds) {
                if (!currentIds.has(id)) this._notifiedIds.delete(id);
            }

            for (const atk of attacks) {
                const id = String(atk.id);
                if (this._notifiedIds.has(id)) continue;
                const sent = await this._sendAlert(atk);
                if (sent) this._notifiedIds.add(id);
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

    /* Confirmado via captura real: town_info/info (GET) na cidade
       de ORIGEM do ataque devolve um HTML que contem
       data-player_name="NomeDoJogador" - extrai isso via regex.
       FIX: o objeto que ajaxGetWithTimeout resolve ja vem
       desembrulhado pelo proprio jogo como {menu, html} - o html
       fica DIRETO em res.html, nao em res.plain.html. */
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

    async _sendAlert(atk) {
        try {
            const townName = this.getTownName(atk.target_town_id);
            const originName = atk.town_name_origin || this.getTownName(atk.home_town_id);
            const attackerName = await this._resolveAttackerName(atk.home_town_id);
            const defenderName = this._getOwnPlayerName();
            const arrival = atk.arrival_at || atk.time_of_arrival || 0;
            if (!arrival) return false;

            const arrivalDate = new Date(arrival * 1000);
            const isSpy = atk.type === 'attack_with_spy';

            const embed = {
                author: { name: this.t('da_brand_name') },
                title: '🚨 ' + this.t('da_alert_title'),
                color: 15158332,
                fields: [
                    { name: '⚔️ ' + this.t('da_field_enemy'), value: '\u200b', inline: false },
                    { name: this.t('da_field_player'), value: attackerName || this.t('da_unknown'), inline: true },
                    { name: this.t('da_field_city'), value: originName || this.t('da_unknown'), inline: true },
                    { name: '🛡️ ' + this.t('da_field_defender'), value: '\u200b', inline: false },
                    { name: this.t('da_field_player'), value: defenderName, inline: true },
                    { name: this.t('da_field_city'), value: townName, inline: true },
                    { name: '\u200b', value: '\u200b', inline: false },
                    { name: '⚔️ ' + this.t('da_field_type'), value: isSpy ? this.t('da_type_spy') : this.t('da_type_normal'), inline: true },
                    { name: '⏰ ' + this.t('da_field_arrival'), value: arrivalDate.toLocaleString(), inline: true },
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
