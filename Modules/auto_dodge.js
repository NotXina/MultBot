// ══════════════════════════════════════════════════════
//  MODULE: AutoDodge
//  Detecta ataques chegando e evacua as tropas da cidade
//  atacada como reforço para uma cidade segura configurada,
//  antes do impacto — e traz de volta automaticamente
//  depois que o ataque passa (cancelCommand).
// ══════════════════════════════════════════════════════
class AutoDodge extends ModernUtil {
    MIN_LEAD_SECONDS = 20;
    // Quanto tempo depois do impacto esperar antes de tentar o recall,
    // dando margem de segurança pro servidor processar o ataque
    RECALL_BUFFER_SECONDS = 20;
    // Quanto esperar após enviar o apoio antes de procurar o ID do comando
    // criado (dá tempo do MovementsUnits ser atualizado no client)
    CAPTURE_DELAY_MS = 2500;

    constructor(c, s) {
        super(c, s);
        this._active     = false;
        this._intervalId = null;
        this._evacuated  = new Set();     // townIds já evacuados nesta onda de ataque
        this._pendingRecalls = new Map(); // townId -> { timeoutId, commandId }

        this.config = this.storage.load('dodge_config', {
            safeTownId: '',
        });

        if (this.storage.load('dodge_active', false)) {
            setTimeout(() => this.start(), 2000);
        }
    }

    settings = () => {
        const cfg = this.config;
        requestAnimationFrame(() => {
            this._updateTitle();
            uw.$('#dodge_safe_town').off('keydown').on('keydown', e => { if (e.key === 'Enter') this._saveSafeTown(); });
        });
        return `
        <div class="game_border" style="margin-bottom:20px;">
            <div class="game_border_top"></div><div class="game_border_bottom"></div>
            <div class="game_border_left"></div><div class="game_border_right"></div>
            <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>
            <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>
            ${this.getTitleHtml('dodge_title', 'Auto Fuga (Dodge)', this.toggle, '', this._active)}
            <div style="padding:5px 10px;font-weight:bold;">
                Ao detectar um ataque chegando, evacua as tropas para a cidade
                segura e as traz de volta automaticamente após o impacto.
                Verifica a cada 15s.
            </div>
            <div style="padding:5px 10px;">
                <label style="font-weight:bold;font-size:11px;">Cidade Segura (ID ou [town]...[/town])</label><br>
                <div style="display:flex;gap:4px;margin-top:3px;align-items:center;">
                    <input id="dodge_safe_town" type="text" placeholder="ID da cidade"
                        value="${cfg.safeTownId || ''}"
                        style="width:120px;padding:2px 5px;" />
                    ${this.getButtonHtml('dodge_save_target', 'Salvar', this._saveSafeTown)}
                </div>
                <div id="dodge_target_status" style="font-size:11px;color:#5a3a0a;margin-top:3px;">
                    ${cfg.safeTownId ? '✓ ' + this._getTownName(cfg.safeTownId) : 'Nenhuma cidade segura configurada'}
                </div>
            </div>
            <div id="dodge_log" style="padding:2px 10px 8px;font-size:11px;color:#5a3a0a;min-height:16px;"></div>
        </div>`;
    };

    _saveSafeTown = () => {
        const raw = (uw.$('#dodge_safe_town').val() || '').trim();
        const id  = this._parseTownId(raw);
        if (!id) { uw.$('#dodge_target_status').text('ID inválido.').css('color', '#f87171'); return; }
        this.config.safeTownId = id;
        this.storage.save('dodge_config', this.config);
        uw.$('#dodge_target_status').text('✓ Destino: ' + this._getTownName(id)).css('color', '#4ade80');
        this.console.log('[AutoDodge] Cidade segura salva: #' + id);
    };

    toggle = () => {
        if (this._active) this.stop();
        else this.start();
    };

    start() {
        if (this._active) return;
        this._active = true;
        this.storage.save('dodge_active', true);
        this._updateTitle();
        this.console.log('[AutoDodge] Iniciado. Monitorando ataques...');
        this._tick();
        this._intervalId = setInterval(() => this._tick(), 15000);
    }

    stop() {
        this._active = false;
        this.storage.save('dodge_active', false);
        if (this._intervalId) { clearInterval(this._intervalId); this._intervalId = null; }

        // Cancela só os TIMERS locais agendados — não cancela o apoio no
        // servidor. Se um recall já estava agendado, a tropa continua em
        // apoio até você trazer manualmente ou reiniciar o módulo.
        for (const { timeoutId } of this._pendingRecalls.values()) clearTimeout(timeoutId);
        this._pendingRecalls.clear();
        this._evacuated.clear();

        this._updateTitle();
        this.console.log('[AutoDodge] Parado.');
    }

    _updateTitle() {
        uw.$('#dodge_title').css('filter', this._active
            ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    }

    _tick() {
        if (window.__multbot_captcha_active) return;
        if (!this.config.safeTownId) return;

        try {
            const attacks = this._getIncomingAttacks();
            const now     = Math.floor(Date.now() / 1000);

            const byTown = new Map(); // townId -> maior "arrival" entre os ataques daquela cidade
            for (const atk of attacks) {
                const townId  = String(atk.target_town_id);
                const arrival = atk.arrival_at ?? atk.time_of_arrival ?? 0;
                if (!arrival) continue;
                if (!byTown.has(townId) || arrival > byTown.get(townId)) {
                    byTown.set(townId, arrival);
                }
            }

            for (const townId of this._evacuated) {
                if (!byTown.has(townId)) this._evacuated.delete(townId);
            }

            for (const [townId, arrival] of byTown) {
                if (this._evacuated.has(townId)) continue;
                if (String(townId) === String(this.config.safeTownId)) continue;

                const remaining = arrival - now;
                if (remaining < this.MIN_LEAD_SECONDS) {
                    this.console.log(`[AutoDodge] ⚠ Pouco tempo (${remaining}s) para evacuar #${townId}, tentando mesmo assim...`);
                }

                this._evacuated.add(townId);
                this._evacuateTown(townId, arrival);
            }
        } catch (e) {
            this.console.log('[AutoDodge] Erro: ' + e?.message);
        }
    }

    _getIncomingAttacks() {
        try {
            const models = uw.MM.getModels().MovementsUnits;
            if (!models) return [];
            const attacks = [];
            for (const key in models) {
                const mv = models[key].attributes;
                if ((mv.type === 'attack' || mv.type === 'attack_with_spy')
                    && uw.ITowns?.towns?.[mv.target_town_id]) {
                    attacks.push(mv);
                }
            }
            return attacks;
        } catch (e) { return []; }
    }

    async _evacuateTown(townId, attackArrival) {
        try {
            const town = uw.ITowns.towns[townId];
            if (!town) return;
            const townName = town.getName?.() ?? '#' + townId;

            const units = { ...town.units() };
            delete units.militia;
            for (const key of Object.keys(units)) {
                if (!units[key] || units[key] <= 0) delete units[key];
            }

            if (Object.keys(units).length === 0) {
                this.console.log(`[AutoDodge] ${townName}: sem tropas para evacuar.`);
                return;
            }

            this.console.log(`[AutoDodge] ⚠ Evacuando ${townName} para a cidade segura...`);
            await this._sendUnits(townId, this.config.safeTownId, units);

            const msg = `✓ ${townName}: tropas evacuadas com sucesso!`;
            this.console.log('[AutoDodge] ' + msg);
            uw.$('#dodge_log').text(msg).css('color', '#1a6b2a');
            if (uw.HumanMessage) uw.HumanMessage.success(`MultBot: ${townName} evacuada!`);

            // Espera um pouco para o MovementsUnits atualizar, depois captura
            // o ID do comando de apoio recém-criado
            await this.sleep(this.CAPTURE_DELAY_MS);
            const commandId = this._findSupportCommandId(townId, this.config.safeTownId);

            if (!commandId) {
                this.console.log(`[AutoDodge] ⚠ ${townName}: não encontrei o ID do comando de apoio. Recall automático não será possível — traga manualmente depois do ataque.`);
                uw.$('#dodge_log').text(`⚠ ${townName}: recall automático indisponível (ID não encontrado).`).css('color', '#eab308');
                return;
            }

            this._scheduleRecall(townId, townName, attackArrival, commandId);
        } catch (e) {
            this.console.log(`[AutoDodge] ✗ Erro ao evacuar #${townId}: ${e?.message}`);
        }
    }

    /* Procura, entre os MovementsUnits atuais, o comando de apoio que criamos
       (origem = cidade evacuada, destino = cidade segura). Retorna o ID
       usado pelo endpoint cancelCommand. */
    _findSupportCommandId(fromTownId, toTownId) {
        try {
            const models = uw.MM.getModels().MovementsUnits;
            if (!models) return null;
            for (const key in models) {
                const mv = models[key].attributes;
                if (mv.type === 'support'
                    && String(mv.origin_town_id) === String(fromTownId)
                    && String(mv.target_town_id) === String(toTownId)) {
                    return mv.id ?? mv.command_id ?? key;
                }
            }
            return null;
        } catch (e) { return null; }
    }

    /* Agenda a tentativa de trazer as tropas de volta, um pouco depois do
       horário em que o ataque deveria ter chegado (dá tempo do servidor
       processar o combate antes de tentarmos o recall). */
    _scheduleRecall(townId, townName, attackArrival, commandId) {
        const now       = Math.floor(Date.now() / 1000);
        const fireInSec = Math.max(this.RECALL_BUFFER_SECONDS, (attackArrival - now) + this.RECALL_BUFFER_SECONDS);
        const fireInMs  = fireInSec * 1000;

        this.console.log(`[AutoDodge] ${townName}: retorno agendado para daqui a ${fireInSec}s (comando #${commandId}).`);

        const timeoutId = setTimeout(() => {
            this._pendingRecalls.delete(townId);
            this._recallSupport(townId, townName, commandId);
        }, fireInMs);

        this._pendingRecalls.set(townId, { timeoutId, commandId });
    }

    /* Cancela o comando de apoio no servidor — confirmado via captura real
       do jogo: model_url 'Commands', action_name 'cancelCommand'. */
    _recallSupport(townId, townName, commandId) {
        const data = {
            model_url:   'Commands',
            action_name: 'cancelCommand',
            captcha:     null,
            arguments:   { id: commandId },
        };

        this.console.log(`[AutoDodge] ⏳ ${townName}: chamando as tropas de volta (comando #${commandId})...`);

        uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data, false,
            res => {
                if (res && !res.error) {
                    const msg = `✓ ${townName}: tropas retornando!`;
                    this.console.log('[AutoDodge] ' + msg);
                    uw.$('#dodge_log').text(msg).css('color', '#1a6b2a');
                    if (uw.HumanMessage) uw.HumanMessage.success(`MultBot: ${townName} — tropas retornando!`);
                } else {
                    this.console.log(`[AutoDodge] ✗ ${townName}: falha ao chamar de volta — ${JSON.stringify(res)}`);
                    uw.$('#dodge_log').text(`✗ ${townName}: falha no recall — traga manualmente.`).css('color', '#f87171');
                }
            },
            err => {
                this.console.log(`[AutoDodge] ✗ ${townName}: erro de rede no recall — ${err}`);
            }
        );
    }

    _sendUnits(fromTownId, toTownId, units) {
        return this._withTownId(fromTownId, () => new Promise((resolve, reject) => {
            const data = {
                id:   parseInt(toTownId, 10),
                type: 'support',
                ...units,
            };
            uw.gpAjax.ajaxPost('town_info', 'send_units', data, false,
                res => {
                    if (res && res.success !== false) resolve(res);
                    else reject(new Error(res?.error || 'Falha ao enviar tropas'));
                },
                (r, status, txt) => reject(new Error('Erro de rede: ' + txt))
            );
        }));
    }

    async _withTownId(townId, fn) {
        const orig    = uw.Game.townId;
        const origStr = uw.Game.town_id;
        uw.Game.townId  = parseInt(townId, 10);
        uw.Game.town_id = parseInt(townId, 10);
        try {
            return await fn();
        } finally {
            uw.Game.townId  = orig;
            uw.Game.town_id = origStr;
        }
    }

    _getTownName(townId) {
        if (!townId) return String(townId);
        const id  = parseInt(townId);
        const ids = String(townId);
        try {
            const t1 = uw.ITowns?.towns?.[id] ?? uw.ITowns?.towns?.[ids];
            if (t1) return t1.getName() + ' (#' + ids + ')';

            const allTowns = uw.MM.getOnlyCollectionByName('Town')?.models ?? [];
            for (const t of allTowns) {
                const tid = t.attributes?.id ?? t.id;
                if (parseInt(tid) === id) {
                    return (t.attributes?.name ?? '?') + ' (#' + ids + ')';
                }
            }

            const wt = uw.WMap?.towns?.[id] ?? uw.WMap?.towns?.[ids];
            if (wt?.name) return wt.name + ' (#' + ids + ')';
        } catch (e) {}
        return '#' + ids;
    }

    _parseTownId(input) {
        if (!input) return null;
        const bb = input.match(/\[town[^\]]*\](\d+)\[\/town\]/i);
        if (bb) return bb[1];
        for (const m of [...input.matchAll(/#([A-Za-z0-9+\/=]{8,})/g)]) {
            try { const o = JSON.parse(atob(m[1])); if (o?.id) return String(o.id); } catch {}
        }
        const n = input.trim().match(/^\d{3,}$/);
        if (n) return input.trim();
        return null;
    }
}
