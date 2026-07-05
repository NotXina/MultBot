// ══════════════════════════════════════════════════════
//  MODULE: AutoDodge
//  Detecta ataques chegando e agenda a evacuacao das tropas
//  para exatamente ~15s antes do impacto - enviando para
//  QUALQUER cidade na MESMA ILHA (de qualquer jogador),
//  terrestres e navais SEPARADAMENTE - e traz de volta
//  automaticamente depois (cancelCommand).
// ══════════════════════════════════════════════════════
class AutoDodge extends ModernUtil {
    EVACUATE_LEAD_SECONDS = 15;
    RECALL_BUFFER_SECONDS = 20;
    CAPTURE_DELAY_MS = 2500;

    constructor(c, s) {
        super(c, s);
        this._active = false;
        this._intervalId = null;
        this._scheduledEvac = new Map();
        this._evacuated = new Set();
        this._pendingRecalls = new Map();

        if (this.storage.load('dodge_active', false)) {
            setTimeout(() => {
                this.start();
            }, 2000);
        }
    }

    settings = () => {
        requestAnimationFrame(() => {
            this._updateTitle();
        });
        return (
            '<div class="game_border" style="margin-bottom:20px;">' +
            '<div class="game_border_top"></div><div class="game_border_bottom"></div>' +
            '<div class="game_border_left"></div><div class="game_border_right"></div>' +
            '<div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>' +
            '<div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>' +
            this.getTitleHtml('dodge_title', 'Auto Fuga (Dodge)', this.toggle, '', this._active) +
            '<div style="padding:5px 10px;font-weight:bold;" title="Envia reforco para qualquer cidade da ilha, de qualquer jogador. Se nenhuma cidade existir na mesma ilha, a evacuacao e pulada.">' +
            'Evacua tropas ' + this.EVACUATE_LEAD_SECONDS + 's antes do impacto para uma cidade aleatoria na mesma ilha (qualquer jogador), com retorno automatico.' +
            '</div>' +
            '<div id="dodge_log" style="padding:2px 10px 8px;font-size:11px;color:#5a3a0a;min-height:16px;"></div>' +
            '</div>'
        );
    };

    toggle = () => {
        if (this._active) {
            this.stop();
        } else {
            this.start();
        }
    };

    start() {
        if (this._active) return;
        this._active = true;
        this.storage.save('dodge_active', true);
        this._updateTitle();
        this.console.log('[AutoDodge] Iniciado. Monitorando ataques...');
        this._tick();
        this._intervalId = setInterval(() => {
            this._tick();
        }, 15000);
    }

    stop() {
        this._active = false;
        this.storage.save('dodge_active', false);

        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }

        for (const timeoutId of this._scheduledEvac.values()) {
            clearTimeout(timeoutId);
        }
        this._scheduledEvac.clear();

        for (const entry of this._pendingRecalls.values()) {
            clearTimeout(entry.timeoutId);
        }
        this._pendingRecalls.clear();
        this._evacuated.clear();

        this._updateTitle();
        this.console.log('[AutoDodge] Parado.');
    }

    _updateTitle() {
        const filter = this._active ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '';
        uw.$('#dodge_title').css('filter', filter);
    }

    _tick() {
        if (window.__multbot_captcha_active) return;

        try {
            const attacks = this._getIncomingAttacks();
            const now = Math.floor(Date.now() / 1000);
            const byTown = new Map();

            for (const atk of attacks) {
                const townId = String(atk.target_town_id);
                const arrival = atk.arrival_at ? atk.arrival_at : (atk.time_of_arrival ? atk.time_of_arrival : 0);
                if (!arrival) continue;

                if (!byTown.has(townId) || arrival > byTown.get(townId)) {
                    byTown.set(townId, arrival);
                }
            }

            const attackedTowns = new Set(byTown.keys());

            for (const townId of this._scheduledEvac.keys()) {
                if (!attackedTowns.has(townId)) {
                    clearTimeout(this._scheduledEvac.get(townId));
                    this._scheduledEvac.delete(townId);
                }
            }

            for (const townId of this._evacuated) {
                if (!attackedTowns.has(townId)) {
                    this._evacuated.delete(townId);
                }
            }

            for (const entry of byTown) {
                const townId = entry[0];
                const arrival = entry[1];

                if (this._scheduledEvac.has(townId)) continue;
                if (this._evacuated.has(townId)) continue;

                const remaining = arrival - now;
                const leadMs = (remaining - this.EVACUATE_LEAD_SECONDS) * 1000;
                const fireInMs = leadMs > 0 ? leadMs : 0;

                const timeoutId = setTimeout(() => {
                    this._scheduledEvac.delete(townId);
                    this._evacuated.add(townId);
                    this._evacuateTown(townId, arrival);
                }, fireInMs);

                this._scheduledEvac.set(townId, timeoutId);

                const townLabel = this._getTownName(townId);
                const secLeft = Math.round(fireInMs / 1000);
                this.console.log('[AutoDodge] Evacuacao agendada: ' + townLabel + ' em ' + secLeft + 's (' + this.EVACUATE_LEAD_SECONDS + 's antes do impacto).');
            }
        } catch (e) {
            const msg = e && e.message ? e.message : e;
            this.console.log('[AutoDodge] Erro: ' + msg);
        }
    }

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

    /* Escolhe aleatoriamente QUALQUER cidade na mesma ilha da cidade
       atacada (de qualquer jogador, excluindo ela mesma). Usa a colecao
       global "Town" (uw.MM.getOnlyCollectionByName('Town')), que cacheia
       todas as cidades carregadas no cliente - nao apenas as suas.
       Retorna null se nao houver nenhuma outra cidade conhecida na ilha. */
    _pickRandomTownOnSameIsland(attackedTownId) {
        try {
            const attackedTown = uw.ITowns.towns[attackedTownId];
            if (!attackedTown || !attackedTown.attributes) return null;

            const ix = attackedTown.attributes.island_x;
            const iy = attackedTown.attributes.island_y;

            const collection = uw.MM.getOnlyCollectionByName('Town');
            const allTowns = collection && collection.models ? collection.models : [];
            const candidates = [];

            for (const t of allTowns) {
                if (!t || !t.attributes) continue;

                const tid = t.attributes.id !== undefined ? t.attributes.id : t.id;
                if (tid === undefined || tid === null) continue;
                if (String(tid) === String(attackedTownId)) continue;

                if (t.attributes.island_x === ix && t.attributes.island_y === iy) {
                    candidates.push(tid);
                }
            }

            if (candidates.length === 0) return null;
            const randomIndex = Math.floor(Math.random() * candidates.length);
            return candidates[randomIndex];
        } catch (e) {
            const msg = e && e.message ? e.message : e;
            this.console.log('[AutoDodge] Erro ao procurar cidade na mesma ilha: ' + msg);
            return null;
        }
    }

    _splitUnitsByType(town) {
        const all = Object.assign({}, town.units());
        delete all.militia;

        const landUnits = {};
        const navalUnits = {};

        for (const unit of Object.keys(all)) {
            const count = all[unit];
            if (!count || count <= 0) continue;

            const unitData = uw.GameData.units[unit];
            const isNaval = unitData && unitData.is_naval ? true : false;

            if (isNaval) {
                navalUnits[unit] = count;
            } else {
                landUnits[unit] = count;
            }
        }

        return { landUnits: landUnits, navalUnits: navalUnits };
    }

    async _evacuateTown(townId, attackArrival) {
        try {
            const town = uw.ITowns.towns[townId];
            if (!town) return;

            const townName = town.getName ? town.getName() : ('#' + townId);
            const safeTownId = this._pickRandomTownOnSameIsland(townId);

            if (!safeTownId) {
                this.console.log('[AutoDodge] Aviso: ' + townName + ' - nenhuma cidade conhecida na mesma ilha. Evacuacao pulada.');
                uw.$('#dodge_log').text('Aviso: ' + townName + ' sem cidade na mesma ilha.').css('color', '#eab308');
                return;
            }

            const safeTownName = this._getTownName(safeTownId);
            const split = this._splitUnitsByType(town);
            const landUnits = split.landUnits;
            const navalUnits = split.navalUnits;
            const hasLand = Object.keys(landUnits).length > 0;
            const hasNaval = Object.keys(navalUnits).length > 0;

            if (!hasLand && !hasNaval) {
                this.console.log('[AutoDodge] ' + townName + ': sem tropas para evacuar.');
                return;
            }

            this.console.log('[AutoDodge] Evacuando ' + townName + ' para ' + safeTownName + ' (mesma ilha, terrestre e naval separados)...');

            const excludeIds = new Set();

            if (hasLand) {
                try {
                    await this._sendUnits(townId, safeTownId, landUnits);
                    await this.sleep(this.CAPTURE_DELAY_MS);
                    const landCommandId = this._findSupportCommandId(townId, safeTownId, excludeIds);

                    if (landCommandId) {
                        excludeIds.add(String(landCommandId));
                        this._scheduleRecall(townId, townName, attackArrival, landCommandId, 'terrestre');
                    } else {
                        this.console.log('[AutoDodge] Aviso: ' + townName + ' - id do comando terrestre nao encontrado. Recall manual necessario.');
                    }
                } catch (e) {
                    const msg = e && e.message ? e.message : e;
                    this.console.log('[AutoDodge] Erro ao enviar terrestres de ' + townName + ': ' + msg);
                }
            } else {
                this.console.log('[AutoDodge] ' + townName + ': sem tropas terrestres, pulando esse grupo.');
            }

            if (hasNaval) {
                try {
                    await this._sendUnits(townId, safeTownId, navalUnits);
                    await this.sleep(this.CAPTURE_DELAY_MS);
                    const navalCommandId = this._findSupportCommandId(townId, safeTownId, excludeIds);

                    if (navalCommandId) {
                        excludeIds.add(String(navalCommandId));
                        this._scheduleRecall(townId, townName, attackArrival, navalCommandId, 'naval');
                    } else {
                        this.console.log('[AutoDodge] Aviso: ' + townName + ' - id do comando naval nao encontrado. Recall manual necessario.');
                    }
                } catch (e) {
                    const msg = e && e.message ? e.message : e;
                    this.console.log('[AutoDodge] Erro ao enviar navais de ' + townName + ': ' + msg);
                }
            } else {
                this.console.log('[AutoDodge] ' + townName + ': sem tropas navais, pulando esse grupo.');
            }

            const finalMsg = townName + ' evacuada para ' + safeTownName + '!';
            this.console.log('[AutoDodge] ' + finalMsg);
            uw.$('#dodge_log').text(finalMsg).css('color', '#1a6b2a');

            if (uw.HumanMessage) {
                uw.HumanMessage.success('MultBot: ' + townName + ' -> ' + safeTownName);
            }
        } catch (e) {
            const msg = e && e.message ? e.message : e;
            this.console.log('[AutoDodge] Erro ao evacuar #' + townId + ': ' + msg);
        }
    }

    _findSupportCommandId(fromTownId, toTownId, excludeIds) {
        const excluded = excludeIds ? excludeIds : new Set();
        try {
            const models = uw.MM.getModels().MovementsUnits;
            if (!models) return null;

            for (const key in models) {
                const mv = models[key].attributes;
                if (!mv) continue;
                if (mv.type !== 'support') continue;
                if (String(mv.origin_town_id) !== String(fromTownId)) continue;
                if (String(mv.target_town_id) !== String(toTownId)) continue;

                const id = mv.id ? mv.id : (mv.command_id ? mv.command_id : key);
                if (excluded.has(String(id))) continue;

                return id;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    _scheduleRecall(townId, townName, attackArrival, commandId, label) {
        const now = Math.floor(Date.now() / 1000);
        const rawSec = (attackArrival - now) + this.RECALL_BUFFER_SECONDS;
        const fireInSec = rawSec > this.RECALL_BUFFER_SECONDS ? rawSec : this.RECALL_BUFFER_SECONDS;
        const fireInMs = fireInSec * 1000;
        const recallKey = townId + ':' + label;

        this.console.log('[AutoDodge] ' + townName + ' (' + label + '): retorno agendado para daqui a ' + fireInSec + 's (comando #' + commandId + ').');

        const timeoutId = setTimeout(() => {
            this._pendingRecalls.delete(recallKey);
            this._recallSupport(townId, townName, commandId, label);
        }, fireInMs);

        this._pendingRecalls.set(recallKey, { timeoutId: timeoutId, commandId: commandId });
    }

    _recallSupport(townId, townName, commandId, label) {
        const data = {
            model_url: 'Commands',
            action_name: 'cancelCommand',
            captcha: null,
            arguments: { id: commandId },
        };

        this.console.log('[AutoDodge] ' + townName + ' (' + label + '): chamando as tropas de volta (comando #' + commandId + ')...');

        uw.gpAjax.ajaxPost('frontend_bridge', 'execute', data, false,
            function (res) {
                if (res && !res.error) {
                    const msg = townName + ' (' + label + '): tropas retornando!';
                    this.console.log('[AutoDodge] ' + msg);
                    uw.$('#dodge_log').text(msg).css('color', '#1a6b2a');
                    if (uw.HumanMessage) {
                        uw.HumanMessage.success('MultBot: ' + townName + ' (' + label + ') - retornando!');
                    }
                } else {
                    this.console.log('[AutoDodge] Falha ao chamar de volta ' + townName + ' (' + label + '): ' + JSON.stringify(res));
                    uw.$('#dodge_log').text('Falha no recall de ' + townName + ' (' + label + '). Traga manualmente.').css('color', '#f87171');
                }
            }.bind(this),
            function (err) {
                this.console.log('[AutoDodge] Erro de rede no recall de ' + townName + ' (' + label + '): ' + err);
            }.bind(this)
        );
    }

    _sendUnits(fromTownId, toTownId, units) {
        return this._withTownId(fromTownId, () => {
            return new Promise((resolve, reject) => {
                const data = Object.assign(
                    { id: parseInt(toTownId, 10), type: 'support' },
                    units
                );

                uw.gpAjax.ajaxPost('town_info', 'send_units', data, false,
                    function (res) {
                        if (res && res.success !== false) {
                            resolve(res);
                        } else {
                            reject(new Error(res && res.error ? res.error : 'Falha ao enviar tropas'));
                        }
                    },
                    function (r, status, txt) {
                        reject(new Error('Erro de rede: ' + txt));
                    }
                );
            });
        });
    }

    async _withTownId(townId, fn) {
        const orig = uw.Game.townId;
        const origStr = uw.Game.town_id;
        uw.Game.townId = parseInt(townId, 10);
        uw.Game.town_id = parseInt(townId, 10);

        try {
            const result = await fn();
            return result;
        } finally {
            uw.Game.townId = orig;
            uw.Game.town_id = origStr;
        }
    }

    _getTownName(townId) {
        if (!townId) return String(townId);

        const id = parseInt(townId);
        const ids = String(townId);

        try {
            const towns = uw.ITowns && uw.ITowns.towns ? uw.ITowns.towns : {};
            const t1 = towns[id] ? towns[id] : towns[ids];
            if (t1) return t1.getName() + ' (#' + ids + ')';

            const collection = uw.MM.getOnlyCollectionByName('Town');
            const allTowns = collection && collection.models ? collection.models : [];

            for (const t of allTowns) {
                const tid = t.attributes && t.attributes.id ? t.attributes.id : t.id;
                if (parseInt(tid) === id) {
                    const name = t.attributes && t.attributes.name ? t.attributes.name : '?';
                    return name + ' (#' + ids + ')';
                }
            }

            const wmapTowns = uw.WMap && uw.WMap.towns ? uw.WMap.towns : {};
            const wt = wmapTowns[id] ? wmapTowns[id] : wmapTowns[ids];
            if (wt && wt.name) return wt.name + ' (#' + ids + ')';
        } catch (e) {}

        return '#' + ids;
    }
}
