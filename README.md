# Seu Mundo Neste Momento

Monitor global estático para GitHub Pages. O projeto consulta fontes públicas, mostra origem e horário de cada leitura e nunca substitui uma fonte indisponível por valores aleatórios.

## O que está funcional

- Globo 3D com mapa 2D automático para aparelhos sem WebGL.
- Terremotos, anéis sísmicos, eventos naturais, desastres GDACS e alertas ativos de tsunami.
- Posição e trilha recente da ISS.
- Índice Kp, Bz, vento solar e previsão NOAA OVATION de auroras.
- Camadas opcionais de temperatura global e qualidade do ar.
- Linha astronômica aproximada de dia/noite.
- Imagem diária VIIRS do NASA GIBS, carregada somente quando solicitada.
- 4.589 estados, províncias e subdivisões do Natural Earth, representados por pontos administrativos carregados sob demanda; um clique pesquisa notícias recentes da região e, quando necessário, do país.
- Clima pontual, diretório externo de câmeras públicas e alertas críticos locais do navegador enquanto o site está aberto.

## Fontes e intervalos

- USGS: terremotos de magnitude 2,5 ou maior nas últimas 24 horas; navegador a cada 5 minutos.
- NASA EONET: eventos naturais abertos; navegador a cada 5 minutos.
- GDACS: ciclones, inundações, vulcões, secas e incêndios; snapshot do GitHub Actions a cada 15 minutos.
- NOAA Tsunami Warning Centers: somente Warning, Watch, Advisory ou Threat ativos; snapshot a cada 15 minutos.
- NOAA SWPC: Kp, Bz, vento solar e OVATION; navegador a cada 5 minutos e snapshot de contingência.
- Where The ISS At: posição da ISS a cada 10 segundos.
- Open-Meteo: clima pontual, temperatura sob demanda e grade de qualidade do ar atualizada no snapshot a cada 15 minutos.
- GDELT: referências jornalísticas regionais das últimas 48 horas, sob demanda e com cache de 15 minutos no navegador.
- NASA GIBS: imagem VIIRS do dia anterior, sob demanda.
- Natural Earth Admin-1: pontos administrativos estáticos, compactados para desempenho. Dados em domínio público.

O GitHub Actions consolida e republica o snapshot a cada 15 minutos sem criar commits automáticos no histórico. Cada provedor tem sua própria latência; “tempo quase real” significa a leitura mais recente efetivamente publicada por ele.

## Limites e segurança

O GitHub Pages não executa um servidor. APIs podem impor limites, bloquear CORS ou ficar temporariamente fora do ar. Notícias não garantem cobertura uniforme nem representam confirmação independente. Câmeras podem atrasar, sair do ar ou não mostrar o evento selecionado.

O monitor não calcula nem publica trajetória de armamentos, previsão própria de impacto de míssil ou autoria não confirmada. Incidentes nucleares, radiológicos, biológicos e conflitos só devem ser incorporados a partir de alertas civis ou autoridades reconhecidas, com localização compatível com o que a fonte tornou público.

As categorias nuclear/radiológica e biológica/química permanecem invisíveis quando não há ocorrência oficial ativa. Se uma fonte oficial vier a alimentar um evento nuclear, a categoria surge automaticamente e o mapa adota o estado visual vermelho; um evento biológico/químico confirmado ativa um estado âmbar. A interface já aplica essas regras, mas nenhum agregador foi habilitado sem um feed oficial global suficientemente confiável.

Alertas do navegador funcionam enquanto o site está aberto. E-mail, Telegram e WhatsApp exigem um serviço externo e credenciais guardadas em GitHub Secrets; nenhuma chave deve ser colocada em `index.html` ou `app.js`.
