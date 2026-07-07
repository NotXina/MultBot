// Testa a sintaxe de cada módulo individualmente, sem executar nada,
// e aponta exatamente qual arquivo tem erro e onde
(async function () {
    const BASE_URL = 'https://raw.githubusercontent.com/NotXina/MultBot/main/Modules';
    const MODULES = [
        'core.js', 'anti_rage.js', 'auto_bootcamp.js', 'auto_build.js',
        'auto_farm.js', 'auto_gratis.js', 'auto_hide.js', 'auto_party.js',
        'auto_rural_level.js', 'auto_rural_trade.js', 'auto_trade.js',
        'auto_train.js', 'status.js', 'auto_militia.js', 'auto_dodge.js',
        'auto_attack.js', 'auto_ares_sacrifice.js', 'auto_research.js',
        'auto_send_resources.js', 'colonize_ship_sender.js',
        'mult_tools.js', 'multbot.js',
    ];

    console.log('%c===== Validando sintaxe de cada módulo =====', 'color: cyan; font-weight: bold; font-size: 13px;');

    for (const mod of MODULES) {
        try {
            const res = await fetch(`${BASE_URL}/${mod}?_=${Date.now()}`, { cache: 'no-store' });
            const text = await res.text();

            try {
                new Function(text);
                console.log(`✓ ${mod} — sintaxe OK`);
            } catch (syntaxErr) {
                console.log(`%c✗ ERRO DE SINTAXE em ${mod}:`, 'color: red; font-weight: bold; font-size: 13px;');
                console.log(`  ${syntaxErr.message}`);
                console.log(syntaxErr);
            }
        } catch (e) {
            console.log(`✗ Erro ao baixar ${mod}: ${e.message}`);
        }
    }

    console.log('%c===== Validação completa =====', 'color: cyan; font-weight: bold;');
})();
