#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const storage = { load: (_key, fallback) => fallback, save: () => true };
const botConsole = { log: () => {} };

function loadModule(moduleName) {
    class FakeDate extends Date {}

    const context = {
        MultUtil: class {
            constructor(console, moduleStorage) {
                this.console = console;
                this.storage = moduleStorage;
            }
            createGuardedInterval() { return 1; }
            t(key) { return key; }
            getTownName(id) { return `#${id}`; }
            sleep() { return Promise.resolve(); }
            isSleeping() { return false; }
        },
        window: { __multbot_captcha_active: false },
        uw: {
            Game: { townId: 99, town_id: 99 },
            ITowns: { towns: {} },
            $: () => ({ text() { return this; }, css() { return this; } }),
        },
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        Date: FakeDate,
        Math,
        Map,
        Set,
        Object,
        String,
        parseInt,
    };

    vm.createContext(context);
    const code = fs.readFileSync(path.join(root, 'Modules', moduleName), 'utf8');
    vm.runInContext(code, context, { filename: moduleName });
    return context;
}

async function testDodgeUsesWholeWave() {
    const context = loadModule('auto_dodge.js');
    const dodge = new context.AutoDodge(botConsole, storage);
    context.uw.ITowns.towns[1] = {};
    context.Date.now = () => 1_000_000;
    dodge._getIncomingAttacks = () => [
        { target_town_id: 1, arrival_at: 1100, type: 'attack' },
        { target_town_id: 1, arrival_at: 1200, type: 'attack' },
    ];

    await dodge._tick();
    const scheduled = dodge._scheduledEvac.get('1');
    assert.ok(scheduled, 'Auto Dodge deveria agendar a cidade atacada.');
    assert.equal(scheduled.fireAt, 1_085_000, 'A saída deve usar o primeiro ataque menos 15s.');
    assert.equal(scheduled.lastArrival, 1200, 'O retorno deve considerar o último ataque.');
    clearTimeout(scheduled.timeoutId);
}

function testMilitiaReschedulesForEarlierAttack() {
    const context = loadModule('auto_militia.js');
    const militia = new context.AutoMilitia(botConsole, storage);
    context.uw.ITowns.towns[1] = { getName: () => 'Town' };
    context.Date.now = () => 1_000_000;

    militia._scheduleMilitia('1', 1200);
    const later = militia._scheduled.get('1');
    militia._scheduleMilitia('1', 1100);
    const earlier = militia._scheduled.get('1');

    assert.ok(earlier.fireAt < later.fireAt, 'Um ataque anterior deve antecipar a milícia.');
    clearTimeout(earlier.timeoutId);
}

async function testMilitiaRetriesAfterFailedActivation() {
    const context = loadModule('auto_militia.js');
    let scheduledCallback = null;
    context.setTimeout = (callback) => {
        scheduledCallback = callback;
        return 1;
    };
    context.uw.ITowns.towns[1] = { getName: () => 'Town' };
    const militia = new context.AutoMilitia(botConsole, storage);
    militia._activateMilitia = async () => false;

    militia._scheduleMilitia('1', Math.floor(Date.now() / 1000) + 30);
    assert.equal(typeof scheduledCallback, 'function', 'Auto Militia deve agendar a ativação.');
    await scheduledCallback();
    assert.equal(
        militia._activatedTowns.has('1'),
        false,
        'Falha ao ativar deve liberar a cidade para uma nova tentativa.'
    );
}

function testAutoHideRestoresActiveState() {
    const context = loadModule('auto_hide.js');
    let deferredStart = null;
    context.setTimeout = (callback) => {
        deferredStart = callback;
        return 1;
    };
    const savedStorage = {
        load: (key, fallback) => key === 'autohide_active' ? true : fallback,
        save: () => true,
    };

    const autoHide = new context.AutoHide(botConsole, savedStorage);
    assert.equal(autoHide._active, false, 'Auto Hide deve aguardar start() antes de marcar o estado ativo.');
    assert.equal(typeof deferredStart, 'function', 'Auto Hide deve reagendar o estado salvo.');
    deferredStart();
    assert.equal(autoHide._active, true, 'Auto Hide deve restaurar o estado ativo salvo.');
    autoHide.stop();
}

async function testDodgePersistsRecallAcrossTransientFailure() {
    const context = loadModule('auto_dodge.js');
    const state = {};
    const mutableStorage = {
        load: (key, fallback) => Object.prototype.hasOwnProperty.call(state, key) ? state[key] : fallback,
        save: (key, value) => { state[key] = value; return true; },
    };
    const dodge = new context.AutoDodge(botConsole, mutableStorage);
    context.setTimeout = () => 1;
    const entry = { townId: '1', townName: 'Town', commandId: '77', label: 'land', dueAt: Date.now() };
    dodge._savePendingRecall('1:land', entry);
    dodge.ajaxPostWithTimeout = async () => { throw new Error('offline'); };

    await dodge._executePendingRecall('1:land', entry);
    assert.ok(state.dodge_pending_recalls['1:land'], 'Falha de rede não deve apagar um recall pendente.');

    dodge.ajaxPostWithTimeout = async () => ({});
    await dodge._executePendingRecall('1:land', state.dodge_pending_recalls['1:land']);
    assert.equal(state.dodge_pending_recalls['1:land'], undefined, 'Resposta do servidor deve concluir o recall persistido.');
}

async function testSendUnitsUsesExplicitOrigin() {
    const cases = [
        { file: 'auto_attack.js', className: 'AutoAttack', method: '_sendAttack', args: [10, 20, [{ unit: 'sword', quantity: 5 }], null] },
        { file: 'auto_dodge.js', className: 'AutoDodge', method: '_sendUnits', args: [10, 20, { sword: 5 }] },
        { file: 'colonize_ship_sender.js', className: 'ColonizeShipSender', method: '_sendSupport', args: [10, 20, 1] },
    ];

    for (const testCase of cases) {
        const context = loadModule(testCase.file);
        const instance = new context[testCase.className](botConsole, storage);
        let captured;
        instance.ajaxPostWithTimeout = async (_endpoint, _action, data) => {
            captured = data;
            return {};
        };

        await instance[testCase.method](...testCase.args);
        assert.equal(captured.town_id, 10, `${testCase.file} deve enviar town_id de origem.`);
        assert.equal(captured.id, 20, `${testCase.file} deve enviar o id de destino.`);
        assert.equal(context.uw.Game.townId, 99, `${testCase.file} não deve trocar Game.townId.`);
        assert.equal(context.uw.Game.town_id, 99, `${testCase.file} não deve trocar Game.town_id.`);
    }
}

(async () => {
    await testDodgeUsesWholeWave();
    await testDodgePersistsRecallAcrossTransientFailure();
    testMilitiaReschedulesForEarlierAttack();
    await testMilitiaRetriesAfterFailedActivation();
    testAutoHideRestoresActiveState();
    await testSendUnitsUsesExplicitOrigin();
    console.log('OK: testes comportamentais de defesa, persistência e envio passaram.');
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
