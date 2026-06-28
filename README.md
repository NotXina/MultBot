# MultBot

Fork aprimorado do [ModernBot](https://github.com/Sau1707/ModernBot) para Grepolis.

## Instalação

1. Instale o [Tampermonkey](https://www.tampermonkey.net/)
2. Crie um novo script e cole o conteúdo de `index.js`
   — ou use a URL direta:
   ```
   https://raw.githubusercontent.com/NotXina/MultBot/main/index.js
   ```

## Módulos

### Incluídos do ModernBot original
- **Farm** — AutoFarm, AutoRuralLevel, AutoRuralTrade
- **Build** — AutoBuild, AutoGratis
- **Train** — AutoTrain
- **Mix** — AutoBootcamp, AutoParty, AutoHide
- **Console** — Log em tempo real

### Novos módulos (aba Ships / Mult)

**ColonizeShipSender** (aba Ships)
Envia `colonize_ship` de todas as cidades automaticamente como apoio para uma cidade destino.
- Configura destino por ID ou `[town]...[/town]`
- Intervalo configurável em minutos
- Persiste estado entre reloads

**MultTools** (aba Mult)
Ferramentas em massa para todas as cidades.
- Preset: aplica nível máximo em todos os edifícios (Quartel → 5, Muro → 0)
- Ativa AutoBuild automaticamente

## Estrutura do repo

```
MultBot/
├── index.js                 ← instalar no Tampermonkey
├── multbot_base.js          ← ModernBot base + patches
├── colonize_ship_sender.js  ← módulo ColonizeShipSender
├── mult_tools.js            ← módulo MultTools
└── README.md
```

## Créditos

- [Sau1707/ModernBot](https://github.com/Sau1707/ModernBot) — base original
