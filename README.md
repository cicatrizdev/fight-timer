# 🥊 Fight Timer

Timer de rounds para treino de lutas (boxe, MMA, muay thai, HIIT) — web app
**PWA instalável e 100% offline**, com experiência de app nativo em celular,
tablet e desktop.

## Features

- Rounds, duração, aquecimento e intervalo configuráveis
- **Blocos de rounds** com durações diferentes na mesma sessão (ex.: 3×3min
  boxe + 2×5min sparring)
- **Intervalos dentro do round** (forte/leve, ex.: 30s/15s) com aviso sonoro,
  por voz e indicador na tela
- Aviso sonoro antes do fim do round/intervalo, com antecedência configurável
- **Treino sobrevive a refresh/fechamento**: reabra o app e o timer continua
  de onde estava (timestamps absolutos)
- Sons reais de luta (sino de boxe, clacker de madeira, air horn, buzzer — CC0,
  ver `public/sounds/CREDITS.md`) + upload de sons próprios (salvos no
  IndexedDB)
- Presets de modalidade (Boxe 12×3', MMA 5×5', Muay Thai 5×3', HIIT) e presets
  do usuário
- Cor de tela por fase (verde = round, vermelho = descanso, âmbar =
  aquecimento) com pulso na janela de aviso — legível do outro lado do tatame
- Wake Lock (tela não apaga durante o treino), avisos por voz (TTS),
  vibração (Android), beeps de contagem nos últimos 3s
- Pular fase, +30s, pausa com um toque, tela cheia
- i18n pt-BR/EN (detecta o idioma do navegador)

## Stack

React 19 + Vite + TypeScript · Zustand · Web Audio API · Web Worker +
timestamps para precisão do timer · vite-plugin-pwa (Workbox, precache total
para offline) · idb · react-i18next

## Desenvolvimento

```sh
npm install
npm run dev      # servidor de desenvolvimento
npm test         # testes do motor do timer (vitest)
npm run test:ui  # testes end-to-end (Playwright; requer npx playwright install chromium)
npm run build    # typecheck + build de produção + service worker
npm run preview  # serve o build (necessário para testar o PWA/offline)
```

O motor do timer (`src/core/timer/`) é uma máquina de estados pura baseada em
timestamps absolutos — imune a throttling de aba em segundo plano — com ticks
vindos de um Web Worker e ressincronização em `visibilitychange`.
