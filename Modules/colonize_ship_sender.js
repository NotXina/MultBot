// ══════════════════════════════════════════════════════
//  MODULE: ColonizeShipSender
//  Envia colonize_ships de todas as cidades como apoio
//  para uma cidade-alvo configurada pelo usuário.
// ══════════════════════════════════════════════════════
class ColonizeShipSender extends ModernUtil {
    constructor(c, s) {
        super(c, s);
        this._running    = false;
        this._stop       = false;
        this._intervalId = null;
        this.config = this.storage.load('css_config', {
            targetTownId:    '',
            intervalMinutes: 5
        });
        this.console.log('[ColonizeShipSender] Initialized');

        // Retoma automaticamente se estava ativo antes do reload
        if (this.storage.load('css_active', false)) {
            setTimeout(() => this.start(), 2000);
        }
    }

    settings = () => {
        const cfg = this.config;
        requestAnimationFrame(() => this._bindEvents());
        return `
        <div class="game_border" style="margin-bottom: 20px;">
            <div class="game_border_top"></div>
            <div class="game_border_bottom"></div>
            <div class="game_border_left"></div>
            <div class="game_border_right"></div>
            <div class="game_border_corner corner1"></div>
            <div class="game_border_corner corner2"></div>
            <div class="game_border_corner corner3"></div>
            <div class="game_border_corner corner4"></div>
            <div class="game_header bold" style="position:relative;">
                <span style="z-index:10;position:relative;">Colonize Ship Sender</span>
                <span class="command_count"></span>
            </div>
            <div style="padding:10px;display:flex;flex-direction:column;gap:10px;">
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <label style="font-weight:bold;font-size:12px;">Cidade destino (ID ou [town]...[/town])</label>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <input id="css_target_town" type="text" placeholder="Ex: 123456"
                            value="${cfg.targetTownId || ''}"
                            style="width:180px;padding:3px 6px;" />
                        ${this.getButtonHtml('css_save_target', 'Salvar', this._saveTarget)}
                    </div>
                    <div id="css_target_status" style="font-size:11px;color:#4ade80;min-height:14px;">
                        ${cfg.targetTownId ? '✓ Destino: ' + this._getTownName(cfg.targetTownId) : ''}
                    </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <label style="font-weight:bold;font-size:12px;">Intervalo entre ciclos (minutos)</label>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <input id="css_interval" type="number" min="1" max="120"
                            value="${cfg.intervalMinutes || 5}"
                            style="width:70px;padding:3px 6px;" />
                        ${this.getButtonHtml('css_save_interval', 'Salvar', this._saveInterval)}
                    </div>
                </div>
                <div style="display:flex;gap:8px;">
                    ${this.getButtonHtml('css_start_btn', '▶ Iniciar', this._startBtn)}
                    ${this.getButtonHtml('css_stop_btn',  '■ Parar',  this._stopBtn)}
                </div>
                <div id="css_status" style="font-size:12px;font-weight:bold;color:#94a3b8;">
                    ${this._running ? '● Rodando' : '○ Parado'}
                </div>

            </div>
        </div>`;
    };

    _bindEvents() {
        uw.$('#css_target_town').off('keydown').on('keydown', e => { if (e.key === 'Enter') this._saveTarget(); });
        uw.$('#css_interval').off('keydown').on('keydown',   e => { if (e.key === 'Enter') this._saveInterval(); });
        this._updateButtons();
    }

    _updateButtons() {
        if (this._running) {
            uw.$('#css_start_btn').addClass('disabled');
            uw.$('#css_stop_btn').removeClass('disabled');
        } else {
            uw.$('#css_start_btn').removeClass('disabled');
            uw.$('#css_stop_btn').addClass('disabled');
        }
        uw.$('#css_status').text(this._running ? '● Rodando' : '○ Parado')
            .css('color', this._running ? '#4ade80' : '#94a3b8');
    }

    _saveTarget = () => {
        const raw = (uw.$('#css_target_town').val() || '').trim();
        const id  = this._parseTownId(raw);
        if (!id) { uw.$('#css_target_status').text('ID inválido.').css('color','#f87171'); return; }
        this.config.targetTownId = id;
        this._saveConfig();
        uw.$('#css_target_status').text('✓ Destino: #' + id).css('color','#4ade80');
        this.console.log('[ColonizeShipSender] Destino salvo: #' + id);
    };

    _saveInterval = () => {
        const val = parseInt(uw.$('#css_interval').val(), 10);
        if (!val || val < 1) { this._log('Intervalo inválido (mínimo 1 minuto).', 'error'); return; }
        this.config.intervalMinutes = val;
        this._saveConfig();
        this._log('Intervalo salvo: ' + val + ' minuto(s).', 'info');
        if (this._running) { this._stopLoop(); this._startLoop(); }
    };

    _startBtn = () => this.start();
    _stopBtn  = () => this.stop();

    start() {
        if (this._running) return;
        if (!this.config.targetTownId) { this._log('Configure a cidade destino antes de iniciar.', 'error'); return; }
        if (!uw.gpAjax || !uw.Game)    { this._log('Jogo não está pronto. Tente novamente.', 'error'); return; }
        this._stop = false;
        this._startLoop();
    }

    stop() {
        this._stop = true;
        this._stopLoop();
        this._log('Loop parado manualmente.', 'warning');
        this._updateButtons();
    }

    _startLoop() {
        this._running = true;
        this._updateButtons();
        this.storage.save('css_active', true);
        this._log('Loop iniciado. Intervalo: ' + this.config.intervalMinutes + ' min.', 'success');
        this._tick();
        const ms = this.config.intervalMinutes * 60 * 1000;
        this._intervalId = setInterval(() => { if (!this._stop) this._tick(); }, ms);
    }

    _stopLoop() {
        if (this._intervalId) { clearInterval(this._intervalId); this._intervalId = null; }
        this._running = false;
        this.storage.save('css_active', false);
    }

    _tick = async () => {
        this._log('Verificando colonize_ships em todas as cidades...', 'info');
        try {
            const townIds = Object.keys(uw.ITowns.towns);
            if (townIds.length === 0) { this._log('Nenhuma cidade encontrada.', 'warning'); return; }

            // Filtra cidades com colonize_ship disponível
            const eligible = townIds.filter(townId =>
                String(townId) !== String(this.config.targetTownId) &&
                this._getColonizeShipCount(townId) > 0
            );

            if (eligible.length === 0) { this._log('Nenhum colonize_ship disponível.', 'info'); return; }

            // Envia em paralelo com pequeno delay entre cada um para não sobrecarregar
            let totalSent = 0;
            const results = await Promise.allSettled(
                eligible.map(async (townId, i) => {
                    await this.sleep(i * 400); // escalonado: 0ms, 400ms, 800ms...
                    if (this._stop) return 0;
                    const count    = this._getColonizeShipCount(townId);
                    const townName = uw.ITowns.towns[townId]?.getName?.() || townId;
                    await this._sendSupport(townId, this.config.targetTownId, count);
                    this._log('✓ ' + townName + ': ' + count + ' navio(s) enviado(s).', 'success');
                    return count;
                })
            );

            for (const r of results) {
                if (r.status === 'fulfilled') totalSent += r.value || 0;
                else this._log('✗ Erro: ' + r.reason?.message, 'error');
            }

            if (totalSent > 0) this._log('Ciclo completo. Total: ' + totalSent + ' navio(s).', 'success');
        } catch (e) {
            this._log('Erro no ciclo: ' + (e?.message ?? e), 'error');
        }
    };

    _getColonizeShipCount(townId) {
        try { return uw.ITowns.towns[townId].units()?.colonize_ship ?? 0; } catch { return 0; }
    }

    _sendSupport(fromTownId, toTownId, count) {
        return this._withTownId(fromTownId, () => new Promise((resolve, reject) => {
            const data = {
                id:            parseInt(toTownId, 10),
                type:          'support',
                colonize_ship: count
            };
            uw.gpAjax.ajaxPost('town_info', 'send_units', data, false,
                res => {
                    if (res && res.success) resolve(res);
                    else reject(new Error(res?.error || 'Failed to send support'));
                },
                (r, status, txt) => reject(new Error('Network error: ' + txt))
            );
        }));
    }

    // Lock global compartilhado — evita conflito de Game.townId entre módulos
    async _withTownId(townId, fn) {
        while (window.__gp_townId_lock) {
            await new Promise(r => setTimeout(r, 50));
        }
        window.__gp_townId_lock = true;
        const orig    = uw.Game.townId;
        const origStr = uw.Game.town_id;
        try {
            uw.Game.townId  = parseInt(townId, 10);
            uw.Game.town_id = parseInt(townId, 10);
            return await fn();
        } finally {
            uw.Game.townId  = orig;
            uw.Game.town_id = origStr;
            window.__gp_townId_lock = false;
        }
    }

    _getTownName(townId) {
        if (!townId) return '';
        try {
            // Tenta achar nas cidades do mapa (todas, não só as do jogador)
            const allTowns = uw.MM.getOnlyCollectionByName('Town').models;
            for (const t of allTowns) {
                if (String(t.attributes.id ?? t.id) === String(townId)) {
                    return (t.attributes.name ?? '') + ' (#' + townId + ')';
                }
            }
        } catch(e) {}
        return '#' + townId;
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

    _saveConfig() { this.storage.save('css_config', this.config); }

    _log(message, type = 'info') {
        this.console.log('[ColonizeShipSender] ' + message);
    }
}
