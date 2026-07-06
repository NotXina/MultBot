// ══════════════════════════════════════════════════════
//  MODULE: AutoAttack
//  Monitora uma cidade atacante e, assim que a quantidade
//  configurada de uma unidade estiver disponivel, dispara
//  ataques automaticamente para uma ou mais cidades-alvo.
//  Reutiliza o mesmo padrao de envio (send_units) e roteamento
//  terrestre/naval ja validados no AutoDodge.
// ══════════════════════════════════════════════════════
class AutoAttack extends ModernUtil {
    CHECK_INTERVAL_MS = 20000;
    SEND_DELAY_MS = 800;

    constructor(c, s) {
        super(c, s);
        this._active = false;
        this._intervalId = null;
        this._plans = this.storage.load('attack_plans', []);

        if (this.storage.load('attack_active', false)) {
            setTimeout(() => this.start(), 2000);
        }
    }

    settings = () => {
        requestAnimationFrame(() => {
            this._updateTitle();
            this._renderPlans();
        });

        return (
            '<div class="game_border" style="margin-bottom:20px;">' +
            '<div class="game_border_top"></div><div class="game_border_bottom"></div>' +
            '<div class="game_border_left"></div><div class="game_border_right"></div>' +
            '<div class="game_border_corner corner1"></div><div class="game_border_corner corner2"></div>' +
            '<div class="game_border_corner corner3"></div><div class="game_border_corner corner4"></div>' +
            this.getTitleHtml('attack_title', 'Auto Ataque', this.toggle, '', this._active) +
            '<div style="padding:5px 10px;font-weight:bold;">' +
            'Ataca automaticamente assim que a quantidade configurada da unidade estiver disponivel na cidade. Verifica a cada 20s.' +
            '</div>' +

            '<div style="padding:8px 10px; border-top:1px solid rgba(0,0,0,0.1);">' +
            '<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">' +

            '<div>' +
            '<label style="font-size:11px;font-weight:bold;">Cidade Atacante (ID)</label><br>' +
            '<input type="text" id="attack_origin_id" placeholder="ex: 5342" style="width:100px;padding:3px;">' +
            '</div>' +

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

            '</div>' +

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

    /* Gera as opcoes do dropdown a partir do GameData.units real do
       jogo (funciona em qualquer mundo, ja que le direto do cliente).
       Militia fica de fora, pois nao pode ser enviada em ataque. */
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

    /* Adiciona um novo plano a partir dos campos preenchidos. Faz
       validacao basica antes de aceitar. */
    addPlan = () => {
        const originId = (uw.$('#attack_origin_id').val() || '').trim();
        const unit = uw.$('#attack_unit_select').val();
        const qty = parseInt(uw.$('#attack_qty').val(), 10);
        const targetsRaw = (uw.$('#attack_targets').val() || '').trim();

        if (!originId || !/^\d+$/.test(originId)) {
            this.console.log('[AutoAttack] Erro: ID da cidade atacante invalido.');
            uw.$('#attack_log').text('Erro: informe um ID de cidade atacante valido.').css('color', '#f87171');
            return;
        }
        if (!unit) {
            this.console.log('[AutoAttack] Erro: nenhuma unidade selecionada.');
            uw.$('#attack_log').text('Erro: selecione uma unidade.').css('color', '#f87171');
            return;
        }
        if (!qty || qty <= 0) {
            this.console.log('[AutoAttack] Erro: quantidade invalida.');
            uw.$('#attack_log').text('Erro: informe uma quantidade valida.').css('color', '#f87171');
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

        const isNaval = !!uw.GameData.units[unit]?.is_naval;
        const plan = {
            id: Date.now() + '_' + Math.floor(Math.random() * 10000),
            originId: originId,
            unit: unit,
            isNaval: isNaval,
            quantity: qty,
            targets: targets,
            enabled: true,
        };

        this._plans.push(plan);
        this.storage.save('attack_plans', this._plans);
        this._renderPlans();

        uw.$('#attack_origin_id').val('');
        uw.$('#attack_qty').val('');
        uw.$('#attack_targets').val('');
        uw.$('#attack_unit_select').val('');

        this.console.log('[AutoAttack] Plano adicionado: cidade #' + originId + ', ' + qty + 'x ' + unit + ' -> ' + targets.length + ' alvo(s).');
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
            const townName = this._getTownName(plan.originId);
            const typeLabel = plan.isNaval ? 'naval' : 'terrestre';
            const targetsLabel = plan.targets.map(t => this._getTownName(t)).join(', ');

            html += (
                '<div style="display:flex;justify-content:space-between;align-items:center;' +
                'padding:4px 6px;border-bottom:1px solid rgba(0,0,0,0.08);font-size:11px;">' +
                '<div>' +
                '<b>' + townName + '</b> &rarr; ' + plan.quantity + 'x ' + plan.unit + ' (' + typeLabel + ') &rarr; ' + targetsLabel +
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

    async _checkAndFire(plan) {
        try {
            const town = uw.ITowns.towns[plan.originId];
            if (!town) {
                this.console.log('[AutoAttack] Aviso: cidade #' + plan.originId + ' nao encontrada (nao e sua ou saiu do cache).');
                return;
            }

            const units = town.units();
            const available = units[plan.unit] || 0;

            if (available < plan.quantity) {
                return; // ainda nao tem o suficiente, tenta de novo no proximo tick
            }

            const townName = town.getName ? town.getName() : ('#' + plan.originId);
            this.console.log('[AutoAttack] ' + townName + ': ' + available + 'x ' + plan.unit + ' disponivel (precisa ' + plan.quantity + '). Disparando ataques...');

            let remaining = available;

            for (const targetId of plan.targets) {
                if (remaining < plan.quantity) {
                    this.console.log('[AutoAttack] ' + townName + ': quantidade insuficiente para continuar (restam ' + remaining + ').');
                    break;
                }

                const targetName = this._getTownName(targetId);
                try {
                    await this._sendAttack(plan.originId, targetId, plan.unit, plan.quantity);
                    this.console.log('[AutoAttack] ✓ ' + townName + ' -> ' + targetName + ': ataque com ' + plan.quantity + 'x ' + plan.unit + ' enviado!');
                    uw.$('#attack_log').text('✓ ' + townName + ' atacou ' + targetName + ' (' + plan.quantity + 'x ' + plan.unit + ')').css('color', '#1a6b2a');
                    if (uw.HumanMessage) uw.HumanMessage.success('MultBot: ' + townName + ' -> ' + targetName + ' (ataque)');
                    remaining -= plan.quantity;
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

    /* Envia o ataque via town_info/send_units com type "attack" - mesmo
       endpoint ja validado no AutoDodge (que usa type "support"). */
    _sendAttack(fromTownId, toTownId, unit, quantity) {
        return this._withTownId(fromTownId, () => new Promise((resolve, reject) => {
            const data = {
                id: parseInt(toTownId, 10),
                type: 'attack',
                nl_init: true,
            };
            data[unit] = quantity;

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
