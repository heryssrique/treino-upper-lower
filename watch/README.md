# App do relógio (Redmi Watch 4 · Xiaomi Vela)

Treino do dia no pulso: toque ao terminar a série, o descanso conta e o relógio vibra no fim.
Funciona sem internet e sem a chave da API. As cargas continuam sendo registradas no celular.

É um Vela JS Quick App (`src/manifest.json` + `.ux`), desenhado para a tela de 390×450 do Redmi Watch 4 (`designWidth: 390`).

## Gerar o .rpk

```bash
cd watch
npm ci
npm run build
```

Sai em `dist/com.heryssrique.treino.debug.<versão>.rpk`, assinado com a chave de debug do `aiot-toolkit`.
Antes de instalar uma versão nova, suba `versionCode` em `src/manifest.json`: o relógio guarda a versão antiga.

## Instalar no relógio

A Xiaomi não libera instalação de apps de terceiros no Redmi Watch 4. Caminhos usados pela comunidade
(nenhum oficial; todos pedem login da conta Xiaomi em app não oficial):

- Mi Fitness modificado do @m0tral (grupo no Telegram): instalação pelo próprio app.
- Xiaomi Wearable debug (小米穿戴 debug): Factory test → ThirdAppDemo → digite qualquer nome de pacote → Install third app → escolha o `.rpk`.
- 表盘自定义工具 (BandBBS) + Shizuku: instalação por Bluetooth.

Guia detalhado: https://blog.iyatt.com/?p=17811 · Docs do Vela: https://iot.mi.com/vela/quickapp/en/

## Mudou o plano?

`js/plan.js` é a fonte. Na raiz do repositório, rode `npm run watch:plan` para atualizar `src/common/plan.js` e gere o `.rpk` de novo.
