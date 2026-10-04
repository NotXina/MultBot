#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const assert = (condition, message) => {
    if (!condition) failures.push(message);
};

const indexCode = read('index.js');
const manifestMatch = indexCode.match(/const MODULES = \[([\s\S]*?)\n\s*\];/);
assert(manifestMatch, 'Não foi possível localizar MODULES em index.js.');

const modules = manifestMatch
    ? [...manifestMatch[1].matchAll(/['"]([^'"]+\.js)['"]/g)].map(match => match[1])
    : [];

assert(modules.length > 0, 'O manifesto de módulos está vazio.');
assert(modules[0] === 'core.js', 'core.js deve ser o primeiro módulo.');
assert(modules.at(-1) === 'multbot.js', 'multbot.js deve ser o último módulo.');
assert(new Set(modules).size === modules.length, 'Há módulos duplicados no manifesto.');

for (const moduleName of modules) {
    assert(fs.existsSync(path.join(root, 'Modules', moduleName)), `Módulo ausente: Modules/${moduleName}`);
}
const moduleFiles = fs.readdirSync(path.join(root, 'Modules')).filter(file => file.endsWith('.js'));
for (const moduleName of moduleFiles) {
    assert(modules.includes(moduleName), `Módulo órfão fora do manifesto: Modules/${moduleName}`);
}

// Valida a sintaxe da mesma concatenação feita pelo loader em produção.
try {
    const bundle = modules.map(moduleName => read(`Modules/${moduleName}`)).join('\n\n');
    // eslint-disable-next-line no-new-func
    new Function(`(function () {\n${bundle}\n})();`);
} catch (error) {
    failures.push(`Bundle inválido: ${error.message}`);
}

try {
    // eslint-disable-next-line no-new-func
    new Function(indexCode);
} catch (error) {
    failures.push(`index.js inválido: ${error.message}`);
}

// Toda chave literal usada por this.t()/multT() deve existir nos dois idiomas.
const coreCode = read('Modules/core.js');
const englishMatch = coreCode.match(/\n\ten: \{([\s\S]*?)\n\t\},\n\tpt: \{/);
const portugueseMatch = coreCode.match(/\n\tpt: \{([\s\S]*?)\n\t\},\n\};/);
assert(englishMatch && portugueseMatch, 'Não foi possível localizar os dicionários en/pt.');

const dictionaryKeys = (block) => new Set(
    [...block.matchAll(/^\s*([A-Za-z0-9_]+):/gm)].map(match => match[1])
);

if (englishMatch && portugueseMatch) {
    const en = dictionaryKeys(englishMatch[1]);
    const pt = dictionaryKeys(portugueseMatch[1]);
    const used = new Set();

    for (const moduleName of modules) {
        const code = read(`Modules/${moduleName}`);
        for (const match of code.matchAll(/(?:this\.t|multT)\(\s*['"]([^'"]+)['"]/g)) {
            used.add(match[1]);
        }
    }

    for (const key of used) {
        assert(en.has(key), `Tradução inglesa ausente: ${key}`);
        assert(pt.has(key), `Tradução portuguesa ausente: ${key}`);
    }
    for (const key of en) assert(pt.has(key), `Chave presente apenas em en: ${key}`);
    for (const key of pt) assert(en.has(key), `Chave presente apenas em pt: ${key}`);
}

// send_units deve receber a origem explicitamente; alterar Game.townId cria
// condição de corrida entre módulos e com a navegação do usuário.
for (const moduleName of ['auto_attack.js', 'auto_dodge.js', 'colonize_ship_sender.js']) {
    const code = read(`Modules/${moduleName}`);
    assert(!/uw\.Game\.town(?:Id|_id)\s*=/.test(code), `${moduleName} ainda altera Game.townId globalmente.`);
}

if (failures.length > 0) {
    console.error(`Falha na validação (${failures.length}):`);
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
}

console.log(`OK: ${modules.length} módulos, bundle válido e traduções en/pt completas.`);
