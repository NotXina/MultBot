// ══════════════════════════════════════════════════════
//  MODULE: AutoDodge
//  Detecta ataques chegando e evacua as tropas da cidade
//  atacada como reforço para uma cidade ALEATÓRIA sua na
//  MESMA ILHA — enviando terrestres e navais SEPARADAMENTE
//  para evitar conflito de capacidade de transporte — e
//  traz de volta automaticamente após o impacto (cancelCommand).
// ══════════════════════════════════════════════════════
class AutoDodge extends ModernUtil {
    MIN_LEAD_SECONDS = 20;
    // Quanto tempo depois do impacto esperar antes de tentar o recall,
    // dando margem de segurança pro servidor processar o ataque
    RECALL_BUFFER_SECONDS = 20;
    // Quanto esperar após cada envio antes de procurar o ID do comando
    // criado (dá tempo do MovementsUnits ser atualizado no client)
    CAPTURE_DELAY_MS = 2500;

    constructor(c, s) {
        super(c, s);
        this._active     = false;
        this._intervalId = null;
        this._evacuated  = new Set();     // townIds já evacuados nesta onda de ataque
        this._pendingRecalls = new Map(); // "townId:land"/"townId:naval" -> { timeoutId, commandId }

        if (this.storage.load('dodge_active', false)) {
            setTimeout(() => this.start(), 2000);
        }
    }

    settings = () => {
        requestAnimationFrame(() => {
            this._updateTitle();
        });
        return `
        <div class="game_border" style="margin-bottom:20px;">
            <div class="game_border_top"></div><div class="game_border_bottom"></div>
            <div class="game_border_left"></div><div class="game_border_right"></div>
            <div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>
            <div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>
            ${this.getTitleHtml('dodge_title', 'Auto Fuga (Dodge)', this.toggle, '', this._active)}
            <div style="padding:5px 10px;font-weight:bold;">
                Ao detectar um ataque chegando, evacua terrestres e navais
                SEPARADAMENTE para uma cidade sua escolhida aleatoriamente na
                MESMA ILHA, e traz de volta automaticamente após o impacto.
                Verifica a cada 15s.
            </div>
            <div style="padding:2px 10px 8px;font-size:11px;color:#5a3a0a;">
                Se não houver outra cidade sua na mesma ilha, a evacuação
                daquela cidade é pulada (sem enviar para longe).
            </div>
            <div id="dodge_log" style="padding:2px 10px 8px;font-size:11px;color:#5a3a0a;min-height:16px;"></div>
        </div>`;
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

    /* Escolhe aleatoriamente uma cidade PRÓPRIA na mesma ilha da cidade
       atacada (excluindo ela mesma). Retorna null se não houver nenhuma. */
    _pickRandomTownOnSameIsland(attackedTownId) {
        try {
            const attackedTown = uw.ITowns.towns[attackedTownId];
            if (!attackedTown) return null;

            const ix = attackedTown.attributes.island_x;
            const iy = attackedTown.attributes.island_y;

            const candidates = [];
            for (const townId in uw.ITowns.towns) {
                if (String(townId) === String(attackedTownId)) continue;
                const town = uw.ITowns.towns[townId];
                if (town.attributes.island_x === ix && town.attributes.island_y === iy) {
                    candidates.push(townId);
                }
            }

            if (candidates.length === 0) return null;
            return candidates[Math.floor(Math.random() * candidates.length)];
        } catch (e) {
            return null;
        }
    }

    /* Separa as tropas de uma cidade em dois grupos: terrestres e navais,
       usando a flag is_naval do próprio GameData (mesma fonte usada no
       AutoTrain), garantindo consistência entre módulos. */
    _splitUnitsByType(town) {
        const all = { ...town.units() };
        delete all.militia; // milícia nunca é enviada como reforço

        const landUnits  = {};
        const navalUnits = {};

        for (const unit of Object.keys(all)) {
            const count = all[unit];
            if (!count || count <= 0) continue;

            const isNaval = !!uw.GameData.units[unit]?.is_naval;
            if (isNaval) navalUnits[unit] = count;
            else         landUnits[unit] = count;
        }

        return { landUnits, navalUnits };
    }

    async _evacuateTown(townId, attackArrival) {
        try {
            const town = uw.ITowns.towns[townId];
            if (!town) return;
            const townName = town.getName?.() ?? '#' + townId;

            const safeTownId = this._pickRandomTownOnSameIsland(townId);
            if (!safeTownId) {
                this.console.log(`[AutoDodge] ⚠ ${townName}: nenhuma outra cidade sua na mesma ilha — evacuação pulada.`);
                uw.$('#dodge_log').text(`⚠ ${townName}: sem cidade na mesma ilha para evacuar.`).css('color', '#eab308');
                return;
            }
            const safeTownName = this._getTownName(safeTownId);

            const { landUnits, navalUnits } = this._splitUnitsByType(town);
            const hasLand  = Object.keys(landUnits).length  > 0;
            const hasNaval = Object.keys(navalUnits).length > 0;

            if (!hasLand && !hasNaval) {
                this.console.log(`[AutoDodge] ${townName}: sem tropas para evacuar.`);
                return;
            }

            this.console.log(`[AutoDodge] ⚠ Evacuando ${townName} → ${safeTownName} (mesma ilha, terrestre e naval separados)...`);

            const excludeIds = new Set();

            // ── Envia terrestres primeiro ──
            if (hasLand) {
                try {
                    await this._sendUnits(townId, safeTownId, landUnits);
                    await this.sleep(this.CAPTURE_DELAY_MS);
                    const landCommandId = this._findSupportCommandId(townId, safeTownId, excludeIds);
                    if (landCommandId) {
                        excludeIds.add(String(landCommandId));
                        this._scheduleRecall(townId, townName, attackArrival, landCommandId, 'terrestre');
                    } else {
                        this.console.log(`[AutoDodge] ⚠ ${townName}: ID do comando terrestre não encontrado — recall manual necessário.`);
                    }
                } catch (e) {
                    this.console.log(`[AutoDodge] ✗ ${townName}: falha ao enviar terrestres — ${e?.message}`);
                }
            } else {
                this.console.log(`[AutoDodge] ${townName}: sem tropas terrestres, pulando esse grupo.`);
            }

            // ── Envia navais depois (independente do resultado do terrestre) ──
            if (hasNaval) {
                try {
                    await this._sendUnits(townId, safeTownId, navalUnits);
                    await this.sleep(this.CAPTURE_DELAY_MS);
                    const navalCommandId = this._findSupportCommandId(townId, safeTownId, excludeIds);
                    if (navalCommandId) {
                        excludeIds.add(String(navalCommandId));
                        this._scheduleRecall(townId, townName, attackArrival, navalCommandId, 'naval');
                    } else {
                        this.console.log(`[AutoDodge] ⚠ ${townName}: ID do comando naval não encontrado — recall manual necessário.`);
                    }
                } catch (e) {
                    this.console.log(`[AutoDodge] ✗ ${townName}: falha ao enviar navais — ${e?.message}`);
                }
            } else {
                this.console.log(`[AutoDodge] ${townName}: sem tropas navais, pulando esse grupo.`);
            }

            const msg = `✓ ${townName} evacuada para ${safeTownName}!`;
            this.console.log('[AutoDodge] ' + msg);
            uw.$('#dodge_log').text(msg).css('color', '#1a6b2a');
            if (uw.HumanMessage) uw.HumanMessage.success(`MultBot: ${townName} → ${safeTownName}`);
        } catch (e) {
            this.console.log(`[AutoDodge] ✗ Erro ao evacuar #${townId}: ${e?.message}`);
        }
    }

    /* Procura, entre os MovementsUnits atuais, o comando de apoio mais
       recente que bate origem/destino, ignorando IDs já capturados
       anteriormente (usado para diferenciar o comando terrestre do naval,
       enviados em momentos separados para a mesma rota). */
    _findSupportCommandId(fromTownId, toTownId, excludeIds = new Set()) {
        try {
            const models = uw.MM.getModels().MovementsUnits;
            if (!models) return null;
            for (const key in models) {
                const mv = models[key].attributes;
                if (mv.type !== 'support') continue;
                if (String(mv.origin_town_id) !== String(fromTownId)) continue;
                if (String(mv.target_town_id) !== String(toTownId)) continue;

                const id = mv.id ?? mv.command_id ?? key;
                if (excludeIds.has(String(id))) continue;

                return id;
            }
            return null;
        } catch (e) { return null; }
    }

    /* Agenda a tentativa de trazer as tropas de volta, um pouco depois do
       horário em que o ataque deveria ter chegado (dá tempo do servidor
       processar o combate antes de tentarmos o recall). */
    _scheduleRecall(townId, townName, attackArrival, commandId, label) {
        const now       = Math.floor(Date.now() / 1000);
        const fireInSec = Math.max(this.RECALL_BUFFER_SECONDS, (attackArrival - now) + this.RECALL_BUFFER_SECONDS);
        const fireInMs  = fireInSec * 1000;
        const recallKey = `${townId}:${label}`;

        this.console.log(`[AutoDodge] ${townName} (${label}): retorno agendado para daqui a ${fireInSec}s (comando #${commandId}).`);

        const timeoutId = setTimeout(() => {
            this._pendingRecalls.delete(recallKey);
            this._recallSupport(townId, townName, commandId, label);
        }, fireInMs);

        this._pendingRecalls.set(recallKey, { timeoutId, commandId });
    }

    /* Cancela o comando de apoio no servidor — confirmado via captura real
       do jogo: model_url 'Commands', action_name 'cancelCommand'. */
    _recallSupport(townId, townName, commandId, label) {
        const data = {
            model_url:   'Commands',
            action_name: 'cancelCommand',
            captcha:     null,
            arguments:   { id: commandId },
        };

        this.console.log(`[AutoDodge] ⏳ ${townName} (${label}): chamando as tropas de volta (comando #${commandId})...`);

        uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data, false,
            res => {
                if (res && !res.error) {
                    const msg = `✓ ${townName} (${label}): tropas retornando!`;
                    this.console.log('[AutoDodge] ' + msg);
                    uw.$('#dodge_log').text(msg).css('color', '#1a6b2a');
                    if (uw.HumanMessage) uw.HumanMessage.success(`MultBot: ${townName} (${label}) — retornando!`);
                } else {
                    this.console.log(`[AutoDodge] ✗ ${townName} (${label}): falha ao chamar de volta — ${JSON.stringify(res)}`);
                    uw.$('#dodge_log').text(`✗ ${townName} (${label}): falha no recall — traga manualmente.`).css('color', '#f87171');
                }
            },
            err => {
                this.console.log(`[AutoDodge] ✗ ${townName} (${label}): erro de rede no recall — ${err}`);
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
}
