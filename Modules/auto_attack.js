// ══════════════════════════════════════════════════════
//  MODULE: AutoAttack
//  Monitora uma cidade atacante e, assim que TODAS as
//  quantidades configuradas de uma composicao de unidades
//  estiverem disponiveis, dispara ataques automaticamente
//  para uma ou mais cidades-alvo, com a composicao completa
//  em um unico envio. Reutiliza o mesmo padrao de envio
//  (send_units) ja validado no AutoDodge.
//
//  BUGFIX: planos salvos ANTES da versao com multiplas
//  unidades usavam o formato antigo (plan.unit + plan.quantity,
//  no singular). Ao carregar, migramos automaticamente qualquer
//  plano nesse formato para o novo (plan.units, array), evitando
//  o erro "plan.units is undefined" e preservando planos ja
//  configurados.
// ══════════════════════════════════════════════════════
class AutoAttack extends ModernUtil {
    CHECK_INTERVAL_MS = 20000;
    SEND_DELAY_MS = 800;

    constructor(c, s) {
        super(c, s);
        this._active = false;
        this._intervalId = null;
        this._plans = this.storage.load('attack_plans', []);
        this._stagingUnits = [];

        this._migrateOldPlans();

        if (this.storage.load('attack_active', false)) {
            setTimeout(() => this.start(), 2000);
        }
    }

    /* Converte planos salvos no formato antigo (unit + quantity,
       no singular) para o formato novo (units, array). Roda uma
       unica vez na inicializacao, e salva de volta se algo mudou. */
    _migrateOldPlans() {
        let changed = false;

        this._plans = this._plans.map(plan => {
            if (Array.isArray(plan.units)) return plan; // ja esta no formato novo

            if (plan.unit) {
                changed = true;
                const migrated = {
                    id: plan.id,
                    originId: plan.originId,
                    units: [{
                        unit: plan.unit,
                        quantity: plan.quantity,
                        isNaval: !!plan.isNaval,
                    }],
                    targets: plan.targets || [],
                    enabled: plan.enabled !== false,
                };
                this.console.log('[AutoAttack] Plano antigo migrado: cidade #' + plan.originId + ' (' + plan.unit + ' x' + plan.quantity + ').');
                return migrated;
            }

            // Plano corrompido/sem unit nem units - remove com log de aviso
            changed = true;
            this.console.log('[AutoAttack] Aviso: plano invalido removido (sem unidades definidas): ' + JSON.stringify(plan));
            return null;
        }).filter(p => p !== null);

        if (changed) {
            this.storage.save('attack_plans', this._plans);
        }
    }

    settings = () => {
        requestAnimationFrame(() => {
            this._updateTitle();
            this._renderPlans();
            this._renderStagingUnits();
        });

        return (
            '<div class="game_border" style="margin-bottom:20px;">' +
            '<div class="game_border_top"></div><div class="game_border_bottom"></div>' +
            '<div class="game_border_left"></div><div class="game_border_right"></div>' +
            '<div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>' +
            '<div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>' +
            this.getTitleHtml('attack_title', 'Auto Ataque', this.toggle, '', this._active) +
            '<div style="padding:5px 10px;font-weight:bold;">' +
            'Ataca automaticamente assim que TODA a composicao configurada estiver disponivel na cidade. Verifica a cada 20s.' +
            '</div>' +

            '<div style="padding:8px 10px; border-top:1px solid rgba(0,0,0,0.1);">' +

            '<div>' +
            '<label style="font-size:11px;font-weight:bold;">Cidade Atacante</label><br>' +
            '<select id="attack_origin_select" style="width:220px;padding:3px;">' +
            this._getTownOptionsHtml() +
            '</select>' +
            '</div>' +

            '<div style="margin-top:8px;font-weight:bold;font-size:12px;">Composicao do ataque</div>' +
            '<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-top:4px;">' +

            '<div>' +
            '<label style="font-size:11px;font-weight:bold;">Unidade</label><br>' +
            '<select id="attack_unit_select" style="width:160px;padding:3px;">' +
            this._getUnitOptionsHtml() +
            '</select>' +
            '</div>' +

            '<div>' +
            '<label style="font-size:11px;font-weight:bold;">Quantidade</label><br>' +
            '<input type="number" id="attack_qty" min="1" placeholder="ex: 100" style="width:80px;padding:3px;">' +
            '</div>' +

            '<div>' +
            this.getButtonHtml('attack_add_unit_btn', '+ Add Unidade', this.addUnitToStaging) +
            '</div>' +

            '</div>' +

            '<div id="attack_staging_list" style="padding:6px 0;font-size:11px;"></div>' +

            '<div style="margin-top:6px;">' +
            '<label style="font-size:11px;font-weight:bold;">Cidades-alvo (uma por linha, ou separadas por virgula)</label><br>' +
            '<textarea id="attack_targets" rows="2" style="width:100%;padding:4px;" placeholder="ex: 12345, 67890"></textarea>' +
            '</div>' +

            '<div style="margin-top:6px;">' +
            this.getButtonHtml('attack_add_plan_btn', '+ Adicionar Plano', this.addPlan) +
            '</div>' +
            '</div>' +

            '<div id="attack_plans_list" style="padding:8px 10px; border-top:1px solid rgba(0,0,0,0.1);"></div>' +
            '<div id="attack_log" style="padding:2px 10px 8px;font-size:11px;color:#5a3a0a;min-height:16px;"></div>' +
            '</div>'
        );
    };

    /* Gera as opcoes do dropdown de cidade atacante, a partir de
       uw.ITowns.towns (suas proprias cidades), ordenadas por nome. */
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
                html += '<option value="' + id + '">' + name + ' (#' + id + ')</option>';
            });
            return html;
        } catch (e) {
            return '<option value="">Erro ao carregar cidades</option>';
        }
    }

    /* Gera as opcoes do dropdown a partir do GameData.units real do
       jogo. Militia fica de fora, pois nao pode ser enviada em ataque. */
    _getUnitOptionsHtml() {
        try {
            const units = uw.GameData.units;
            const keys = Object.keys(units).filter(u => u !== 'militia');

            let html = '<option value="">Selecione...</option>';
            keys.forEach(key => {
                const isNaval = !!units[key].is_naval;
                const label = key + (isNaval ? ' (naval)' : ' (terrestre)');
                html += '<option value="' + key + '">' + label + '</option>';
            });
            return html;
        } catch (e) {
            return '<option value="">Erro ao carregar unidades</option>';
        }
    }

    /* Adiciona uma unidade+quantidade a lista temporaria (staging)
       que sera usada para montar o plano. Se a unidade ja estiver
       na lista, soma a quantidade em vez de duplicar a linha. */
    addUnitToStaging = () => {
        const unit = uw.$('#attack_unit_select').val();
        const qty = parseInt(uw.$('#attack_qty').val(), 10);

        if (!unit) {
            this.console.log('[AutoAttack] Erro: selecione uma unidade antes de adicionar.');
            uw.$('#attack_log').text('Erro: selecione uma unidade.').css('color', '#f87171');
            return;
        }
        if (!qty || qty <= 0) {
            this.console.log('[AutoAttack] Erro: quantidade invalida.');
            uw.$('#attack_log').text('Erro: informe uma quantidade valida.').css('color', '#f87171');
            return;
        }

        const isNaval = !!uw.GameData.units[unit]?.is_naval;
        const existing = this._stagingUnits.find(u => u.unit === unit);

        if (existing) {
            existing.quantity += qty;
        } else {
            this._stagingUnits.push({ unit: unit, quantity: qty, isNaval: isNaval });
        }

        uw.$('#attack_qty').val('');
        uw.$('#attack_unit_select').val('');

        this._renderStagingUnits();
        this.console.log('[AutoAttack] Unidade adicionada a composicao: ' + qty + 'x ' + unit);
    };

    removeStagingUnit = (unit) => {
        this._stagingUnits = this._stagingUnits.filter(u => u.unit !== unit);
        this._renderStagingUnits();
    };

    _renderStagingUnits() {
        const container = uw.$('#attack_staging_list');
        if (!container.length) return;

        if (this._stagingUnits.length === 0) {
            container.html('<span style="color:#7a5c2a;">Nenhuma unidade adicionada ainda a esta composicao.</span>');
            return;
        }

        let html = '<div style="font-weight:bold;margin-bottom:4px;">Composicao atual:</div>';
        this._stagingUnits.forEach(u => {
            const typeLabel = u.isNaval ? 'naval' : 'terrestre';
            html += (
                '<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 4px;">' +
                '<span>' + u.quantity + 'x ' + u.unit + ' (' + typeLabel + ')</span>' +
                '<span onclick="window.modernBot.autoAttack.removeStagingUnit(\'' + u.unit + '\')" style="cursor:pointer;color:#f87171;font-weight:bold;padding:0 6px;">✕</span>' +
                '</div>'
            );
        });
        container.html(html);
    }

    toggle = () => {
        if (this._active) this.stop();
        else this.start();
    };

    start() {
        if (this._active) return;
        this._active = true;
        this.storage.save('attack_active', true);
        this._updateTitle();
        this.console.log('[AutoAttack] Iniciado. Monitorando planos de ataque...');
        this._tick();
        this._intervalId = setInterval(() => this._tick(), this.CHECK_INTERVAL_MS);
    }

    stop() {
        this._active = false;
        this.storage.save('attack_active', false);
        if (this._intervalId) { clearInterval(this._intervalId); this._intervalId = null; }
        this._updateTitle();
        this.console.log('[AutoAttack] Parado.');
    }

    _updateTitle() {
        uw.$('#attack_title').css('filter', this._active
            ? 'brightness(100%) saturate(186%) hue-rotate(241deg)' : '');
    }

    /* Adiciona um novo plano usando a composicao montada em
       _stagingUnits + a cidade atacante + as cidades-alvo. */
    addPlan = () => {
        const originId = (uw.$('#attack_origin_select').val() || '').trim();
        const targetsRaw = (uw.$('#attack_targets').val() || '').trim();

        if (!originId) {
            this.console.log('[AutoAttack] Erro: nenhuma cidade atacante selecionada.');
            uw.$('#attack_log').text('Erro: selecione uma cidade atacante.').css('color', '#f87171');
            return;
        }
        if (this._stagingUnits.length === 0) {
            this.console.log('[AutoAttack] Erro: adicione ao menos uma unidade a composicao.');
            uw.$('#attack_log').text('Erro: adicione ao menos uma unidade.').css('color', '#f87171');
            return;
        }

        const targets = targetsRaw
            .split(/[\n,]+/)
            .map(t => t.trim())
            .filter(t => /^\d+$/.test(t));

        if (targets.length === 0) {
            this.console.log('[AutoAttack] Erro: nenhuma cidade-alvo valida informada.');
            uw.$('#attack_log').text('Erro: informe pelo menos uma cidade-alvo valida.').css('color', '#f87171');
            return;
        }

        const plan = {
            id: Date.now() + '_' + Math.floor(Math.random() * 10000),
            originId: originId,
            units: this._stagingUnits.map(u => ({ ...u })),
            targets: targets,
            enabled: true,
        };

        this._plans.push(plan);
        this.storage.save('attack_plans', this._plans);
        this._renderPlans();

        this._stagingUnits = [];
        this._renderStagingUnits();
        uw.$('#attack_origin_select').val('');
        uw.$('#attack_targets').val('');

        const originName = uw.ITowns.towns[originId]?.getName ? uw.ITowns.towns[originId].getName() : ('#' + originId);
        const unitsSummary = plan.units.map(u => u.quantity + 'x ' + u.unit).join(', ');
        this.console.log('[AutoAttack] Plano adicionado: ' + originName + ' [' + unitsSummary + '] -> ' + targets.length + ' alvo(s).');
        uw.$('#attack_log').text('Plano adicionado com sucesso!').css('color', '#1a6b2a');
    };

    removePlan = (planId) => {
        this._plans = this._plans.filter(p => p.id !== planId);
        this.storage.save('attack_plans', this._plans);
        this._renderPlans();
        this.console.log('[AutoAttack] Plano removido.');
    };

    _renderPlans() {
        const container = uw.$('#attack_plans_list');
        if (!container.length) return;

        if (this._plans.length === 0) {
            container.html('<span style="font-size:11px;color:#7a5c2a;">Nenhum plano configurado.</span>');
            return;
        }

        let html = '<div style="font-weight:bold;font-size:12px;margin-bottom:6px;">Planos ativos:</div>';

        this._plans.forEach(plan => {
            if (!Array.isArray(plan.units)) return; // seguranca extra, nunca deveria acontecer apos migracao

            const townName = this._getTownName(plan.originId);
            const unitsLabel = plan.units.map(u => u.quantity + 'x ' + u.unit).join(', ');
            const targetsLabel = plan.targets.map(t => this._getTownName(t)).join(', ');

            html += (
                '<div style="display:flex;justify-content:space-between;align-items:center;' +
                'padding:4px 6px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:11px;">' +
                '<div>' +
                '<b>' + townName + '</b> [' + unitsLabel + '] &rarr; ' + targetsLabel +
                '</div>' +
                '<div class="button_new" onclick="window.modernBot.autoAttack.removePlan(\'' + plan.id + '\')" style="cursor:pointer;margin:0;padding:0 6px;">' +
                '<div class="left"></div><div class="right"></div>' +
                '<div class="caption js-caption">Remover<div class="effect js-effect"></div></div>' +
                '</div>' +
                '</div>'
            );
        });

        container.html(html);
    }

    _tick() {
        if (window.__multbot_captcha_active) return;
        if (this._plans.length === 0) return;

        this._plans.forEach(plan => {
            if (!plan.enabled) return;
            this._checkAndFire(plan);
        });
    }

    /* So dispara quando TODAS as unidades da composicao tiverem a
       quantidade configurada disponivel simultaneamente na cidade.
       Guard extra: se por algum motivo plan.units nao for um array
       (nunca deveria acontecer apos a migracao), loga aviso e sai
       sem quebrar o loop dos outros planos. */
    async _checkAndFire(plan) {
        try {
            if (!Array.isArray(plan.units) || plan.units.length === 0) {
                this.console.log('[AutoAttack] Aviso: plano da cidade #' + plan.originId + ' sem composicao valida, ignorado.');
                return;
            }

            const town = uw.ITowns.towns[plan.originId];
            if (!town) {
                this.console.log('[AutoAttack] Aviso: cidade #' + plan.originId + ' nao encontrada (nao e sua ou saiu do cache).');
                return;
            }

            const available = town.units();

            const missing = plan.units.filter(u => (available[u.unit] || 0) < u.quantity);
            if (missing.length > 0) {
                return; // ainda falta pelo menos uma unidade da composicao
            }

            const townName = town.getName ? town.getName() : ('#' + plan.originId);
            const unitsSummary = plan.units.map(u => u.quantity + 'x ' + u.unit).join(', ');
            this.console.log('[AutoAttack] ' + townName + ': composicao completa disponivel [' + unitsSummary + ']. Disparando ataques...');

            const remaining = {};
            plan.units.forEach(u => { remaining[u.unit] = available[u.unit] || 0; });

            for (const targetId of plan.targets) {
                const stillEnough = plan.units.every(u => remaining[u.unit] >= u.quantity);
                if (!stillEnough) {
                    this.console.log('[AutoAttack] ' + townName + ': composicao insuficiente para continuar aos proximos alvos.');
                    break;
                }

                const targetName = this._getTownName(targetId);
                try {
                    await this._sendAttack(plan.originId, targetId, plan.units);
                    this.console.log('[AutoAttack] ✓ ' + townName + ' -> ' + targetName + ': ataque com [' + unitsSummary + '] enviado!');
                    uw.$('#attack_log').text('✓ ' + townName + ' atacou ' + targetName + ' [' + unitsSummary + ']').css('color', '#1a6b2a');
                    if (uw.HumanMessage) uw.HumanMessage.success('MultBot: ' + townName + ' -> ' + targetName + ' (ataque)');

                    plan.units.forEach(u => { remaining[u.unit] -= u.quantity; });
                } catch (e) {
                    const msg = e && e.message ? e.message : e;
                    this.console.log('[AutoAttack] ✗ Falha ao atacar ' + targetName + ' de ' + townName + ': ' + msg);
                    uw.$('#attack_log').text('✗ Falha ao atacar ' + targetName + ': ' + msg).css('color', '#f87171');
                }

                await this.sleep(this.SEND_DELAY_MS);
            }
        } catch (e) {
            const msg = e && e.message ? e.message : e;
            this.console.log('[AutoAttack] Erro ao processar plano da cidade #' + plan.originId + ': ' + msg);
        }
    }

    /* Envia o ataque via town_info/send_units com type "attack",
       incluindo TODAS as unidades da composicao num unico payload. */
    _sendAttack(fromTownId, toTownId, unitsList) {
        return this._withTownId(fromTownId, () => new Promise((resolve, reject) => {
            const data = {
                id: parseInt(toTownId, 10),
                type: 'attack',
                nl_init: true,
            };

            unitsList.forEach(u => {
                data[u.unit] = u.quantity;
            });

            uw.gpAjax.ajaxPost('town_info', 'send_units', data, false,
                res => {
                    if (res && res.success !== false) {
                        resolve(res);
                    } else {
                        reject(new Error('Servidor recusou: ' + JSON.stringify(res)));
                    }
                },
                (r, status, txt) => {
                    reject(new Error('Erro de rede: ' + txt));
                }
            );
        }));
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
            if (t1 && typeof t1.getName === 'function') return t1.getName() + ' (#' + ids + ')';

            const wmapTowns = uw.WMap && uw.WMap.towns ? uw.WMap.towns : {};
            const wt = wmapTowns[id] ? wmapTowns[id] : wmapTowns[ids];
            if (wt && wt.name) return wt.name + ' (#' + ids + ')';
        } catch (e) {}

        return '#' + ids;
    }
}
